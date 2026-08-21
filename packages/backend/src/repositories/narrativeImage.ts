import { Prisma, type EntityImageProvider } from '@prisma/client'
import { prisma } from '../db.js'

export type { EntityImageProvider }

export interface NewNarrativeImage {
  synthesisResultId: string
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

/** Whether this SynthesisResult already has a lead image — checked by `narrative.generate`'s
 *  image step before searching, so pg-boss's at-least-once delivery redelivering an
 *  already-succeeded attempt can't try to insert a second row for the same `synthesisResultId`
 *  and fail on the unique constraint (same "already present, skip" idempotency `entityImage.ts`
 *  uses). */
export async function findNarrativeImageForSynthesisResult(
  synthesisResultId: string
): Promise<{ id: string } | null> {
  return prisma.narrativeImage.findUnique({ where: { synthesisResultId }, select: { id: true } })
}

/** The existence check above and this insert aren't atomic, so two concurrently-run attempts for
 *  the same SynthesisResult (a redelivered job overlapping a fresh one) can both pass that check
 *  and race here — the loser hits the same `synthesisResultId` unique constraint the winner just
 *  inserted. That's not a real failure (the image is attached either way), so it's swallowed as a
 *  no-op rather than surfaced, same convention as `entityImage.ts`'s `createEntityImage`. */
export async function createNarrativeImage(input: NewNarrativeImage): Promise<void> {
  try {
    await prisma.narrativeImage.create({ data: input })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return
    throw err
  }
}
