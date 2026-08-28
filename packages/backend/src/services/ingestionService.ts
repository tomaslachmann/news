import type { FastifyBaseLogger } from 'fastify'
import type {
  IngestionRunSummary,
  PendingAdditionItem,
  AnalysisListItem,
  PendingStoryRelationItem,
  PagedResult,
  DraftQuery,
  PendingAdditionQuery,
  StoryRelationQuery,
  DraftApprovalResult,
  DraftExclusion,
} from '@news-triangulator/shared'
import { resolveOffsetPage, toPagedResult } from '../pagination.js'
import { queryRssFeeds } from './rss.js'
import { generateEmbedding, type EmbeddingResult } from './embeddingClient.js'
import {
  evaluateMatch,
  buildEmbeddingInput,
  MATCH_SCORER_VERSION,
  DEDUP_WINDOW_HOURS,
} from './storyMatching.js'
import { verifyCandidatesAgainstAnchorInBatches } from './storyVerification.js'
import { MAX_COVERAGES_PER_ANALYSIS } from './coverageLimits.js'
import { scrapeForCoverage } from './articleScraper.js'
import { resolveCategoryForCandidate } from './articleCategoryMapping.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { NotFoundError, ValidationError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import * as coverageRepo from '../repositories/coverage.js'
import * as pendingAdditionRepo from '../repositories/pendingAddition.js'
import * as storyRelationRepo from '../repositories/storyRelation.js'
import * as matchDecisionRepo from '../repositories/matchDecision.js'
import * as ingestionRunLockRepo from '../repositories/ingestionRunLock.js'
import * as synthesisResultRepo from '../repositories/synthesisResult.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'
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

// Well past any realistic pass duration (the scheduler's own curl gives up after 600s) — lets a
// later trigger reclaim the lease if a previous run crashed without releasing it (P2-22,
// docs/audit.md). See repositories/ingestionRunLock.ts.
const INGESTION_LOCK_STALE_AFTER_MINUTES = 30

/**
 * Runs one Ingestion pass, guarded by IngestionRunLock so a manual/admin-triggered run can never
 * overlap an in-flight scheduled one (P2-22, docs/audit.md) — the scheduler itself
 * (docker-compose.yml's curl-then-sleep loop) already can't overlap its own scheduled triggers
 * structurally, but nothing previously stopped a second, independently-triggered call. A
 * skipped run (lock already held) returns a summary of all zeros rather than throwing — this is
 * a routine "someone else is already doing this," not a failure.
 */
export async function runIngestionPass(log?: FastifyBaseLogger): Promise<IngestionRunSummary> {
  const runId = await ingestionRunLockRepo.tryClaimIngestionLock(INGESTION_LOCK_STALE_AFTER_MINUTES)
  if (!runId) {
    log?.info('Ingestion: another run is already in progress, skipping this trigger')
    return { checked: 0, created: 0, attached: 0, flagged: 0, skipped: 0 }
  }

  try {
    return await runIngestionPassLocked(log)
  } finally {
    // A release failure must never mask whatever runIngestionPassLocked itself threw — standard
    // JS try/finally semantics would otherwise let a throw here silently replace the real error
    // (e.g. "RSS feed down") with an unrelated one, hiding the actual root cause from logs/ops.
    // A stuck lease still self-heals via staleAfterMinutes on the next trigger.
    try {
      await ingestionRunLockRepo.releaseIngestionLock(runId)
    } catch (err) {
      log?.error({ runId, err }, 'Ingestion: failed to release the run lock; it will self-heal once stale')
    }
  }
}

