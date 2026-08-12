import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export interface ScrapedArticle {
  title: string
  excerpt: string   // first ~3 paragraphs — used for keyword extraction
  fullText: string  // complete article body — used for LLM extraction
}

export class ScrapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScrapeError'
  }
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)

  let html: string
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NewsTriangulator/1.0' },
    })
    clearTimeout(timer)

    if (!res.ok) {
      throw new ScrapeError(`Seed article returned HTTP ${res.status}`)
    }

    html = await res.text()
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof ScrapeError) throw err
    throw new ScrapeError(`Could not reach the seed article: ${(err as Error).message}`)
  }

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article) {
    throw new ScrapeError('Could not extract article content from the page')
  }

  const title = article.title?.trim() || 'Untitled'

  const excerpt = (article.textContent ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 40)
    .slice(0, 3)
    .join('\n\n')

  const fullText = (article.textContent ?? '').trim()

  return { title, excerpt, fullText }
}
