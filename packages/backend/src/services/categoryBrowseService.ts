import type { AnalysisListItem, Page } from '@news-triangulator/shared'
import { ARTICLE_CATEGORY_LABELS, DEFAULT_PAGE_SIZE } from '@news-triangulator/shared'
import { fetchPage } from '../pagination.js'
import { ValidationError } from '../errors.js'
import * as analysisRepo from '../repositories/analysis.js'
import type { ArticleCategory } from '../repositories/coverage.js'
import { toAnalysisListItem } from '../mappers/analysis.js'

/** The URL-facing form of an `ArticleCategory` is just its own value, lowercased -- no separate
 *  slug<->enum table to keep in sync (ticket 80). `/category/domestic` round-trips to `DOMESTIC`
 *  via a plain case transform; anything that isn't one of the 13 real enum values (typo, or an
 *  old dead rubric like "energetika") is rejected explicitly rather than silently returning an
 *  empty page that reads as "no articles in this category yet". */
function parseCategorySlug(slug: string): ArticleCategory | null {
  const upper = slug.toUpperCase()
  return upper in ARTICLE_CATEGORY_LABELS ? (upper as ArticleCategory) : null
}

/** Public, COMPLETE-only listing of Analyses whose Story-level derived category (ticket 78)
 *  matches `slug` — same "browse everything" role `/articles` (`/history` for Admins) and
 *  `/threads` already play, same `AnalysisListItem` row shape as `/articles`. Throws
 *  ValidationError (→ 400) for an unknown slug, never a silently-empty page — see
 *  parseCategorySlug. */
export async function listAnalysesByCategory(
  slug: string,
  cursor: string | undefined,
  limit: number = DEFAULT_PAGE_SIZE
): Promise<Page<AnalysisListItem>> {
  const category = parseCategorySlug(slug)
  if (!category) throw new ValidationError(`Neznámá kategorie: ${slug}`)

  const { items, nextCursor } = await fetchPage(cursor, limit, (decoded, boundedLimit) =>
    analysisRepo.findAnalysesByCategoryPage(category, decoded, boundedLimit)
  )
  return { items: items.map(toAnalysisListItem), nextCursor }
}
