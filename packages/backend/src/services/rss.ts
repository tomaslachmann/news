import Parser from 'rss-parser'
import type { FastifyBaseLogger } from 'fastify'
import type { CandidateArticle } from '@news-triangulator/shared'
import * as sourceRepo from '../repositories/source.js'
import type { SourceFeedWithSource } from '../repositories/source.js'

// Seznam.cz-family outlets (Novinky, Seznam Zprávy) tag every item's rubric via a custom
// `<szn:sections><value>...</value></szn:sections>` field, never the plain `<category>` tag
// rss-parser reads by default -- without this, `item.categories` is always undefined for them
// (ticket 85, live-verified 2026-08-27: STANDARD_CZECH_RUBRIC_MAP had silently never fired for
// either source since ticket 78).
const parser = new Parser<Record<string, unknown>, RawFeedItem>({
  timeout: 8_000,
  customFields: { item: [['szn:sections', 'sznSections']] },
})

// See ADR 0032/ticket 10: every outlet's feed verified as genuine RSS 2.0, "rss2" is the only
// FeedParserKind today. A new kind gets a new handler here (and a new SourceFeed.parserKind
// value) only when a real non-RSS-2.0 outlet is actually added, not speculatively.
type FeedParserKind = 'rss2'

/** rss-parser (and its own upstream .d.ts, which just says `string[]`) actually hands back a
 *  `{_: text, $: {domain: "..."}}` object, not a plain string, for any `<category domain="...">`
 *  tag -- confirmed live (ticket 85, 2026-08-27) for Aktuálně, ČT24 and CNN Prima NEWS, all of
 *  which have used domain-attributed categories since before ticket 78. `resolvePrimaryCategory`
 *  expects plain strings; an unnormalized object element throws `Cannot convert object to
 *  primitive value` the moment it's used as a map key -- a real crash that predates this ticket
 *  and was masked only for candidates whose feed itself carries a `feedCategory` (which short-
 *  circuits before ever touching `rawCategories`). */
type RawCategoryValue = string | { _?: string }

interface RawFeedItem {
  link?: string
  title?: string
  pubDate?: string
  contentSnippet?: string
  categories?: RawCategoryValue[]
  sznSections?: { value?: string | string[] }
}

function normalizeCategory(raw: RawCategoryValue): string | undefined {
  return typeof raw === 'string' ? raw : raw._
}

/** rss-parser's underlying xml2js config (`explicitArray: false`) collapses a repeated XML element
 *  down to a plain value, not a 1-element array, when only one occurrence is present -- a real
 *  single-`<value>` `szn:sections` item would otherwise break the `.length`/iteration ticket 85's
 *  fallback relies on. */
function toStringArray(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value : [value]
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
      .map((item) => {
        const categories = item.categories?.map(normalizeCategory).filter((c): c is string => !!c)
        return {
          sourceId: feed.sourceId,
          outlet: feed.source.name,
          title: item.title!,
          url: item.link!,
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          excerpt: item.contentSnippet?.trim() || undefined,
          rawCategories: categories?.length ? categories : toStringArray(item.sznSections?.value),
          feedCategory: feed.category,
        }
      })
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
