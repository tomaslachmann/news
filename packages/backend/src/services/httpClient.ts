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
  headers: Record<string, string> = DEFAULT_HEADERS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, headers })
  } finally {
    clearTimeout(timer)
  }
}
