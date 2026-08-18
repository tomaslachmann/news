import { describe, it, expect } from 'vitest'
import {
  scoreRelationCandidates,
  toRelationCandidateStory,
  RELATION_CANDIDATE_POOL_SIZE,
} from './storyRelationScoring.js'

const NOW = new Date('2026-01-15T00:00:00Z')

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000)
}

function candidate(overrides: Partial<Parameters<typeof scoreRelationCandidates>[1][number]> = {}) {
  return {
    storyId: 'c1',
    analysisId: 'a1',
    anchorHeadline: 'Candidate headline',
    embedding: [1, 0, 0],
    entities: [],
    entityRelations: [],
    createdAt: hoursAgo(1),
    ...overrides,
  }
}

const CURRENT = {
  embedding: [1, 0, 0],
  entities: [],
  entityRelations: [],
}

describe('scoreRelationCandidates', () => {
  it('returns an empty array when there are no candidates', () => {
    expect(scoreRelationCandidates(CURRENT, [], NOW)).toEqual([])
  })

  it('scores a fresh, identical-embedding candidate above the threshold', () => {
    const c = candidate()

    const result = scoreRelationCandidates(CURRENT, [c], NOW)

    expect(result).toEqual([c])
  })

  it('excludes a candidate whose embedding is completely unrelated and has no entity overlap', () => {
    const c = candidate({ storyId: 'unrelated', embedding: [0, 1, 0] })

    const result = scoreRelationCandidates(CURRENT, [c], NOW)

    expect(result).toEqual([])
  })

  it('sorts candidates by score, highest first', () => {
    const strong = candidate({ storyId: 'strong', embedding: [1, 0, 0] })
    const weak = candidate({ storyId: 'weak', embedding: [0.6, 0.8, 0] })

    const result = scoreRelationCandidates(CURRENT, [weak, strong], NOW)

    expect(result.map((c) => c.storyId)).toEqual(['strong', 'weak'])
  })

  it('lets entity-key overlap lift an otherwise-weak embedding match above the threshold', () => {
    // current stays at [1, 0, 0]; candidate embedding [1, 4, 0] gives cosine ≈ 0.24, which
    // combined with full time proximity scores well under the 0.35 threshold on its own — only
    // the shared entity should be able to push it over.
    const sharedEntities = [
      { key: 'person:donald-tusk', name: 'Donald Tusk', type: 'PERSON' as const, confidence: 0.9 },
    ]
    const currentWithEntities = { ...CURRENT, entities: sharedEntities }
    const weakEmbeddingButSharedEntity = candidate({
      storyId: 'shared-entity',
      embedding: [1, 4, 0],
      entities: sharedEntities,
    })
    const noOverlapAtAll = candidate({ storyId: 'no-overlap', embedding: [1, 4, 0], entities: [] })

    const result = scoreRelationCandidates(
      currentWithEntities,
      [weakEmbeddingButSharedEntity, noOverlapAtAll],
      NOW
    )

    expect(result.map((c) => c.storyId)).toEqual(['shared-entity'])
  })

  it('lets entity-relation overlap lift an otherwise-weak embedding match above the threshold', () => {
    const sharedRelation = [
      { from: 'person:donald-tusk', to: 'country:poland', type: 'REPRESENTS' as const, confidence: 0.9 },
    ]
    const currentWithRelations = { ...CURRENT, entityRelations: sharedRelation }
    const withSharedRelation = candidate({
      storyId: 'shared-relation',
      embedding: [1, 4, 0],
      entityRelations: sharedRelation,
    })
    const noOverlapAtAll = candidate({ storyId: 'no-overlap', embedding: [1, 4, 0], entityRelations: [] })

    const result = scoreRelationCandidates(currentWithRelations, [withSharedRelation, noOverlapAtAll], NOW)

    expect(result.map((c) => c.storyId)).toEqual(['shared-relation'])
  })

  it('scores a candidate at the far edge of the time window lower than a fresh one with identical similarity', () => {
    const fresh = candidate({ storyId: 'fresh', createdAt: hoursAgo(1) })
    const old = candidate({ storyId: 'old', createdAt: hoursAgo(24 * 13) })

    const result = scoreRelationCandidates(CURRENT, [fresh, old], NOW)

    expect(result.map((c) => c.storyId)).toEqual(['fresh', 'old'])
  })

  it('clamps time proximity at zero rather than going negative for a candidate far beyond the window, instead of penalizing it below what a weak embedding match alone would score', () => {
    const wayTooOldWeakEmbedding = candidate({ embedding: [0, 1, 0], createdAt: hoursAgo(24 * 60) })

    const result = scoreRelationCandidates(CURRENT, [wayTooOldWeakEmbedding], NOW)

    // No embedding similarity, no entity overlap, and time proximity clamped to (not below) zero
    // — nothing here clears the threshold, but the score itself must still be a valid, finite
    // number rather than negative.
    expect(result).toEqual([])
  })

  it(`caps the result at ${RELATION_CANDIDATE_POOL_SIZE} candidates, keeping the highest-scoring ones`, () => {
    const candidates = Array.from({ length: RELATION_CANDIDATE_POOL_SIZE + 5 }, (_, i) =>
      candidate({ storyId: `c${i}`, createdAt: hoursAgo(i) })
    )

    const result = scoreRelationCandidates(CURRENT, candidates, NOW)

    expect(result).toHaveLength(RELATION_CANDIDATE_POOL_SIZE)
    expect(result.map((c) => c.storyId)).toEqual(
      candidates.slice(0, RELATION_CANDIDATE_POOL_SIZE).map((c) => c.storyId)
    )
  })

  it('does not crash when the current Story has no entities/entityRelations, scoring purely on embedding and time', () => {
    const c = candidate()

    const result = scoreRelationCandidates(
      { embedding: [1, 0, 0], entities: [], entityRelations: [] },
      [c],
      NOW
    )

    expect(result).toEqual([c])
  })
})

describe('toRelationCandidateStory', () => {
  it('parses valid raw entities/entityRelations JSON into the typed shape', () => {
    const raw = {
      storyId: 's1',
      analysisId: 'a1',
      anchorHeadline: 'Headline',
      embedding: [1, 0, 0],
      entities: [{ key: 'country:poland', name: 'Poland', type: 'COUNTRY', confidence: 0.9 }],
      entityRelations: [{ from: 'a', to: 'b', type: 'MEETS', confidence: 0.5 }],
      createdAt: NOW,
    }

    expect(toRelationCandidateStory(raw)).toEqual({
      storyId: 's1',
      analysisId: 'a1',
      anchorHeadline: 'Headline',
      embedding: [1, 0, 0],
      entities: raw.entities,
      entityRelations: raw.entityRelations,
      createdAt: NOW,
    })
  })

  it('degrades malformed entities/entityRelations JSON to empty arrays rather than throwing', () => {
    const raw = {
      storyId: 's1',
      analysisId: 'a1',
      anchorHeadline: 'Headline',
      embedding: [1, 0, 0],
      entities: 'not valid json shape',
      entityRelations: null,
      createdAt: NOW,
    }

    const result = toRelationCandidateStory(raw)

    expect(result.entities).toEqual([])
    expect(result.entityRelations).toEqual([])
  })
})
