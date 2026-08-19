import type { FastifyBaseLogger } from 'fastify'
import { runNarrativePass, type NarrativeSource, type NarrativeResult } from '../services/narrativePass.js'
import type { SynthesisResult as SynthesisDimensions } from '../services/synthesisPass.js'
import type { AnalysisWithDetails } from '../repositories/analysis.js'
import type { CoverageWithSource } from '../repositories/coverage.js'
import { ExternalServiceError } from '../errors.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface NarrativeJobDeps {
  findAnalysisWithDetails: (analysisId: string) => Promise<AnalysisWithDetails | null>
  updateSynthesisResultNarrative: (
    analysisId: string,
    narrative: NarrativeResult['segments']
  ) => Promise<void>
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
 *  already-completed Synthesis Dimensions plus the full text of every OK Coverage. The Analysis
 *  (or its SynthesisResult) no longer existing and there being no eligible source text are both
 *  permanent conditions a retry can't fix — logged and swallowed rather than thrown, same
 *  reasoning as `entity.extract`'s job (ticket 14). An actual generation failure (the LLM call
 *  throwing, or quote verification dropping every segment — see quoteVerification.ts) is
 *  retryable: marked via markNarrativeGenerationFailedSafe as an audit trail, then rethrown as
 *  ExternalServiceError so `registerJobWorker` reports `failed` and `LLM_JOB_RETRY_POLICY`
 *  (ticket 13) actually retries. */
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

  const sources = buildNarrativeSources(analysis.coverages)
  if (sources.length === 0) {
    log?.warn(
      { analysisId: payload.analysisId },
      'narrative.generate job: no OK Coverage with extractedText, skipping'
    )
    return
  }

  const dimensions = analysis.synthesisResult.dimensions as unknown as SynthesisDimensions

  let result
  try {
    result = await runNarrativePass(sources, dimensions, log)
  } catch (err) {
    log?.error({ err, analysisId: payload.analysisId }, 'narrative.generate job: generation failed')
    await deps.markNarrativeGenerationFailedSafe(payload.analysisId)
    throw new ExternalServiceError('Cross-Source Narrative generation failed', { cause: err })
  }

  // Every segment can end up dropped by quote verification (see quoteVerification.ts) — an empty
  // result is a failure for retry-gating purposes, not a successful "nothing to narrate" result.
  if (result.segments.length === 0) {
    log?.error(
      { analysisId: payload.analysisId },
      'narrative.generate job: generation produced no verifiable segments'
    )
    await deps.markNarrativeGenerationFailedSafe(payload.analysisId)
    throw new ExternalServiceError('Cross-Source Narrative generation produced no verifiable segments')
  }

  await deps.updateSynthesisResultNarrative(payload.analysisId, result.segments)
}
