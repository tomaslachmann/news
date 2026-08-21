import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { findWikidataEntityImage, searchWikimediaImageByQuery } from './wikimediaImageClient.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const CLAIMS_WITH_IMAGE = {
  claims: { P18: [{ mainsnak: { datavalue: { value: 'Petr Fiala 2022.jpg' } } }] },
}

const COMMONS_IMAGEINFO = {
  query: {
    pages: {
      '123': {
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/full/Petr_Fiala_2022.jpg',
            thumburl: 'https://upload.wikimedia.org/thumb/Petr_Fiala_2022.jpg',
            width: 4000,
            height: 3000,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Petr_Fiala_2022.jpg',
            extmetadata: {
              Artist: { value: '<a href="//example.org">Jane Doe</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
            },
          },
        ],
      },
    },
  },
}

describe('findWikidataEntityImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends an honest User-Agent on both requests', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(CLAIMS_WITH_IMAGE))
      .mockResolvedValueOnce(jsonResponse(COMMONS_IMAGEINFO))

    await findWikidataEntityImage('Q123')

    for (const call of vi.mocked(fetch).mock.calls) {
      const headers = new Headers(call[1]?.headers)
      expect(headers.get('User-Agent')).toBe('NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)')
    }
  })

  it('resolves a P18 claim to a fully attributed image, stripping HTML from the author field', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(CLAIMS_WITH_IMAGE))
      .mockResolvedValueOnce(jsonResponse(COMMONS_IMAGEINFO))

    const image = await findWikidataEntityImage('Q123')

    expect(image).toEqual({
      externalId: 'Petr Fiala 2022.jpg',
      imageUrl: 'https://upload.wikimedia.org/full/Petr_Fiala_2022.jpg',
      thumbnailUrl: 'https://upload.wikimedia.org/thumb/Petr_Fiala_2022.jpg',
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Petr_Fiala_2022.jpg',
      width: 4000,
      height: 3000,
    })
  })

  it('decodes HTML entities in the author field after stripping tags', async () => {
    const commonsWithEncodedAuthor = {
      query: {
        pages: {
          '123': {
            imageinfo: [
              {
                ...COMMONS_IMAGEINFO.query.pages['123'].imageinfo[0],
                extmetadata: {
                  Artist: { value: '<a href="//example.org">Jan Kol&#225;&#345; &amp; Sons</a>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                },
              },
            ],
          },
        },
      },
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(CLAIMS_WITH_IMAGE))
      .mockResolvedValueOnce(jsonResponse(commonsWithEncodedAuthor))

    const image = await findWikidataEntityImage('Q123')

    expect(image?.author).toBe('Jan Kolář & Sons')
  })

  it('returns null and never calls Commons when the item has no P18 image claim', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ claims: {} }))

    const image = await findWikidataEntityImage('Q999')

    expect(image).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when Commons has no matching page for the claimed file', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(CLAIMS_WITH_IMAGE))
      .mockResolvedValueOnce(jsonResponse({ query: { pages: { '-1': {} } } }))

    await expect(findWikidataEntityImage('Q123')).resolves.toBeNull()
  })

  it('throws on a non-OK Wikidata claims response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 503))

    await expect(findWikidataEntityImage('Q123')).rejects.toThrow('HTTP 503')
  })

  it('throws on a non-OK Commons imageinfo response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(CLAIMS_WITH_IMAGE))
      .mockResolvedValueOnce(jsonResponse({}, 500))

    await expect(findWikidataEntityImage('Q123')).rejects.toThrow('HTTP 500')
  })
})

const SEARCH_RESULT = {
  query: {
    pages: {
      '456': {
        title: 'File:Prague Castle aerial.jpg',
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/full/Prague_Castle_aerial.jpg',
            thumburl: 'https://upload.wikimedia.org/thumb/Prague_Castle_aerial.jpg',
            width: 6000,
            height: 4000,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle_aerial.jpg',
            extmetadata: {
              Artist: { value: '<a href="//example.org">Jane Doe</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
            },
          },
        ],
      },
    },
  },
}

describe('searchWikimediaImageByQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves the top search hit to a fully attributed image', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(SEARCH_RESULT))

    const image = await searchWikimediaImageByQuery('Pražský hrad')

    expect(image).toEqual({
      externalId: 'Prague Castle aerial.jpg',
      imageUrl: 'https://upload.wikimedia.org/full/Prague_Castle_aerial.jpg',
      thumbnailUrl: 'https://upload.wikimedia.org/thumb/Prague_Castle_aerial.jpg',
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prague_Castle_aerial.jpg',
      width: 6000,
      height: 4000,
    })
  })

  it('restricts the search to bitmap files and the file namespace', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(SEARCH_RESULT))

    await searchWikimediaImageByQuery('Pražský hrad')

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(requestedUrl.searchParams.get('gsrsearch')).toBe('Pražský hrad filetype:bitmap')
    expect(requestedUrl.searchParams.get('gsrnamespace')).toBe('6')
  })

  it('strips CirrusSearch operator syntax out of the query so it cannot swallow the bitmap filter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(SEARCH_RESULT))

    await searchWikimediaImageByQuery('Rusko-ukrajinská válka: "mírová" jednání (2026)')

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(requestedUrl.searchParams.get('gsrsearch')).toBe(
      'Rusko ukrajinská válka mírová jednání 2026 filetype:bitmap'
    )
  })

  it('returns null when the search has no hits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ query: { pages: {} } }))

    await expect(searchWikimediaImageByQuery('nonexistent topic')).resolves.toBeNull()
  })

  it('throws on a non-OK search response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 503))

    await expect(searchWikimediaImageByQuery('Pražský hrad')).rejects.toThrow('HTTP 503')
  })
})
