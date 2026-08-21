import type { AnalysisListItem, AnalysisListSummary } from '@/services/analyses'

export type HomePageStory = AnalysisListItem & { summary: AnalysisListSummary }

export function isHomePageStory(item: AnalysisListItem): item is HomePageStory {
  return item.status === 'complete' && item.summary !== undefined
}

export function splitHomePageStories(items: AnalysisListItem[]): {
  lead: HomePageStory | undefined
  twoCards: HomePageStory[]
  listStories: HomePageStory[]
} {
  const stories = items.filter(isHomePageStory)
  const [lead, ...rest] = stories

  return {
    lead,
    twoCards: rest.slice(0, 2),
    listStories: rest.slice(2),
  }
}

export function getStorySignal(summary: AnalysisListSummary): {
  bad: boolean
  chipClass: string
  chipLabel: string
} {
  if (summary.hasConflict) return { bad: true, chipClass: 'chip chip--bad', chipLabel: 'rozpor' }
  if (summary.sourceOverlap?.tier === 'mid') {
    return { bad: false, chipClass: 'chip chip--mid', chipLabel: 'částečná shoda' }
  }
  if (summary.sourceOverlap?.tier === 'bad') {
    return { bad: true, chipClass: 'chip chip--bad', chipLabel: 'rozpor' }
  }
  return { bad: false, chipClass: 'chip chip--ok', chipLabel: 'primární zdroj' }
}
