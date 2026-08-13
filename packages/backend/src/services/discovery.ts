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

export interface DiscoveryResult {
  candidates: CandidateArticle[]
  /** How many of `candidates` came from GDELT's keyword search, as opposed to the RSS fallback
   *  layer — which returns whatever's currently trending, unfiltered by keyword. Callers that need
   *  confidence the candidates are actually about the same Story (not just "also recent") should
   *  only trust this list when gdeltCount > 0. */
  gdeltCount: number
}

export async function discoverCoverage(
  keywords: string[],
  log?: FastifyBaseLogger
): Promise<DiscoveryResult> {
  const seen = new Set<string>()
  let gdeltResults: CandidateArticle[] = []

  try {
    gdeltResults = await queryGdelt(keywords)
  } catch (err) {
    log?.warn(`GDELT unreachable, falling back to RSS only: ${(err as Error).message}`)
  }

  const gdeltDeduped = deduplicateInto(gdeltResults, seen, MAX_CANDIDATES)

  if (gdeltDeduped.length >= GDELT_MIN_THRESHOLD) {
    return { candidates: gdeltDeduped, gdeltCount: gdeltDeduped.length }
  }

  const rssResults = await queryRssFeeds(log)
  const rssDeduped = deduplicateInto(rssResults, seen, MAX_CANDIDATES - gdeltDeduped.length)

  return { candidates: [...gdeltDeduped, ...rssDeduped], gdeltCount: gdeltDeduped.length }
}
