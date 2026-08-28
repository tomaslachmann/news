import { fetchWithTimeout } from './httpClient.js'

const TIMEOUT_MS = 8_000

// Czech-language Wikipedia only: the reader-facing product is Czech throughout (ADR 0016), and an
// English extract next to Czech coverage would read worse than no extract at all.
const WIKI_LANG = 'cs'
const SITELINK = `${WIKI_LANG}wiki`

export interface WikidataContext {
  /** Wikidata's own one-line label — Czech preferred, English fallback. Null if the item has none. */
  description: string | null
  /** The Czech Wikipedia intro paragraph as plain text (Wikipedia's own tag-stripped `extract`). */
  wikipediaExtract: string | null
  /** Canonical desktop URL of the Czech Wikipedia page. Non-null iff `wikipediaExtract` is. */
  wikipediaUrl: string | null
}

const EMPTY: WikidataContext = { description: null, wikipediaExtract: null, wikipediaUrl: null }

interface WikidataEntitiesResponse {
  entities?: Record<
    string,
    {
      descriptions?: Record<string, { value?: string }>
      sitelinks?: Record<string, { title?: string }>
    }
  >
}

interface WikipediaRestSummary {
  type?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

/** Given a confirmed `wikidataId`, pulls the external descriptive context the entity wiki page
 *  shows (ticket 90): Wikidata's one-line description, plus the Czech Wikipedia intro extract and
 *  URL. Two external calls (Wikidata `wbgetentities` for the description + `cswiki` sitelink title,
 *  then Wikipedia REST for the summary), mirroring `wikimediaImageClient.ts`'s shape.
 *
 *  Partial results are the norm and are fine: an item with a description but no Czech Wikipedia
 *  page returns `{ description, wikipediaExtract: null, wikipediaUrl: null }`. Only a hard failure
 *  of the first Wikidata call throws (so the job can log it); a failed/404 Wikipedia call is
 *  swallowed and the description still comes back. The caller (`entity.image.enrich` job) treats
 *  every field as best-effort, exactly like a missing image. */
export async function findWikidataContext(wikidataId: string): Promise<WikidataContext> {
  const entitiesUrl = new URL('https://www.wikidata.org/w/api.php')
  entitiesUrl.searchParams.set('action', 'wbgetentities')
  entitiesUrl.searchParams.set('ids', wikidataId)
  entitiesUrl.searchParams.set('props', 'descriptions|sitelinks')
  entitiesUrl.searchParams.set('sitefilter', SITELINK)
  entitiesUrl.searchParams.set('languages', 'cs|en')
  entitiesUrl.searchParams.set('format', 'json')

  const entitiesRes = await fetchWithTimeout(entitiesUrl.toString(), TIMEOUT_MS)
  if (!entitiesRes.ok) throw new Error(`Wikidata entities lookup returned HTTP ${entitiesRes.status}`)
  const body = (await entitiesRes.json()) as WikidataEntitiesResponse
  const item = body.entities?.[wikidataId]
  if (!item) return EMPTY

  const description = item.descriptions?.cs?.value?.trim() || item.descriptions?.en?.value?.trim() || null
  const title = item.sitelinks?.[SITELINK]?.title
  if (!title) return { ...EMPTY, description }

  let summary: WikipediaRestSummary | null = null
  try {
    const summaryUrl = `https://${WIKI_LANG}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const summaryRes = await fetchWithTimeout(summaryUrl, TIMEOUT_MS)
    if (summaryRes.ok) summary = (await summaryRes.json()) as WikipediaRestSummary
  } catch {
    // Swallowed on purpose — the description is still worth persisting on its own.
  }

  const extract = summary?.extract?.trim()
  const url = summary?.content_urls?.desktop?.page
  // A disambiguation page has no real intro to show.
  if (!extract || !url || summary?.type === 'disambiguation') return { ...EMPTY, description }

  return { description, wikipediaExtract: extract, wikipediaUrl: url }
}
