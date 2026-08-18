import type { Coverage, CoverageStatus, Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export type { Coverage, CoverageStatus }

export interface NewCoverage {
  analysisId: string
  sourceId: string
  title?: string
  articleUrl: string
  publishedAt?: string
  status: CoverageStatus
}

export type CoverageWithSource = Coverage & { source: { name: string } }

export async function createCoverages(coverages: NewCoverage[]): Promise<void> {
  if (coverages.length === 0) return
  // skipDuplicates: defense-in-depth for the partial unique index on (analysisId, sourceId) —
  // callers should never pass two rows for the same (analysisId, sourceId), but a caller-level
  // dedup bug or a race with a concurrent write should degrade to "one Coverage created" rather
  // than the whole batch throwing and creating none (docs/audit.md P0-6, ticket 02).
  await prisma.coverage.createMany({ data: coverages, skipDuplicates: true })
}

/** Non-excluded coverages for an Analysis, optionally narrowed to one status. Includes the
 *  Source relation — every caller needs the display name (Source.name), never a free-text
 *  outlet column (see docs/audit.md P0-6, fixed by ticket 02). */
export async function findCoveragesForAnalysis(
  analysisId: string,
  opts: { onlyStatus?: CoverageStatus } = {}
): Promise<CoverageWithSource[]> {
  return prisma.coverage.findMany({
    where: { analysisId, excluded: false, ...(opts.onlyStatus ? { status: opts.onlyStatus } : {}) },
    orderBy: { id: 'asc' },
    include: { source: { select: { name: true } } },
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

/** Excludes exactly the given Coverage ids — unlike excludeCoverages (which excludes everything
 *  *not* in a keep-list), this never touches a row that isn't named, so it's safe to call after
 *  a slow async gap (e.g. LLM verification) during which unrelated Coverage may have been
 *  attached concurrently by another process. See ticket 24. */
export async function excludeCoverageIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.coverage.updateMany({ where: { id: { in: ids } }, data: { excluded: true } })
}

/** Every Coverage article URL ever recorded, across all Analyses — used by Ingestion to skip
 *  RSS items it has already turned into a Coverage on some earlier pass. */
export async function findAllArticleUrls(): Promise<string[]> {
  const rows = await prisma.coverage.findMany({ select: { articleUrl: true } })
  return rows.map((r) => r.articleUrl)
}