async function runIngestionPassLocked(log?: FastifyBaseLogger): Promise<IngestionRunSummary> {
  const ingestionLog = log?.child({ namespace: 'ingestion' })
  const summary: IngestionRunSummary = { checked: 0, created: 0, attached: 0, flagged: 0, skipped: 0 }

  ingestionLog?.info('Ingestion run started')
  const items = await queryRssFeeds(log)
  summary.checked = items.length
  ingestionLog?.info({ itemCount: items.length }, 'Fetched candidates from all source feeds')

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
      ingestionLog?.warn(
        { url: item.url, err },
        'Ingestion: could not generate embedding, skipping this item'
      )
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
          ingestionLog?.info(
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
                primaryCategory: resolveCategoryForCandidate(item),
              },
            ],
            MAX_COVERAGES_PER_ANALYSIS
          )
          if (result.ok) {
            ingestionLog?.info(
              { analysisId: match.analysisId, sourceId: item.sourceId, url: item.url },
              'Ingestion: attached Coverage to matched Analysis'
            )
            summary.attached++
          } else {
            ingestionLog?.info(
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
          primaryCategory: resolveCategoryForCandidate(item),
        })
        ingestionLog?.info(
          { analysisId: match.analysisId, sourceId: item.sourceId, url: item.url },
          'Ingestion: flagged as a PendingAddition against a COMPLETE Analysis'
        )
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
      // item.publishedAt is rss.ts's parsed pubDate (Ingestion's only candidate pipeline is RSS
      // — see Story.eventTime's schema doc comment, ticket 16).
      eventTime: new Date(item.publishedAt),
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
        primaryCategory: resolveCategoryForCandidate(item),
      },
    ])
    ingestionLog?.info(
      { storyId: draft.storyId, analysisId: draft.id, sourceId: item.sourceId, url: item.url },
      'Ingestion: created new Draft Story'
    )
    summary.created++
  }

  ingestionLog?.info(summary, 'Ingestion run finished')
  return summary
}

export async function approveDraft(
  analysisId: string,
  actorId: string,
  log?: FastifyBaseLogger
): Promise<DraftApprovalResult> {
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

  // Excludes only the specific ids that failed or were never sent to verification — not "keep
  // just these" — so Coverage attached by a concurrent Ingestion poll during this (LLM-backed,
  // now multi-second) verification pass is never touched, verified or not.
  //
  // Kept as two separate buckets (not one combined "failed" set) because they're different
  // findings: unverifiableIds never underwent verification at all (no title to check against the
  // anchor headline) and aren't evidence of anything the LLM rejected — collapsing them into
  // "failed verification" mischaracterizes them. See docs audit finding P1-12.
  const verifiedIds = new Set(verified.map((c) => c.id))
  const failedVerificationIds = verifiable.filter((c) => !verifiedIds.has(c.id)).map((c) => c.id)
  const unverifiableIds = coverages.filter((c) => c.title === null).map((c) => c.id)
  if (failedVerificationIds.length > 0) {
    log?.warn(
      { analysisId, excludedCount: failedVerificationIds.length, totalCount: coverages.length },
      'Pre-Extraction quality gate excluded Coverage that failed or errored during same-story ' +
        'verification (see individual verifySameStory log entries to tell the two apart)'
    )
  }
  if (unverifiableIds.length > 0) {
    log?.warn(
      { analysisId, excludedCount: unverifiableIds.length, totalCount: coverages.length },
      'Pre-Extraction quality gate excluded Coverage with no title — never sent to verification, ' +
        'not evidence it failed'
    )
  }
  const excludedIds = [...failedVerificationIds, ...unverifiableIds]
  if (excludedIds.length > 0) {
    await coverageRepo.excludeCoverageIds(excludedIds)
  }

  // Returned to the caller (ticket 87) so the Admin who just approved this Draft can be shown, on
  // /review/:id, which outlets the gate dropped and why — the same two buckets the warn logs keep,
  // but surfaced in the UI instead of only in Docker logs.
  const outletByCoverageId = new Map(coverages.map((c) => [c.id, c.source.name]))
  const toExclusions = (ids: string[], reason: DraftExclusion['reason']): DraftExclusion[] =>
    ids.map((id) => ({
      coverageId: id,
      outlet: outletByCoverageId.get(id) ?? 'Neznámý zdroj',
      reason,
    }))
  const excluded: DraftExclusion[] = [
    ...toExclusions(failedVerificationIds, 'failed-verification'),
    ...toExclusions(unverifiableIds, 'no-title'),
  ]

  // Conditional on still being DRAFT — a concurrent rejectDraft may have already resolved during
  // the verification pass above; if so, this must not resurrect it back to PENDING, and there's
  // no point enqueueing extraction for a Draft that just got rejected.
  //
  // Entity extraction (ticket 34) + Story-relation candidate generation & confirmation (ticket
  // 35) now run on the `entity.extract` job (ticket 14), not inline — enqueued inside the same
  // transaction as the DRAFT→PENDING write (ADR 0028: never a Draft approved without its job),
  // so a queue failure rolls the status transition back rather than leaving this Draft stuck in
  // PENDING with no job ever enqueued for it. Logged explicitly before rethrowing — unlike a
  // plain propagated exception, this way the failure's cause (e.g. a queue timeout) survives in
  // the application log, not just as a bare 500 to the caller.
  let transitioned: boolean
  try {
    transitioned = await analysisRepo.updateAnalysisStatusIfCurrently(
      analysisId,
      'DRAFT',
      'PENDING',
      async (tx) => {
        await enqueueJob(
          JobName.EntityRelation,
          { analysisId, origin: 'draft-approval', coverageIds: verified.map((c) => c.id) },
          { tx }
        )
      }
    )
  } catch (err) {
    log?.error({ analysisId, err }, 'Failed to transition Draft to PENDING and enqueue entity.extract')
    throw err
  }
  if (!transitioned) {
    log?.warn(
      { analysisId },
      'Draft was no longer DRAFT when the quality gate finished (likely rejected concurrently); not overwriting its status'
    )
    return { excluded }
  }
  await recordAdminActionSafe({
    actorId,
    action: 'draft.approved',
    targetType: 'analysis',
    targetId: analysisId,
  })
  return { excluded }
}

