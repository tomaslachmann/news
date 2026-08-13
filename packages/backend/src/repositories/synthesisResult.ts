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
