// Shared by every thin external-API client (articleFetchClient.ts, wikidataSearchClient.ts,
// wikimediaImageClient.ts) — one honest User-Agent with a contact URL, one timeout/AbortController
// wrapper. Each client still owns its own timeout value and any retry/backoff on top of this.
export const NEWS_TRIANGULATOR_USER_AGENT = 'NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)'

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': NEWS_TRIANGULATOR_USER_AGENT },
    })
  } finally {
    clearTimeout(timer)
  }
}
