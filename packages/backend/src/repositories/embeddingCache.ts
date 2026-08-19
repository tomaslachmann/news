import { prisma } from '../db.js'

/** Looks up a previously-computed embedding for this exact (model, inputHash) pair — see ADR
 *  0025. Null on a miss; the caller is expected to fall back to actually calling the embeddings
 *  API and then persist the result via saveCachedEmbedding. */
export async function findCachedEmbedding(model: string, inputHash: string): Promise<number[] | null> {
  const row = await prisma.embeddingCache.findUnique({
    where: { model_inputHash: { model, inputHash } },
    select: { embedding: true },
  })
  return row?.embedding ?? null
}

/** Upsert-safe (same convention as sourceResolver.ts's auto-created Source): two concurrent
 *  requests for the same never-before-seen (model, inputHash) can both miss the cache and both
 *  call the embeddings API — the second write here must not throw on the first write's already
 *  having created the row. Both calls produce the same vector (the embedding function is
 *  deterministic for a fixed model), so which write "wins" doesn't matter. */
export async function saveCachedEmbedding(
  model: string,
  inputHash: string,
  embedding: number[]
): Promise<void> {
  await prisma.embeddingCache.upsert({
    where: { model_inputHash: { model, inputHash } },
    create: { model, inputHash, embedding },
    update: {},
  })
}
