import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetchArticleHtml } = vi.hoisted(() => ({ mockFetchArticleHtml: vi.fn() }))

vi.mock('./articleFetchClient.js', () => ({ fetchArticleHtml: mockFetchArticleHtml }))

import { scrapeArticle, ScrapeError } from './articleScraper.js'

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
