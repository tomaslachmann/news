import type {
  HomepageContradictionItem,
  HomepageEntityStatItem,
  HomepageMinuteItem,
  HomepageSummaryStats,
} from '@news-triangulator/shared'
import type {
  HomepageContradictionAnalysisRow,
  HomepageEntityStatStoredRow,
  HomepageMinuteRow,
  HomepageSummaryStatsRow,
} from '../repositories/homepageStats.js'
import { resolveDisplayTitle } from './analysis.js'

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

export function toHomepageSummaryStats(row: HomepageSummaryStatsRow): HomepageSummaryStats {
  return {
    processedArticleCount: row.processedArticleCount,
    activeSourceCount: row.activeSourceCount,
    contradictionCount: row.contradictionCount,
    ...(row.averageSourceOverlapPercentage != null
      ? { averageSourceOverlapPercentage: row.averageSourceOverlapPercentage }
      : {}),
  }
}

export function toHomepageMinuteItem(row: HomepageMinuteRow): HomepageMinuteItem {
  return {
    analysisId: row.id,
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
    createdAt: row.createdAt.toISOString(),
    sourceCount: row.sourceCount,
    hasConflict: (row.dimensions?.contradiction.length ?? 0) > 0,
  }
}

export function toHomepageContradictionItem(
  row: HomepageContradictionAnalysisRow,
  item: { prose: string; sourceCount: number }
): HomepageContradictionItem {
  return {
    analysisId: row.id,
    title: resolveDisplayTitle(row.headline, row.seedHeadline),
    createdAt: row.createdAt.toISOString(),
    prose: item.prose,
    sourceCount: item.sourceCount,
    ...(row.sourceOverlapPercentage != null ? { sourceOverlapPercentage: row.sourceOverlapPercentage } : {}),
  }
}
