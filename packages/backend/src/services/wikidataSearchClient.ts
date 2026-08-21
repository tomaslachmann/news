import { fetchWithTimeout } from './httpClient.js'

const TIMEOUT_MS = 8_000
const SEARCH_LIMIT = 10

export interface WikidataCandidate {
  qid: string
  label: string
  description?: string
}

interface WikidataSearchResponse {
  search?: { id: string; label?: string; description?: string }[]
}

/** Wikidata's public `wbsearchentities` search, for the Admin-triggered candidate list in ticket
 *  41's search-and-confirm flow (docs/spec-entity-resolution.md) — one function, one external
 *  call, mirroring articleFetchClient.ts's shape. Never called automatically; only from an Admin
 *  request, so no caching/durable-log table (same reasoning as that spec's Implementation
 *  Decisions section). */
export async function searchWikidataEntities(query: string): Promise<WikidataCandidate[]> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', query)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', String(SEARCH_LIMIT))

  const res = await fetchWithTimeout(url.toString(), TIMEOUT_MS)
  if (!res.ok) throw new Error(`Wikidata search returned HTTP ${res.status}`)

  const body = (await res.json()) as WikidataSearchResponse
  return (body.search ?? []).map((r) => ({
    qid: r.id,
    label: r.label ?? r.id,
    description: r.description,
  }))
}
