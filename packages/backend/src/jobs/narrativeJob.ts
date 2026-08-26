import type { FastifyBaseLogger } from 'fastify'
import type { NarrativeDocument } from '@news-triangulator/shared'
import {
  runNarrativePass,
  type NarrativeSource,
  type NarrativeDimensions,
  type KnownEntity,
} from '../services/narrativePass.js'
import { searchWikimediaImageByQuery } from '../services/wikimediaImageClient.js'
import { runStageOrThrow } from '../services/pipelineStage.js'
import type { AnalysisWithDetails } from '../repositories/analysis.js'
import type { CoverageWithSource } from '../repositories/coverage.js'
import type { NewNarrativeImage } from '../repositories/narrativeImage.js'
import { ExternalServiceError } from '../errors.js'
import { enqueueJob } from './enqueue.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface NarrativeJobDeps {
  findAnalysisWithDetails: (analysisId: string) => Promise<AnalysisWithDetails | null>
  /** The Story's full known-entity set (ticket 47 / ADR 0034) — given to the Narrative LLM so an
   *  inline `<nt:e>` tag's `entityKey` is grounded against a real entity rather than invented. */
  findEntityMentionsForStory: (storyId: string) => Promise<KnownEntity[]>
  updateSynthesisResultNarrative: (analysisId: string, narrative: NarrativeDocument) => Promise<void>
  markNarrativeGenerationFailedSafe: (analysisId: string) => Promise<void>
  findNarrativeImageForSynthesisResult: (synthesisResultId: string) => Promise<{ id: string } | null>
  createNarrativeImage: (input: NewNarrativeImage) => Promise<void>
  /** Ticket 72/75's second `thread.trackClaimSeries` trigger point — see this job's own doc
   *  comment (near the enqueue call below) for why. */
  findThreadIdForStory: (storyId: string) => Promise<string | null>
}

/** Ticket 51: best-effort illustrative lead image selection, run once right after the
 *  NarrativeDocument itself is persisted. Deliberately never throws — a missing/failed image
 *  search must not fail the whole `narrative.generate` job or trigger a retry: unlike the
 *  Narrative LLM call, there's no "content issue vs outage" distinction worth a bounded retry
 *  for, and (crucially) a retry would re-enter this job after `narrative` is already non-null,
 *  hitting the "narrative already present" skip guard above before ever reaching this step again
 *  — so a thrown-and-retried image failure would silently never get a second attempt anyway. An
 *  Analysis simply keeps no lead image if the search fails or finds nothing
 *  (NarrativeArticle.tsx renders identically either way — no broken-image state).
 *
 *  `candidateQueries` is tried in order, stopping at the first hit — discovered during
 *  implementation smoke-testing against real dev-DB Analyses: a full generated headline (a whole
 *  Czech sentence, grammatically inflected) very often returns zero Commons hits, while a single
 *  entity's `canonicalName` (a bare, nominative-case proper noun — a place, person, or org) hits
 *  far more reliably. The headline is still tried first since it best captures the *event*, not
 *  just an entity involved in it; the Story's most-salient entities (already loaded for the
 *  Narrative LLM call, so no extra query) are the fallback, not the primary. */
async function attachNarrativeLeadImage(
  synthesisResultId: string,
  candidateQueries: string[],
  deps: Pick<NarrativeJobDeps, 'findNarrativeImageForSynthesisResult' | 'createNarrativeImage'>,
  log?: FastifyBaseLogger
): Promise<void> {
  // The whole body is one try/catch, not just the search loop — findNarrativeImageForSynthesisResult
  // and createNarrativeImage are real DB calls too, and this function's contract (see docstring
  // above) is that NOTHING it does may throw, including a DB hiccup on either of those.
  try {
    const existing = await deps.findNarrativeImageForSynthesisResult(synthesisResultId)
    if (existing) {
      log?.warn(
        { synthesisResultId },
        'narrative.generate job: NarrativeImage already present (redelivered job?), skipping'
      )
      return
    }

    let image: Awaited<ReturnType<typeof searchWikimediaImageByQuery>> = null
    for (const query of candidateQueries) {
      image = await searchWikimediaImageByQuery(query)
      if (image) break
    }

    if (!image) {
      log?.info({ synthesisResultId }, 'narrative.generate job: no illustrative image found')
      return
    }

    await deps.createNarrativeImage({ synthesisResultId, provider: 'WIKIMEDIA', ...image })
  } catch (err) {
    log?.warn(
      { synthesisResultId, err },
      'narrative.generate job: illustrative lead image step failed, continuing without a lead image'
    )
  }
}

