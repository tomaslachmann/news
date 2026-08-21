import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { findWikidataEntityImage } from './wikimediaImageClient.js'

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
