import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { findWikidataContext } from './wikipediaClient.js'

function entitiesResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const QID = 'Q42'

describe('findWikidataContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the Wikidata description plus the Czech Wikipedia extract and URL', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        entitiesResponse({
          entities: {
            [QID]: {
              descriptions: { cs: { value: 'český politik' }, en: { value: 'Czech politician' } },
              sitelinks: { cswiki: { title: 'Petr Fiala' } },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        entitiesResponse({
          type: 'standard',
          extract: 'Petr Fiala je český politik.',
          content_urls: { desktop: { page: 'https://cs.wikipedia.org/wiki/Petr_Fiala' } },
        })
      )

    const result = await findWikidataContext(QID)

    expect(result).toEqual({
      description: 'český politik',
      wikipediaExtract: 'Petr Fiala je český politik.',
      wikipediaUrl: 'https://cs.wikipedia.org/wiki/Petr_Fiala',
    })
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      'https://cs.wikipedia.org/api/rest_v1/page/summary/Petr%20Fiala'
    )
  })

  it('falls back to the English description when Czech is absent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      entitiesResponse({ entities: { [QID]: { descriptions: { en: { value: 'Czech politician' } } } } })
    )

    const result = await findWikidataContext(QID)

    expect(result).toEqual({ description: 'Czech politician', wikipediaExtract: null, wikipediaUrl: null })
  })

  it('returns description-only (no second call) when the item has no Czech Wikipedia sitelink', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      entitiesResponse({ entities: { [QID]: { descriptions: { cs: { value: 'místo' } }, sitelinks: {} } } })
    )

    const result = await findWikidataContext(QID)

    expect(result).toEqual({ description: 'místo', wikipediaExtract: null, wikipediaUrl: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the description when the Wikipedia summary call fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        entitiesResponse({
          entities: {
            [QID]: { descriptions: { cs: { value: 'x' } }, sitelinks: { cswiki: { title: 'X' } } },
          },
        })
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }))

    const result = await findWikidataContext(QID)

    expect(result).toEqual({ description: 'x', wikipediaExtract: null, wikipediaUrl: null })
  })

  it('drops a disambiguation-page extract', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        entitiesResponse({
          entities: { [QID]: { sitelinks: { cswiki: { title: 'Fiala' } } } },
        })
      )
      .mockResolvedValueOnce(
        entitiesResponse({
          type: 'disambiguation',
          extract: 'Fiala může být:',
          content_urls: { desktop: { page: 'https://cs.wikipedia.org/wiki/Fiala' } },
        })
      )

    const result = await findWikidataContext(QID)

    expect(result).toEqual({ description: null, wikipediaExtract: null, wikipediaUrl: null })
  })

  it('throws when the first Wikidata call hard-fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))

    await expect(findWikidataContext(QID)).rejects.toThrow('HTTP 500')
  })

  it('returns all-null for an unknown Q-id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(entitiesResponse({ entities: {} }))

    expect(await findWikidataContext(QID)).toEqual({
      description: null,
      wikipediaExtract: null,
      wikipediaUrl: null,
    })
  })
})
