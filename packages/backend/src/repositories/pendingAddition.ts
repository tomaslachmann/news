import { Prisma } from '@prisma/client'
import type { PendingAddition, PendingAdditionStatus, AnalysisStatus } from '@prisma/client'
import { prisma } from '../db.js'
import type { Cursor } from '../pagination.js'

export type { PendingAddition }

export interface NewPendingAddition {
  analysisId: string
  sourceId: string
  title?: string
  articleUrl: string
  publishedAt?: string
}

export async function createPendingAddition(data: NewPendingAddition): Promise<PendingAddition> {
  return prisma.pendingAddition.create({ data })
}

export type PendingAdditionWithAnalysis = PendingAddition & {
  analysis: { seedHeadline: string }
  source: { name: string }
}

/** Row-tuple comparison, not a plain `createdAt <` — stable across inserts that land exactly on
 *  the boundary timestamp (keyset pagination, docs/audit.md P0-7, ticket 03), same as
 *  analysis.ts's own `cursorWhere`. */
function cursorWhere(cursor: Cursor | undefined): Prisma.PendingAdditionWhereInput {
  if (!cursor) return {}
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  }
}

/** Only `PENDING_REVIEW` rows — a resolved (approved/rejected) one stops appearing here without
 *  being deleted (ticket 45), same convention as StoryRelation's `findPendingReviewRelations`.
 *  Keyset (createdAt, id) pagination, same pattern as `findDraftsPage` (ticket 49) — no HAVING
 *  clause is needed here, so a plain Prisma `findMany` suffices, unlike `findDraftsPage`'s raw
 *  SQL. */
export async function findPendingAdditionsPage(
  cursor: Cursor | undefined,
  limit: number
): Promise<PendingAdditionWithAnalysis[]> {
  return prisma.pendingAddition.findMany({
    where: { status: 'PENDING_REVIEW', ...cursorWhere(cursor) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { analysis: { select: { seedHeadline: true } }, source: { select: { name: true } } },
  })
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
