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

/** Records that the most recent narrative-generation attempt failed — ADR 0026, fixes P0-5
 *  (docs/audit.md): getAnalysisDetail only re-attempts once this is null or past
 *  NARRATIVE_RETRY_TTL_HOURS, bounding the cost of a deterministically-failing Analysis instead
 *  of retrying on every unauthenticated view. */
export async function markNarrativeGenerationFailed(analysisId: string): Promise<void> {
  await prisma.synthesisResult.update({
    where: { analysisId },
    data: { narrativeGenerationFailedAt: new Date() },
  })
}
