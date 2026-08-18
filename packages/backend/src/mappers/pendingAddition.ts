import type { PendingAdditionItem } from '@news-triangulator/shared'
import type { PendingAdditionWithAnalysis } from '../repositories/pendingAddition.js'

export function toPendingAdditionItem(row: PendingAdditionWithAnalysis): PendingAdditionItem {
  return {
    id: row.id,
    analysisId: row.analysisId,
    analysisSeedHeadline: row.analysis.seedHeadline,
    outlet: row.source.name,
    title: row.title ?? undefined,
    articleUrl: row.articleUrl,
    publishedAt: row.publishedAt ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }
}
