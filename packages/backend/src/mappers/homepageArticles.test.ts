import { describe, it, expect } from 'vitest'
import { toHomepageArticleItem } from './homepageArticles.js'

const DIMENSIONS = {
  agreement: [],
  contradiction: [],
  uniqueReporting: [],
  framing: [],
  agreementCategory: 'PARTIAL' as const,
}

const COMPLETE_ROW = {
  id: 'a1',
  seedHeadline: 'Seed',
  headline: 'Headline',
  createdAt: new Date('2026-08-21T00:00:00Z'),
  status: 'COMPLETE' as const,
  okCoverageCount: 3,
  coverages: [],
  dimensions: DIMENSIONS,
  sourceOverlapPercentage: null,
  leadImage: null,
  entityNames: [],
}

describe('toHomepageArticleItem', () => {
  it('maps a COMPLETE row with a SynthesisResult to a narrowed HomepageArticleItem', () => {
    const item = toHomepageArticleItem(COMPLETE_ROW)

    expect(item.status).toBe('complete')
    expect(item.summary).toBeDefined()
    expect(item.id).toBe('a1')
  })

  it('throws rather than silently degrading when the row is not actually a complete Article', () => {
    const draftRow = { ...COMPLETE_ROW, status: 'DRAFT' as const, dimensions: null }

    expect(() => toHomepageArticleItem(draftRow)).toThrow(/expected to be a COMPLETE Article/)
  })
})
