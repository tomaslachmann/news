import { describe, it, expect, afterAll } from 'vitest'
import { createAnalysis, disconnect } from '../../src/repositories/analysis.js'
import { createStoryRelation, findRelationCandidateStories } from '../../src/repositories/storyRelation.js'
import { replaceStoryEntities } from '../../src/repositories/entity.js'

describe('StoryRelation repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('persists a HIGH-confidence relation as PUBLISHED', async () => {
    const from = await createAnalysis({ seedUrl: 'https://example.cz/from-1', seedHeadline: 'From story' })
    const to = await createAnalysis({ seedUrl: 'https://example.cz/to-1', seedHeadline: 'To story' })

    const created = await createStoryRelation({
      fromStoryId: from.storyId,
      toStoryId: to.storyId,
      type: 'FOLLOW_UP',
      confidenceTier: 'HIGH',
      reasoning: 'Story A directly continues Story B.',
      status: 'PUBLISHED',
    })

    expect(created.status).toBe('PUBLISHED')
    expect(created.type).toBe('FOLLOW_UP')
    expect(created.confidenceTier).toBe('HIGH')
    expect(created.fromStoryId).toBe(from.storyId)
    expect(created.toStoryId).toBe(to.storyId)
  })

  it('persists a LOW-confidence relation as PENDING_REVIEW', async () => {
    const from = await createAnalysis({ seedUrl: 'https://example.cz/from-2', seedHeadline: 'From story' })
    const to = await createAnalysis({ seedUrl: 'https://example.cz/to-2', seedHeadline: 'To story' })

    const created = await createStoryRelation({
      fromStoryId: from.storyId,
      toStoryId: to.storyId,
      type: 'RELATED',
      confidenceTier: 'LOW',
      reasoning: 'Possibly connected.',
      status: 'PENDING_REVIEW',
    })

    expect(created.status).toBe('PENDING_REVIEW')
  })

  it('is idempotent: creating the same (fromStoryId, toStoryId) pair twice does not throw and keeps the first write', async () => {
    const from = await createAnalysis({ seedUrl: 'https://example.cz/from-3', seedHeadline: 'From story' })
    const to = await createAnalysis({ seedUrl: 'https://example.cz/to-3', seedHeadline: 'To story' })

    const first = await createStoryRelation({
      fromStoryId: from.storyId,
      toStoryId: to.storyId,
      type: 'FOLLOW_UP',
      confidenceTier: 'HIGH',
      reasoning: 'First write.',
      status: 'PUBLISHED',
    })
    const second = await createStoryRelation({
      fromStoryId: from.storyId,
      toStoryId: to.storyId,
      type: 'RELATED',
      confidenceTier: 'LOW',
      reasoning: 'Should not overwrite the first write.',
      status: 'PENDING_REVIEW',
    })

    expect(second.id).toBe(first.id)
    expect(second.reasoning).toBe('First write.')
    expect(second.status).toBe('PUBLISHED')
  })

  it('findRelationCandidateStories finds an older Story, excludes itself, and returns its entities/entityRelations already shaped for scoring', async () => {
    const older = await createAnalysis({ seedUrl: 'https://example.cz/older', seedHeadline: 'Older' })
    const newer = await createAnalysis({ seedUrl: 'https://example.cz/newer', seedHeadline: 'Newer' })
    await replaceStoryEntities(
      older.storyId,
      [{ key: 'country:story-relation-test', name: 'Poland', type: 'COUNTRY', confidence: 0.9 }],
      []
    )

    const results = await findRelationCandidateStories(newer.storyId, newer.createdAt, 24 * 14)

    const ids = results.map((r) => r.storyId)
    expect(ids).not.toContain(newer.storyId)
    expect(ids).toContain(older.storyId)
    const found = results.find((r) => r.storyId === older.storyId)
    expect(found?.entities).toEqual([{ key: 'country:story-relation-test', storyCount: 1 }])
    expect(found?.entityRelations).toEqual([])
    expect(found?.anchorHeadline).toBe('Older')
  })

  it('findRelationCandidateStories returns empty entities/entityRelations for a Story with none', async () => {
    const older = await createAnalysis({ seedUrl: 'https://example.cz/older-none', seedHeadline: 'Older' })
    const newer = await createAnalysis({ seedUrl: 'https://example.cz/newer-none', seedHeadline: 'Newer' })

    const results = await findRelationCandidateStories(newer.storyId, newer.createdAt, 24 * 14)

    const found = results.find((r) => r.storyId === older.storyId)
    expect(found?.entities).toEqual([])
    expect(found?.entityRelations).toEqual([])
  })

  it('never returns a Story created at or after the given beforeStoryCreatedAt bound, so a Story can never appear as its own candidate\'s "older" match in the reverse direction', async () => {
    const older = await createAnalysis({ seedUrl: 'https://example.cz/older-2', seedHeadline: 'Older' })
    const newer = await createAnalysis({ seedUrl: 'https://example.cz/newer-2', seedHeadline: 'Newer' })

    // From the *older* Story's own point of view, `newer` must never come back as a candidate —
    // otherwise both (older, newer) and (newer, older) StoryRelation rows could end up created,
    // which the directional @@unique constraint alone doesn't prevent (see ADR 0022).
    const results = await findRelationCandidateStories(older.storyId, older.createdAt, 24 * 14)

    expect(results.map((r) => r.storyId)).not.toContain(newer.storyId)
  })
})
