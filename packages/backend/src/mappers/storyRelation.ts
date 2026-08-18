import type { PendingStoryRelationItem, RelatedEventItem } from '@news-triangulator/shared'
import type { PendingReviewRelationRow, RawStoryRelationForEvents } from '../repositories/storyRelation.js'
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

/** The single place ticket 37's "other side, COMPLETE only" filtering + title-resolution logic
 *  lives — findPublishedRelationsForStory returns both sides raw specifically so this pure
 *  function (not a DB query) owns the decision, directly unit-testable with no mocking. */
export function toRelatedEvents(storyId: string, rows: RawStoryRelationForEvents[]): RelatedEventItem[] {
  const items: RelatedEventItem[] = []
  for (const r of rows) {
    const other =
      r.fromStoryId === storyId
        ? {
            analysisId: r.toAnalysisId,
            seedHeadline: r.toSeedHeadline,
            headline: r.toHeadline,
            status: r.toStatus,
            coverageCount: r.toCoverageCount,
          }
        : {
            analysisId: r.fromAnalysisId,
            seedHeadline: r.fromSeedHeadline,
            headline: r.fromHeadline,
            status: r.fromStatus,
            coverageCount: r.fromCoverageCount,
          }

    if (other.status !== 'COMPLETE') continue

    items.push({
      analysisId: other.analysisId,
      title: resolveDisplayTitle(other.headline, other.seedHeadline),
      type: r.type,
      coverageCount: other.coverageCount,
    })
  }
  return items
}
