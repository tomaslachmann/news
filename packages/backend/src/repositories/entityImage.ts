import type { EntityImageProvider } from '@prisma/client'
import { prisma } from '../db.js'

export type { EntityImageProvider }

export interface NewEntityImage {
  entityId: string
  provider: EntityImageProvider
  externalId: string
  imageUrl: string
  thumbnailUrl?: string
  author?: string
  license?: string
  sourceUrl: string
  width?: number
  height?: number
}

/** Whether this Entity already has an image — checked by `entity.image.enrich`'s handler before
 *  fetching, so pg-boss's at-least-once delivery redelivering an already-succeeded attempt can't
 *  try to insert the same `[provider, externalId]` pair twice and fail on the unique constraint
 *  (same "already present, skip" idempotency narrativeJob.ts uses). */
export async function findEntityImageForEntity(entityId: string): Promise<{ id: string } | null> {
  return prisma.entityImage.findFirst({ where: { entityId }, select: { id: true } })
}

export async function createEntityImage(input: NewEntityImage): Promise<void> {
  await prisma.entityImage.create({ data: input })
}
