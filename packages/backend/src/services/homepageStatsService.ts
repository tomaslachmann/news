import type {
  ContradictionItem,
  HomepageContradictionItem,
  HomepageEntityStatItem,
  HomepageMinuteItem,
  HomepageSummaryStats,
} from '@news-triangulator/shared'
import {
  toHomepageContradictionItem,
  toHomepageEntityStatItem,
  toHomepageMinuteItem,
  toHomepageSummaryStats,
} from '../mappers/homepageStats.js'
import * as homepageStatsRepo from '../repositories/homepageStats.js'

export const HOMEPAGE_ENTITY_STATS_WINDOW_HOURS = 24
export const HOMEPAGE_ENTITY_STATS_LIMIT = 10
export const HOMEPAGE_ENTITY_STATS_MAX_AGE_HOURS = 6
export const HOMEPAGE_MINUTE_LIMIT = 9
export const HOMEPAGE_CONTRADICTION_LIMIT = 4

const HOUR_MS = 60 * 60 * 1000

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
  const { currentStart, currentEnd } = getHomepageEntityStatsWindow(now)
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
