import Parser from 'rss-parser'
import type { FastifyBaseLogger } from 'fastify'
import type { CandidateArticle } from '@news-triangulator/shared'
import { RSS_FEEDS } from '../config/rssFeeds.js'

const parser = new Parser({ timeout: 8_000 })

async function fetchFeed(outlet: string, url: string, log?: FastifyBaseLogger): Promise<CandidateArticle[]> {
  try {
    const feed = await parser.parseURL(url)
    return (feed.items ?? [])
      .filter((item) => item.link && item.title)
      .map((item) => ({
        outlet,
        title: item.title!,
        url: item.link!,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      }))
  } catch (err) {
    log?.warn(`RSS feed failed for ${outlet} (${url}): ${(err as Error).message}`)
    return []
  }
}

export async function queryRssFeeds(log?: FastifyBaseLogger): Promise<CandidateArticle[]> {
  const results = await Promise.allSettled(RSS_FEEDS.map((feed) => fetchFeed(feed.outlet, feed.url, log)))

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
