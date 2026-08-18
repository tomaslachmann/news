import type { CandidateArticle } from '@news-triangulator/shared'
import { resolveSourcesByDomains } from './sourceResolver.js'
import { fetchGdelt } from './gdeltClient.js'

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

  const data = (await fetchGdelt(params)) as GdeltResponse
  const articles = data.articles ?? []

  // One query for the whole batch, not one per article (GDELT can return up to 25) — see
  // resolveSourcesByDomains.
  const sourcesByDomain = await resolveSourcesByDomains(articles.map((a) => a.domain))

  return articles.map((a) => {
    const source = sourcesByDomain.get(a.domain.replace(/^www\./, ''))!
    return {
      sourceId: source.id,
      outlet: source.name,
      title: a.title,
      url: a.url,
      publishedAt: parseGdeltDate(a.seendate),
    }
  })
}
