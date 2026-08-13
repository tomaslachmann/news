import type { FastifyBaseLogger } from 'fastify'
import type { IngestionRunSummary, PendingAdditionItem } from '@news-triangulator/shared'
import { queryRssFeeds } from './rss.js'
import { discoverCoverage } from './discovery.js'
import { scrapeArticle } from './articleScraper.js'
import { extractKeywords } from './keywordExtractor.js'
import { NotFoundError, ValidationError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import { toPendingAdditionItem } from '../mappers/pendingAddition.js'

const DEDUP_WINDOW_HOURS = 48

export async function runIngestionPass(log?: FastifyBaseLogger): Promise<IngestionRunSummary> {
  const summary: IngestionRunSummary = { checked: 0, created: 0, attached: 0, flagged: 0, skipped: 0 }

  const items = await queryRssFeeds(log)
  summary.checked = items.length

  const [knownSeedUrls, knownCoverageUrls] = await Promise.all([
    analysisRepo.findAllSeedUrls(),
    coverageRepo.findAllArticleUrls(),
  ])
  const known = new Set([...knownSeedUrls, ...knownCoverageUrls])

  // Processed sequentially, not in parallel: two outlets can publish about the same fresh event
  // within the same poll, and a matching Analysis created by the first item in this loop must be
  // visible to findRecentAnalysisMatchingUrls when a later item in the same batch checks for it.
  for (const item of items) {
    if (known.has(item.url)) {
      summary.skipped++
      continue
    }
    known.add(item.url)

    let title: string
    let keywords: string[]
    try {
      const scraped = await scrapeArticle(item.url)
      title = scraped.title
      keywords = await extractKeywords(scraped.title, scraped.excerpt)
    } catch (err) {
      log?.warn({ url: item.url, err }, 'Ingestion: could not scrape/extract keywords, skipping this item')
      summary.skipped++
      continue
    }

    const { candidates, gdeltCount } = await discoverCoverage(keywords, log)
    const candidateUrls = candidates.map((c) => c.url)

    // The RSS fallback layer returns whatever's currently trending, unfiltered by keyword — fine
    // as a starting candidate set for a genuinely new Draft, but too weak to trust as evidence that
    // two items are the same Story. Only match against candidates GDELT actually confirmed.
    const matchCandidateUrls = gdeltCount > 0 ? candidateUrls : []
    const match = await coverageRepo.findRecentAnalysisMatchingUrls(matchCandidateUrls, DEDUP_WINDOW_HOURS)

    if (match) {
      candidateUrls.forEach((u) => known.add(u))

      if (match.status === 'PENDING' || match.status === 'DRAFT') {
        await coverageRepo.createCoverages([
          {
            analysisId: match.analysisId,
            outlet: item.outlet,
            title: item.title,
            articleUrl: item.url,
            publishedAt: item.publishedAt,
            status: 'PENDING',
          },
        ])
        summary.attached++
      } else if (match.status === 'COMPLETE') {
        await pendingAdditionRepo.createPendingAddition({
          analysisId: match.analysisId,
          outlet: item.outlet,
          title: item.title,
          articleUrl: item.url,
          publishedAt: item.publishedAt,
        })
        summary.flagged++
      } else {
        // Matched a FAILED (or rejected) Analysis — treat as already-seen; don't recreate it.
        summary.skipped++
      }
      continue
    }

    const draft = await analysisRepo.createDraftAnalysis({ seedUrl: item.url, seedHeadline: title })
    await coverageRepo.createCoverages(
      candidates.map((c) => ({
        analysisId: draft.id,
        outlet: c.outlet,
        title: c.title,
        articleUrl: c.url,
        publishedAt: c.publishedAt,
        status: 'PENDING' as const,
      }))
    )
    summary.created++
  }

  return summary
}

export async function approveDraft(analysisId: string): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analysis not found')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Only draft analyses can be approved')

  await analysisRepo.updateAnalysisStatus(analysisId, 'PENDING')
}

export async function rejectDraft(analysisId: string): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analysis not found')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Only draft analyses can be rejected')

  await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED')
}

export async function listPendingAdditions(): Promise<PendingAdditionItem[]> {
  const rows = await pendingAdditionRepo.findAllPendingAdditions()
  return rows.map(toPendingAdditionItem)
}
