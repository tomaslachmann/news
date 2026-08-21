import type { PendingAddition, PendingAdditionStatus, AnalysisStatus } from '@prisma/client'
import { prisma } from '../db.js'

export type { PendingAddition }

export interface NewPendingAddition {
  analysisId: string
  sourceId: string
  title?: string
  articleUrl: string
  publishedAt?: string
}

export async function createPendingAddition(data: NewPendingAddition): Promise<void> {
  await prisma.pendingAddition.create({ data })
}

export type PendingAdditionWithAnalysis = PendingAddition & {
  analysis: { seedHeadline: string }
  source: { name: string }
}

/** Only `PENDING_REVIEW` rows — a resolved (approved/rejected) one stops appearing here without
 *  being deleted (ticket 45), same convention as StoryRelation's `findPendingReviewRelations`. */
export async function findAllPendingAdditions(): Promise<PendingAdditionWithAnalysis[]> {
  return prisma.pendingAddition.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'desc' },
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
