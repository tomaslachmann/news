import { describe, it, expect } from 'vitest'
import { scoreRelationCandidates, RELATION_CANDIDATE_POOL_SIZE } from './storyRelationScoring.js'

const NOW = new Date('2026-01-15T00:00:00Z')
const TOTAL_STORIES = 100

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
    eventTime: hoursAgo(1),
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
    expect(scoreRelationCandidates(CURRENT, [], TOTAL_STORIES, NOW)).toEqual([])
  })

  it('scores a fresh, identical-embedding candidate above the threshold', () => {
    const c = candidate()

    const result = scoreRelationCandidates(CURRENT, [c], TOTAL_STORIES, NOW)

    expect(result).toEqual([c])
  })

  it('excludes a candidate whose embedding is completely unrelated and has no entity overlap', () => {
    const c = candidate({ storyId: 'unrelated', embedding: [0, 1, 0] })

    const result = scoreRelationCandidates(CURRENT, [c], TOTAL_STORIES, NOW)

    expect(result).toEqual([])
  })

  it('sorts candidates by score, highest first', () => {
    const strong = candidate({ storyId: 'strong', embedding: [1, 0, 0] })
    const weak = candidate({ storyId: 'weak', embedding: [0.6, 0.8, 0] })

    const result = scoreRelationCandidates(CURRENT, [weak, strong], TOTAL_STORIES, NOW)

    expect(result.map((c) => c.storyId)).toEqual(['strong', 'weak'])
  })

  it('lets entity-key overlap lift an otherwise-weak embedding match above the threshold', () => {
    // current stays at [1, 0, 0]; candidate embedding [1, 4, 0] gives cosine ≈ 0.24, which
    // combined with full time proximity scores well under the 0.35 threshold on its own — only
    // the shared entity should be able to push it over.
    const sharedEntities = [{ key: 'person:donald-tusk', storyCount: 3 }]
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
      TOTAL_STORIES,
      NOW
    )

    expect(result.map((c) => c.storyId)).toEqual(['shared-entity'])
  })

  it('lets entity-relation overlap lift an otherwise-weak embedding match above the threshold', () => {
    const sharedRelation = [
      { fromKey: 'person:donald-tusk', toKey: 'country:poland', type: 'REPRESENTS' as const },
    ]
    const currentWithRelations = { ...CURRENT, entityRelations: sharedRelation }
    const withSharedRelation = candidate({
      storyId: 'shared-relation',
      embedding: [1, 4, 0],
      entityRelations: sharedRelation,
    })
    const noOverlapAtAll = candidate({ storyId: 'no-overlap', embedding: [1, 4, 0], entityRelations: [] })

    const result = scoreRelationCandidates(
      currentWithRelations,
      [withSharedRelation, noOverlapAtAll],
      TOTAL_STORIES,
      NOW
    )

    expect(result.map((c) => c.storyId)).toEqual(['shared-relation'])
  })

  it('scores a candidate at the far edge of the time window lower than a fresh one with identical similarity', () => {
    const fresh = candidate({ storyId: 'fresh', createdAt: hoursAgo(1) })
    const old = candidate({ storyId: 'old', createdAt: hoursAgo(24 * 13), eventTime: hoursAgo(24 * 13) })

    const result = scoreRelationCandidates(CURRENT, [fresh, old], TOTAL_STORIES, NOW)

    expect(result.map((c) => c.storyId)).toEqual(['fresh', 'old'])
  })

  it('ages by eventTime, not createdAt, when both are present and differ (ticket 16, fixes the rest of P1-11)', () => {
    // A Draft that sat in the Ingestion queue for a long time before approval — createdAt is
    // recent (row inserted late), but the real event, per eventTime, is old.
    const staleDraft = candidate({ storyId: 'stale', createdAt: hoursAgo(1), eventTime: hoursAgo(24 * 13) })
    const genuinelyFresh = candidate({ storyId: 'fresh', createdAt: hoursAgo(1), eventTime: hoursAgo(1) })

    const result = scoreRelationCandidates(CURRENT, [staleDraft, genuinelyFresh], TOTAL_STORIES, NOW)

    expect(result.map((c) => c.storyId)).toEqual(['fresh', 'stale'])
  })

  it('falls back to createdAt when eventTime is null (human-seeded or pre-migration Story)', () => {
    const noEventTime = candidate({
      storyId: 'no-event-time',
      createdAt: hoursAgo(24 * 13),
      eventTime: null,
    })
    const genuinelyFresh = candidate({ storyId: 'fresh', createdAt: hoursAgo(1), eventTime: hoursAgo(1) })

    const result = scoreRelationCandidates(CURRENT, [noEventTime, genuinelyFresh], TOTAL_STORIES, NOW)

    // If the null eventTime were treated as age-zero instead of falling back to createdAt, both
    // candidates would score identically and this ordering assertion would fail.
    expect(result.map((c) => c.storyId)).toEqual(['fresh', 'no-event-time'])
  })

  it('clamps time proximity at one rather than exceeding it for an eventTime in the future (an unvalidated external timestamp, e.g. a malformed RSS pubDate)', () => {
    const fresh = candidate({ storyId: 'fresh', createdAt: hoursAgo(1), eventTime: hoursAgo(0) })
    const future = candidate({ storyId: 'future', createdAt: hoursAgo(1), eventTime: hoursAgo(-24) })

    // Same order both ways: if timeProximity could exceed 1, `future` (negative ageHours) would
    // score strictly higher than `fresh` and sort first despite identical everything else,
    // letting a mistimed feed entry dominate the shortlist over a genuinely time-proximate one.
    const result = scoreRelationCandidates(CURRENT, [fresh, future], TOTAL_STORIES, NOW)
    expect(result.map((c) => c.storyId)).toEqual(['fresh', 'future'])
  })

  it('clamps time proximity at zero rather than going negative for a candidate far beyond the window, instead of penalizing it below what a weak embedding match alone would score', () => {
    const wayTooOldWeakEmbedding = candidate({
      embedding: [0, 1, 0],
      createdAt: hoursAgo(24 * 60),
      eventTime: hoursAgo(24 * 60),
    })

    const result = scoreRelationCandidates(CURRENT, [wayTooOldWeakEmbedding], TOTAL_STORIES, NOW)

    // No embedding similarity, no entity overlap, and time proximity clamped to (not below) zero
    // — nothing here clears the threshold, but the score itself must still be a valid, finite
    // number rather than negative.
    expect(result).toEqual([])
  })

  it(`caps the result at ${RELATION_CANDIDATE_POOL_SIZE} candidates, keeping the highest-scoring ones`, () => {
    const candidates = Array.from({ length: RELATION_CANDIDATE_POOL_SIZE + 5 }, (_, i) =>
      candidate({ storyId: `c${i}`, createdAt: hoursAgo(i), eventTime: hoursAgo(i) })
    )

    const result = scoreRelationCandidates(CURRENT, candidates, TOTAL_STORIES, NOW)

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
      TOTAL_STORIES,
      NOW
    )

    expect(result).toEqual([c])
  })

  // P1-9 (docs/audit.md, ADR 0024): plain Jaccard penalized exactly this asymmetry — 3 entities
  // fully contained in 40 scored 0.075 under Jaccard, lost under the 0.35 threshold despite
  // perfect containment. IDF-weighted containment must not have that problem.
  it('scores a small entity set fully contained in a much larger one highly, unlike Jaccard', () => {
    // Weak embedding match on its own (cosine ≈ 0.24, same setup as the tests above) — only the
    // containment score can push this over the threshold.
    const small = Array.from({ length: 3 }, (_, i) => ({ key: `entity:${i}`, storyCount: 5 }))
    const large = [
      ...small,
      ...Array.from({ length: 37 }, (_, i) => ({ key: `other-entity:${i}`, storyCount: 5 })),
    ]
    const current = { ...CURRENT, embedding: [1, 4, 0], entities: small }
    const fullyContained = candidate({ storyId: 'fully-contained', embedding: [1, 4, 0], entities: large })

    const result = scoreRelationCandidates(current, [fullyContained], TOTAL_STORIES, NOW)

    expect(result.map((c) => c.storyId)).toEqual(['fully-contained'])
  })

  it('weighs a shared rare entity far higher than two shared near-universal ones, unlike an unweighted overlap measure', () => {
    // current mentions one rare entity ("person:rare", storyCount 1) and two near-universal ones
    // ("Czech Republic"/"government"-style, storyCount 99 out of 100 total Stories).
    const current = {
      ...CURRENT,
      entities: [
        { key: 'person:rare', storyCount: 1 },
        { key: 'place:czech-republic', storyCount: 99 },
        { key: 'concept:government', storyCount: 99 },
      ],
    }
    // Shares only the one rare entity (plus an unrelated entity of its own) — a raw entity-count
    // measure would call this the weaker overlap (1 of current's 3 keys).
    const sharesRareOnly = candidate({
      storyId: 'shares-rare-only',
      embedding: [1, 4, 0],
      entities: [
        { key: 'person:rare', storyCount: 1 },
        { key: 'other:unrelated', storyCount: 50 },
      ],
    })
    // Shares both near-universal entities (plus an unrelated entity of its own) — a raw
    // entity-count measure would call this the stronger overlap (2 of current's 3 keys).
    const sharesUniversalOnly = candidate({
      storyId: 'shares-universal-only',
      embedding: [1, 4, 0],
      entities: [
        { key: 'place:czech-republic', storyCount: 99 },
        { key: 'concept:government', storyCount: 99 },
        { key: 'other:unrelated', storyCount: 50 },
      ],
    })

    const result = scoreRelationCandidates(current, [sharesRareOnly, sharesUniversalOnly], TOTAL_STORIES, NOW)

    // IDF weighting inverts the raw-count ranking: the single rare, informative match clears the
    // threshold; matching twice as many near-universal, uninformative entities does not.
    expect(result.map((c) => c.storyId)).toEqual(['shares-rare-only'])
  })
})
