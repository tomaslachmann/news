import { describe, it, expect } from 'vitest'
import { toThreadDetail } from './threadDetail.js'
import type { ThreadDetailRow, ThreadDetailMemberRow } from '../repositories/threadDetail.js'

const VALID_EXTRACTION = { claims: [], framingSignals: [] }

function coverage(overrides: Partial<ThreadDetailMemberRow['coverages'][number]> = {}) {
  return {
    articleUrl: 'https://example.cz/a1',
    title: 'Coverage title',
    createdAt: new Date('2026-08-13T10:00:00Z'),
    sourceName: 'ČTK',
    status: 'OK' as const,
    extractionResult: VALID_EXTRACTION,
    ...overrides,
  }
}

function member(overrides: Partial<ThreadDetailMemberRow> = {}): ThreadDetailMemberRow {
  return {
    analysisId: 'a1',
    storyId: 's1',
    seedHeadline: 'Seed headline',
    headline: 'Generated headline',
    eventTime: new Date('2026-08-13T12:00:00Z'),
    dimensions: { agreement: [], contradiction: [], uniqueReporting: [], framing: [] },
    agreementCategory: 'PARTIAL',
    sourceOverlapPercentage: 70,
    coverages: [coverage()],
    ...overrides,
  }
}

function thread(overrides: Partial<ThreadDetailRow> = {}): ThreadDetailRow {
  return {
    title: 'Vícedílná kauza',
    slug: 'vicedilna-kauza',
    status: 'ACTIVE',
    firstEventAt: new Date('2026-08-13T00:00:00Z'),
    lastEventAt: new Date('2026-08-18T00:00:00Z'),
    members: [member()],
    ...overrides,
  }
}

