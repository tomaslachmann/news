const TIMEOUT_MS = 12_000
const USER_AGENT = 'NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)'

// ADR 0032: small-scope politeness. 3 attempts total on 429/5xx, honoring Retry-After when the
// outlet sends one, else this fixed backoff — no jitter, traffic here is far below the scale
// jitter exists to protect against.
const MAX_ATTEMPTS = 3
const FIXED_BACKOFF_MS = [1_000, 2_000]
// A misbehaving/hostile outlet could send an arbitrarily large Retry-After; this request path is
// synchronous (an admin PATCH awaits it directly), so honoring it verbatim risks a de-facto hang.
const MAX_RETRY_DELAY_MS = 10_000

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1_000, MAX_RETRY_DELAY_MS)
  return FIXED_BACKOFF_MS[attempt] ?? FIXED_BACKOFF_MS.at(-1)!
}

async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchArticleHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchOnce(url)
    if (res.ok) return await res.text()

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
