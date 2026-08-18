import { describe, it, expect } from 'vitest'
import { toRelatedEvents } from './storyRelation.js'
import type { RawStoryRelationForEvents } from '../repositories/storyRelation.js'

function makeRow(overrides: Partial<RawStoryRelationForEvents> = {}): RawStoryRelationForEvents {
  return {
    fromStoryId: 'story-current',
    toStoryId: 'story-other',
    type: 'FOLLOW_UP',
    fromAnalysisId: 'a-current',
    fromSeedHeadline: 'Current working title',
    fromHeadline: null,
    fromStatus: 'COMPLETE',
    fromCoverageCount: 5,
    toAnalysisId: 'a-other',
    toSeedHeadline: 'Other working title',
    toHeadline: null,
    toStatus: 'COMPLETE',
    toCoverageCount: 3,
    ...overrides,
  }
}

describe('toRelatedEvents', () => {
  it('picks the other side when the current Story is fromStoryId', () => {
    const row = makeRow({ toHeadline: 'Other generated headline' })

    const result = toRelatedEvents('story-current', [row])

    expect(result).toEqual([
      { analysisId: 'a-other', title: 'Other generated headline', type: 'FOLLOW_UP', coverageCount: 3 },
    ])
  })

  it('picks the other side when the current Story is toStoryId', () => {
    const row = makeRow({ fromHeadline: 'Current generated headline' })

    const result = toRelatedEvents('story-other', [row])

    expect(result).toEqual([
      { analysisId: 'a-current', title: 'Current generated headline', type: 'FOLLOW_UP', coverageCount: 5 },
    ])
  })

  it('falls back to the working title when the other side has no generated headline', () => {
    const row = makeRow({ toHeadline: null })

    const result = toRelatedEvents('story-current', [row])

    expect(result[0]?.title).toBe('Other working title')
  })

  it('excludes a relation whose other side is not COMPLETE', () => {
    const row = makeRow({ toStatus: 'PENDING' })

    const result = toRelatedEvents('story-current', [row])

    expect(result).toEqual([])
  })

  it('excludes a relation whose other side is DRAFT', () => {
    const row = makeRow({ toStatus: 'DRAFT' })

    const result = toRelatedEvents('story-current', [row])

    expect(result).toEqual([])
  })

  it('excludes a relation whose other side FAILED', () => {
    const row = makeRow({ toStatus: 'FAILED' })

    const result = toRelatedEvents('story-current', [row])

    expect(result).toEqual([])
  })

  it('preserves the relation type (RELATED vs FOLLOW_UP)', () => {
    const row = makeRow({ type: 'RELATED' })

    const result = toRelatedEvents('story-current', [row])

    expect(result[0]?.type).toBe('RELATED')
  })

  it('returns an empty array when there are no rows', () => {
    expect(toRelatedEvents('story-current', [])).toEqual([])
  })

  it('maps multiple rows, each resolving its own other side', () => {
    const rowA = makeRow({ toAnalysisId: 'a-other-1', toStatus: 'COMPLETE' })
    const rowB = makeRow({ toAnalysisId: 'a-other-2', toStatus: 'PENDING' })

    const result = toRelatedEvents('story-current', [rowA, rowB])

    expect(result.map((r) => r.analysisId)).toEqual(['a-other-1'])
  })
})
