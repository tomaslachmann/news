import type { HomepageArticles } from '@news-triangulator/shared'
import { toHomepageArticleItem } from '../mappers/homepageArticles.js'
import * as homepageArticlesRepo from '../repositories/homepageArticles.js'

// lead (1) + spotlight (2) + latest (8) — the exact slotting ticket 62 specifies.
export const HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT = 2
export const HOMEPAGE_ARTICLES_LATEST_COUNT = 8
export const HOMEPAGE_ARTICLES_LIMIT = 1 + HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT + HOMEPAGE_ARTICLES_LATEST_COUNT

/** The homepage's main Article column, pre-slotted so the frontend never has to decide "index 0
 *  is the lead" itself (ticket 62 / ADR 0037) — deterministically ordered `createdAt DESC, id
 *  DESC`, sliced into `lead` (first), `spotlight` (next two), `latest` (next eight). `lead` is
 *  `null` and `spotlight`/`latest` are empty, never partially so, exactly when there are fewer
 *  than 1/3/11 COMPLETE Articles respectively — no fabricated filler for an empty slot. */
export async function getHomepageArticles(): Promise<HomepageArticles> {
  const rows = await homepageArticlesRepo.findHomepageArticleRows(HOMEPAGE_ARTICLES_LIMIT)
  const items = rows.map(toHomepageArticleItem)
  const [lead, ...rest] = items

  return {
    lead: lead ?? null,
    spotlight: rest.slice(0, HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT),
    latest: rest.slice(
      HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT,
      HOMEPAGE_ARTICLES_SPOTLIGHT_COUNT + HOMEPAGE_ARTICLES_LATEST_COUNT
    ),
  }
}
