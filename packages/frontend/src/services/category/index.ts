import type { AnalysisListItem, Page } from '@news-triangulator/shared'
import { cursorQueryParam } from '../pagination'

export type { AnalysisListItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

/** `/category/:slug` browse-all listing (ticket 80) — same `AnalysisListItem` row shape as
 *  `/articles`/`/history`, filtered server-side to one Story-level derived category
 *  (categoryBrowseService.ts). A 400 here means `slug` isn't a real `ArticleCategory` value —
 *  CategoryPage.tsx renders `NotFoundPage` for that, distinguishing it from a genuine fetch
 *  failure via the thrown message (see `ThreadNotFoundError`'s equivalent role in services/thread). */
export class UnknownCategoryError extends Error {}

export async function fetchCategoryArticles(slug: string, cursor?: string): Promise<Page<AnalysisListItem>> {
  const res = await fetch(`/api/category/${encodeURIComponent(slug)}${cursorQueryParam(cursor)}`, {
    credentials: 'include',
  })

  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new UnknownCategoryError(body.error ?? 'Neznámá kategorie')
  }
  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst články')

  return res.json() as Promise<Page<AnalysisListItem>>
}
