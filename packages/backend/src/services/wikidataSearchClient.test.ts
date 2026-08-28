import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchItemDetails,
  resolveByCswikiTitle,
  searchTypedCandidates,
  searchWikidataEntities,
} from './wikidataSearchClient.js'

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

const CSWIKI_ENTITY = {
  labels: { cs: { value: 'Petr Fiala' }, en: { value: 'Petr Fiala' } },
  aliases: { cs: [{ value: 'Fiala' }] },
  descriptions: { cs: { value: 'český politik' } },
  claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }] },
  sitelinks: { cswiki: { title: 'Petr Fiala' }, enwiki: { title: 'Petr Fiala' } },
}

describe('resolveByCswikiTitle', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('resolves a cswiki title to one typed item detail, with maxlag and the sites/titles params', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ entities: { Q3377548: CSWIKI_ENTITY } }))

    const item = await resolveByCswikiTitle('Petr Fiala')

    const parsed = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(parsed.searchParams.get('action')).toBe('wbgetentities')
    expect(parsed.searchParams.get('sites')).toBe('cswiki')
    expect(parsed.searchParams.get('titles')).toBe('Petr Fiala')
    expect(parsed.searchParams.get('maxlag')).toBe('5')
    expect(item).toEqual({
      qid: 'Q3377548',
      label: 'Petr Fiala',
      names: ['Petr Fiala', 'Fiala'],
      description: 'český politik',
      p31: ['Q5'],
      sitelinkCount: 2,
      hasCswikiSitelink: true,
    })
  })

  it('returns null when no cswiki page has that title (the "-1" missing marker)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ entities: { '-1': { missing: '' } } }))

    await expect(resolveByCswikiTitle('Nонexistent')).resolves.toBeNull()
  })
})

describe('searchTypedCandidates', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('builds a haswbstatement P31 OR-clause from the passed Q-ids and returns only Q-id titles', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        query: { search: [{ title: 'Q3377548' }, { title: 'Q12044841' }, { title: 'not-a-qid' }] },
      })
    )

    const qids = await searchTypedCandidates('Petr Fiala', ['Q5', 'Q6256'])

    const parsed = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(parsed.searchParams.get('list')).toBe('search')
    expect(parsed.searchParams.get('srsearch')).toBe('"Petr Fiala" haswbstatement:P31=Q5|P31=Q6256')
    expect(qids).toEqual(['Q3377548', 'Q12044841'])
  })

  it('strips quotes from the name before wrapping it in the phrase query', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ query: { search: [] } }))

    await searchTypedCandidates('the "big" one', ['Q5'])

    const parsed = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(parsed.searchParams.get('srsearch')).toBe('"the big one" haswbstatement:P31=Q5')
  })

  it('throws when the API returns an error body (e.g. maxlag)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { code: 'maxlag' } }))

    await expect(searchTypedCandidates('X', ['Q5'])).rejects.toThrow('maxlag')
  })

  it('retries once on a 429 that carries Retry-After, then succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Q1' }] } }))

    await expect(searchTypedCandidates('X', ['Q5'])).resolves.toEqual(['Q1'])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})

describe('fetchItemDetails', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('batches ids into one wbgetentities call and maps each entity', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        entities: {
          Q1: {
            labels: { en: { value: 'One' } },
            claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q43229' } } } }] },
          },
          Q2: { labels: {}, sitelinks: {} },
        },
      })
    )

    const details = await fetchItemDetails(['Q1', 'Q2', 'Q1'])

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    const parsed = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(parsed.searchParams.get('ids')).toBe('Q1|Q2')
    expect(details).toEqual([
      {
        qid: 'Q1',
        label: 'One',
        names: ['One'],
        description: null,
        p31: ['Q43229'],
        sitelinkCount: 0,
        hasCswikiSitelink: false,
      },
      {
        qid: 'Q2',
        label: 'Q2',
        names: [],
        description: null,
        p31: [],
        sitelinkCount: 0,
        hasCswikiSitelink: false,
      },
    ])
  })
})
