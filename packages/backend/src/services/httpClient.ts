// Shared by every thin external-API client (articleFetchClient.ts, wikidataSearchClient.ts,
// wikimediaImageClient.ts) — one timeout/AbortController wrapper. Each client still owns its own
// timeout value and any retry/backoff on top of this.
//
// The default request headers are one honest User-Agent with a contact URL — what the Wikidata and
// Wikimedia APIs ask for. A caller that needs a different set (articleFetchClient.ts fetches
// article bodies with a browser-shaped header set, since several Czech outlets bot-block the
// honest UA — ticket 89) passes its own `headers`, which replace the default entirely.
export const NEWS_TRIANGULATOR_USER_AGENT = 'NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)'

const DEFAULT_HEADERS: Record<string, string> = { 'User-Agent': NEWS_TRIANGULATOR_USER_AGENT }

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = DEFAULT_HEADERS,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers })
  } finally {
    clearTimeout(timer)
  }
}

// Statuses worth retrying against a rate-limited/overloaded API rather than failing the caller.
const RETRYABLE_STATUS = new Set([429, 503])
// Cap on how long a single `Retry-After` can park a request — a job still has its own timeout.
const MAX_RETRY_WAIT_MS = 15_000

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds) * 1000, MAX_RETRY_WAIT_MS)
  const dateMs = Date.parse(header)
  if (Number.isNaN(dateMs)) return null
  return Math.min(Math.max(0, dateMs - Date.now()), MAX_RETRY_WAIT_MS)
}

/** `fetchWithTimeout` plus a bounded retry on 429/503 that honours the `Retry-After` header —
 *  Wikimedia's documented rate-limit signal (API:Etiquette, WDQS). Used by the polite serial
 *  callers (`wikidataSearchClient`, `wikidataReconcileClient`); other clients keep the plain
 *  `fetchWithTimeout`. Falls back to exponential backoff when the server sends no `Retry-After`. */
export async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  options: { headers?: Record<string, string>; init?: RequestInit; retries?: number } = {}
): Promise<Response> {
  const retries = options.retries ?? 2
  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(url, timeoutMs, options.headers ?? DEFAULT_HEADERS, options.init)
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= retries) return res
    const waitMs = retryAfterMs(res) ?? Math.min(1000 * 2 ** attempt, MAX_RETRY_WAIT_MS)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}
