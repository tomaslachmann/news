import type { Analysis, AnalysisStatus, Coverage, Story, SynthesisResult, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { Analysis, AnalysisStatus }

export type AnalysisWithDetails = Analysis & {
  coverages: Coverage[]
  synthesisResult: SynthesisResult | null
}

export type AnalysisWithStory = Analysis & { story: Story }

/** Creates the Analysis and its Story together — a Story is always created alongside its
 *  Analysis, anchored to the same seed headline, per ADR 0017. */
export async function createAnalysis(data: { seedUrl: string; seedHeadline: string }): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'PENDING',
      story: { create: { anchorHeadline: data.seedHeadline } },
    },
  })
}

export async function createDraftAnalysis(data: {
  seedUrl: string
  seedHeadline: string
}): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'DRAFT',
      story: { create: { anchorHeadline: data.seedHeadline } },
    },
  })
}

export async function findAnalysisWithStory(id: string): Promise<AnalysisWithStory | null> {
  return prisma.analysis.findUnique({ where: { id }, include: { story: true } })
}

/** Every Seed Article URL ever recorded, across all Analyses — used by Ingestion alongside
 *  findAllArticleUrls to skip RSS items it has already turned into an Analysis. */
export async function findAllSeedUrls(): Promise<string[]> {
  const rows = await prisma.analysis.findMany({ select: { seedUrl: true } })
  return rows.map((r) => r.seedUrl)
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

export interface AnalysisListRow {
  id: string
  seedHeadline: string
  createdAt: Date
  status: AnalysisStatus
  okCoverageCount: number
}

export async function findAllAnalyses(includeAllStatuses: boolean): Promise<AnalysisListRow[]> {
  const rows = await prisma.analysis.findMany({
    where: includeAllStatuses ? undefined : { status: 'COMPLETE' },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { coverages: { where: { status: 'OK', excluded: false } } } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    seedHeadline: r.seedHeadline,
    createdAt: r.createdAt,
    status: r.status,
    okCoverageCount: r._count.coverages,
  }))
}

export async function updateAnalysisStatus(id: string, status: AnalysisStatus): Promise<void> {
  await prisma.analysis.update({ where: { id }, data: { status } })
}

/** Closes the underlying Prisma connection pool — for test teardown only. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

export async function completeAnalysisWithSynthesis(
  analysisId: string,
  dimensions: Prisma.InputJsonValue
): Promise<void> {
  await prisma.$transaction([
    prisma.synthesisResult.upsert({
      where: { analysisId },
      create: { analysisId, dimensions },
      update: { dimensions },
    }),
    prisma.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETE' } }),
  ])
}
