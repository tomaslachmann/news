import type { SynthesisResult } from '@prisma/client'
import { prisma } from '../db.js'

export type { SynthesisResult }

export async function findSynthesisResultByAnalysisId(analysisId: string): Promise<SynthesisResult | null> {
  return prisma.synthesisResult.findUnique({ where: { analysisId } })
}
