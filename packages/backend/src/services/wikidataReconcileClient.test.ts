import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reconcile, ReconcileUnavailableError } from './wikidataReconcileClient.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('reconcile', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('sends a form-style queries batch constrained to the type root class and honest UA', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ q0: { result: [] } }))

    await reconcile('Petr Fiala', 'PERSON')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://wikidata-reconciliation.wmcloud.org/cs/api')
    const batch = JSON.parse(parsed.searchParams.get('queries') as string) as {
      q0: { query: string; type: string }
    }
    expect(batch.q0).toMatchObject({ query: 'Petr Fiala', type: 'Q5' })
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      'NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)'
    )
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

  it('throws ReconcileUnavailableError on a 429 (rate limited)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 429))

    await expect(reconcile('X', 'PERSON')).rejects.toBeInstanceOf(ReconcileUnavailableError)
  })

  it('throws ReconcileUnavailableError when the request itself fails (timeout / network)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('aborted'))

    await expect(reconcile('X', 'PERSON')).rejects.toBeInstanceOf(ReconcileUnavailableError)
  })
})
