import type { CandidateArticle } from '@news-triangulator/shared'
import { queryGdelt } from './gdelt.js'
import { queryRssFeeds } from './rss.js'

const MAX_CANDIDATES = 10
const GDELT_MIN_THRESHOLD = 5

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function deduplicate(candidates: CandidateArticle[]): CandidateArticle[] {
  const seen = new Set<string>()
  const result: CandidateArticle[] = []

  for (const c of candidates) {
    const domain = extractDomain(c.url)
    if (!seen.has(domain)) {
      seen.add(domain)
      result.push(c)
      if (result.length >= MAX_CANDIDATES) break
    }
  }

  return result
}

export async function discoverCoverage(
  keywords: string[],
  logger?: { warn: (msg: string) => void }
): Promise<CandidateArticle[]> {
  let gdeltResults: CandidateArticle[] = []

  try {
    gdeltResults = await queryGdelt(keywords)
  } catch (err) {
    logger?.warn(`GDELT unreachable, falling back to RSS only: ${(err as Error).message}`)
  }

  const gdeltDeduped = deduplicate(gdeltResults)

  if (gdeltDeduped.length >= GDELT_MIN_THRESHOLD) {
    return gdeltDeduped.slice(0, MAX_CANDIDATES)
  }

  const rssResults = await queryRssFeeds()

  const seenDomains = new Set(gdeltDeduped.map((c) => extractDomain(c.url)))
  const rssNew = rssResults.filter((c) => {
    const domain = extractDomain(c.url)
    if (seenDomains.has(domain)) return false
    seenDomains.add(domain)
    return true
  })

  const merged = [...gdeltDeduped, ...rssNew]
  return merged.slice(0, MAX_CANDIDATES)
}
