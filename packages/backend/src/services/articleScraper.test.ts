import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetchArticleHtml } = vi.hoisted(() => ({ mockFetchArticleHtml: vi.fn() }))

vi.mock('./articleFetchClient.js', () => ({ fetchArticleHtml: mockFetchArticleHtml }))

import { scrapeArticle, scrapeForCoverage, ScrapeError } from './articleScraper.js'

const ARTICLE_HTML = `
  <html>
    <head><title>A real headline</title></head>
    <body>
      <article>
        <h1>A real headline</h1>
        <p>${'This is the first paragraph of the article body. '.repeat(20)}</p>
        <p>${'This is the second paragraph with more filler content. '.repeat(20)}</p>
      </article>
    </body>
  </html>
`

describe('scrapeArticle', () => {
  beforeEach(() => {
    mockFetchArticleHtml.mockReset()
  })

  it('extracts title, excerpt, and full text from the fetched HTML', async () => {
    mockFetchArticleHtml.mockResolvedValue(ARTICLE_HTML)

    const result = await scrapeArticle('https://example.cz/article')

    expect(result.title).toBe('A real headline')
    expect(result.fullText).toContain('first paragraph')
    expect(result.fullText).toContain('second paragraph')
    expect(mockFetchArticleHtml).toHaveBeenCalledWith('https://example.cz/article')
  })

  it('wraps a fetch failure in a ScrapeError', async () => {
    mockFetchArticleHtml.mockRejectedValue(new Error('network down'))

    await expect(scrapeArticle('https://example.cz/article')).rejects.toThrow(ScrapeError)
  })

  it('throws a ScrapeError when Readability cannot extract content', async () => {
    mockFetchArticleHtml.mockResolvedValue('<html><body></body></html>')

    await expect(scrapeArticle('https://example.cz/empty')).rejects.toThrow(ScrapeError)
  })
})

describe('scrapeForCoverage', () => {
  beforeEach(() => {
    mockFetchArticleHtml.mockReset()
  })

  it('returns OK with the extracted text for a real, unblocked article', async () => {
    mockFetchArticleHtml.mockResolvedValue(ARTICLE_HTML)

    const result = await scrapeForCoverage('https://example.cz/article')

    expect(result.status).toBe('OK')
    expect(result.extractedText).toContain('first paragraph')
  })

  it('returns EXTRACTION_FAILED, not OK, when the scraped text is too short', async () => {
    mockFetchArticleHtml.mockResolvedValue(
      '<html><head><title>T</title></head><body><article><p>Too short.</p></article></body></html>'
    )

    const result = await scrapeForCoverage('https://example.cz/short')

    expect(result).toEqual({ status: 'EXTRACTION_FAILED' })
  })

  it('returns EXTRACTION_FAILED when the text matches a blocked-content phrase', async () => {
    const blockedHtml = `
      <html>
        <head><title>Paywalled</title></head>
        <body>
          <article>
            <p>${'Neblokujete reklamy? '.repeat(20)}</p>
          </article>
        </body>
      </html>
    `
    mockFetchArticleHtml.mockResolvedValue(blockedHtml)

    const result = await scrapeForCoverage('https://example.cz/paywalled')

    expect(result).toEqual({ status: 'EXTRACTION_FAILED' })
  })

  it('returns EXTRACTION_FAILED, not a throw, when the scrape itself fails', async () => {
    mockFetchArticleHtml.mockRejectedValue(new Error('network down'))

    await expect(scrapeForCoverage('https://example.cz/article')).resolves.toEqual({
      status: 'EXTRACTION_FAILED',
    })
  })
})
