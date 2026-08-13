const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'
const TIMEOUT_MS = 10_000

export async function fetchGdelt(params: URLSearchParams): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${GDELT_BASE}?${params}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`GDELT returned HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}
