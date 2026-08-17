import type { Analysis, AnalysisStatus, Coverage, Story, SynthesisResult, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { Analysis, AnalysisStatus }

export type AnalysisWithDetails = Analysis & {
  coverages: Coverage[]
  synthesisResult: SynthesisResult | null
}

export type AnalysisWithStory = Analysis & { story: Story }

/** Creates the Analysis and its Story together — a Story is always created alongside its
 *  Analysis, anchored to the same seed headline, per ADR 0017. Accepts an optional embedding
 *  (ticket 27) so a human-seeded Story can participate in the same matching pool Ingestion's
 *  own Stories already do — before ticket 27 this was always omitted, which is why Ingestion
 *  could never recognize a human had already started investigating an event (ADR 0019). */
export async function createAnalysis(data: {
  seedUrl: string
  seedHeadline: string
  embedding?: number[]
}): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'PENDING',
      story: { create: { anchorHeadline: data.seedHeadline, embedding: data.embedding ?? [] } },
    },
  })
}

export async function createDraftAnalysis(data: {
  seedUrl: string
  seedHeadline: string
  embedding?: number[]
}): Promise<Analysis> {
  return prisma.analysis.create({
    data: {
      seedUrl: data.seedUrl,
      seedHeadline: data.seedHeadline,
      status: 'DRAFT',
      story: { create: { anchorHeadline: data.seedHeadline, embedding: data.embedding ?? [] } },
    },
  })
}

export async function findAnalysisWithStory(id: string): Promise<AnalysisWithStory | null> {
  return prisma.analysis.findUnique({ where: { id }, include: { story: true } })
}

export interface RecentStoryCandidate {
  storyId: string
  analysisId: string
  analysisStatus: AnalysisStatus
  embedding: number[]
  createdAt: Date
  anchorHeadline: string
}

/** Every Story whose Analysis was created within `sinceHours`, with its embedding — the
 *  candidate pool Ingestion's cheap matching scores a new RSS item against, and (ticket 27)
 *  human-seeded submission's own dedup check scores a new seed against. Includes every
 *  Analysis status (not just DRAFT/PENDING): a match against a COMPLETE Analysis still needs
 *  surfacing as a possible addition, and a match against FAILED must still be recognized as
 *  already-seen so it isn't recreated on the next poll. See ADR 0018. */
export async function findRecentStoriesForMatching(sinceHours: number): Promise<RecentStoryCandidate[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await prisma.story.findMany({
    where: { analysis: { createdAt: { gte: since } } },
    include: { analysis: { select: { id: true, status: true, createdAt: true } } },
  })

  return rows
    .filter((r): r is typeof r & { analysis: NonNullable<(typeof r)['analysis']> } => r.analysis !== null)
    .map((r) => ({
      storyId: r.id,
      analysisId: r.analysis.id,
      analysisStatus: r.analysis.status,
      embedding: r.embedding,
      createdAt: r.analysis.createdAt,
      anchorHeadline: r.anchorHeadline,
    }))
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

/** Shared by findAllAnalyses and findDraftsWithCoverageCount — both need "Analyses matching X,
 *  each with a Coverage count matching Y", differing only in which rows and which Coverage rows
 *  count. */
async function findAnalysesWithCoverageCount(
  analysisWhere: Prisma.AnalysisWhereInput | undefined,
  coverageWhere: Prisma.CoverageWhereInput
) {
  return prisma.analysis.findMany({
    where: analysisWhere,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { coverages: { where: coverageWhere } } } },
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
  const rows = await findAnalysesWithCoverageCount(includeAllStatuses ? undefined : { status: 'COMPLETE' }, {
    status: 'OK',
    excluded: false,
  })

  return rows.map((r) => ({
    id: r.id,
    seedHeadline: r.seedHeadline,
    createdAt: r.createdAt,
    status: r.status,
    okCoverageCount: r._count.coverages,
  }))
}

export interface DraftListRow {
  id: string
  seedHeadline: string
  createdAt: Date
  coverageCount: number
}

/** Every DRAFT Analysis with its attached (non-excluded) Coverage count — deliberately every
 *  status, not just `OK` like `findAllAnalyses`'s `okCoverageCount`: a Draft's Coverage is
 *  always `PENDING` (nothing is scraped until Review Step confirmation after approval), so an
 *  OK-only count would always read zero here. Unfiltered by any visibility threshold — that's
 *  the caller's job (see `ingestionService.listVisibleDrafts`), so an Admin's full History audit
 *  can still see every Draft regardless of source count. */
export async function findDraftsWithCoverageCount(): Promise<DraftListRow[]> {
  const rows = await findAnalysesWithCoverageCount({ status: 'DRAFT' }, { excluded: false })

  return rows.map((r) => ({
    id: r.id,
    seedHeadline: r.seedHeadline,
    createdAt: r.createdAt,
    coverageCount: r._count.coverages,
  }))
}

export async function updateAnalysisStatus(id: string, status: AnalysisStatus): Promise<void> {
  await prisma.analysis.update({ where: { id }, data: { status } })
}

/** Like updateAnalysisStatus, but only writes if the row is still `fromStatus` — returns
 *  whether the transition actually happened. Used after a slow async gap (e.g. LLM
 *  verification) to avoid clobbering a status change (like a concurrent rejection) that landed
 *  in the meantime. See ticket 24. */
export async function updateAnalysisStatusIfCurrently(
  id: string,
  fromStatus: AnalysisStatus,
  toStatus: AnalysisStatus
): Promise<boolean> {
  const result = await prisma.analysis.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  })
  return result.count > 0
}

/** Closes the underlying Prisma connection pool — for test teardown only. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

/** Persists the Synthesis result and the tool-authored headline (see ADR 0021) and flips the
 *  Analysis to COMPLETE, all in one transaction — there is never a window where an Analysis is
 *  COMPLETE without its headline already having been generated. `headline` is null when
 *  generation was skipped because the Agreement dimension was empty. */
export async function completeAnalysisWithSynthesis(
  analysisId: string,
  dimensions: Prisma.InputJsonValue,
  headline: string | null
): Promise<void> {
  await prisma.$transaction([
    prisma.synthesisResult.upsert({
      where: { analysisId },
      create: { analysisId, dimensions, headline },
      update: { dimensions, headline },
    }),
    prisma.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETE' } }),
  ])
}
