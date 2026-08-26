import type { CoverageInfo } from '@news-triangulator/shared'
import type { ArticleCategory, CoverageStatus, CoverageWithSource } from '../repositories/coverage.js'

const STATUS_MAP: Record<CoverageStatus, CoverageInfo['status']> = {
  OK: 'ok',
  EXTRACTION_FAILED: 'extraction-failed',
  PENDING: 'pending',
}

export function toCoverageInfo(coverage: CoverageWithSource): CoverageInfo {
  return {
    id: coverage.id,
    outlet: coverage.source.name,
    title: coverage.title ?? undefined,
    articleUrl: coverage.articleUrl,
    publishedAt: coverage.publishedAt ?? undefined,
    status: STATUS_MAP[coverage.status],
  }
}

/** A Story/Analysis's own "primary category" is never a persisted column (ticket 78, ticket 77's
 *  Answer) -- derived at read time as the mode of its Coverages' `primaryCategory` values, tied
 *  Coverage without a resolved category (`null`) never counts as a vote. A tie between two or
 *  more categories at the same count is broken by whichever has the earliest-attached Coverage
 *  (smallest `createdAt`) -- matching how Coverage.createdAt is already this codebase's ordering
 *  signal for "which arrived first" (see findAllArticleUrls). `null` when every Coverage is
 *  uncategorized, same as a single uncategorized Coverage. */
export function resolveStoryPrimaryCategory(
  coverages: Array<{ primaryCategory: ArticleCategory | null; createdAt: Date }>
): ArticleCategory | null {
  const counts = new Map<ArticleCategory, number>()
  const earliestByCategory = new Map<ArticleCategory, Date>()

  for (const coverage of coverages) {
    if (!coverage.primaryCategory) continue
    counts.set(coverage.primaryCategory, (counts.get(coverage.primaryCategory) ?? 0) + 1)
    const earliest = earliestByCategory.get(coverage.primaryCategory)
    if (!earliest || coverage.createdAt < earliest) {
      earliestByCategory.set(coverage.primaryCategory, coverage.createdAt)
    }
  }
  if (counts.size === 0) return null

  const maxCount = Math.max(...counts.values())
  let winner: ArticleCategory | null = null
  let winnerEarliest: Date | null = null
  for (const [category, count] of counts) {
    if (count !== maxCount) continue
    const earliest = earliestByCategory.get(category)!
    if (!winnerEarliest || earliest < winnerEarliest) {
      winner = category
      winnerEarliest = earliest
    }
  }
  return winner
}
