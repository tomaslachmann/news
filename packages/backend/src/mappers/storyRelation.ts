import type { PendingStoryRelationItem } from '@news-triangulator/shared'
import type { PendingReviewRelationRow } from '../repositories/storyRelation.js'
import { resolveDisplayTitle } from './analysis.js'

export function toPendingStoryRelationItem(row: PendingReviewRelationRow): PendingStoryRelationItem {
  return {
    id: row.id,
    fromAnalysisId: row.fromAnalysisId,
    fromTitle: resolveDisplayTitle(row.fromHeadline, row.fromSeedHeadline),
    toAnalysisId: row.toAnalysisId,
    toTitle: resolveDisplayTitle(row.toHeadline, row.toSeedHeadline),
    type: row.type,
    reasoning: row.reasoning,
    createdAt: row.createdAt.toISOString(),
  }
}
