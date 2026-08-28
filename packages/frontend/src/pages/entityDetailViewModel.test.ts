import { describe, it, expect } from 'vitest'
import type { EntityDetail } from '@/services/entities'
import {
  entityInfoboxRows,
  formatMentionSpan,
  hasWikiContext,
  timelineChartData,
} from './entityDetailViewModel'

function makeDetail(overrides: Partial<EntityDetail> = {}): EntityDetail {
  return {
    key: 'person:petr-fiala',
    canonicalName: 'Petr Fiala',
    type: 'PERSON',
    wikidataId: null,
    wikidataDescription: null,
    wikipediaExtract: null,
    wikipediaUrl: null,
    image: null,
    aliases: [],
    eventCount: 0,
    firstMentionAt: null,
    lastMentionAt: null,
    relationCount: 0,
    coMentions: [],
    mentionTimeline: [],
    events: { items: [], nextCursor: null },
    relations: [],
    ...overrides,
  }
}

describe('formatMentionSpan', () => {
  it('is null when the entity has no COMPLETE-Event mention', () => {
    expect(formatMentionSpan(null, null)).toBeNull()
    expect(formatMentionSpan('2026-06-01T00:00:00Z', null)).toBeNull()
  })

  it('is a single date when first and last fall on the same day', () => {
    const span = formatMentionSpan('2026-06-01T09:00:00Z', '2026-06-01T18:00:00Z')
    expect(span).not.toContain('–')
  })

  it('is a range when first and last differ', () => {
    const span = formatMentionSpan('2026-06-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(span).toContain('–')
  })
})

describe('entityInfoboxRows', () => {
  it('always shows the type; omits rows with nothing real to say', () => {
    const rows = entityInfoboxRows(makeDetail())
    expect(rows).toEqual([{ label: 'Typ', value: 'Osoba' }])
  })

  it('includes aliases, a mention span, and Czech-pluralised counts when present', () => {
    const rows = entityInfoboxRows(
      makeDetail({
        aliases: ['P. Fiala'],
        firstMentionAt: '2026-06-01T00:00:00Z',
        lastMentionAt: '2026-08-01T00:00:00Z',
        eventCount: 3,
        relationCount: 1,
      })
    )
    const byLabel = new Map(rows.map((r) => [r.label, r.value]))
    expect(byLabel.get('Také známo jako')).toBe('P. Fiala')
    expect(byLabel.has('Zmiňováno')).toBe(true)
    expect(byLabel.get('Články')).toBe('3 články')
    expect(byLabel.get('Vztahy')).toBe('1 vztah')
  })
})

describe('timelineChartData', () => {
  it('returns [] for a single month (not a trend worth a chart)', () => {
    expect(timelineChartData([{ month: '2026-06', count: 4 }])).toEqual([])
  })

  it('maps YYYY-MM buckets to labelled points, in order', () => {
    const data = timelineChartData([
      { month: '2026-06', count: 1 },
      { month: '2026-08', count: 3 },
    ])
    expect(data).toHaveLength(2)
    expect(data[0].count).toBe(1)
    expect(data[1].count).toBe(3)
    expect(data[0].label).toMatch(/2026/)
  })
})

describe('hasWikiContext', () => {
  it('is true when either the Wikidata description or the Wikipedia extract is present', () => {
    expect(hasWikiContext(makeDetail())).toBe(false)
    expect(hasWikiContext(makeDetail({ wikidataDescription: 'český politik' }))).toBe(true)
    expect(hasWikiContext(makeDetail({ wikipediaExtract: 'Petr Fiala je…' }))).toBe(true)
  })
})
