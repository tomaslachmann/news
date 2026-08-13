const TIMEOUT_MS = 12_000

export async function fetchArticleHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NewsTriangulator/1.0' },
    })
    if (!res.ok) throw new Error(`Seed article returned HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}
