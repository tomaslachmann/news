import { describe, it, expect, afterAll } from 'vitest'
import { disconnect } from '../../src/repositories/analysis.js'
import { findCachedEmbedding, saveCachedEmbedding } from '../../src/repositories/embeddingCache.js'

describe('EmbeddingCache repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('returns null for a key that has never been cached', async () => {
    const result = await findCachedEmbedding('text-embedding-3-small', 'never-seen-hash')

    expect(result).toBeNull()
  })

  it('saves and reads back a cached embedding for (model, inputHash)', async () => {
    await saveCachedEmbedding('text-embedding-3-small', 'hash-1', [0.1, 0.2, 0.3])

    const result = await findCachedEmbedding('text-embedding-3-small', 'hash-1')

    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('keys the cache on (model, inputHash) jointly — same hash, different model misses', async () => {
    await saveCachedEmbedding('text-embedding-3-small', 'hash-shared', [0.1, 0.2, 0.3])

    const result = await findCachedEmbedding('text-embedding-3-large', 'hash-shared')

    expect(result).toBeNull()
  })

  it('is upsert-safe: writing the same (model, inputHash) twice does not throw', async () => {
    await saveCachedEmbedding('text-embedding-3-small', 'hash-2', [0.1, 0.2, 0.3])

    await expect(
      saveCachedEmbedding('text-embedding-3-small', 'hash-2', [0.1, 0.2, 0.3])
    ).resolves.toBeUndefined()

    const result = await findCachedEmbedding('text-embedding-3-small', 'hash-2')
    expect(result).toEqual([0.1, 0.2, 0.3])
  })
})
