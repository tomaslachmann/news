import { fetchWithTimeout } from './httpClient.js'

const TIMEOUT_MS = 8_000
// Requested alongside the full-size url so the response carries a ready-to-use thumbnail without
// a second round trip — see MediaWiki's imageinfo `iiurlwidth` param.
const THUMBNAIL_WIDTH = 500

export interface WikimediaImage {
  externalId: string
  imageUrl: string
  thumbnailUrl?: string
  author?: string
  license?: string
  sourceUrl: string
  width?: number
  height?: number
}

interface WikidataClaimsResponse {
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: string } } }[]>
}

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: {
          url: string
          thumburl?: string
          width: number
          height: number
          descriptionurl: string
          extmetadata?: {
            Artist?: { value: string }
            LicenseShortName?: { value: string }
          }
        }[]
      }
    >
  }
}

/** Decodes the handful of HTML entities MediaWiki's `extmetadata` fields actually use (named
 *  entities plus numeric/hex escapes for accented characters) — good enough for attribution text,
 *  not a general-purpose HTML decoder. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

/** Wikimedia attribution fields (Artist) come back as an HTML fragment (often a link to the
 *  author's user page) — this codebase stores plain attribution text, not markup. */
function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).trim()
}

/** Given a confirmed `wikidataId`, finds that Wikidata item's depicting image (property P18) and
 *  resolves it to a usable, attributed Wikimedia Commons file — one function, two external calls
 *  (Wikidata for the claim, Commons for the file's url/attribution), mirroring
 *  articleFetchClient.ts's one-function-per-external-dependency shape. Returns `null` when the
 *  item has no image claim, or Commons has no matching file for it — never throws for a genuine
 *  "no image" outcome, only for an actual HTTP failure (ticket 41's job handler treats both the
 *  same way: complete with no `EntityImage` row). */
export async function findWikidataEntityImage(wikidataId: string): Promise<WikimediaImage | null> {
  const claimsUrl = new URL('https://www.wikidata.org/w/api.php')
  claimsUrl.searchParams.set('action', 'wbgetclaims')
  claimsUrl.searchParams.set('entity', wikidataId)
  claimsUrl.searchParams.set('property', 'P18')
  claimsUrl.searchParams.set('format', 'json')

  const claimsRes = await fetchWithTimeout(claimsUrl.toString(), TIMEOUT_MS)
  if (!claimsRes.ok) throw new Error(`Wikidata claims lookup returned HTTP ${claimsRes.status}`)
  const claimsBody = (await claimsRes.json()) as WikidataClaimsResponse
  const fileName = claimsBody.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  if (!fileName) return null

  const infoUrl = new URL('https://commons.wikimedia.org/w/api.php')
  infoUrl.searchParams.set('action', 'query')
  infoUrl.searchParams.set('titles', `File:${fileName}`)
  infoUrl.searchParams.set('prop', 'imageinfo')
  infoUrl.searchParams.set('iiprop', 'url|size|extmetadata')
  infoUrl.searchParams.set('iiurlwidth', String(THUMBNAIL_WIDTH))
  infoUrl.searchParams.set('format', 'json')

  const infoRes = await fetchWithTimeout(infoUrl.toString(), TIMEOUT_MS)
  if (!infoRes.ok) throw new Error(`Wikimedia Commons imageinfo lookup returned HTTP ${infoRes.status}`)
  const infoBody = (await infoRes.json()) as CommonsImageInfoResponse
  const info = Object.values(infoBody.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info) return null

  return {
    externalId: fileName,
    imageUrl: info.url,
    thumbnailUrl: info.thumburl,
    author: info.extmetadata?.Artist ? stripHtml(info.extmetadata.Artist.value) : undefined,
    license: info.extmetadata?.LicenseShortName?.value,
    sourceUrl: info.descriptionurl,
    width: info.width,
    height: info.height,
  }
}
