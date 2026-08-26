import type {
  ContradictionItem,
  HomepageContradictionItem,
  HomepageEntityStatItem,
  HomepageMinuteItem,
  HomepageMostReadItem,
  HomepageSummaryStats,
  HomepageThreadItem,
} from '@news-triangulator/shared'
import {
  toHomepageContradictionItem,
  toHomepageEntityStatItem,
  toHomepageMinuteItem,
  toHomepageMostReadItem,
  toHomepageSummaryStats,
  toHomepageThreadItem,
} from '../mappers/homepageStats.js'
import * as homepageStatsRepo from '../repositories/homepageStats.js'

export const HOMEPAGE_ENTITY_STATS_WINDOW_HOURS = 24
export const HOMEPAGE_ENTITY_STATS_LIMIT = 10
export const HOMEPAGE_ENTITY_STATS_MAX_AGE_HOURS = 6
export const HOMEPAGE_MINUTE_LIMIT = 9
export const HOMEPAGE_CONTRADICTION_LIMIT = 4
export const HOMEPAGE_MOST_READ_WINDOW_HOURS = 24
export const HOMEPAGE_MOST_READ_LIMIT = 5
export const HOMEPAGE_RECENT_THREADS_LIMIT = 3

const HOUR_MS = 60 * 60 * 1000
const HOMEPAGE_STATS_TIME_ZONE = 'Europe/Prague'
const DATE_TIME_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOMEPAGE_STATS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export interface HomepageEntityStatsRefreshResult {
  snapshotId: string | null
  itemCount: number
  skipped: boolean
}

export function getHomepageEntityStatsWindow(now = new Date()): {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
} {
  const currentEnd = now
  const currentStart = new Date(currentEnd.getTime() - HOMEPAGE_ENTITY_STATS_WINDOW_HOURS * HOUR_MS)
  const previousEnd = currentStart
  const previousStart = new Date(previousEnd.getTime() - HOMEPAGE_ENTITY_STATS_WINDOW_HOURS * HOUR_MS)

  return { currentStart, currentEnd, previousStart, previousEnd }
}

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value
  if (value === undefined) throw new Error(`Missing ${type} in formatted date parts`)
  return Number(value)
}

function timeZoneOffsetMs(date: Date): number {
  const parts = DATE_TIME_PARTS.formatToParts(date)
  const asUtc = Date.UTC(
    getDateTimePart(parts, 'year'),
    getDateTimePart(parts, 'month') - 1,
    getDateTimePart(parts, 'day'),
    getDateTimePart(parts, 'hour'),
    getDateTimePart(parts, 'minute'),
    getDateTimePart(parts, 'second')
  )
  return asUtc - date.getTime()
}

export function getHomepageTodayStatsWindow(now = new Date()): {
  currentStart: Date
  currentEnd: Date
} {
  const parts = DATE_TIME_PARTS.formatToParts(now)
  const localMidnightAsUtc = Date.UTC(
    getDateTimePart(parts, 'year'),
    getDateTimePart(parts, 'month') - 1,
    getDateTimePart(parts, 'day')
  )
  const currentStart = new Date(localMidnightAsUtc - timeZoneOffsetMs(new Date(localMidnightAsUtc)))

  return { currentStart, currentEnd: now }
}

export async function refreshHomepageEntityStats(
  now = new Date()
): Promise<HomepageEntityStatsRefreshResult> {
  const { currentStart, currentEnd, previousStart, previousEnd } = getHomepageEntityStatsWindow(now)
  const result = await homepageStatsRepo.refreshHomepageEntityStatsSnapshot({
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    limit: HOMEPAGE_ENTITY_STATS_LIMIT,
  })

  return result
    ? { snapshotId: result.snapshotId, itemCount: result.itemCount, skipped: false }
    : { snapshotId: null, itemCount: 0, skipped: true }
}

export async function getHomepageEntityStats(now = new Date()): Promise<HomepageEntityStatItem[]> {
  const minimumWindowEnd = new Date(now.getTime() - HOMEPAGE_ENTITY_STATS_MAX_AGE_HOURS * HOUR_MS)
  const rows = await homepageStatsRepo.findLatestHomepageEntityStats({ minimumWindowEnd })
  return rows.map(toHomepageEntityStatItem)
}

export async function getHomepageSummaryStats(now = new Date()): Promise<HomepageSummaryStats> {
  const { currentStart, currentEnd } = getHomepageTodayStatsWindow(now)
  const row = await homepageStatsRepo.findHomepageSummaryStats({
    windowStart: currentStart,
    windowEnd: currentEnd,
  })
  return toHomepageSummaryStats(row)
}

export async function getHomepageMinuteFeed(): Promise<HomepageMinuteItem[]> {
  const rows = await homepageStatsRepo.findHomepageMinuteRows(HOMEPAGE_MINUTE_LIMIT)
  return rows.map(toHomepageMinuteItem)
}

/** Ticket 61's "Nejčtenější" rail — most `AnalysisView`-counted Analyses in the last
 *  `HOMEPAGE_MOST_READ_WINDOW_HOURS` hours. Same rolling-window shape as the other live-computed
 *  rails above (Minute/Contradictions), not a snapshot — see `findHomepageMostReadRows`'s own
 *  docstring for why this table doesn't need one. */
export async function getHomepageMostRead(now = new Date()): Promise<HomepageMostReadItem[]> {
  const windowStart = new Date(now.getTime() - HOMEPAGE_MOST_READ_WINDOW_HOURS * HOUR_MS)
  const rows = await homepageStatsRepo.findHomepageMostReadRows({
    windowStart,
    limit: HOMEPAGE_MOST_READ_LIMIT,
  })
  return rows.map(toHomepageMostReadItem)
}

/** Ticket 70's homepage highlight — the `HOMEPAGE_RECENT_THREADS_LIMIT` most recently-updated
 *  Threads a reader can actually navigate into (>= 2 visible members). No design precedent for
 *  this section existed (ticket 65's grilling session checked — the reference design's own
 *  homepage template has nothing thread-related), so the limit is chosen to match this session's
 *  other compact homepage rails rather than ported from anywhere. */
export async function getHomepageRecentThreads(): Promise<HomepageThreadItem[]> {
  const rows = await homepageStatsRepo.findHomepageRecentThreadRows(HOMEPAGE_RECENT_THREADS_LIMIT)
  return rows.map(toHomepageThreadItem)
}

function contradictionSourceCount(item: ContradictionItem): number {
  return new Set(item.attributions.map((attribution) => attribution.outlet.trim()).filter(Boolean)).size
}

export async function getHomepageContradictions(now = new Date()): Promise<HomepageContradictionItem[]> {
  const { currentStart, currentEnd } = getHomepageEntityStatsWindow(now)
  const rows = await homepageStatsRepo.findHomepageContradictionAnalysisRows({
    windowStart: currentStart,
    windowEnd: currentEnd,
  })

  return rows
    .flatMap((row) =>
      (row.dimensions?.contradiction ?? [])
        .map((item) => ({
          row,
          item: {
            prose: item.prose.trim(),
            sourceCount: contradictionSourceCount(item),
          },
        }))
        .filter(({ item }) => item.prose.length > 0)
    )
    .sort((a, b) => {
      const sourceDelta = b.item.sourceCount - a.item.sourceCount
      if (sourceDelta !== 0) return sourceDelta
      return b.row.createdAt.getTime() - a.row.createdAt.getTime()
    })
    .slice(0, HOMEPAGE_CONTRADICTION_LIMIT)
    .map(({ row, item }) => toHomepageContradictionItem(row, item))
}
