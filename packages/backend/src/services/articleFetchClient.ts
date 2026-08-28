import { fetchWithTimeout } from './httpClient.js'

const TIMEOUT_MS = 12_000

// ADR 0032: small-scope politeness. 3 attempts total on 403/429/5xx, honoring Retry-After when the
// outlet sends one, else this fixed backoff — no jitter, traffic here is far below the scale
// jitter exists to protect against.
const MAX_ATTEMPTS = 3
const FIXED_BACKOFF_MS = [1_000, 2_000]
// A misbehaving/hostile outlet could send an arbitrarily large Retry-After; this request path is
// synchronous (an admin PATCH awaits it directly), so honoring it verbatim risks a de-facto hang.
const MAX_RETRY_DELAY_MS = 10_000

// Article bodies are fetched with a browser-shaped header set, NOT the project's honest
// contact-URL User-Agent (httpClient.ts) that the Wikidata/Wikimedia clients still use: several
// Czech outlets — irozhlas.cz behind Cloudflare most reliably — answer a request that doesn't
// look like a real browser navigation with a 403, which surfaced as "extraction failed, paste it
// by hand" on every Review Step involving those outlets (ticket 89).
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

// Cookies that get an outlet's article HTML served directly instead of a consent-wall redirect.
// idnes.cz 302s every article URL to /nastaveni-souhlasu until a consent choice is recorded;
// `dCMP=1` is that recorded choice (the generic `cookie_consent`/`euconsent-v2`/… names don't
// work). Matched by exact hostname or a dotted suffix, so `www.idnes.cz` and `idnes.cz` both hit.
const CONSENT_COOKIE_BY_HOST: { suffix: string; cookie: string }[] = [
  { suffix: 'idnes.cz', cookie: 'dCMP=1' },
]

function headersFor(url: string): Record<string, string> {
  const headers = { ...BROWSER_HEADERS }
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return headers
  }
  const match = CONSENT_COOKIE_BY_HOST.find(
    ({ suffix }) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  )
  if (match) headers.Cookie = match.cookie
  return headers
}

// 403 is retryable here (unlike the general case): irozhlas.cz rate-limits short bursts with a
// 403 that the fixed backoff below clears. A genuinely forbidden URL just fails after 3 attempts.
function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 429 || status >= 500
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1_000, MAX_RETRY_DELAY_MS)
  return FIXED_BACKOFF_MS[attempt] ?? FIXED_BACKOFF_MS.at(-1)!
}

/** Decodes the body by its declared charset. undici's `Response.text()` always assumes UTF-8, so
 *  an outlet still serving a legacy charset (idnes.cz — `windows-1250`) would come back with
 *  mangled Czech diacritics. Node ships full-ICU, so `TextDecoder` handles the legacy labels;
 *  an unknown or absent label falls back to UTF-8. */
async function decodeBody(res: Response): Promise<string> {
  const charset = /charset=([^;]+)/i
    .exec(res.headers.get('content-type') ?? '')?.[1]
    ?.trim()
    .toLowerCase()
  const buffer = await res.arrayBuffer()
  if (!charset || charset === 'utf-8' || charset === 'utf8') return new TextDecoder('utf-8').decode(buffer)
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

export async function fetchArticleHtml(url: string): Promise<string> {
  const headers = headersFor(url)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchWithTimeout(url, TIMEOUT_MS, headers)
    if (res.ok) return await decodeBody(res)

    const isLastAttempt = attempt === MAX_ATTEMPTS - 1
    if (!isRetryableStatus(res.status) || isLastAttempt) {
      throw new Error(`Seed article returned HTTP ${res.status}`)
    }

    // Drain the body before retrying — an un-consumed body holds the underlying connection open,
    // and with retries now in the mix, several never-read bodies could otherwise pile up.
    await res.body?.cancel()
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res, attempt)))
  }
  // Unreachable: the loop above always returns or throws.
  throw new Error('Seed article fetch exhausted retries')
}
