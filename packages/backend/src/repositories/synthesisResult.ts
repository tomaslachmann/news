import type { SynthesisResult, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { SynthesisResult }

export async function findSynthesisResultByAnalysisId(analysisId: string): Promise<SynthesisResult | null> {
  return prisma.synthesisResult.findUnique({ where: { analysisId } })
}

export async function updateSynthesisResultNarrative(
  analysisId: string,
  narrative: Prisma.InputJsonValue
): Promise<void> {
  await prisma.synthesisResult.update({ where: { analysisId }, data: { narrative } })
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
