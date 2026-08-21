import { Prisma } from '@prisma/client'
import type { SynthesisResult } from '@prisma/client'
import type { NarrativeDocument } from '@news-triangulator/shared'
import { prisma } from '../db.js'

export type { SynthesisResult }

export async function findSynthesisResultByAnalysisId(analysisId: string): Promise<SynthesisResult | null> {
  return prisma.synthesisResult.findUnique({ where: { analysisId } })
}

/** Clears a stale SynthesisResult so `runAnalysisStream`'s cache check (analysisStream.ts) can't
 *  short-circuit and re-emit it instead of actually re-synthesizing — used by ticket 45's
 *  Pending Addition approval, the one place an already-COMPLETE Analysis is deliberately sent
 *  back through re-triangulation. A no-op, not an error, if no SynthesisResult exists yet (e.g. a
 *  retried approval after a prior attempt's transition failed partway through).
 *
 *  Takes an optional `tx` — `approvePendingAddition` runs this inside the same transaction as its
 *  COMPLETE→PENDING status write (via `updateAnalysisStatusIfCurrently`'s `onTransition` hook), so
 *  a failure in between can't leave the Analysis COMPLETE with no SynthesisResult. */
export async function deleteSynthesisResult(
  analysisId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  await (tx ?? prisma).synthesisResult.deleteMany({ where: { analysisId } })
}

export async function updateSynthesisResultNarrative(
  analysisId: string,
  narrative: NarrativeDocument
): Promise<void> {
  await prisma.synthesisResult.update({ where: { analysisId }, data: { narrative } })
}

/** Clears a COMPLETE Analysis's already-cached narrative back to SQL NULL, leaving every other
 *  `SynthesisResult` field (dimensions, headline, sourceOverlapPercentage, agreementCategory)
 *  untouched — used only by `scripts/backfillNarratives.ts` (ticket 47 / ADR 0034) to force a
 *  re-enqueued `narrative.generate` job past its own "narrative already present" skip guard
 *  (narrativeJob.ts), so every historical Analysis picks up the new NarrativeDocument shape.
 *  `Prisma.JsonNull`, not a bare `null`, is required here — Prisma's generated input type for a
 *  nullable Json column doesn't accept a plain `null` literal at all.
 *
 *  Runs inside its own transaction and calls `onTransition` (if given) before committing — same
 *  `onTransition`-inside-the-transaction convention `updateAnalysisStatusIfCurrently`/
 *  `completeAnalysisWithSynthesis` already established (repositories/analysis.ts). The backfill
 *  script passes its `enqueueJob` call as `onTransition` so a failure enqueueing rolls the nullify
 *  back too — an Analysis can never end up with its narrative cleared and no regeneration job
 *  actually in flight. Keeps the db.js/Prisma import inside the repository layer (ADR 0010) rather
 *  than exposing a raw `tx` for a script/service caller to orchestrate itself. */
export async function nullifySynthesisResultNarrative(
  analysisId: string,
  onTransition?: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.synthesisResult.update({ where: { analysisId }, data: { narrative: Prisma.JsonNull } })
    await onTransition?.(tx)
  })
}

/** Records that the most recent narrative-generation attempt failed — an audit trail only since
 *  ticket 15 (ADR 0028 supersedes ADR 0026): the `narrative.generate` job's own
 *  `LLM_JOB_RETRY_POLICY` (ticket 13) is what actually retries, not a read of this field. */
export async function markNarrativeGenerationFailed(analysisId: string): Promise<void> {
  await prisma.synthesisResult.update({
    where: { analysisId },
    data: { narrativeGenerationFailedAt: new Date() },
  })
}

/** markNarrativeGenerationFailed, but a failure to record the marker must never itself turn a
 *  graceful "serve the Analysis without a narrative" degrade into a hard error for the whole
 *  unauthenticated GET — same convention as llmCallLog.ts's recordLlmCallSafe and
 *  matchDecision.ts's recordMatchDecisionSafe ("a logging failure must never break the actual
 *  call it's recording"). Used by every real call site (analysisService.ts). */
export async function markNarrativeGenerationFailedSafe(analysisId: string): Promise<void> {
  try {
    await markNarrativeGenerationFailed(analysisId)
  } catch (err) {
    console.error('Failed to record narrative generation failure marker', err)
  }
}
