import type { EntityWikidataSuggestionItem } from '@news-triangulator/shared'

export type { EntityWikidataSuggestionItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

const BASE = '/api/admin/entity-wikidata-suggestions'

export async function fetchEntityWikidataSuggestions(): Promise<EntityWikidataSuggestionItem[]> {
  const res = await fetch(BASE, { credentials: 'include' })
  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst návrhy na propojení')
  return res.json() as Promise<EntityWikidataSuggestionItem[]>
}

async function postAction(entityKey: string, action: string, wikidataId?: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(entityKey)}/${action}`, {
    method: 'POST',
    headers: wikidataId ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: wikidataId ? JSON.stringify({ wikidataId }) : undefined,
  })
  if (!res.ok) return throwApiError(res, 'Akci se nepodařilo provést')
}

export function confirmEntityWikidataSuggestion(entityKey: string, wikidataId: string): Promise<void> {
  return postAction(entityKey, 'confirm', wikidataId)
}

export function rejectEntityWikidataCandidate(entityKey: string, wikidataId: string): Promise<void> {
  return postAction(entityKey, 'reject-candidate', wikidataId)
}

export function dismissEntityWikidataSuggestion(entityKey: string): Promise<void> {
  return postAction(entityKey, 'dismiss')
}