export async function rejectDraft(analysisId: string, actorId: string): Promise<void> {
  const analysis = await analysisRepo.findAnalysisById(analysisId)
  if (!analysis) throw new NotFoundError('Analýza nenalezena')
  if (analysis.status !== 'DRAFT') throw new ValidationError('Zamítnout lze pouze koncepty')

  await analysisRepo.updateAnalysisStatus(analysisId, 'FAILED')
  await recordAdminActionSafe({
    actorId,
    action: 'draft.rejected',
    targetType: 'analysis',
    targetId: analysisId,
  })
}

export async function listPendingAdditions(
  query: PendingAdditionQuery = {}
): Promise<PagedResult<PendingAdditionItem>> {
  const page = resolveOffsetPage(query.page, query.pageSize)
  const { rows, total } = await pendingAdditionRepo.findPendingAdditionsPage({
    offset: page.offset,
    limit: page.pageSize,
    dir: query.dir,
    outlet: query.outlet,
    createdAfter: query.createdAfter,
    createdBefore: query.createdBefore,
  })
  return toPagedResult(rows.map(toPendingAdditionItem), total, page)
}

/** Real re-triangulation (ticket 45, grilling session 2026-08-21): attaches the flagged Coverage
 *  to the already-COMPLETE Analysis, scrapes its text, clears the stale SynthesisResult so
 *  `runAnalysisStream`'s cache check can't skip re-synthesis, and flips the Analysis back to
 *  PENDING — the same conditional transition `approveDraft` uses for DRAFT→PENDING, reusing the
 *  existing SSE-stream pipeline rather than a bespoke "re-triangulate a complete one" path.
 *
 *  Order matters: the cap/scrape/synthesis-clear/status-transition all happen before the
 *  PendingAddition itself is marked APPROVED, so a failure partway through (cap reached, a lost
 *  status-transition race) never leaves this row falsely marked resolved without the Coverage
 *  actually landing. */
