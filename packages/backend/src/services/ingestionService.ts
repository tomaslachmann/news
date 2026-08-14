import type { FastifyBaseLogger } from 'fastify'
import type { IngestionRunSummary, PendingAdditionItem } from '@news-triangulator/shared'
import { queryRssFeeds } from './rss.js'
import { discoverCoverage } from './discovery.js'
import { scrapeArticle } from './articleScraper.js'
import { extractKeywords } from './keywordExtractor.js'
import { verifySameStoryLogged, verifyCandidatesAgainstAnchor } from './storyVerification.js'
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
    const rawMatch = await coverageRepo.findRecentAnalysisMatchingUrls(matchCandidateUrls, DEDUP_WINDOW_HOURS)

    // A URL-heuristic match is only a candidate — confirm it's genuinely the same event as the
    // matched Story before trusting it. A rejected match (including a failed verification call,
    // which degrades to rejection rather than throwing) falls through to the new-Draft path
    // below exactly as a real no-match would. See ADR 0017.
    let match: typeof rawMatch = null
    if (rawMatch) {
      const verdict = await verifySameStoryLogged(title, rawMatch.anchorHeadline, log)
      if (verdict.sameEvent) match = rawMatch
    }

    if (match) {
      // Only item.url (already tracked in `known` above) actually becomes Coverage here — the
      // rest of `candidateUrls` were never verified against anything and must not be marked
      // known, or a later item's own genuine candidate check for one of them would be silently
      // filtered out despite nothing having actually been attached under that URL.

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

    // No verified match — this is a genuinely new Story. Verify Discovery's own candidates
    // against the triggering article itself before seeding the new Draft's Coverage with them;
    // this is the gap that previously let unrelated RSS-trending items become Coverage (ADR 0017).
    //
    // Excluding already-known URLs first also closes a narrower race within one poll: the dedup
    // check above compares this item's own title against a matched Story's anchor, while this
    // candidate check compares each candidate's title against this item's own title — two
    // different comparisons that can legitimately disagree. Without this filter, a URL that an
    // earlier item in the same poll already turned into real Coverage could pass this item's own
    // candidate verification and get attached a second time, to a second Analysis.
    const novelCandidates = candidates.filter((c) => !known.has(c.url))
    const verifiedCandidates = await verifyCandidatesAgainstAnchor(novelCandidates, title, log)

    const draft = await analysisRepo.createDraftAnalysis({ seedUrl: item.url, seedHeadline: title })
    await coverageRepo.createCoverages(
      verifiedCandidates.map((c) => ({
        analysisId: draft.id,
        outlet: c.outlet,
        title: c.title,
        articleUrl: c.url,
        publishedAt: c.publishedAt,
        status: 'PENDING' as const,
      }))
    )
    verifiedCandidates.forEach((c) => known.add(c.url))
    summary.created++
  }

  return summary
}

export async function approveDraft(analysisId: string): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Schválit lze pouze koncepty')

  await analysisRepo.updateAnalysisStatus(analysisId, 'PENDING')
}

export async function rejectDraft(analysisId: string): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Zamítnout lze pouze koncepty')

  await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED')
}

export async function listPendingAdditions(): Promise<PendingAdditionItem[]> {
  const rows = await pendingAdditionRepo.findAllPendingAdditions()
  return rows.map(toPendingAdditionItem)
}
