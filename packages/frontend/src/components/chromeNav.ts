import type { ArticleCategory } from '@news-triangulator/shared'
import { ARTICLE_CATEGORY_LABELS } from '@news-triangulator/shared'

export interface PrimaryNavItem {
  label: string
  to: string
}

/** The real subset of `ArticleCategory` worth a top-level nav entry (ticket 80), replacing the
 *  old 7 dead `to: '#'` placeholders. "Energetika" is dropped entirely — no `ENERGY` value exists
 *  in the real enum (ticket 77's Answer: no outlet evidence for it). Every other original rubric
 *  keeps its Czech label and relative order; `to` is `/category/:slug`, where `:slug` is just the
 *  enum value lowercased (categoryBrowseService.ts's `parseCategorySlug` reverses the same
 *  transform) — real, findable content now, not a placeholder. */
const RUBRIC_CATEGORIES: ArticleCategory[] = ['DOMESTIC', 'ECONOMY', 'WORLD', 'REGIONAL', 'SPORT', 'CULTURE']

const RUBRICS: PrimaryNavItem[] = RUBRIC_CATEGORIES.map((category) => ({
  label: ARTICLE_CATEGORY_LABELS[category],
  to: `/category/${category.toLowerCase()}`,
}))

export const ADMIN_HOME_PATH = '/admin/ingestion'

export function getPrimaryNavItems(isAdmin: boolean, compact = false): PrimaryNavItem[] {
  const rubrics = compact ? RUBRICS.slice(0, 5) : RUBRICS
  const items: PrimaryNavItem[] = [
    ...rubrics,
    { label: isAdmin ? 'Historie' : 'Články', to: '/history' },
    // A real, working link (ticket 71) — unlike the topic rubrics above, which have no real
    // category data behind them and are `to: '#'` placeholders.
    { label: 'Vlákna', to: '/threads' },
    { label: 'Hledat', to: '/search' },
  ]

  if (isAdmin) {
    items.push({ label: 'Admin', to: ADMIN_HOME_PATH })
  }

  return items
}
