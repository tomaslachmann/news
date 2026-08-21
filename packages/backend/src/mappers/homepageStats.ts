import type { HomepageEntityStatItem } from '@news-triangulator/shared'
import type { HomepageEntityStatStoredRow } from '../repositories/homepageStats.js'

export function toHomepageEntityStatItem(row: HomepageEntityStatStoredRow): HomepageEntityStatItem {
  const trend =
    row.previousEventCount && row.previousEventCount > 0
      ? Math.round(((row.recentEventCount - row.previousEventCount) / row.previousEventCount) * 100)
      : undefined

  return {
    key: row.key,
    canonicalName: row.canonicalName,
    type: row.type,
    recentEventCount: row.recentEventCount,
    recentSourceCount: row.recentSourceCount,
    ...(trend !== undefined ? { trendPercent: trend } : {}),
  }
}
