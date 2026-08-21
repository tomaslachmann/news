const TIMEOUT_MS = 8_000
const USER_AGENT = 'NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)'
const SEARCH_LIMIT = 10

export interface WikidataCandidate {
  qid: string
  label: string
  description?: string
}

interface WikidataSearchResponse {
  search?: { id: string; label?: string; description?: string }[]
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } })
  } finally {
    clearTimeout(timer)
  }
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

  const res = await fetchWithTimeout(url.toString())
  if (!res.ok) throw new Error(`Wikidata search returned HTTP ${res.status}`)

  const body = (await res.json()) as WikidataSearchResponse
  return (body.search ?? []).map((r) => ({
    qid: r.id,
    label: r.label ?? r.id,
    description: r.description,
  }))
}
