import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reconcile, ReconcileUnavailableError } from './wikidataReconcileClient.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('reconcile', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs a form-encoded queries batch constrained to the type root class, with the honest UA', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ q0: { result: [] } }))

    await reconcile('Petr Fiala', 'PERSON')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://wikidata-reconciliation.wmcloud.org/cs/api')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')
    expect(headers.get('User-Agent')).toBe('NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)')
    const body = init?.body as string
    expect(body.startsWith('queries=')).toBe(true)
    const batch = JSON.parse(decodeURIComponent(body.slice('queries='.length))) as {
      q0: { query: string; type: string }
    }
    expect(batch.q0).toMatchObject({ query: 'Petr Fiala', type: 'Q5' })
  })

  it('returns the highest-scoring candidate with its match flag', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        q0: {
          result: [
            { id: 'Q12044841', score: 71, match: false },
            { id: 'Q3377548', score: 96, match: true },
          ],
        },
      })
    )

    await expect(reconcile('Petr Fiala', 'PERSON')).resolves.toEqual({
      qid: 'Q3377548',
      score: 96,
      match: true,
    })
  })

  it('returns null when the service found nothing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ q0: { result: [] } }))

    await expect(reconcile('zzz', 'PERSON')).resolves.toBeNull()
  })

  it('retries then throws ReconcileUnavailableError when 429s persist', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '0' } }))

    await expect(reconcile('X', 'PERSON')).rejects.toBeInstanceOf(ReconcileUnavailableError)
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1)
  })

  it('throws ReconcileUnavailableError when the request itself fails (timeout / network)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('aborted'))

    await expect(reconcile('X', 'PERSON')).rejects.toBeInstanceOf(ReconcileUnavailableError)
  })
})
