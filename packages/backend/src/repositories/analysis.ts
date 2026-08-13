import type { Analysis, AnalysisStatus, Coverage, SynthesisResult } from '@prisma/client'
import { prisma } from '../db.js'

export type { Analysis, AnalysisStatus }

export type AnalysisWithDetails = Analysis & {
  coverages: Coverage[]
  synthesisResult: SynthesisResult | null
}

export async function createAnalysis(data: { seedUrl: string; seedHeadline: string }): Promise<Analysis> {
  return prisma.analysis.create({
    data: { seedUrl: data.seedUrl, seedHeadline: data.seedHeadline, status: 'PENDING' },
  })
}

export async function findAnalysisById(id: string): Promise<Analysis | null> {
  return prisma.analysis.findUnique({ where: { id } })
}

export async function findAnalysisWithDetails(id: string): Promise<AnalysisWithDetails | null> {
  return prisma.analysis.findUnique({
    where: { id },
    include: {
      coverages: { where: { excluded: false }, orderBy: { id: 'asc' } },
      synthesisResult: true,
    },
  })
}

export async function updateAnalysisStatus(id: string, status: AnalysisStatus): Promise<void> {
  await prisma.analysis.update({ where: { id }, data: { status } })
}

/** Closes the underlying Prisma connection pool — for test teardown only. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

export async function completeAnalysisWithSynthesis(analysisId: string, dimensions: object): Promise<void> {
  await prisma.$transaction([
    prisma.synthesisResult.upsert({
      where: { analysisId },
      create: { analysisId, dimensions },
      update: { dimensions },
    }),
    prisma.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETE' } }),
  ])
}
