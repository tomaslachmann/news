import type { EntityDetail, EntitySearchResultItem } from '@news-triangulator/shared'
import { cursorQueryParam } from '../pagination'

export type { EntityDetail, EntitySearchResultItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function searchEntities(query: string): Promise<EntitySearchResultItem[]> {
  const res = await fetch(`/api/entities?q=${encodeURIComponent(query)}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se vyhledat entity')

  return res.json() as Promise<EntitySearchResultItem[]>
}

export async function fetchEntityDetail(key: string, cursor?: string): Promise<EntityDetail> {
  const res = await fetch(`/api/entities/${encodeURIComponent(key)}${cursorQueryParam(cursor)}`, {
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst entitu')

  return res.json() as Promise<EntityDetail>
}
