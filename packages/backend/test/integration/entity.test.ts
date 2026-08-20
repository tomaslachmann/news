import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, disconnect } from '../../src/repositories/analysis.js'
import {
  replaceStoryEntities,
  findStoryEntitiesForScoring,
  findStoryEntity,
  countStories,
} from '../../src/repositories/entity.js'

// Entity.key is globally unique across the whole shared test-container database (not scoped per
// Story, unlike the JSON column this replaces) — every test below uses its own key so storyCount
// assertions can't be polluted by another test, or another test file, writing the same key.

describe('Entity repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('attaches a new entity to a Story, setting storyCount to 1', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e1', seedHeadline: 'x' })

    await replaceStoryEntities(
      storyId,
      [{ key: 'person:entity-test-1', name: 'Donald Tusk', type: 'PERSON', confidence: 0.9, salience: 0.5 }],
      []
    )

    const result = await findStoryEntitiesForScoring(storyId)
    expect(result.entities).toEqual([{ key: 'person:entity-test-1', storyCount: 1 }])
  })

  it('persists salience alongside confidence', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e1b', seedHeadline: 'x' })

    await replaceStoryEntities(
      storyId,
      [
        {
          key: 'person:entity-test-1b',
          name: 'Donald Tusk',
          type: 'PERSON',
          confidence: 0.9,
          salience: 0.75,
        },
      ],
      []
    )

    const storyEntity = await findStoryEntity(storyId, 'person:entity-test-1b')
    expect(storyEntity?.salience).toBe(0.75)
  })

  it('increments storyCount when a second, different Story attaches the same entity key', async () => {
    const first = await createAnalysis({ seedUrl: 'https://example.cz/entity-e2', seedHeadline: 'x' })
    const second = await createAnalysis({ seedUrl: 'https://example.cz/entity-e3', seedHeadline: 'x' })
    const entity = {
      key: 'country:entity-test-2',
      name: 'Poland',
      type: 'COUNTRY' as const,
      confidence: 0.9,
      salience: 1,
    }

    await replaceStoryEntities(first.storyId, [entity], [])
    await replaceStoryEntities(second.storyId, [entity], [])

    const result = await findStoryEntitiesForScoring(second.storyId)
    expect(result.entities).toEqual([{ key: 'country:entity-test-2', storyCount: 2 }])
  })

  it('does not double-count when the same Story re-extracts and re-includes an already-attached entity', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e4', seedHeadline: 'x' })
    const entity = {
      key: 'place:entity-test-3',
      name: 'Prague',
      type: 'PLACE' as const,
      confidence: 0.8,
      salience: 1,
    }

    await replaceStoryEntities(storyId, [entity], [])
    await replaceStoryEntities(storyId, [entity], [])

    const result = await findStoryEntitiesForScoring(storyId)
    expect(result.entities).toEqual([{ key: 'place:entity-test-3', storyCount: 1 }])
  })

  it('does not double-count storyCount when two calls for the same Story race concurrently', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e4b', seedHeadline: 'x' })
    const entity = {
      key: 'place:entity-test-3b',
      name: 'Prague',
      type: 'PLACE' as const,
      confidence: 0.8,
      salience: 1,
    }

    // Both calls see the same pre-write state if unserialized — the pg_advisory_xact_lock in
    // replaceStoryEntities must force one to wait for the other rather than both incrementing.
    await Promise.all([
      replaceStoryEntities(storyId, [entity], []),
      replaceStoryEntities(storyId, [entity], []),
    ])

    const result = await findStoryEntitiesForScoring(storyId)
    expect(result.entities).toEqual([{ key: 'place:entity-test-3b', storyCount: 1 }])
  })

  it('decrements storyCount for an entity a Story drops on re-extraction, without affecting another Story still attached to it', async () => {
    const dropping = await createAnalysis({ seedUrl: 'https://example.cz/entity-e5', seedHeadline: 'x' })
    const stillAttached = await createAnalysis({ seedUrl: 'https://example.cz/entity-e6', seedHeadline: 'x' })
    const dropped = {
      key: 'org:entity-test-4',
      name: 'United Nations',
      type: 'ORGANIZATION' as const,
      confidence: 0.9,
      salience: 1,
    }
    const kept = {
      key: 'place:entity-test-5',
      name: 'New York',
      type: 'PLACE' as const,
      confidence: 0.9,
      salience: 1,
    }

    await replaceStoryEntities(dropping.storyId, [dropped], [])
    await replaceStoryEntities(stillAttached.storyId, [dropped], [])
    // Re-extraction for `dropping` no longer mentions `dropped`, only `kept`.
    await replaceStoryEntities(dropping.storyId, [kept], [])

    const droppingResult = await findStoryEntitiesForScoring(dropping.storyId)
    const stillAttachedResult = await findStoryEntitiesForScoring(stillAttached.storyId)
    expect(droppingResult.entities).toEqual([{ key: 'place:entity-test-5', storyCount: 1 }])
    // storyCount for the dropped entity reflects only `stillAttached` now — the drop decremented
    // it once, not to zero.
    expect(stillAttachedResult.entities).toEqual([{ key: 'org:entity-test-4', storyCount: 1 }])
  })

  it('persists entity relations and resolves them to the correct from/to keys', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e7', seedHeadline: 'x' })
    const tusk = {
      key: 'person:entity-test-6',
      name: 'Donald Tusk',
      type: 'PERSON' as const,
      confidence: 0.9,
      salience: 1,
    }
    const poland = {
      key: 'country:entity-test-7',
      name: 'Poland',
      type: 'COUNTRY' as const,
      confidence: 0.9,
      salience: 1,
    }

    await replaceStoryEntities(
      storyId,
      [tusk, poland],
      [{ from: tusk.key, to: poland.key, type: 'REPRESENTS', confidence: 0.85 }]
    )

    const result = await findStoryEntitiesForScoring(storyId)
    expect(result.entityRelations).toEqual([
      { fromKey: 'person:entity-test-6', toKey: 'country:entity-test-7', type: 'REPRESENTS' },
    ])
  })

  it('fully replaces entity relations on re-extraction rather than accumulating them', async () => {
    const { storyId } = await createAnalysis({ seedUrl: 'https://example.cz/entity-e8', seedHeadline: 'x' })
    const tusk = {
      key: 'person:entity-test-8',
      name: 'Donald Tusk',
      type: 'PERSON' as const,
      confidence: 0.9,
      salience: 1,
    }
    const poland = {
      key: 'country:entity-test-9',
      name: 'Poland',
      type: 'COUNTRY' as const,
      confidence: 0.9,
      salience: 1,
    }
    const eu = {
      key: 'org:entity-test-10',
      name: 'European Union',
      type: 'ORGANIZATION' as const,
      confidence: 0.9,
      salience: 1,
    }

    await replaceStoryEntities(
      storyId,
      [tusk, poland],
      [{ from: tusk.key, to: poland.key, type: 'REPRESENTS', confidence: 0.85 }]
    )
    await replaceStoryEntities(
      storyId,
      [tusk, eu],
      [{ from: tusk.key, to: eu.key, type: 'MEMBER_OF', confidence: 0.7 }]
    )

    const result = await findStoryEntitiesForScoring(storyId)
    expect(result.entityRelations).toEqual([
      { fromKey: 'person:entity-test-8', toKey: 'org:entity-test-10', type: 'MEMBER_OF' },
    ])
  })

  it('countStories reflects the total number of Stories created', async () => {
    // >= before+1, not ===: this integration DB is shared across every test file, run in
    // parallel — another file creating a Story between the two reads below is expected, not a
    // bug. The point of this assertion is only that countStories picks up a newly created Story
    // at all.
    const before = await countStories()

    await createAnalysis({ seedUrl: 'https://example.cz/entity-e9', seedHeadline: 'x' })

    expect(await countStories()).toBeGreaterThanOrEqual(before + 1)
  })
})