describe('toThreadDetail', () => {
  it('tags a Coverage row with every dimension its articleUrl was cited under', () => {
    const url = 'https://example.cz/agrees-and-unique'
    const result = toThreadDetail(
      thread({
        members: [
          member({
            coverages: [coverage({ articleUrl: url })],
            dimensions: {
              agreement: [
                { id: 'd1', prose: 'p', attributions: [{ outlet: 'ČTK', czechQuote: 'q', articleUrl: url }] },
              ],
              contradiction: [],
              uniqueReporting: [
                { id: 'd2', prose: 'p', attributions: [{ outlet: 'ČTK', czechQuote: 'q', articleUrl: url }] },
              ],
              framing: [],
            },
          }),
        ],
      }),
      []
    )

    expect(result.articles).toHaveLength(1)
    expect(result.articles[0]?.tags).toEqual(['agrees', 'unique'])
  })

  it('tags a Coverage row with no dimension match as an empty (honest) tag list, not an error', () => {
    const result = toThreadDetail(
      thread({ members: [member({ coverages: [coverage({ articleUrl: 'https://example.cz/untagged' })] })] }),
      []
    )

    expect(result.articles[0]?.tags).toEqual([])
  })

  it('tags contradiction separately from agreement for two different Coverage rows', () => {
    const agreeUrl = 'https://example.cz/agrees'
    const disputeUrl = 'https://example.cz/disputes'
    const result = toThreadDetail(
      thread({
        members: [
          member({
            coverages: [
              coverage({ articleUrl: agreeUrl }),
              coverage({ articleUrl: disputeUrl, sourceName: 'Deník N' }),
            ],
            dimensions: {
              agreement: [
                {
                  id: 'd1',
                  prose: 'p',
                  attributions: [{ outlet: 'ČTK', czechQuote: 'q', articleUrl: agreeUrl }],
                },
              ],
              contradiction: [
                {
                  id: 'd2',
                  prose: 'p',
                  attributions: [{ outlet: 'Deník N', czechQuote: 'q', articleUrl: disputeUrl }],
                },
              ],
              uniqueReporting: [],
              framing: [],
            },
          }),
        ],
      }),
      []
    )

    expect(result.articles.find((a) => a.articleUrl === agreeUrl)?.tags).toEqual(['agrees'])
    expect(result.articles.find((a) => a.articleUrl === disputeUrl)?.tags).toEqual(['contradicts'])
  })

  it('never matches by outlet name alone — only an exact articleUrl match counts', () => {
    const result = toThreadDetail(
      thread({
        members: [
          member({
            coverages: [coverage({ articleUrl: 'https://example.cz/real-url', sourceName: 'ČTK' })],
            dimensions: {
              agreement: [
                {
                  id: 'd1',
                  prose: 'p',
                  attributions: [
                    { outlet: 'ČTK', czechQuote: 'q', articleUrl: 'https://other.cz/different' },
                  ],
                },
              ],
              contradiction: [],
              uniqueReporting: [],
              framing: [],
            },
          }),
        ],
      }),
      []
    )

    expect(result.articles[0]?.tags).toEqual([])
  })

  it('averages sourceOverlapPercentage only across members that have one, ignoring null', () => {
    const result = toThreadDetail(
      thread({
        members: [
          member({ analysisId: 'a1', sourceOverlapPercentage: 60 }),
          member({ analysisId: 'a2', sourceOverlapPercentage: 80 }),
          member({ analysisId: 'a3', sourceOverlapPercentage: null }),
        ],
      }),
      []
    )

    expect(result.averageAgreementPercentage).toBe(70)
  })

  it('reports averageAgreementPercentage as null, not 0 or NaN, when no member has one', () => {
    const result = toThreadDetail(thread({ members: [member({ sourceOverlapPercentage: null })] }), [])

    expect(result.averageAgreementPercentage).toBeNull()
  })

  it('sums contradiction counts across every member', () => {
    const oneContradiction = {
      agreement: [],
      contradiction: [{ id: 'd1', prose: 'p', attributions: [] }],
      uniqueReporting: [],
      framing: [],
    }
    const result = toThreadDetail(
      thread({
        members: [
          member({ analysisId: 'a1', dimensions: oneContradiction }),
          member({ analysisId: 'a2', dimensions: oneContradiction }),
        ],
      }),
      []
    )

    expect(result.contradictionCount).toBe(2)
  })

  it('reports sourceCount as the number of distinct outlets, not total Coverage rows', () => {
    const result = toThreadDetail(
      thread({
        members: [
          member({
            coverages: [
              coverage({ articleUrl: 'u1', sourceName: 'ČTK' }),
              coverage({ articleUrl: 'u2', sourceName: 'ČTK' }),
              coverage({ articleUrl: 'u3', sourceName: 'Deník N' }),
            ],
          }),
        ],
      }),
      []
    )

    expect(result.sourceCount).toBe(2)
  })

  it('maps Thread status to its lowercase label', () => {
    expect(toThreadDetail(thread({ status: 'DORMANT' }), []).status).toBe('dormant')
    expect(toThreadDetail(thread({ status: 'CLOSED' }), []).status).toBe('closed')
  })

  it('carries the passed-in entities through unchanged', () => {
    const entities = [{ key: 'e1', canonicalName: 'Entity One', type: 'PERSON' as const }]

    expect(toThreadDetail(thread(), entities).entities).toEqual(entities)
  })

  it('derives firstEventAt/lastEventAt from the visible (COMPLETE) members, never the raw Thread row span', () => {
    // The raw Thread span (08-13 to 08-18) covers a 3rd, still-DRAFT member that never made it
    // into `members` — using it would leak that a newer, unpublished development exists.
    const result = toThreadDetail(
      thread({
        firstEventAt: new Date('2026-08-13T00:00:00Z'),
        lastEventAt: new Date('2026-08-18T00:00:00Z'),
        members: [
          member({ analysisId: 'a1', eventTime: new Date('2026-08-14T00:00:00Z') }),
          member({ analysisId: 'a2', eventTime: new Date('2026-08-15T00:00:00Z') }),
        ],
      }),
      []
    )

    expect(result.firstEventAt).toBe('2026-08-14T00:00:00.000Z')
    expect(result.lastEventAt).toBe('2026-08-15T00:00:00.000Z')
  })

  it('dedupes a Coverage attached to more than one Thread member by articleUrl, merging tags instead of duplicating the row', () => {
    const sharedUrl = 'https://example.cz/reprinted-elsewhere'
    const result = toThreadDetail(
      thread({
        members: [
          member({
            analysisId: 'a1',
            coverages: [coverage({ articleUrl: sharedUrl, sourceName: 'ČTK' })],
            dimensions: {
              agreement: [
                {
                  id: 'd1',
                  prose: 'p',
                  attributions: [{ outlet: 'ČTK', czechQuote: 'q', articleUrl: sharedUrl }],
                },
              ],
              contradiction: [],
              uniqueReporting: [],
              framing: [],
            },
          }),
          member({
            analysisId: 'a2',
            coverages: [coverage({ articleUrl: sharedUrl, sourceName: 'ČTK' })],
            dimensions: {
              agreement: [],
              contradiction: [],
              uniqueReporting: [
                {
                  id: 'd2',
                  prose: 'p',
                  attributions: [{ outlet: 'ČTK', czechQuote: 'q', articleUrl: sharedUrl }],
                },
              ],
              framing: [],
            },
          }),
        ],
      }),
      []
    )

    expect(result.articles).toHaveLength(1)
    expect(result.articles[0]?.tags.sort()).toEqual(['agrees', 'unique'])
    expect(result.sources).toEqual([{ outlet: 'ČTK', coverageCount: 1 }])
  })
})