// Bounds how many entity-name fallback searches a single Analysis can trigger — the Story's
// known-entity list (findEntityMentionsForStory) is already sorted most-salient-first, so the
// first few carry most of the hit-rate benefit; unbounded would mean an Analysis with dozens of
// minor entity mentions triggers dozens of external calls for diminishing returns.
const MAX_ENTITY_IMAGE_QUERY_CANDIDATES = 5

/** Same source selection `getAnalysisDetail` used inline before this ticket — every non-excluded,
 *  successfully-extracted Coverage on the Analysis. Unlike `entity.extract`'s `coverageIds`
 *  pinning (ticket 14), there's no equivalent race to guard against here: this job only ever runs
 *  once, right after Synthesis has already consumed a fixed, already-settled set of extracted
 *  Coverage to produce the Analysis's Dimensions — there's no "verified at enqueue time" set to
 *  pin against a later concurrent attach the way draft-approval/coverage-confirmation had. */
export function buildNarrativeSources(
  coverages: Pick<CoverageWithSource, 'status' | 'extractedText' | 'source' | 'articleUrl'>[]
): NarrativeSource[] {
  return coverages
    .filter((c) => c.status === 'OK' && c.extractedText)
    .map((c) => ({ outlet: c.source.name, articleUrl: c.articleUrl, fullText: c.extractedText! }))
}

/** Handler for the `narrative.generate` job (ticket 15, supersedes ADR 0026): looks up the
 *  Analysis this job's `analysisId` points to and generates its Cross-Source Narrative from the
 *  already-completed Synthesis Dimensions plus the full text of every OK Coverage.
 *
 *  Three conditions short-circuit before any LLM call, none of them retryable: the Analysis (or
 *  its SynthesisResult) no longer existing, a narrative already present (pg-boss's at-least-once
 *  delivery can redeliver a job whose prior attempt already succeeded and persisted — this must
 *  not pay for a second LLM call and silently overwrite it with a different result), and no
 *  eligible source text (can't happen on the real enqueue path, defensive only — see ticket 15's
 *  Answer). All are logged and swallowed rather than thrown, same reasoning as `entity.extract`'s
 *  job (ticket 14).
 *
 *  Everything after that — the LLM call, quote verification dropping every segment (see
 *  quoteVerification.ts), and persisting the result — is retryable: any failure there is marked
 *  via markNarrativeGenerationFailedSafe as an audit trail, then rethrown so `registerJobWorker`
 *  reports `failed` and `LLM_JOB_RETRY_POLICY` (ticket 13) actually retries. Uses the same shared
 *  `runStageOrThrow` (pipelineStage.ts) `entity.extract`'s pipeline stages use, rather than a
 *  bespoke try/log/rethrow, so both LLM-calling jobs classify failures the same way.
 *
 *  Once the NarrativeDocument itself is safely persisted, a best-effort illustrative lead image
 *  is selected (ticket 51 — see attachNarrativeLeadImage). New Analyses only: an Analysis whose
 *  narrative was already generated before ticket 51 shipped hits the "narrative already present"
 *  skip above and is never revisited for a lead image, per ADR 0021's no-backfill convention. */
