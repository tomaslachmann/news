import type { FastifyBaseLogger } from 'fastify'
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

function deduplicateInto(
  candidates: CandidateArticle[],
  seen: Set<string>,
  limit: number
): CandidateArticle[] {
  const result: CandidateArticle[] = []
  for (const c of candidates) {
    if (result.length >= limit) break
    const domain = extractDomain(c.url)
    if (!seen.has(domain)) {
      seen.add(domain)
      result.push(c)
    }
  }
  return result
}

export async function discoverCoverage(
  keywords: string[],
  log?: FastifyBaseLogger
): Promise<CandidateArticle[]> {
  const seen = new Set<string>()
  let gdeltResults: CandidateArticle[] = []

  try {
    gdeltResults = await queryGdelt(keywords)
  } catch (err) {
    log?.warn(`GDELT unreachable, falling back to RSS only: ${(err as Error).message}`)
  }

  const gdeltDeduped = deduplicateInto(gdeltResults, seen, MAX_CANDIDATES)

  if (gdeltDeduped.length >= GDELT_MIN_THRESHOLD) {
    return gdeltDeduped
  }

  const rssResults = await queryRssFeeds(log)
  const rssDeduped = deduplicateInto(rssResults, seen, MAX_CANDIDATES - gdeltDeduped.length)

  return [...gdeltDeduped, ...rssDeduped]
}
