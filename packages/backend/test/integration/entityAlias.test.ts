import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, disconnect } from '../../src/repositories/analysis.js'
import {
  replaceStoryEntities,
  findStoryEntitiesForScoring,
  findEntityById,
  findEntityByKey,
} from '../../src/repositories/entity.js'
import {
  resolveEntityKey,
  mergeEntities,
  findCandidatePairs,
  rejectCandidatePair,
  AlreadyMergedError,
} from '../../src/repositories/entityAlias.js'

async function entityIdByKey(key: string): Promise<string> {
  const entity = await findEntityByKey(key)
  if (!entity) throw new Error(`Test setup: no Entity found for key ${key}`)
  return entity.id
}

// Entity.key/canonicalName are globally unique/visible across the whole shared test-container
// database (not scoped per Story) — every test below uses its own unique suffix so storyCount and
// candidate-pair assertions can't be polluted by another test, or another test file, writing a
// similarly-named entity (see entity.test.ts's own header for the same convention).

const ADMIN_ID = 'admin-1'

async function seedEntity(
  storyId: string,
  key: string,
  name: string,
  type: 'PERSON' | 'ORGANIZATION' | 'PLACE' | 'COUNTRY' = 'COUNTRY'
): Promise<string> {
  await replaceStoryEntities(storyId, [{ key, name, type, confidence: 0.9, salience: 1 }], [])
  return entityIdByKey(key)
}

