import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchWithRetry } from './httpClient.js'

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : '{}', { status, headers })
}

describe('fetchWithRetry', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('returns a non-retryable response immediately, no retry', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200))

    const out = await fetchWithRetry('https://x.test', 1000)

    expect(out.status).toBe(200)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 that carries Retry-After: 0 and returns the next response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(res(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(res(200))

    const out = await fetchWithRetry('https://x.test', 1000)

    expect(out.status).toBe(200)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('gives up after `retries` attempts and returns the last (still-failing) response', async () => {
    vi.mocked(fetch).mockResolvedValue(res(503, { 'retry-after': '0' }))

    const out = await fetchWithRetry('https://x.test', 1000, { retries: 2 })

    expect(out.status).toBe(503)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('honours an HTTP-date Retry-After, capped at 15s', async () => {
    vi.useFakeTimers()
    try {
      const farFuture = new Date(Date.now() + 60_000).toUTCString()
      vi.mocked(fetch)
        .mockResolvedValueOnce(res(429, { 'retry-after': farFuture }))
        .mockResolvedValueOnce(res(200))

      const pending = fetchWithRetry('https://x.test', 1000, { retries: 1 })
      // Not resolved before the cap; resolved once 15s of fake time passes.
      await vi.advanceTimersByTimeAsync(14_000)
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_500)
      expect((await pending).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('threads a POST body and custom headers through to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(res(200))

    await fetchWithRetry('https://x.test', 1000, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      init: { method: 'POST', body: 'a=1' },
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('a=1')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded')
  })
})
