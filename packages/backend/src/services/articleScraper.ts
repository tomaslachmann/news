import type { FastifyBaseLogger } from 'fastify'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { fetchArticleHtml } from './articleFetchClient.js'
import { isBlockedContent } from './blockedContent.js'

export const MIN_TEXT_LENGTH = 150

export interface ScrapedArticle {
  title: string
  excerpt: string // first ~3 paragraphs — used for keyword extraction
  fullText: string // complete article body — used for LLM extraction
}

export class ScrapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScrapeError'
  }
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle> {
  let html: string
  try {
    html = await fetchArticleHtml(url)
  } catch (err) {
    throw new ScrapeError(`Nepodařilo se načíst zdrojový článek: ${(err as Error).message}`)
  }

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article) {
    throw new ScrapeError('Nepodařilo se extrahovat obsah článku ze stránky')
  }

  const title = article.title?.trim() || 'Bez názvu'

  const excerpt = (article.textContent ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 40)
    .slice(0, 3)
    .join('\n\n')

  const fullText = (article.textContent ?? '').trim()

  return { title, excerpt, fullText }
}

export interface ScrapeForCoverageOutcome {
  status: 'OK' | 'EXTRACTION_FAILED'
  extractedText?: string
}

/** The scrape → too-short/blocked-content check → Coverage status decision, shared by
 *  confirmCoverages (analysisService.ts) and approvePendingAddition (ingestionService.ts) — kept
 *  in one place so the blocked/too-short heuristics can't silently diverge between the two call
 *  sites (the exact P0-6-style drift this codebase's own audit history warns about). Never
 *  throws: a scrape failure degrades to `EXTRACTION_FAILED`, same as an accepted-but-blocked one —
 *  callers still see it and write it via `coverageRepo.updateCoverage`. */
export async function scrapeForCoverage(
  url: string,
  log?: FastifyBaseLogger
): Promise<ScrapeForCoverageOutcome> {
  const scrapeLog = log?.child({ namespace: 'scraper' })
  scrapeLog?.info({ url }, 'Scraping article')
  try {
    const scraped = await scrapeArticle(url)
    const isBlocked = scraped.fullText.length < MIN_TEXT_LENGTH || isBlockedContent(scraped.fullText)
    if (isBlocked) {
      scrapeLog?.info({ url, textLength: scraped.fullText.length }, 'Scraped article too short or blocked')
      return { status: 'EXTRACTION_FAILED' }
    }
    scrapeLog?.info({ url, textLength: scraped.fullText.length }, 'Scraped article')
    return { status: 'OK', extractedText: scraped.fullText }
  } catch (err) {
    scrapeLog?.warn({ url, err }, 'Scraping Coverage article failed')
    return { status: 'EXTRACTION_FAILED' }
  }
}
