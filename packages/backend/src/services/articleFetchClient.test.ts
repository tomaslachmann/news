import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchArticleHtml } from './articleFetchClient.js'

function jsonHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries)
}

describe('fetchArticleHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches article bodies with a browser-shaped header set, not the honest contact UA', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>ok</html>', { status: 200 }))

    await fetchArticleHtml('https://example.cz/article')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('User-Agent')).toMatch(/^Mozilla\/5\.0 /)
    expect(headers.get('User-Agent')).not.toContain('NewsTriangulator')
    expect(headers.get('Accept-Language')).toContain('cs')
    expect(headers.get('Sec-Fetch-Mode')).toBe('navigate')
  })

  it('sends the idnes.cz consent cookie for an idnes URL (any subdomain), and no cookie elsewhere', async () => {
    // Fresh Response per call — arrayBuffer() consumes the body, so a shared instance can't be reused.
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response('<html>ok</html>', { status: 200 }))
    )

    await fetchArticleHtml('https://www.idnes.cz/zpravy/domaci/nejaky-clanek.A123')
    await fetchArticleHtml('https://www.novinky.cz/clanek/456')

    const idnesHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)
    const novinkyHeaders = new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers)
    expect(idnesHeaders.get('Cookie')).toBe('dCMP=1')
    expect(novinkyHeaders.get('Cookie')).toBeNull()
  })

  it('returns the body text on a 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>hello</html>', { status: 200 }))

    const html = await fetchArticleHtml('https://example.cz/article')

    expect(html).toBe('<html>hello</html>')
  })

  it('decodes a windows-1250 body by its declared charset, not as UTF-8', async () => {
    // 0x8a 0x9a 0xe8 0xf8 0x9e in windows-1250 == Š š č ř ž
    const win1250 = Uint8Array.from([0x3c, 0x70, 0x3e, 0x8a, 0x9a, 0xe8, 0xf8, 0x9e, 0x3c, 0x2f, 0x70, 0x3e])
    vi.mocked(fetch).mockResolvedValue(
      new Response(win1250, { status: 200, headers: { 'content-type': 'text/html; charset=windows-1250' } })
    )

    const html = await fetchArticleHtml('https://www.idnes.cz/legacy-encoded')

    expect(html).toBe('<p>Šščřž</p>')
  })

  it('retries a 403 (irozhlas burst rate-limit), then succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('nope', { status: 403 }))
      .mockResolvedValueOnce(new Response('<html>recovered</html>', { status: 200 }))

    const promise = fetchArticleHtml('https://www.irozhlas.cz/zpravy-domov/clanek_123')
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await promise).toBe('<html>recovered</html>')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on a non-retryable 404, no retry attempted', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }))

    await expect(fetchArticleHtml('https://example.cz/gone')).rejects.toThrow('HTTP 404')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on a 503, then succeeds, honoring the fixed backoff', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html>recovered</html>', { status: 200 }))

    const promise = fetchArticleHtml('https://example.cz/flaky')
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await promise).toBe('<html>recovered</html>')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on a 429 honoring the Retry-After header in seconds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 429, headers: jsonHeaders({ 'retry-after': '5' }) }))
      .mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200 }))

    const promise = fetchArticleHtml('https://example.cz/limited')
    await vi.advanceTimersByTimeAsync(4_999)
    // Not yet retried — Retry-After: 5 hasn't elapsed.
    expect(fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(await promise).toBe('<html>ok</html>')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('caps an outlet-supplied Retry-After at the max delay instead of honoring it verbatim', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: jsonHeaders({ 'retry-after': '86400' }) })
      )
      .mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200 }))

    const promise = fetchArticleHtml('https://example.cz/hostile-retry-after')
    // A day-long Retry-After must not be honored verbatim on a synchronous request path — capped.
    await vi.advanceTimersByTimeAsync(10_000)

    expect(await promise).toBe('<html>ok</html>')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drains a retryable non-OK response body before retrying, so the connection can be reused', async () => {
    const cancel = vi.fn()
    const retryableResponse = new Response('', { status: 503 })
    Object.defineProperty(retryableResponse, 'body', { value: { cancel } })
    vi.mocked(fetch)
      .mockResolvedValueOnce(retryableResponse)
      .mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200 }))

    const promise = fetchArticleHtml('https://example.cz/flaky-body')
    await vi.advanceTimersByTimeAsync(1_000)
    await promise

    expect(cancel).toHaveBeenCalled()
  })

  it('gives up after 3 total attempts on persistent 5xx failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }))

    const promise = fetchArticleHtml('https://example.cz/always-down')
    const assertion = expect(promise).rejects.toThrow('HTTP 500')
    await vi.runAllTimersAsync()
    await assertion

    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
