import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchWikidataEntities } from './wikidataSearchClient.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('searchWikidataEntities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the query, language, and format params to wbsearchentities', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ search: [] }))

    await searchWikidataEntities('Petr Fiala')

    const [url] = vi.mocked(fetch).mock.calls[0]
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://www.wikidata.org/w/api.php')
    expect(parsed.searchParams.get('action')).toBe('wbsearchentities')
    expect(parsed.searchParams.get('search')).toBe('Petr Fiala')
    expect(parsed.searchParams.get('format')).toBe('json')
  })

  it('sends an honest User-Agent with a contact URL', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ search: [] }))

    await searchWikidataEntities('test')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('User-Agent')).toBe('NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)')
  })

  it('maps search results to candidates, label falling back to the qid when absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        search: [{ id: 'Q123', label: 'Petr Fiala', description: 'Czech politician' }, { id: 'Q456' }],
      })
    )

    const candidates = await searchWikidataEntities('Petr Fiala')

    expect(candidates).toEqual([
      { qid: 'Q123', label: 'Petr Fiala', description: 'Czech politician' },
      { qid: 'Q456', label: 'Q456', description: undefined },
    ])
  })

  it('returns an empty array when Wikidata has no matches', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ search: [] }))

    await expect(searchWikidataEntities('zzzzzznonsense')).resolves.toEqual([])
  })

  it('throws on a non-OK HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 503))

    await expect(searchWikidataEntities('test')).rejects.toThrow('HTTP 503')
  })
})
