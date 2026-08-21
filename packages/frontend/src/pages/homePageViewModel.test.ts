import { describe, expect, it } from 'vitest'
import type { AnalysisListItem } from '@/services/analyses'
import { getStorySignal, isHomePageStory, splitHomePageStories } from './homePageViewModel'

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
