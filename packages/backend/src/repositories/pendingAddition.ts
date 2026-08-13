import type { PendingAddition } from '@prisma/client'
import { prisma } from '../db.js'

export type { PendingAddition }

export interface NewPendingAddition {
  analysisId: string
  outlet: string
  title?: string
  articleUrl: string
  publishedAt?: string
}

export async function createPendingAddition(data: NewPendingAddition): Promise<void> {
  await prisma.pendingAddition.create({ data })
}

export type PendingAdditionWithAnalysis = PendingAddition & { analysis: { seedHeadline: string } }

export async function findAllPendingAdditions(): Promise<PendingAdditionWithAnalysis[]> {
  return prisma.pendingAddition.findMany({
    orderBy: { createdAt: 'desc' },
    include: { analysis: { select: { seedHeadline: true } } },
  })
}
