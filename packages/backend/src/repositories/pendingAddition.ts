import { Prisma } from '@prisma/client'
import type { ArticleCategory, PendingAddition, PendingAdditionStatus, AnalysisStatus } from '@prisma/client'
import { prisma } from '../db.js'

export type { PendingAddition }

export interface NewPendingAddition {
  analysisId: string
  sourceId: string
  title?: string
  articleUrl: string
  publishedAt?: string
  /** Resolved via resolveCategoryForCandidate (articleCategoryMapping.ts) at flag time --
   *  feed-implied (ticket 79) or per-item mapping-table lookup (ticket 78), same precedence as
   *  NewCoverage.primaryCategory. Copied verbatim onto the Coverage approvePendingAddition later
   *  creates (ticket 78, code review). */
  primaryCategory?: ArticleCategory | null
}

export async function createPendingAddition(data: NewPendingAddition): Promise<PendingAddition> {
  return prisma.pendingAddition.create({ data })
}

export type PendingAdditionWithAnalysis = PendingAddition & {
  analysis: { seedHeadline: string }
  source: { name: string }
}

export interface PendingAdditionsPageQuery {
  offset: number
  limit: number
  /** Order direction on `createdAt`. Default `desc`. */
  dir?: 'asc' | 'desc'
  /** Case-insensitive substring match against the flagged Coverage's Source name. */
  outlet?: string
  createdAfter?: Date
  createdBefore?: Date
}

function pendingAdditionWhere(q: PendingAdditionsPageQuery): Prisma.PendingAdditionWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (q.createdAfter) createdAt.gte = q.createdAfter
  if (q.createdBefore) createdAt.lte = q.createdBefore
  return {
    status: 'PENDING_REVIEW',
    ...(q.outlet ? { source: { name: { contains: q.outlet, mode: 'insensitive' } } } : {}),
    ...(q.createdAfter || q.createdBefore ? { createdAt } : {}),
  }
}

/** Only `PENDING_REVIEW` rows — a resolved (approved/rejected) one stops appearing here without
 *  being deleted (ticket 45), same convention as StoryRelation's `findPendingReviewRelationsPage`.
 *  Offset-paginated with a real `total` (ticket 88) — a bounded admin queue, not a public feed;
 *  `dir`/`outlet`/date-range are optional Admin triage controls. */
export async function findPendingAdditionsPage(
  q: PendingAdditionsPageQuery
): Promise<{ rows: PendingAdditionWithAnalysis[]; total: number }> {
  const where = pendingAdditionWhere(q)
  const dir = q.dir ?? 'desc'
  const [rows, total] = await Promise.all([
    prisma.pendingAddition.findMany({
      where,
      orderBy: [{ createdAt: dir }, { id: dir }],
      skip: q.offset,
      take: q.limit,
      include: { analysis: { select: { seedHeadline: true } }, source: { select: { name: true } } },
    }),
    prisma.pendingAddition.count({ where }),
  ])
  return { rows, total }
}

export type PendingAdditionWithAnalysisStatus = PendingAddition & {
  analysis: { status: AnalysisStatus }
}

export async function findPendingAdditionById(id: string): Promise<PendingAdditionWithAnalysisStatus | null> {
  return prisma.pendingAddition.findUnique({
    where: { id },
    include: { analysis: { select: { status: true } } },
  })
}

/** Like StoryRelation's `updateStoryRelationStatusIfCurrently` — only writes if the row is still
 *  `fromStatus`, guarding against a concurrent action (e.g. approve and reject double-clicked) on
 *  the same row racing this read-check-then-write. Returns whether the transition happened. */
export async function updatePendingAdditionStatusIfCurrently(
  id: string,
  fromStatus: PendingAdditionStatus,
  toStatus: PendingAdditionStatus
): Promise<boolean> {
  const result = await prisma.pendingAddition.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  })
  return result.count > 0
}

/** Backdates/postdates a PendingAddition's createdAt — exists for integration tests that need
 *  deterministic keyset-pagination ordering (ticket 49), same convention as analysis.ts's
 *  `setAnalysisCreatedAtForTesting`. */
export async function setPendingAdditionCreatedAtForTesting(id: string, createdAt: Date): Promise<void> {
  await prisma.pendingAddition.update({ where: { id }, data: { createdAt } })
}
