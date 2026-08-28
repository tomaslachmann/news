import { Prisma, type EntityImageProvider } from '@prisma/client'
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

export interface EntityWikiImageRow {
  imageUrl: string
  author: string | null
  license: string | null
  sourceUrl: string
}

/** This Entity's photo for the entity wiki page (ticket 90) — url plus the attribution the
 *  infobox credits (Wikimedia licensing, same as the Narrative lead image). v1 has at most one
 *  image per Entity (Wikimedia only, ADR 0034), so `findFirst` is the whole story. Null when
 *  none fetched. */
export async function findEntityWikiImage(entityId: string): Promise<EntityWikiImageRow | null> {
  return prisma.entityImage.findFirst({
    where: { entityId },
    select: { imageUrl: true, author: true, license: true, sourceUrl: true },
  })
}

/** The existence check in `entityImageEnrichJob.ts` and this insert aren't atomic, so two
 *  concurrently-run enrich jobs for the same Entity (a double-link, or a retry overlapping a
 *  fresh enqueue) can both pass that check and race here — the loser hits this same
 *  `[provider, externalId]` pair the winner just inserted. That's not a real failure (the image
 *  is enriched either way), so it's swallowed as a no-op rather than surfaced, keeping the job
 *  handler's "never rethrows" contract intact for this case too. */
export async function createEntityImage(input: NewEntityImage): Promise<void> {
  try {
    await prisma.entityImage.create({ data: input })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return
    throw err
  }
}
