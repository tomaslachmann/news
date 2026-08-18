import Parser from 'rss-parser'
import type { FastifyBaseLogger } from 'fastify'
import type { CandidateArticle } from '@news-triangulator/shared'
import * as sourceRepo from '../repositories/source.js'
import type { SourceFeedWithSource } from '../repositories/source.js'

const parser = new Parser({ timeout: 8_000 })

async function fetchFeed(feed: SourceFeedWithSource, log?: FastifyBaseLogger): Promise<CandidateArticle[]> {
  try {
    const parsed = await parser.parseURL(feed.url)
    return (parsed.items ?? [])
      .filter((item) => item.link && item.title)
      .map((item) => ({
        sourceId: feed.sourceId,
        outlet: feed.source.name,
        title: item.title!,
        url: item.link!,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        excerpt: item.contentSnippet?.trim() || undefined,
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
