import type { HomepageEntityStatItem } from '@news-triangulator/shared'
import { toHomepageEntityStatItem } from '../mappers/homepageStats.js'
import * as homepageStatsRepo from '../repositories/homepageStats.js'

export const HOMEPAGE_ENTITY_STATS_WINDOW_HOURS = 24
export const HOMEPAGE_ENTITY_STATS_LIMIT = 10
export const HOMEPAGE_ENTITY_STATS_MAX_AGE_HOURS = 6

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