export async function runNarrativeJob(
  payload: JobPayload[typeof JobName.Narrative],
  deps: NarrativeJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const analysis = await deps.findAnalysisWithDetails(payload.analysisId)
  if (!analysis || !analysis.synthesisResult) {
    log?.warn(
      { analysisId: payload.analysisId },
      'narrative.generate job: Analysis or its SynthesisResult no longer exists, skipping'
    )
    return
  }

  if (analysis.synthesisResult.narrative) {
    log?.warn(
      { analysisId: payload.analysisId },
      'narrative.generate job: narrative already present (redelivered job?), skipping'
    )
    return
  }

  const sources = buildNarrativeSources(analysis.coverages)
  if (sources.length === 0) {
    log?.warn(
      { analysisId: payload.analysisId },
      'narrative.generate job: no OK Coverage with extractedText, skipping'
    )
    return
  }

  // Cast to NarrativeDimensions, not the full SynthesisResult shape: only the four narrative
  // dimensions are ever read here, so the 4-legacy-row "dimensions JSON predates agreementCategory"
  // gap (ticket 38's migration) that mappers/analysis.ts and analysisStream.ts had to patch around
  // simply doesn't apply to this call site — there's nothing to merge back in.
  const dimensions = analysis.synthesisResult.dimensions as unknown as NarrativeDimensions
  const logContext = { analysisId: payload.analysisId }
  let entities: KnownEntity[] = []

  try {
    entities = await runStageOrThrow(logContext, 'Loading the Story entity list', log, () =>
      deps.findEntityMentionsForStory(analysis.storyId)
    )

    const result = await runStageOrThrow(logContext, 'Cross-Source Narrative generation', log, () =>
      runNarrativePass(sources, dimensions, entities, log)
    )

    // Every block can end up dropped by verification failing twice — an empty result is a failure
    // for retry-gating purposes, not a successful "nothing to narrate" result. Logged explicitly
    // here (not inside runStageOrThrow, since this isn't a caught exception) so it's as visible in
    // the application log as the LLM-throw and persist-failure paths right above/below it.
    if (result.blocks.length === 0) {
      log?.error(logContext, 'Cross-Source Narrative generation produced no verifiable blocks')
      throw new ExternalServiceError('Cross-Source Narrative generation produced no verifiable blocks')
    }

    await runStageOrThrow(logContext, 'Persisting the Cross-Source Narrative', log, () =>
      deps.updateSynthesisResultNarrative(payload.analysisId, result)
    )
  } catch (err) {
    await deps.markNarrativeGenerationFailedSafe(payload.analysisId)
    throw err
  }

  // Outside the try/catch above on purpose: a failure here must never call
  // markNarrativeGenerationFailedSafe or rethrow — see attachNarrativeLeadImage's own docstring.
  await attachNarrativeLeadImage(
    analysis.synthesisResult.id,
    [
      analysis.synthesisResult.headline ?? analysis.seedHeadline,
      ...entities.slice(0, MAX_ENTITY_IMAGE_QUERY_CANDIDATES).map((e) => e.canonicalName),
    ],
    deps,
    log
  )

  // thread.trackClaimSeries (ticket 72/75): this Narrative may be the one `thread.recompute`'s own
  // chained enqueue ran too early for (narrative.generate and thread.recompute are fully decoupled
  // background jobs — ADR 0028 — with no ordering guarantee between them). Only fires when this
  // Story already belongs to a Thread; most Analyses never do. Best-effort, same posture as the
  // lead-image step above: a missing/failed enqueue here must not fail an already-successful
  // narrative.generate run.
  try {
    const threadId = await deps.findThreadIdForStory(analysis.storyId)
    if (threadId) await enqueueJob(JobName.ThreadTrackClaimSeries, { threadId })
  } catch (err) {
    log?.error(
      { ...logContext, err },
      'Failed to enqueue thread.trackClaimSeries after narrative.generate completion'
    )
  }
}
