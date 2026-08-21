import type { FastifyBaseLogger } from 'fastify'
import type { NarrativeDocument } from '@news-triangulator/shared'
import {
  runNarrativePass,
  type NarrativeSource,
  type NarrativeDimensions,
  type KnownEntity,
} from '../services/narrativePass.js'
import { runStageOrThrow } from '../services/pipelineStage.js'
import type { AnalysisWithDetails } from '../repositories/analysis.js'
import type { CoverageWithSource } from '../repositories/coverage.js'
import { ExternalServiceError } from '../errors.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface NarrativeJobDeps {
  findAnalysisWithDetails: (analysisId: string) => Promise<AnalysisWithDetails | null>
  /** The Story's full known-entity set (ticket 47 / ADR 0034) — given to the Narrative LLM so an
   *  inline `<nt:e>` tag's `entityKey` is grounded against a real entity rather than invented. */
  findEntityMentionsForStory: (storyId: string) => Promise<KnownEntity[]>
  updateSynthesisResultNarrative: (analysisId: string, narrative: NarrativeDocument) => Promise<void>
  markNarrativeGenerationFailedSafe: (analysisId: string) => Promise<void>
}

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
 *  bespoke try/log/rethrow, so both LLM-calling jobs classify failures the same way. */
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

  try {
    const entities = await runStageOrThrow(logContext, 'Loading the Story entity list', log, () =>
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
}