export async function approvePendingAddition(
  id: string,
  actorId: string,
  log?: FastifyBaseLogger
): Promise<void> {
  const pendingAddition = await pendingAdditionRepo.findPendingAdditionById(id)
  if (!pendingAddition) throw new NotFoundError('Doplnění nenalezeno')
  if (pendingAddition.status !== 'PENDING_REVIEW') {
    throw new ValidationError('Schválit lze pouze čekající doplnění')
  }
  if (pendingAddition.analysis.status !== 'COMPLETE') {
    throw new ValidationError('Analýza mezitím změnila stav')
  }

  // Each Source contributes at most one Coverage per Analysis (CONTEXT.md) — checked explicitly
  // here, before ever touching addCoveragesIfWithinLimit, so a second PendingAddition for a
  // Source already attached (e.g. Ingestion re-flagged the same or a different article from an
  // outlet a prior approval already covered) gets an accurate outcome instead of the cap-check's
  // generic {ok:false}, which can't distinguish "at the cap" from "this Source is taken."
  const existingCoverages = await coverageRepo.findCoveragesForAnalysis(pendingAddition.analysisId)
  const existingForSource = existingCoverages.find((c) => c.sourceId === pendingAddition.sourceId)
  if (existingForSource) {
    if (existingForSource.articleUrl !== pendingAddition.articleUrl) {
      throw new ValidationError('Tento zdroj je již k analýze připojen jiným článkem')
    }
    // Same Source, same URL — a duplicate PendingAddition for a Coverage an earlier approval
    // (of a different PendingAddition row) already attached. Nothing new to add or re-triangulate;
    // just resolve this row so it stops showing as actionable.
    const alreadyResolved = await pendingAdditionRepo.updatePendingAdditionStatusIfCurrently(
      id,
      'PENDING_REVIEW',
      'APPROVED'
    )
    if (alreadyResolved) {
      await recordAdminActionSafe({
        actorId,
        action: 'pending_addition.approved',
        targetType: 'pending_addition',
        targetId: id,
      })
    }
    return
  }

  const attachResult = await coverageRepo.addCoveragesIfWithinLimit(
    pendingAddition.analysisId,
    [
      {
        analysisId: pendingAddition.analysisId,
        sourceId: pendingAddition.sourceId,
        title: pendingAddition.title ?? undefined,
        articleUrl: pendingAddition.articleUrl,
        publishedAt: pendingAddition.publishedAt ?? undefined,
        status: 'PENDING',
        primaryCategory: pendingAddition.primaryCategory,
      },
    ],
    MAX_COVERAGES_PER_ANALYSIS
  )
  if (!attachResult.ok) {
    throw new ValidationError('Analýza již dosáhla maximálního počtu zdrojů')
  }

  const coverages = await coverageRepo.findCoveragesForAnalysis(pendingAddition.analysisId)
  const newCoverage = coverages.find((c) => c.sourceId === pendingAddition.sourceId)
  if (!newCoverage) {
    throw new ValidationError('Připojení zdroje se nezdařilo; zkuste to prosím znovu')
  }

  const scraped = await scrapeForCoverage(newCoverage.articleUrl, log)
  await coverageRepo.updateCoverage(newCoverage.id, scraped)

  const eligibleCoverageIds = scraped.status === 'OK' ? [newCoverage.id] : []
  const transitioned = await analysisRepo.updateAnalysisStatusIfCurrently(
    pendingAddition.analysisId,
    'COMPLETE',
    'PENDING',
    async (tx) => {
      // Same transaction as the status write — deleting it separately would let a failure in
      // between (e.g. the queue cold-start risk updateAnalysisStatusIfCurrently's own comment
      // documents) leave the Analysis COMPLETE with no SynthesisResult, the exact inconsistency
      // completeAnalysisWithSynthesis's own single-transaction design exists to prevent.
      await synthesisResultRepo.deleteSynthesisResult(pendingAddition.analysisId, tx)
      await enqueueJob(
        JobName.EntityRelation,
        {
          analysisId: pendingAddition.analysisId,
          origin: 'pending-addition-approval',
          coverageIds: eligibleCoverageIds,
        },
        { tx }
      )
    }
  )
  if (!transitioned) {
    throw new ValidationError('Analýza mezitím změnila stav; zkuste to prosím znovu')
  }

  const resolved = await pendingAdditionRepo.updatePendingAdditionStatusIfCurrently(
    id,
    'PENDING_REVIEW',
    'APPROVED'
  )
  if (!resolved) {
    log?.warn(
      { pendingAdditionId: id },
      'Pending Addition was resolved concurrently after its Coverage was already attached and re-triangulation started'
    )
  }

  await recordAdminActionSafe({
    actorId,
    action: 'pending_addition.approved',
    targetType: 'pending_addition',
    targetId: id,
  })
}

/** Permanent — a rejected Pending Addition is never re-surfaced; it just stops appearing in
 *  `listPendingAdditions`, mirroring `rejectStoryRelation`'s shape. */
