import type { FastifyBaseLogger } from 'fastify'
import type {
  IngestionRunSummary,
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  Page,
} from '@news-triangulator/shared'
import { DEFAULT_PAGE_SIZE } from '@news-triangulator/shared'
import { fetchPage } from '../pagination.js'
import { queryRssFeeds } from './rss.js'
import { generateEmbedding, type EmbeddingResult } from './embeddingClient.js'
import {
  evaluateMatch,
  buildEmbeddingInput,
  MATCH_SCORER_VERSION,
  DEDUP_WINDOW_HOURS,
} from './storyMatching.js'
import { verifyCandidatesAgainstAnchorInBatches } from './storyVerification.js'
import { extractEntitiesAndLinkStoryRelations } from './storyRelationPass.js'
import { MAX_COVERAGES_PER_ANALYSIS } from './coverageLimits.js'
import { NotFoundError, ValidationError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as storyRelationRepo from '../repositories/storyRelation.js'
import * as entityRepo from '../repositories/entity.js'
import * as matchDecisionRepo from '../repositories/matchDecision.js'
import { toPendingAdditionItem } from '../mappers/pendingAddition.js'
import { toVisibleDraftListItem } from '../mappers/analysis.js'
import { toPendingStoryRelationItem } from '../mappers/storyRelation.js'

// A Draft below this many attached sources stays hidden from the review queue — decluttering
// single-source noise without changing the approval gate itself. Tunable, like the other
// thresholds in this pipeline (MATCH_THRESHOLD, GDELT_MIN_THRESHOLD). See ADR 0018.
const MIN_VISIBLE_SOURCE_COUNT = 2

// How far back the "have I already ingested this URL?" check looks. A URL genuinely re-appearing
// in a fresh RSS poll after this long is realistic enough to accept as a re-check; unbounded (the
// entire table's history, scanned on every 20-minute poll) was the actual problem (docs/audit.md
// P0-2, ticket 03).
const KNOWN_URL_LOOKBACK_HOURS = 30 * 24

export async function runIngestionPass(log?: FastifyBaseLogger): Promise<IngestionRunSummary> {
  const summary: IngestionRunSummary = { checked: 0, created: 0, attached: 0, flagged: 0, skipped: 0 }

  const items = await queryRssFeeds(log)
  summary.checked = items.length

  const [knownSeedUrls, knownCoverageUrls] = await Promise.all([
    analysisRepo.findAllSeedUrls(KNOWN_URL_LOOKBACK_HOURS),
    coverageRepo.findAllArticleUrls(KNOWN_URL_LOOKBACK_HOURS),
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
    let embeddingResult: EmbeddingResult
    try {
      embeddingResult = await generateEmbedding(buildEmbeddingInput(item), 'ingestion')
      // generateEmbedding only throws on a missing vector, not an empty one (an unusual but
      // not-impossible API/cache response shape) — treated as a failure the same way, rather
      // than proceeding to create a Draft with an embedding that can never be matched again and
      // an embeddingModel/embeddingInputHash implying a real one exists.
      if (embeddingResult.vector.length === 0) throw new Error('Embedding API returned an empty vector')
    } catch (err) {
      log?.warn({ url: item.url, err }, 'Ingestion: could not generate embedding, skipping this item')
      summary.skipped++
      continue
    }
    const itemEmbedding = embeddingResult.vector

    const { best, thresholdMatched, match } = evaluateMatch(itemEmbedding, candidates, new Date())

    // Ingestion's own attach decision never gets an LLM call (ADR 0018) — the threshold stage
    // alone always decides the outcome here, unlike human-seeded submission's dedup check.
    await matchDecisionRepo.recordMatchDecisionSafe({
      callSite: 'ingestion',
      candidateStoryId: best?.candidate.storyId ?? null,
      candidateAnalysisId: best?.candidate.analysisId ?? null,
      score: best?.score ?? null,
      thresholdMatched,
      llmVerdict: null,
      decidedBy: 'THRESHOLD',
      scorerVersion: MATCH_SCORER_VERSION,
    })

    if (match) {
      if (match.analysisStatus === 'PENDING' || match.analysisStatus === 'DRAFT') {
        // Each Source contributes at most one Coverage per Analysis (CONTEXT.md) — unlike
        // createAnalysis's confirm-coverage path, this attach path previously had no such check
        // at all, so two RSS items from the same outlet matching the same Draft both became
        // separate Coverage rows (P0-6, docs/audit.md). Also enforced at the DB level (Coverage's
        // partial unique index) as a backstop, but checked here first for a clean skip instead of
        // relying on that constraint to throw.
        const existing = await coverageRepo.findCoveragesForAnalysis(match.analysisId)
        if (existing.some((c) => c.sourceId === item.sourceId)) {
          log?.info(
            { analysisId: match.analysisId, sourceId: item.sourceId },
            'Ingestion: this Source already has Coverage on the matched Analysis, skipping duplicate'
          )
          summary.skipped++
        } else {
          // Best-effort, not a failure — a Draft/PENDING Analysis already at the cap just stops
          // accumulating more Coverage from later polls rather than blocking the rest of this
          // pass (code review, ticket 03; MAX_COVERAGES_PER_ANALYSIS previously only guarded the
          // confirmCoverages/discoverSources paths, not this automatic attach).
          const result = await coverageRepo.addCoveragesIfWithinLimit(
            match.analysisId,
            [
              {
                analysisId: match.analysisId,
                sourceId: item.sourceId,
                title: item.title,
                articleUrl: item.url,
                publishedAt: item.publishedAt,
                status: 'PENDING',
              },
            ],
            MAX_COVERAGES_PER_ANALYSIS
          )
          if (result.ok) {
            summary.attached++
          } else {
            log?.info(
              { analysisId: match.analysisId, sourceId: item.sourceId, activeCount: result.activeCount },
              'Ingestion: skipping attach — matched Analysis at MAX_COVERAGES_PER_ANALYSIS, or a concurrent write already attached this Source'
            )
            summary.skipped++
          }
        }
      } else if (match.analysisStatus === 'COMPLETE') {
        await pendingAdditionRepo.createPendingAddition({
          analysisId: match.analysisId,
          sourceId: item.sourceId,
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
      embeddingModel: embeddingResult.model,
      embeddingInputHash: embeddingResult.inputHash,
    })
    candidates.push({
      storyId: draft.storyId,
      analysisId: draft.id,
      analysisStatus: draft.status,
      embedding: itemEmbedding,
      createdAt: draft.createdAt,
      anchorHeadline: item.title,
      headline: null,
    })
    await coverageRepo.createCoverages([
      {
        analysisId: draft.id,
        sourceId: item.sourceId,
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

  // Entity extraction (ticket 34) + Story-relation candidate generation & confirmation (ticket
  // 35), run once immediately, searching backward against already-visible recent Stories only.
  // Uses only the titles that survived the quality gate above, not every originally-attached
  // title, so an excluded wrong-event Coverage doesn't pollute this Story's entity signal.
  // Entirely best-effort: nothing in this pipeline is ever allowed to block this Draft's
  // approval.
  const titles = [analysis.story.anchorHeadline, ...verified.map((c) => c.title)]
  await extractEntitiesAndLinkStoryRelations(
    analysis.storyId,
    titles,
    analysis.story,
    {
      replaceStoryEntities: entityRepo.replaceStoryEntities,
      findStoryEntitiesForScoring: entityRepo.findStoryEntitiesForScoring,
      countStories: entityRepo.countStories,
      findRelationCandidateStories: storyRelationRepo.findRelationCandidateStories,
      createStoryRelation: storyRelationRepo.createStoryRelation,
    },
    log
  )

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

/** Drafts visible in the Ingestion review queue — a live filter on attached-source count, not a
 *  separate "promote to visible" step, so a Draft appears the moment a later poll pushes it over
 *  MIN_VISIBLE_SOURCE_COUNT. Ingestion keeps attaching Coverage to below-threshold Drafts in the
 *  background regardless; this only changes what's visible here. Distinct from the general
 *  `/api/analyses` listing (unfiltered, still shows every Draft for a full Admin History audit)
 *  — see ADR 0018. */
export async function listVisibleDrafts(
  cursor: string | undefined,
  limit: number = DEFAULT_PAGE_SIZE
): Promise<Page<AnalysisListItem>> {
  const { items, nextCursor } = await fetchPage(cursor, limit, (decoded, boundedLimit) =>
    analysisRepo.findDraftsPage(MIN_VISIBLE_SOURCE_COUNT, decoded, boundedLimit)
  )
  return { items: items.map(toVisibleDraftListItem), nextCursor }
}

/** LOW-confidence StoryRelations (ticket 35) awaiting Admin review — the Event Graph's equivalent
 *  of the Draft review queue above, on the same Admin surface (ticket 36). */
export async function listPendingStoryRelations(): Promise<PendingStoryRelationItem[]> {
  const rows = await storyRelationRepo.findPendingReviewRelations()
  return rows.map(toPendingStoryRelationItem)
}

export async function approveStoryRelation(id: string): Promise<void> {
  const relation = await storyRelationRepo.findStoryRelationById(id)
  if (!relation) throw new NotFoundError('Vztah nenalezen')
  if (relation.status !== 'PENDING_REVIEW') throw new ValidationError('Schválit lze pouze čekající vztahy')

  // Conditional, not a plain write — guards against a concurrent action on the same row (e.g. an
  // Admin double-clicking approve then reject) racing this read-check-then-write.
  const transitioned = await storyRelationRepo.updateStoryRelationStatusIfCurrently(
    id,
    'PENDING_REVIEW',
    'PUBLISHED'
  )
  if (!transitioned) throw new ValidationError('Vztah mezitím změnil stav; zkuste to prosím znovu')
}

/** Permanent — a rejected pair is never re-evaluated or re-surfaced by a later
 *  relation-candidate-generation pass (ticket 35 only ever runs once per Story, searching
 *  backward; it never revisits a pair it already produced a row for, per the @@unique
 *  constraint). */
export async function rejectStoryRelation(id: string): Promise<void> {
  const relation = await storyRelationRepo.findStoryRelationById(id)
  if (!relation) throw new NotFoundError('Vztah nenalezen')
  if (relation.status !== 'PENDING_REVIEW') throw new ValidationError('Zamítnout lze pouze čekající vztahy')

  const transitioned = await storyRelationRepo.updateStoryRelationStatusIfCurrently(
    id,
    'PENDING_REVIEW',
    'REJECTED'
  )
  if (!transitioned) throw new ValidationError('Vztah mezitím změnil stav; zkuste to prosím znovu')
}
