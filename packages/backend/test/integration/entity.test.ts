import { describe, it, expect, afterAll } from 'vitest'
import {
  createAnalysis,
  updateAnalysisStatus,
  setAnalysisCreatedAtForTesting,
  disconnect,
} from '../../src/repositories/analysis.js'
import {
  replaceStoryEntities,
  findStoryEntitiesForScoring,
  findStoryEntity,
  countStories,
  searchEntitiesByName,
  findEventsForEntity,
  findRelationsForEntity,
  findEntityMentionsForStory,
  findEntityRelationsForStory,
  findEntityByKey,
} from '../../src/repositories/entity.js'
import { createEntityImage } from '../../src/repositories/entityImage.js'

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
    expect(result.entities).toEqual([{ key: 'person:entity-test-1', storyCount: 1, salience: 0.5 }])
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
    expect(result.entities).toEqual([{ key: 'country:entity-test-2', storyCount: 2, salience: 1 }])
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
    expect(result.entities).toEqual([{ key: 'place:entity-test-3', storyCount: 1, salience: 1 }])
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
    expect(result.entities).toEqual([{ key: 'place:entity-test-3b', storyCount: 1, salience: 1 }])
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
    expect(droppingResult.entities).toEqual([{ key: 'place:entity-test-5', storyCount: 1, salience: 1 }])
    // storyCount for the dropped entity reflects only `stillAttached` now — the drop decremented
    // it once, not to zero.
    expect(stillAttachedResult.entities).toEqual([{ key: 'org:entity-test-4', storyCount: 1, salience: 1 }])
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

  describe('resolveEntityKey wiring (ticket 40 / ADR 0033)', () => {
    it('routes a raw key through resolveEntityKey before it is used to upsert/attach', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-e10',
        seedHeadline: 'x',
      })
      const resolveEntityKey = (key: string) =>
        Promise.resolve(key === 'country:entity-test-alias-raw' ? 'country:entity-test-alias-survivor' : key)

      await replaceStoryEntities(
        storyId,
        [{ key: 'country:entity-test-alias-raw', name: 'US', type: 'COUNTRY', confidence: 0.9, salience: 1 }],
        [],
        resolveEntityKey
      )

      const result = await findStoryEntitiesForScoring(storyId)
      expect(result.entities).toEqual([
        { key: 'country:entity-test-alias-survivor', storyCount: 1, salience: 1 },
      ])
    })

    it('collapses two raw keys from the same batch that resolve to the same key into one attachment, not two', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-e11',
        seedHeadline: 'x',
      })
      const resolveEntityKey = () => Promise.resolve('country:entity-test-alias-collision-survivor')

      await replaceStoryEntities(
        storyId,
        [
          {
            key: 'country:entity-test-alias-collision-a',
            name: 'USA',
            type: 'COUNTRY',
            confidence: 0.6,
            salience: 1,
          },
          {
            key: 'country:entity-test-alias-collision-b',
            name: 'United States',
            type: 'COUNTRY',
            confidence: 0.9,
            salience: 1,
          },
        ],
        [],
        resolveEntityKey
      )

      const result = await findStoryEntitiesForScoring(storyId)
      // One attachment, storyCount 1 — not 2, which a naive per-raw-key upsert would produce.
      expect(result.entities).toEqual([
        { key: 'country:entity-test-alias-collision-survivor', storyCount: 1, salience: 1 },
      ])
    })

    it('resolves an entityRelation from/to using the raw key it was derived from, even after collision-merging', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-e12',
        seedHeadline: 'x',
      })
      const resolveEntityKey = (key: string) =>
        Promise.resolve(
          key === 'country:entity-test-alias-rel-a' ? 'country:entity-test-alias-rel-survivor' : key
        )
      const tusk = {
        key: 'person:entity-test-alias-rel-tusk',
        name: 'Donald Tusk',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const usRaw = {
        key: 'country:entity-test-alias-rel-a',
        name: 'US',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }

      await replaceStoryEntities(
        storyId,
        [tusk, usRaw],
        [{ from: tusk.key, to: usRaw.key, type: 'REPRESENTS', confidence: 0.8 }],
        resolveEntityKey
      )

      const result = await findStoryEntitiesForScoring(storyId)
      expect(result.entityRelations).toEqual([
        {
          fromKey: 'person:entity-test-alias-rel-tusk',
          toKey: 'country:entity-test-alias-rel-survivor',
          type: 'REPRESENTS',
        },
      ])
    })
  })

  describe('searchEntitiesByName (ticket 42)', () => {
    it('finds an entity by a close but not exact name match, ranked by similarity', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-search-1',
        seedHeadline: 'x',
      })
      await replaceStoryEntities(
        storyId,
        [
          {
            key: 'person:entity-search-fiala',
            name: 'Petr Fiala Ticket42Search',
            type: 'PERSON',
            confidence: 0.9,
            salience: 1,
          },
        ],
        []
      )

      const results = await searchEntitiesByName('Petr Fiala Ticket42Search', 10)
      expect(results.map((r) => r.key)).toContain('person:entity-search-fiala')
    })

    it('excludes an entity whose name is nothing like the query', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-search-2',
        seedHeadline: 'x',
      })
      await replaceStoryEntities(
        storyId,
        [
          {
            key: 'place:entity-search-unrelated',
            name: 'Xqzvwkmpljbnr Ticket42Unrelated',
            type: 'PLACE',
            confidence: 0.9,
            salience: 1,
          },
        ],
        []
      )

      const results = await searchEntitiesByName('Petr Fiala Ticket42Search', 10)
      expect(results.map((r) => r.key)).not.toContain('place:entity-search-unrelated')
    })
  })

  describe('findEventsForEntity (ticket 42)', () => {
    it('only returns Events whose Analysis is COMPLETE', async () => {
      const complete = await createAnalysis({
        seedUrl: 'https://example.cz/entity-events-1',
        seedHeadline: 'x',
      })
      const pending = await createAnalysis({
        seedUrl: 'https://example.cz/entity-events-2',
        seedHeadline: 'x',
      })
      const entity = {
        key: 'person:entity-events-test-1',
        name: 'Entity Events Test',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      await replaceStoryEntities(complete.storyId, [entity], [])
      await replaceStoryEntities(pending.storyId, [entity], [])
      await updateAnalysisStatus(complete.id, 'COMPLETE')
      // pending.status stays PENDING (default from createAnalysis) — not completed.

      const page = await findEventsForEntity('person:entity-events-test-1', undefined, 10)

      expect(page.map((r) => r.id)).toEqual([complete.id])
    })

    it('keyset-paginates a high-storyCount entity newest-first, resuming exactly where the previous page left off', async () => {
      // Same convention as pagination.test.ts's findAnalysesPage/findDraftsPage tests: fetch
      // generously (limit far larger than this test's own row count) and simulate a smaller real
      // page size by manually slicing the cursor, rather than relying on the repo's own `limit +
      // 1` "peel off the extra row" mechanics (pagination.ts's fetchPage/splitPage's job, not the
      // repository's).
      const entity = {
        key: 'country:entity-events-test-paginated',
        name: 'Paginated Country',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }

      const analyses = []
      for (let i = 0; i < 5; i++) {
        const a = await createAnalysis({
          seedUrl: `https://example.cz/entity-events-paginated-${i}`,
          seedHeadline: 'x',
        })
        await replaceStoryEntities(a.storyId, [entity], [])
        await updateAnalysisStatus(a.id, 'COMPLETE')
        // Deterministic ordering: i=0 is oldest, i=4 is newest — real wall-clock creation order
        // can't be relied on precisely enough for keyset-pagination assertions (ticket 03's own
        // integration tests use the same setAnalysisCreatedAtForTesting escape hatch).
        await setAnalysisCreatedAtForTesting(a.id, new Date(2026, 0, i + 1))
        analyses.push(a)
      }
      const ownIds = new Set(analyses.map((a) => a.id))

      const firstPage = (await findEventsForEntity(entity.key, undefined, 50)).filter((r) => ownIds.has(r.id))
      expect(firstPage.map((r) => r.id)).toEqual([
        analyses[4].id,
        analyses[3].id,
        analyses[2].id,
        analyses[1].id,
        analyses[0].id,
      ])

      // Pretend the "real" page size was 2 — resume after the second row.
      const cursorRow = firstPage[1]
      const secondPage = (
        await findEventsForEntity(entity.key, { createdAt: cursorRow.createdAt, id: cursorRow.id }, 50)
      ).filter((r) => ownIds.has(r.id))
      expect(secondPage.map((r) => r.id)).toEqual([analyses[2].id, analyses[1].id, analyses[0].id])
    })
  })

  describe('findRelationsForEntity (ticket 42)', () => {
    it('returns a relation attributed to its asserting (COMPLETE) Event, from either side', async () => {
      const { storyId, id: analysisId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-relations-1',
        seedHeadline: 'Relation seed headline',
      })
      const tusk = {
        key: 'person:entity-relations-test-tusk',
        name: 'Donald Tusk',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const poland = {
        key: 'country:entity-relations-test-poland',
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
      await updateAnalysisStatus(analysisId, 'COMPLETE')

      const fromTusk = await findRelationsForEntity(tusk.key)
      expect(fromTusk).toHaveLength(1)
      expect(fromTusk[0]).toMatchObject({
        type: 'REPRESENTS',
        fromEntity: { key: tusk.key },
        toEntity: { key: poland.key },
        analysisId,
        seedHeadline: 'Relation seed headline',
      })

      const fromPoland = await findRelationsForEntity(poland.key)
      expect(fromPoland).toHaveLength(1)
      expect(fromPoland[0]?.id).toBe(fromTusk[0]?.id)
    })

    it('excludes a relation asserted only by a not-yet-COMPLETE Analysis', async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-relations-2',
        seedHeadline: 'x',
      })
      const from = {
        key: 'person:entity-relations-test-pending-from',
        name: 'Pending From',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const to = {
        key: 'country:entity-relations-test-pending-to',
        name: 'Pending To',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }
      await replaceStoryEntities(
        storyId,
        [from, to],
        [{ from: from.key, to: to.key, type: 'REPRESENTS', confidence: 0.85 }]
      )
      // Analysis stays PENDING (createAnalysis's default) — never promoted to COMPLETE.

      expect(await findRelationsForEntity(from.key)).toEqual([])
    })
  })

  describe('findEntityMentionsForStory (ticket 43)', () => {
    it("returns this Story's own entities, most salient first", async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-mentions-1',
        seedHeadline: 'x',
      })
      const central = {
        key: 'person:entity-mentions-central',
        name: 'Central Figure',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 0.9,
      }
      const peripheral = {
        key: 'place:entity-mentions-peripheral',
        name: 'Peripheral Place',
        type: 'PLACE' as const,
        confidence: 0.9,
        salience: 0.2,
      }
      await replaceStoryEntities(storyId, [peripheral, central], [])

      const mentions = await findEntityMentionsForStory(storyId)

      expect(mentions).toEqual([
        { key: central.key, canonicalName: central.name, type: 'PERSON', imageUrl: null },
        { key: peripheral.key, canonicalName: peripheral.name, type: 'PLACE', imageUrl: null },
      ])
    })

    it("does not include another Story's entities", async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-mentions-2',
        seedHeadline: 'x',
      })
      const other = await createAnalysis({
        seedUrl: 'https://example.cz/entity-mentions-3',
        seedHeadline: 'x',
      })
      await replaceStoryEntities(
        other.storyId,
        [
          {
            key: 'org:entity-mentions-other-story',
            name: 'Other Story Org',
            type: 'ORGANIZATION',
            confidence: 0.9,
            salience: 1,
          },
        ],
        []
      )

      expect(await findEntityMentionsForStory(storyId)).toEqual([])
    })

    it("carries an entity's fetched EntityImage.imageUrl through (ticket 41 / ADR 0034)", async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-mentions-4',
        seedHeadline: 'x',
      })
      const imaged = {
        key: 'person:entity-mentions-imaged',
        name: 'Imaged Figure',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 0.9,
      }
      await replaceStoryEntities(storyId, [imaged], [])
      const entity = await findEntityByKey(imaged.key)
      await createEntityImage({
        entityId: entity!.id,
        provider: 'WIKIMEDIA',
        externalId: 'entity-mentions-imaged-file',
        imageUrl: 'https://commons.wikimedia.org/imaged.jpg',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:imaged.jpg',
      })

      const mentions = await findEntityMentionsForStory(storyId)

      expect(mentions).toEqual([
        {
          key: imaged.key,
          canonicalName: imaged.name,
          type: 'PERSON',
          imageUrl: 'https://commons.wikimedia.org/imaged.jpg',
        },
      ])
    })
  })

  describe('findEntityRelationsForStory (ticket 47 / ADR 0034)', () => {
    it("returns this Story's own StoryEntityRelations, each with both entities' key/canonicalName/type", async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-relations-story-1',
        seedHeadline: 'x',
      })
      const tusk = {
        key: 'person:entity-relations-story-tusk',
        name: 'Donald Tusk',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const poland = {
        key: 'country:entity-relations-story-poland',
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

      const relations = await findEntityRelationsForStory(storyId)

      expect(relations).toHaveLength(1)
      expect(typeof relations[0]?.id).toBe('string')
      expect(relations).toMatchObject([
        {
          type: 'REPRESENTS',
          fromEntity: { key: tusk.key, canonicalName: 'Donald Tusk', type: 'PERSON' },
          toEntity: { key: poland.key, canonicalName: 'Poland', type: 'COUNTRY' },
        },
      ])
    })

    it("does not include another Story's relations, and returns an empty array when there are none", async () => {
      const { storyId } = await createAnalysis({
        seedUrl: 'https://example.cz/entity-relations-story-2',
        seedHeadline: 'x',
      })
      const other = await createAnalysis({
        seedUrl: 'https://example.cz/entity-relations-story-3',
        seedHeadline: 'x',
      })
      const from = {
        key: 'person:entity-relations-story-other-from',
        name: 'Other From',
        type: 'PERSON' as const,
        confidence: 0.9,
        salience: 1,
      }
      const to = {
        key: 'country:entity-relations-story-other-to',
        name: 'Other To',
        type: 'COUNTRY' as const,
        confidence: 0.9,
        salience: 1,
      }
      await replaceStoryEntities(
        other.storyId,
        [from, to],
        [{ from: from.key, to: to.key, type: 'REPRESENTS', confidence: 0.85 }]
      )

      expect(await findEntityRelationsForStory(storyId)).toEqual([])
    })
  })
})