export async function rejectPendingAddition(id: string, actorId: string): Promise<void> {
  const pendingAddition = await pendingAdditionRepo.findPendingAdditionById(id)
  if (!pendingAddition) throw new NotFoundError('Doplnění nenalezeno')
  if (pendingAddition.status !== 'PENDING_REVIEW') {
    throw new ValidationError('Zamítnout lze pouze čekající doplnění')
  }

  const transitioned = await pendingAdditionRepo.updatePendingAdditionStatusIfCurrently(
    id,
    'PENDING_REVIEW',
    'REJECTED'
  )
  if (!transitioned) {
    throw new ValidationError('Doplnění mezitím změnilo stav; zkuste to prosím znovu')
  }

  await recordAdminActionSafe({
    actorId,
    action: 'pending_addition.rejected',
    targetType: 'pending_addition',
    targetId: id,
  })
}

/** Drafts visible in the Ingestion review queue — a live filter on attached-source count, not a
 *  separate "promote to visible" step, so a Draft appears the moment a later poll pushes it over
 *  MIN_VISIBLE_SOURCE_COUNT. Ingestion keeps attaching Coverage to below-threshold Drafts in the
 *  background regardless; this only changes what's visible here. Distinct from the general
 *  `/api/analyses` listing (unfiltered, still shows every Draft for a full Admin History audit)
 *  — see ADR 0018. */
export async function listVisibleDrafts(query: DraftQuery = {}): Promise<PagedResult<AnalysisListItem>> {
  const page = resolveOffsetPage(query.page, query.pageSize)
  const { rows, total } = await analysisRepo.findDraftsPage({
    minVisibleSourceCount: MIN_VISIBLE_SOURCE_COUNT,
    offset: page.offset,
    limit: page.pageSize,
    sort: query.sort,
    dir: query.dir,
    outlet: query.outlet,
    createdAfter: query.createdAfter,
    createdBefore: query.createdBefore,
  })
  return toPagedResult(rows.map(toVisibleDraftListItem), total, page)
}

/** LOW-confidence StoryRelations (ticket 35) awaiting Admin review — the Event Graph's equivalent
 *  of the Draft review queue above, on the same Admin surface (ticket 36). */
export async function listPendingStoryRelations(
  query: StoryRelationQuery = {}
): Promise<PagedResult<PendingStoryRelationItem>> {
  const page = resolveOffsetPage(query.page, query.pageSize)
  const { rows, total } = await storyRelationRepo.findPendingReviewRelationsPage({
    offset: page.offset,
    limit: page.pageSize,
    dir: query.dir,
    createdAfter: query.createdAfter,
    createdBefore: query.createdBefore,
  })
  return toPagedResult(rows.map(toPendingStoryRelationItem), total, page)
}

export async function approveStoryRelation(
  id: string,
  actorId: string,
  log?: FastifyBaseLogger
): Promise<void> {
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
  await recordAdminActionSafe({
    actorId,
    action: 'story_relation.approved',
    targetType: 'story_relation',
    targetId: id,
  })

  // thread.recompute (ticket 17, ADR 0028): the second of the two real trigger points a
  // StoryRelation can reach FOLLOW_UP/PUBLISHED from — see storyRelationPass.ts's own enqueue for
  // the auto-linking path and ticket 17's Answer for why this isn't atomic with the write above.
  if (relation.type === 'FOLLOW_UP') {
    try {
      await enqueueJob(JobName.ThreadRecompute, { seedStoryId: relation.fromStoryId })
    } catch (err) {
      log?.error({ relationId: id, err }, 'Failed to enqueue thread.recompute after approving a relation')
    }
  }
}

/** Permanent — a rejected pair is never re-evaluated or re-surfaced by a later
 *  relation-candidate-generation pass (ticket 35 only ever runs once per Story, searching
 *  backward; it never revisits a pair it already produced a row for, per the @@unique
 *  constraint). */
export async function rejectStoryRelation(id: string, actorId: string): Promise<void> {
  const relation = await storyRelationRepo.findStoryRelationById(id)
  if (!relation) throw new NotFoundError('Vztah nenalezen')
  if (relation.status !== 'PENDING_REVIEW') throw new ValidationError('Zamítnout lze pouze čekající vztahy')

  const transitioned = await storyRelationRepo.updateStoryRelationStatusIfCurrently(
    id,
    'PENDING_REVIEW',
    'REJECTED'
  )
  if (!transitioned) throw new ValidationError('Vztah mezitím změnil stav; zkuste to prosím znovu')
  await recordAdminActionSafe({
    actorId,
    action: 'story_relation.rejected',
    targetType: 'story_relation',
    targetId: id,
  })
}
