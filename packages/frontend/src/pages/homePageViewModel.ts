import type { AnalysisListItem, AnalysisListSummary } from '@/services/analyses'

export type HomePageStory = AnalysisListItem & { summary: AnalysisListSummary }

const CZECH_NUMBER = new Intl.NumberFormat('cs-CZ')

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

export function getEntityDotSize(count: number, min: number, max: number): number {
  if (max <= min) return 38
  return 26 + Math.round(((count - min) / (max - min)) * 24)
}

export function formatEntityTrend(percent: number): string {
  if (percent > 0) return `+${percent} %`
  return `${percent} %`
}

export function entityTrendClass(percent: number): string {
  if (percent > 0) return 'is-up'
  if (percent < 0) return 'is-down'
  return ''
}

export function formatCzechCount(count: number, one: string, few: string, many: string): string {
  const form = count === 1 ? one : Number.isInteger(count) && count >= 2 && count <= 4 ? few : many
  return `${CZECH_NUMBER.format(count)} ${form}`
}
