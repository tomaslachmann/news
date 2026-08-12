import type { CandidateArticle } from '@news-triangulator/shared'
import { DOMAIN_TO_OUTLET } from '../config/rssFeeds.js'

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'
const TIMEOUT_MS = 10_000

interface GdeltArticle {
  url: string
  title: string
  seendate: string
  domain: string
  language: string
  sourcecountry: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

function parseGdeltDate(seendate: string): string {
  // Format: "20250812T120000Z"
  const match = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
  if (!match) return new Date().toISOString()
  const [, y, mo, d, h, mi, s] = match
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
}

export async function queryGdelt(keywords: string[]): Promise<CandidateArticle[]> {
  const query = keywords.join(' ')
  const params = new URLSearchParams({
    query: `${query} sourcelang:Czech sourcecountry:CZ`,
    mode: 'artlist',
    format: 'json',
    maxrecords: '25',
    timespan: '14d',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let data: GdeltResponse
  try {
    const res = await fetch(`${GDELT_BASE}?${params}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`GDELT returned HTTP ${res.status}`)
    data = (await res.json()) as GdeltResponse
  } catch (err) {
    clearTimeout(timer)
    throw err
  }

  return (data.articles ?? []).map((a) => ({
    outlet: DOMAIN_TO_OUTLET[a.domain] ?? a.domain,
    title: a.title,
    url: a.url,
    publishedAt: parseGdeltDate(a.seendate),
  }))
}
