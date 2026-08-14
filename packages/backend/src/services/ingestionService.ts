import type { FastifyBaseLogger } from 'fastify'
import type { IngestionRunSummary, PendingAdditionItem } from '@news-triangulator/shared'
import { queryRssFeeds } from './rss.js'
import { generateEmbedding } from './embeddingClient.js'
import { findBestMatch, buildEmbeddingInput } from './storyMatching.js'
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

  // Fetched once, then appended to in-memory as new Drafts are created below — cheaper than
  // re-querying on every item, while still giving a Story created earlier in this same poll
  // (two outlets publishing about the same fresh event within one run) visibility to a later
  // item's own match check, since this loop runs sequentially, not in parallel.
  const candidates = await analysisRepo.findRecentStoriesForMatching(DEDUP_WINDOW_HOURS)

  for (const item of items) {
    if (known.has(item.url)) {
      summary.skipped++
      continue
    }
    known.add(item.url)

    // No scrape, no keyword extraction, no LLM call — the item's own RSS title/excerpt is
    // enough to embed and match cheaply. See ADR 0018.
    let itemEmbedding: number[]
    try {
      itemEmbedding = await generateEmbedding(buildEmbeddingInput(item))
    } catch (err) {
      log?.warn({ url: item.url, err }, 'Ingestion: could not generate embedding, skipping this item')
      summary.skipped++
      continue
    }

    const match = findBestMatch(itemEmbedding, candidates, new Date())

    if (match) {
      if (match.analysisStatus === 'PENDING' || match.analysisStatus === 'DRAFT') {
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
      } else if (match.analysisStatus === 'COMPLETE') {
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

    // No match above threshold — a genuinely new Story. No eager search for other outlets at
    // creation time: Coverage accumulates organically as those outlets' own RSS items arrive
    // and embedding-match against this Story on later polls (ADR 0018).
    const draft = await analysisRepo.createDraftAnalysis({
      seedUrl: item.url,
      seedHeadline: item.title,
      embedding: itemEmbedding,
    })
    candidates.push({
      storyId: draft.storyId,
      analysisId: draft.id,
      analysisStatus: draft.status,
      embedding: itemEmbedding,
      createdAt: draft.createdAt,
    })
    await coverageRepo.createCoverages([
      {
        analysisId: draft.id,
        outlet: item.outlet,
        title: item.title,
        articleUrl: item.url,
        publishedAt: item.publishedAt,
        status: 'PENDING',
      },
    ])
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
