import type { WikidataCandidateItem, LinkEntityWikidataBody } from '@news-triangulator/shared'

export type { WikidataCandidateItem }

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchWikidataCandidates(
  entityKey: string,
  query: string
): Promise<WikidataCandidateItem[]> {
  const url = `/api/admin/entities/${encodeURIComponent(entityKey)}/wikidata-candidates?q=${encodeURIComponent(query)}`
  const res = await fetch(url, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se vyhledat na Wikidatech')

  return res.json() as Promise<WikidataCandidateItem[]>
}

export async function linkEntityWikidata(entityKey: string, body: LinkEntityWikidataBody): Promise<void> {
  const res = await fetch(`/api/admin/entities/${encodeURIComponent(entityKey)}/wikidata-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se propojit entitu s Wikidaty')
}

export async function unlinkEntityWikidata(entityKey: string): Promise<void> {
  const res = await fetch(`/api/admin/entities/${encodeURIComponent(entityKey)}/wikidata-link`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se zrušit propojení s Wikidaty')
}
