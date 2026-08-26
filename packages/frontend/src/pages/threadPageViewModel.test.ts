import { describe, it, expect } from 'vitest'
import { buildThreadStats, orderTimeline } from './threadPageViewModel'
import type { ThreadDetail, ThreadTimelineItem } from '@/services/thread'

function makeThread(overrides: Partial<ThreadDetail> = {}): ThreadDetail {
  return {
    title: 'Vícedílná kauza',
    slug: 'vicedilna-kauza',
    status: 'active',
    firstEventAt: '2026-08-13T00:00:00Z',
    lastEventAt: '2026-08-18T00:00:00Z',
    memberCount: 3,
    sourceCount: 7,
    averageAgreementPercentage: 70,
    contradictionCount: 2,
    timeline: [],
    articles: [],
    sources: [],
    entities: [],
    openQuestions: [],
    ...overrides,
  }
}

describe('buildThreadStats', () => {
  it('includes every stat when the thread has real numbers for all of them', () => {
    const stats = buildThreadStats(makeThread())

    expect(stats.map((s) => s.k)).toEqual([
      'Otevřeno',
      'Zpráv ve vlákně',
      'Zdrojů',
      'Průměrná shoda',
      'Rozpory',
      'Poslední změna',
    ])
  })

  it('omits "Průměrná shoda" entirely, not as 0 %, when no member has a sourceOverlap', () => {
    const stats = buildThreadStats(makeThread({ averageAgreementPercentage: null }))

    expect(stats.some((s) => s.k === 'Průměrná shoda')).toBe(false)
  })

  it('omits "Rozpory" entirely, not as 0, when there are no contradictions', () => {
    const stats = buildThreadStats(makeThread({ contradictionCount: 0 }))

    expect(stats.some((s) => s.k === 'Rozpory')).toBe(false)
  })

  it('marks "Rozpory" as a warning stat when present', () => {
    const stats = buildThreadStats(makeThread({ contradictionCount: 1 }))

    expect(stats.find((s) => s.k === 'Rozpory')?.warn).toBe(true)
  })
})

function makeItem(analysisId: string, eventTime: string): ThreadTimelineItem {
  return { analysisId, title: `Title ${analysisId}`, eventTime, sourceCount: 1, agreementCategory: 'PARTIAL' }
}

describe('orderTimeline', () => {
  const items = [makeItem('a1', '2026-08-13T00:00:00Z'), makeItem('a2', '2026-08-15T00:00:00Z')]

  it('keeps the oldest-first order from the backend when oldestFirst is true', () => {
    expect(orderTimeline(items, true).map((i) => i.analysisId)).toEqual(['a1', 'a2'])
  })

  it('reverses to newest-first when oldestFirst is false (the default view)', () => {
    expect(orderTimeline(items, false).map((i) => i.analysisId)).toEqual(['a2', 'a1'])
  })

  it('never mutates the array passed in', () => {
    const original = [...items]
    orderTimeline(items, false)

    expect(items).toEqual(original)
  })
})