describe('entityAlias repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  describe('resolveEntityKey', () => {
    it('returns the key unchanged when no alias exists', async () => {
      expect(await resolveEntityKey('country:entity-alias-unresolved')).toBe(
        'country:entity-alias-unresolved'
      )
    })

    it('returns the surviving key after a confirmed merge', async () => {
      const first = await createAnalysis({ seedUrl: 'https://example.cz/alias-r1', seedHeadline: 'x' })
      const second = await createAnalysis({ seedUrl: 'https://example.cz/alias-r1b', seedHeadline: 'x' })
      const survivorId = await seedEntity(first.storyId, 'country:entity-alias-r1-usa', 'United States')
      // A second, independent Analysis/Story for the merged-away entity — reusing the first
      // Story's own id would double-attach both entities to the same Story, which is a separate
      // scenario tested below.
      const mergedAwayId = await seedEntity(second.storyId, 'country:entity-alias-r1-us', 'US')

      await mergeEntities(survivorId, mergedAwayId, ADMIN_ID)

      expect(await resolveEntityKey('country:entity-alias-r1-us')).toBe('country:entity-alias-r1-usa')
      // The survivor's own key still resolves to itself.
      expect(await resolveEntityKey('country:entity-alias-r1-usa')).toBe('country:entity-alias-r1-usa')
    })

    it('flattens a chained merge — resolving the original key still reaches the final survivor', async () => {
      // A merges into B, then B (now itself a survivor) merges into C. resolveEntityKey(A.key)
      // must reach C directly, in one lookup, not stop at the now-stale B.
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-r2a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-r2b', seedHeadline: 'x' })
      const a3 = await createAnalysis({ seedUrl: 'https://example.cz/alias-r2c', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'country:entity-alias-r2-a', 'A Name')
      const idB = await seedEntity(a2.storyId, 'country:entity-alias-r2-b', 'B Name')
      const idC = await seedEntity(a3.storyId, 'country:entity-alias-r2-c', 'C Name')

      await mergeEntities(idB, idA, ADMIN_ID) // A -> B
      await mergeEntities(idC, idB, ADMIN_ID) // B -> C

      expect(await resolveEntityKey('country:entity-alias-r2-a')).toBe('country:entity-alias-r2-c')
      expect(await resolveEntityKey('country:entity-alias-r2-b')).toBe('country:entity-alias-r2-c')
    })
  })

  describe('mergeEntities', () => {
    it('repoints an existing StoryEntity row from the merged-away entity to the survivor', async () => {
      const analysis = await createAnalysis({ seedUrl: 'https://example.cz/alias-m1', seedHeadline: 'x' })
      const other = await createAnalysis({ seedUrl: 'https://example.cz/alias-m1b', seedHeadline: 'x' })
      const survivorId = await seedEntity(other.storyId, 'country:entity-alias-m1-usa', 'United States')
      const mergedAwayId = await seedEntity(analysis.storyId, 'country:entity-alias-m1-us', 'US')

      await mergeEntities(survivorId, mergedAwayId, ADMIN_ID)

      const result = await findStoryEntitiesForScoring(analysis.storyId)
      expect(result.entities).toEqual([{ key: 'country:entity-alias-m1-usa', storyCount: 2 }])
    })

    it('deletes the merged-away row instead of repointing when a Story already has both entities attached', async () => {
      const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/alias-m2', seedHeadline: 'x' })
      const survivorId = await seedEntity(storyId, 'country:entity-alias-m2-usa', 'United States')
      // Attach the second entity to the SAME Story — replaceStoryEntities replaces the whole set,
      // so both must be passed together to keep the survivor attached too.
      await replaceStoryEntities(
        storyId,
        [
          {
            key: 'country:entity-alias-m2-usa',
            name: 'United States',
            type: 'COUNTRY',
            confidence: 0.9,
            salience: 1,
          },
          { key: 'country:entity-alias-m2-us', name: 'US', type: 'COUNTRY', confidence: 0.9, salience: 1 },
        ],
        []
      )
      const mergedAwayId = await entityIdByKey('country:entity-alias-m2-us')

      await mergeEntities(survivorId, mergedAwayId, ADMIN_ID)

      const result = await findStoryEntitiesForScoring(storyId)
      expect(result.entities).toEqual([{ key: 'country:entity-alias-m2-usa', storyCount: 1 }])
      expect((await findEntityById(survivorId))?.storyCount).toBe(1)
    })

    it('repoints a StoryEntityRelation edge referencing the merged-away entity', async () => {
      const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/alias-m3', seedHeadline: 'x' })
      const other = await createAnalysis({ seedUrl: 'https://example.cz/alias-m3b', seedHeadline: 'x' })
      const survivorId = await seedEntity(other.storyId, 'country:entity-alias-m3-usa', 'United States')
      const tusk = {
        key: 'person:entity-alias-m3-tusk',
        name: 'Donald Tusk',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const us = {
        key: 'country:entity-alias-m3-us',
        name: 'US',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }
      await replaceStoryEntities(
        storyId,
        [tusk, us],
        [{ from: tusk.key, to: us.key, type: 'REPRESENTS', confidence: 0.8 }]
      )
      const mergedAwayId = await entityIdByKey(us.key)

      await mergeEntities(survivorId, mergedAwayId, ADMIN_ID)

      const result = await findStoryEntitiesForScoring(storyId)
      expect(result.entityRelations).toEqual([
        { fromKey: 'person:entity-alias-m3-tusk', toKey: 'country:entity-alias-m3-usa', type: 'REPRESENTS' },
      ])
    })

    it('drops a relation that would become a self-relation after repointing, rather than violating the CHECK constraint', async () => {
      const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/alias-m4', seedHeadline: 'x' })
      const survivorId = await seedEntity(storyId, 'country:entity-alias-m4-usa', 'United States')
      const us = {
        key: 'country:entity-alias-m4-us',
        name: 'US',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }
      await replaceStoryEntities(
        storyId,
        [
          {
            key: 'country:entity-alias-m4-usa',
            name: 'United States',
            type: 'COUNTRY',
            confidence: 0.9,
            salience: 1,
          },
          us,
        ],
        // survivor REPRESENTS mergedAway — after repointing mergedAway to survivor, this becomes
        // a self-relation.
        [{ from: 'country:entity-alias-m4-usa', to: us.key, type: 'PART_OF', confidence: 0.7 }]
      )
      const mergedAwayId = await entityIdByKey(us.key)

      await mergeEntities(survivorId, mergedAwayId, ADMIN_ID)

      const result = await findStoryEntitiesForScoring(storyId)
      expect(result.entityRelations).toEqual([])
    })

    it('throws AlreadyMergedError when the merged-away entity has already been merged once before', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m5a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m5b', seedHeadline: 'x' })
      const a3 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m5c', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'country:entity-alias-m5-a', 'A Name')
      const idB = await seedEntity(a2.storyId, 'country:entity-alias-m5-b', 'B Name')
      const idC = await seedEntity(a3.storyId, 'country:entity-alias-m5-c', 'C Name')
      await mergeEntities(idB, idA, ADMIN_ID)

      await expect(mergeEntities(idC, idA, ADMIN_ID)).rejects.toThrow(AlreadyMergedError)
    })

    it('redirects onto the true survivor when survivingEntityId was itself already merged away (a stale candidate list)', async () => {
      // A merges into B first. A later, stale candidate list still shows {C, A} — the Admin
      // confirms with A as the chosen survivor, not realizing A no longer holds that role. The
      // merge must land C on B (A's own true survivor), not create a dangling alias through A.
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m6a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m6b', seedHeadline: 'x' })
      const a3 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m6c', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'country:entity-alias-m6-a', 'A Name')
      const idB = await seedEntity(a2.storyId, 'country:entity-alias-m6-b', 'B Name')
      const idC = await seedEntity(a3.storyId, 'country:entity-alias-m6-c', 'C Name')
      await mergeEntities(idB, idA, ADMIN_ID) // A -> B

      await mergeEntities(idA, idC, ADMIN_ID) // stale: "merge C into A"

      expect(await resolveEntityKey('country:entity-alias-m6-c')).toBe('country:entity-alias-m6-b')
      expect(await resolveEntityKey('country:entity-alias-m6-a')).toBe('country:entity-alias-m6-b')
      expect((await findEntityById(idA))?.storyCount).toBe(0)
      expect((await findEntityById(idB))?.storyCount).toBe(3)
    })

    it('throws AlreadyMergedError when survivingEntityId resolves onto mergedAwayEntityId itself', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m7a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m7b', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'country:entity-alias-m7-a', 'A Name')
      const idB = await seedEntity(a2.storyId, 'country:entity-alias-m7-b', 'B Name')
      await mergeEntities(idB, idA, ADMIN_ID) // A -> B

      // Stale: "survivor is A, merge B away" — but A's own true survivor is already B, so this
      // would ask B to merge into itself. mergedAwayEntityId (B) itself was never merged away, so
      // this must hit the second guard (post-resolution self-merge), not the first.
      await expect(mergeEntities(idA, idB, ADMIN_ID)).rejects.toThrow(AlreadyMergedError)
    })

    it('translates a genuine concurrent double-confirm race into AlreadyMergedError, not a raw Prisma error', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m8a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m8b', seedHeadline: 'x' })
      const a3 = await createAnalysis({ seedUrl: 'https://example.cz/alias-m8c', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'country:entity-alias-m8-a', 'A Name')
      const idB = await seedEntity(a2.storyId, 'country:entity-alias-m8-b', 'B Name')
      const idC = await seedEntity(a3.storyId, 'country:entity-alias-m8-c', 'C Name')

      const results = await Promise.allSettled([
        mergeEntities(idB, idA, ADMIN_ID),
        mergeEntities(idC, idA, ADMIN_ID),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0]?.reason).toBeInstanceOf(AlreadyMergedError)
    })
  })

  describe('findCandidatePairs / rejectCandidatePair', () => {
    it('ranks a similarly-named same-type pair above the threshold, ordered by similarity', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c1a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c1b', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'place:entity-alias-c1-praha', 'Zzalias Praha C1', 'PLACE')
      const idB = await seedEntity(a2.storyId, 'place:entity-alias-c1-praha2', 'Zzalias Praha C1', 'PLACE')

      const candidates = await findCandidatePairs(0.3, 200)
      const pair = candidates.find(
        (c) =>
          (c.entityA.id === idA && c.entityB.id === idB) || (c.entityA.id === idB && c.entityB.id === idA)
      )
      expect(pair).toBeDefined()
      expect(pair?.similarity).toBeGreaterThan(0.3)
    })

    it('excludes a pair once it has been rejected', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c2a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c2b', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'place:entity-alias-c2-praha', 'Zzalias Praha C2', 'PLACE')
      const idB = await seedEntity(a2.storyId, 'place:entity-alias-c2-praha2', 'Zzalias Praha C2', 'PLACE')

      await rejectCandidatePair(idB, idA, ADMIN_ID) // reversed order on purpose

      const candidates = await findCandidatePairs(0.3, 200)
      const pair = candidates.find(
        (c) =>
          (c.entityA.id === idA && c.entityB.id === idB) || (c.entityA.id === idB && c.entityB.id === idA)
      )
      expect(pair).toBeUndefined()
    })

    it('rejecting the same pair twice is idempotent, not an error', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c3a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c3b', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'place:entity-alias-c3-a', 'Zzalias Reject C3')
      const idB = await seedEntity(a2.storyId, 'place:entity-alias-c3-b', 'Zzalias Reject C3')

      await rejectCandidatePair(idA, idB, ADMIN_ID)
      await expect(rejectCandidatePair(idA, idB, ADMIN_ID)).resolves.toBeUndefined()
    })

    it('excludes an entity already merged away from appearing in a new candidate pair', async () => {
      const a1 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c4a', seedHeadline: 'x' })
      const a2 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c4b', seedHeadline: 'x' })
      const a3 = await createAnalysis({ seedUrl: 'https://example.cz/alias-c4c', seedHeadline: 'x' })
      const idA = await seedEntity(a1.storyId, 'place:entity-alias-c4-a', 'Zzalias Merged C4', 'PLACE')
      const idB = await seedEntity(a2.storyId, 'place:entity-alias-c4-b', 'Zzalias Merged C4', 'PLACE')
      const idC = await seedEntity(a3.storyId, 'place:entity-alias-c4-c', 'Zzalias Merged C4', 'PLACE')
      await mergeEntities(idB, idA, ADMIN_ID)

      const candidates = await findCandidatePairs(0.3, 200)
      const involvesA = candidates.some((c) => c.entityA.id === idA || c.entityB.id === idA)
      expect(involvesA).toBe(false)
      // B (the survivor) and C are still both live and still a valid candidate pair.
      const involvesBAndC = candidates.some(
        (c) =>
          (c.entityA.id === idB && c.entityB.id === idC) || (c.entityA.id === idC && c.entityB.id === idB)
      )
      expect(involvesBAndC).toBe(true)
    })
  })
})
