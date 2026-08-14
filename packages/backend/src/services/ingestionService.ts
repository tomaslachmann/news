import type { FastifyBaseLogger } from 'fastify'
import type { IngestionRunSummary, PendingAdditionItem } from '@news-triangulator/shared'
import { queryRssFeeds } from './rss.js'
import { generateEmbedding } from './embeddingClient.js'
import { findBestMatch, buildEmbeddingInput } from './storyMatching.js'
import { verifyCandidatesAgainstAnchorInBatches } from './storyVerification.js'
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

export async function approveDraft(analysisId: string, log?: FastifyBaseLogger): Promise<void> {
  const analysis = await analysisRepo.findAnalysisWithStory(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Schválit lze pouze koncepty')

  // Ingestion's own attach decision is unverified (cheap embedding matching only, per ADR 0018)
  // — this bulk re-check right before Extraction is the backstop that guarantees nothing
  // reaches it without ever having been LLM-confirmed against the Story's anchor headline.
  // Batched (not a single unbounded fan-out) per verifyCandidatesAgainstAnchor's own documented
  // contract — a Draft can accumulate many Coverage rows across polls before it's reviewed.
  const coverages = await coverageRepo.findCoveragesForAnalysis(analysisId)
  const verifiable = coverages.filter((c): c is typeof c & { title: string } => c.title !== null)
  const verified = await verifyCandidatesAgainstAnchorInBatches(
    verifiable,
    analysis.story.anchorHeadline,
    log
  )

  // Excludes only the specific ids that failed — not "keep just these" — so Coverage attached by
  // a concurrent Ingestion poll during this (LLM-backed, now multi-second) verification pass is
  // never touched, verified or not.
  const verifiedIds = new Set(verified.map((c) => c.id))
  const failedIds = coverages.filter((c) => !verifiedIds.has(c.id)).map((c) => c.id)
  if (failedIds.length > 0) {
    log?.warn(
      { analysisId, excludedCount: failedIds.length, totalCount: coverages.length },
      'Pre-Extraction quality gate excluded Coverage that failed or errored during same-story ' +
        'verification (see individual verifySameStory log entries to tell the two apart)'
    )
    await coverageRepo.excludeCoverageIds(failedIds)
  }

  // Conditional on still being DRAFT — a concurrent rejectDraft may have already resolved during
  // the verification pass above; if so, this must not resurrect it back to PENDING.
  const transitioned = await analysisRepo.updateAnalysisStatusIfCurrently(analysisId, 'DRAFT', 'PENDING')
  if (!transitioned) {
    log?.warn(
      { analysisId },
      'Draft was no longer DRAFT when the quality gate finished (likely rejected concurrently); not overwriting its status'
    )
  }
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
