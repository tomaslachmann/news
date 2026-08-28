import { fetchWithRetry, fetchWithTimeout } from './httpClient.js'

const TIMEOUT_MS = 8_000
const SEARCH_LIMIT = 10
// Non-interactive access: defer the request when Wikidata's replication lag exceeds this many
// seconds (API:Etiquette's standard bot value — research §5).
const MAXLAG = 5
const CSWIKI_SITELINK = 'cswiki'
// wbgetentities takes up to 50 ids per call for anonymous clients (research §1.2).
const WBGETENTITIES_MAX_IDS = 50

export interface WikidataCandidate {
  qid: string
  label: string
  description?: string
}

/** Wikidata item fields the semi-automated linker needs (ticket 93 / ADR 0042) — the subset
 *  `wbgetentities` returns (labels/aliases/descriptions/claims/sitelinks), flattened. Lives here
 *  because this client is the only thing that produces it; `entityWikidataMatching.ts` imports the
 *  type to score it. */
export interface WikidataItemDetail {
  qid: string
  /** Display label — cs preferred, en fallback, the qid itself if the item has neither. */
  label: string
  /** Every cs + en label and alias, comparison candidates for the exact-name test. */
  names: string[]
  /** Wikidata's one-line description — cs preferred, en fallback. */
  description: string | null
  /** `P31` (instance of) target Q-ids. */
  p31: string[]
  /** Number of sitelinks across all wikis — a cheap popularity signal (research §6). */
  sitelinkCount: number
  hasCswikiSitelink: boolean
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

// --- Ticket 93 / ADR 0042: the semi-automated linker's read calls -----------------------------
// All three run only from the scheduled scan job, serially, with `maxlag=5`, the honest contact
// User-Agent (research §5 — NOT the browser-shaped headers from ADR 0040), and a bounded
// `Retry-After`-honouring retry on 429/503. Unit-tested by mocking the HTTP call; they never hit
// real Wikidata in tests, same convention as searchWikidataEntities.

interface WbEntity {
  labels?: Record<string, { value?: string }>
  aliases?: Record<string, { value?: string }[]>
  descriptions?: Record<string, { value?: string }>
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]>
  sitelinks?: Record<string, { title?: string }>
}

interface WbGetEntitiesResponse {
  entities?: Record<string, WbEntity>
  error?: { code?: string; info?: string }
}

function wbGetEntitiesUrl(): URL {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbgetentities')
  url.searchParams.set('props', 'labels|aliases|descriptions|claims|sitelinks')
  url.searchParams.set('languages', 'cs|en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxlag', String(MAXLAG))
  return url
}

function toItemDetail(qid: string, entity: WbEntity): WikidataItemDetail {
  const csLabel = entity.labels?.cs?.value?.trim()
  const enLabel = entity.labels?.en?.value?.trim()
  const names = new Set<string>()
  for (const label of [csLabel, enLabel]) if (label) names.add(label)
  for (const lang of ['cs', 'en']) {
    for (const alias of entity.aliases?.[lang] ?? []) {
      const value = alias.value?.trim()
      if (value) names.add(value)
    }
  }

  const p31 = (entity.claims?.P31 ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => typeof id === 'string')

  const sitelinks = entity.sitelinks ?? {}

  return {
    qid,
    label: csLabel || enLabel || qid,
    names: [...names],
    description: entity.descriptions?.cs?.value?.trim() || entity.descriptions?.en?.value?.trim() || null,
    p31,
    sitelinkCount: Object.keys(sitelinks).length,
    hasCswikiSitelink: Boolean(sitelinks[CSWIKI_SITELINK]?.title),
  }
}

async function wbGetEntities(url: URL): Promise<Record<string, WbEntity>> {
  const res = await fetchWithRetry(url.toString(), TIMEOUT_MS)
  if (!res.ok) throw new Error(`Wikidata wbgetentities returned HTTP ${res.status}`)
  const body = (await res.json()) as WbGetEntitiesResponse
  if (body.error) throw new Error(`Wikidata wbgetentities error: ${body.error.code ?? 'unknown'}`)
  return body.entities ?? {}
}

/** Resolve a Czech Wikipedia article title to its one Wikidata item (research §1.2 / §6) — the
 *  strongest cheap disambiguation signal for Czech news, since `cswiki` titles are unique.
 *  `normalize=1` folds spaces/underscores and first-letter case against cswiki. Returns null when
 *  no `cswiki` page has that exact title, or the resolved item is missing/a redirect target with
 *  no data. */
export async function resolveByCswikiTitle(title: string): Promise<WikidataItemDetail | null> {
  const url = wbGetEntitiesUrl()
  url.searchParams.set('sites', CSWIKI_SITELINK)
  url.searchParams.set('titles', title)
  url.searchParams.set('normalize', '1')

  const entities = await wbGetEntities(url)
  for (const [qid, entity] of Object.entries(entities)) {
    // A title with no matching item comes back as `{ "-1": { missing: "" } }`.
    if (!qid.startsWith('Q')) continue
    return toItemDetail(qid, entity)
  }
  return null
}

/** Type-constrained candidate search via CirrusSearch (research §1.3): `list=search` in the
 *  Wikidata item namespace with a `haswbstatement:P31=<qid>` OR-clause built from `p31Qids` (the
 *  entity type's Q-id set — passed in so this client stays free of entity-domain knowledge).
 *  Returns candidate Q-ids only — feed them to `fetchItemDetails` for scoring. */
export async function searchTypedCandidates(name: string, p31Qids: string[]): Promise<string[]> {
  const p31Clause = p31Qids.map((qid) => `P31=${qid}`).join('|')
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', `"${name.replace(/"/g, '')}" haswbstatement:${p31Clause}`)
  url.searchParams.set('srnamespace', '0')
  url.searchParams.set('srlimit', String(SEARCH_LIMIT))
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxlag', String(MAXLAG))

  const res = await fetchWithRetry(url.toString(), TIMEOUT_MS)
  if (!res.ok) throw new Error(`Wikidata list=search returned HTTP ${res.status}`)
  const body = (await res.json()) as {
    query?: { search?: { title?: string }[] }
    error?: { code?: string }
  }
  if (body.error) throw new Error(`Wikidata list=search error: ${body.error.code ?? 'unknown'}`)
  return (body.query?.search ?? [])
    .map((r) => r.title)
    .filter((t): t is string => typeof t === 'string' && /^Q[1-9]\d*$/.test(t))
}

/** Batch `wbgetentities` for the scoring / rival checks (research §1.2). One call — callers keep
 *  the id list well under the 50-id anonymous cap (`searchTypedCandidates` returns ≤ 10 plus the
 *  one cswiki id); the `slice` is a guard, not a paging loop. */
export async function fetchItemDetails(qids: string[]): Promise<WikidataItemDetail[]> {
  const unique = [...new Set(qids)].slice(0, WBGETENTITIES_MAX_IDS)
  if (unique.length === 0) return []

  const url = wbGetEntitiesUrl()
  url.searchParams.set('ids', unique.join('|'))
  const entities = await wbGetEntities(url)
  return Object.entries(entities)
    .filter(([qid]) => qid.startsWith('Q'))
    .map(([qid, entity]) => toItemDetail(qid, entity))
}
