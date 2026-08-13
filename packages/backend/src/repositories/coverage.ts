import type { Coverage, CoverageStatus, AnalysisStatus, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { Coverage, CoverageStatus }

export interface NewCoverage {
  analysisId: string
  outlet: string
  title?: string
  articleUrl: string
  publishedAt?: string
  status: CoverageStatus
}

export async function createCoverages(coverages: NewCoverage[]): Promise<void> {
  if (coverages.length === 0) return
  await prisma.coverage.createMany({ data: coverages })
}

/** Non-excluded coverages for an Analysis, optionally narrowed to one status. */
export async function findCoveragesForAnalysis(
  analysisId: string,
  opts: { onlyStatus?: CoverageStatus } = {}
): Promise<Coverage[]> {
  return prisma.coverage.findMany({
    where: { analysisId, excluded: false, ...(opts.onlyStatus ? { status: opts.onlyStatus } : {}) },
    orderBy: { id: 'asc' },
  })
}

/** Every article URL ever recorded for an Analysis, including excluded ones — used for de-duping. */
export async function findCoverageUrlsForAnalysis(analysisId: string): Promise<string[]> {
  const rows = await prisma.coverage.findMany({ where: { analysisId }, select: { articleUrl: true } })
  return rows.map((r) => r.articleUrl)
}

export async function updateCoverage(
  id: string,
  data: { extractedText?: string; status?: CoverageStatus; extractionResult?: Prisma.InputJsonValue }
): Promise<void> {
  await prisma.coverage.update({ where: { id }, data })
}

export async function excludeCoverages(analysisId: string, keepIds: string[]): Promise<void> {
  await prisma.coverage.updateMany({
    where: { analysisId, id: { notIn: keepIds } },
    data: { excluded: true },
  })
}

export async function includeCoverages(analysisId: string, ids: string[]): Promise<void> {
  await prisma.coverage.updateMany({
    where: { analysisId, id: { in: ids } },
    data: { excluded: false },
  })
}

/** Every Coverage article URL ever recorded, across all Analyses — used by Ingestion to skip
 *  RSS items it has already turned into a Coverage on some earlier pass. */
export async function findAllArticleUrls(): Promise<string[]> {
  const rows = await prisma.coverage.findMany({ select: { articleUrl: true } })
  return rows.map((r) => r.articleUrl)
}

export interface RecentAnalysisMatch {
  analysisId: string
  status: AnalysisStatus
}

/** The most recently created Analysis (within `sinceHours`) that already has a Coverage matching
 *  one of `urls`, or null if none — Ingestion's dedup check against Stories already being tracked. */
export async function findRecentAnalysisMatchingUrls(
  urls: string[],
  sinceHours: number
): Promise<RecentAnalysisMatch | null> {
  if (urls.length === 0) return null

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const match = await prisma.coverage.findFirst({
    where: { articleUrl: { in: urls }, analysis: { createdAt: { gte: since } } },
    orderBy: { analysis: { createdAt: 'desc' } },
    select: { analysis: { select: { id: true, status: true } } },
  })

  return match ? { analysisId: match.analysis.id, status: match.analysis.status } : null
}
