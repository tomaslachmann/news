import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { fetchArticleHtml } from './articleFetchClient.js'

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
