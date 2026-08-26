import Parser from 'rss-parser'
import type { FastifyBaseLogger } from 'fastify'
import type { CandidateArticle } from '@news-triangulator/shared'
import * as sourceRepo from '../repositories/source.js'
import type { SourceFeedWithSource } from '../repositories/source.js'

const parser = new Parser({ timeout: 8_000 })

// See ADR 0032/ticket 10: every outlet's feed verified as genuine RSS 2.0, "rss2" is the only
// FeedParserKind today. A new kind gets a new handler here (and a new SourceFeed.parserKind
// value) only when a real non-RSS-2.0 outlet is actually added, not speculatively.
type FeedParserKind = 'rss2'

interface RawFeedItem {
  link?: string
  title?: string
  pubDate?: string
  contentSnippet?: string
  categories?: string[]
}

async function parseRss2(url: string): Promise<RawFeedItem[]> {
  const parsed = await parser.parseURL(url)
  return parsed.items ?? []
}

const feedParsers: Record<FeedParserKind, (url: string) => Promise<RawFeedItem[]>> = {
  rss2: parseRss2,
}

function isKnownParserKind(kind: string): kind is FeedParserKind {
  return Object.hasOwn(feedParsers, kind)
}

async function fetchFeed(feed: SourceFeedWithSource, log?: FastifyBaseLogger): Promise<CandidateArticle[]> {
  if (!isKnownParserKind(feed.parserKind)) {
    log?.warn(`Unknown parserKind "${feed.parserKind}" for ${feed.source.name} (${feed.url}), skipping`)
    return []
  }

  try {
    const items = await feedParsers[feed.parserKind](feed.url)
    return items
      .filter((item) => item.link && item.title)
      .map((item) => ({
        sourceId: feed.sourceId,
        outlet: feed.source.name,
        title: item.title!,
        url: item.link!,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        excerpt: item.contentSnippet?.trim() || undefined,
        rawCategories: item.categories?.length ? item.categories : undefined,
      }))
  } catch (err) {
    log?.warn(`RSS feed failed for ${feed.source.name} (${feed.url}): ${(err as Error).message}`)
    return []
  }
}

export async function queryRssFeeds(log?: FastifyBaseLogger): Promise<CandidateArticle[]> {
  const feeds = await sourceRepo.findAllSourceFeeds()
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed, log)))

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
