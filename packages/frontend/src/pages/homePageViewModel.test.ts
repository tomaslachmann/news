import { describe, expect, it } from 'vitest'
import type { AnalysisListItem } from '@/services/analyses'
import {
  entityTrendClass,
  formatCzechCount,
  formatEntityTrend,
  getEntityDotSize,
  getStorySignal,
  isHomePageStory,
  splitHomePageStories,
} from './homePageViewModel'

function makeItem(overrides: Partial<AnalysisListItem> = {}): AnalysisListItem {
  return {
    id: 'a1',
    seedHeadline: 'Seed',
    title: 'Title',
    createdAt: '2026-08-21T10:00:00.000Z',
    coverageCount: 4,
    status: 'complete',
    summary: {
      teaser: 'Shrnutí.',
      hasConflict: false,
      sourceOverlap: { percentage: 92, sourceCount: 4, tier: 'ok' },
      outlets: ['ČTK'],
      entities: ['Praha'],
    },
    ...overrides,
  }
}

describe('splitHomePageStories', () => {
  it('keeps only complete items with a homepage summary and splits them into lead/cards/list sections', () => {
    const first = makeItem({ id: 'a1' })
    const second = makeItem({ id: 'a2' })
    const third = makeItem({ id: 'a3' })
    const fourth = makeItem({ id: 'a4' })
    const pending = makeItem({ id: 'a5', status: 'pending', summary: undefined })
    const noSummary = makeItem({ id: 'a6', summary: undefined })

    const result = splitHomePageStories([first, pending, second, noSummary, third, fourth])

    expect(result.lead?.id).toBe('a1')
    expect(result.twoCards.map((story) => story.id)).toEqual(['a2', 'a3'])
    expect(result.listStories.map((story) => story.id)).toEqual(['a4'])
  })

  it('recognizes homepage-ready stories through the dedicated type guard', () => {
    expect(isHomePageStory(makeItem())).toBe(true)
    expect(isHomePageStory(makeItem({ summary: undefined }))).toBe(false)
  })
})

describe('getStorySignal', () => {
  it('prefers an explicit contradiction over a high overlap tier', () => {
    expect(
      getStorySignal({
        teaser: 'Shrnutí.',
        hasConflict: true,
        sourceOverlap: { percentage: 91, sourceCount: 6, tier: 'ok' },
        outlets: [],
        entities: [],
      })
    ).toEqual({ bad: true, chipClass: 'chip chip--bad', chipLabel: 'rozpor' })
  })

  it('maps a middle overlap tier to the partial-agreement chip', () => {
    expect(
      getStorySignal({
        teaser: 'Shrnutí.',
        hasConflict: false,
        sourceOverlap: { percentage: 72, sourceCount: 6, tier: 'mid' },
        outlets: [],
        entities: [],
      })
    ).toEqual({ bad: false, chipClass: 'chip chip--mid', chipLabel: 'částečná shoda' })
  })
})

describe('entity rail helpers', () => {
  it('scales entity dots across the same range the mockup used', () => {
    expect(getEntityDotSize(10, 10, 30)).toBe(26)
    expect(getEntityDotSize(30, 10, 30)).toBe(50)
  })

  it('uses a stable dot size when every entity has the same count', () => {
    expect(getEntityDotSize(5, 5, 5)).toBe(38)
  })

  it('formats and classifies honest trend percentages', () => {
    expect(formatEntityTrend(12)).toBe('+12 %')
    expect(formatEntityTrend(-4)).toBe('-4 %')
    expect(formatEntityTrend(0)).toBe('0 %')
    expect(entityTrendClass(12)).toBe('is-up')
    expect(entityTrendClass(-4)).toBe('is-down')
    expect(entityTrendClass(0)).toBe('')
  })
})

describe('formatCzechCount', () => {
  it('uses Czech noun forms for one, two to four, and the remaining counts', () => {
    expect(formatCzechCount(1, 'článek', 'články', 'článků')).toBe('1 článek')
    expect(formatCzechCount(2, 'článek', 'články', 'článků')).toBe('2 články')
    expect(formatCzechCount(4, 'článek', 'články', 'článků')).toBe('4 články')
    expect(formatCzechCount(0, 'článek', 'články', 'článků')).toBe('0 článků')
    expect(formatCzechCount(7, 'článek', 'články', 'článků')).toBe('7 článků')
    expect(formatCzechCount(21, 'článek', 'články', 'článků')).toBe('21 článků')
    expect(formatCzechCount(10, 'zdroj', 'zdroje', 'zdrojů')).toBe('10 zdrojů')
    expect(formatCzechCount(5, 'rozpor', 'rozpory', 'rozporů')).toBe('5 rozporů')
  })
})
