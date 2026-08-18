import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as sourceResolverModule from './sourceResolver.js'

const { mockFetchGdelt } = vi.hoisted(() => ({ mockFetchGdelt: vi.fn() }))

vi.mock('./gdeltClient.js', () => ({ fetchGdelt: mockFetchGdelt }))
vi.mock('./sourceResolver.js')

import { queryGdelt } from './gdelt.js'

const IDNES = { id: 'src-idnes', name: 'iDnes', domains: ['idnes.cz'], createdAt: new Date() }
const NOVINKY = { id: 'src-novinky', name: 'Novinky', domains: ['novinky.cz'], createdAt: new Date() }

describe('queryGdelt', () => {
  beforeEach(() => {
    mockFetchGdelt.mockReset()
    vi.mocked(sourceResolverModule.resolveSourcesByDomains).mockReset()
  })

  it('maps GDELT articles to CandidateArticle, resolving via resolveSourcesByDomains', async () => {
    mockFetchGdelt.mockResolvedValue({
      articles: [
        {
          url: 'https://idnes.cz/some-article',
          title: 'Some headline',
          seendate: '20250812T120000Z',
          domain: 'idnes.cz',
          language: 'Czech',
          sourcecountry: 'Czech Republic',
        },
      ],
    })
    vi.mocked(sourceResolverModule.resolveSourcesByDomains).mockResolvedValue(new Map([['idnes.cz', IDNES]]))

    const result = await queryGdelt(['keyword'])

    expect(sourceResolverModule.resolveSourcesByDomains).toHaveBeenCalledWith(['idnes.cz'])
    expect(result).toEqual([
      {
        sourceId: 'src-idnes',
        outlet: 'iDnes',
        title: 'Some headline',
        url: 'https://idnes.cz/some-article',
        publishedAt: '2025-08-12T12:00:00Z',
      },
    ])
  })

  it('resolves every article domain in a single batch call, not one call per article', async () => {
    mockFetchGdelt.mockResolvedValue({
      articles: [
        {
          url: 'https://idnes.cz/a',
          title: 'A',
          seendate: '20250812T120000Z',
          domain: 'idnes.cz',
          language: 'Czech',
          sourcecountry: 'Czech Republic',
        },
        {
          url: 'https://novinky.cz/b',
          title: 'B',
          seendate: '20250812T120000Z',
          domain: 'novinky.cz',
          language: 'Czech',
          sourcecountry: 'Czech Republic',
        },
      ],
    })
    vi.mocked(sourceResolverModule.resolveSourcesByDomains).mockResolvedValue(
      new Map([
        ['idnes.cz', IDNES],
        ['novinky.cz', NOVINKY],
      ])
    )

    const result = await queryGdelt(['keyword'])

    expect(sourceResolverModule.resolveSourcesByDomains).toHaveBeenCalledTimes(1)
    expect(sourceResolverModule.resolveSourcesByDomains).toHaveBeenCalledWith(['idnes.cz', 'novinky.cz'])
    expect(result.map((r) => r.sourceId)).toEqual(['src-idnes', 'src-novinky'])
  })

  it('surfaces an unverified Source (name = raw domain) when resolveSourcesByDomains finds no known outlet', async () => {
    mockFetchGdelt.mockResolvedValue({
      articles: [
        {
          url: 'https://example.cz/x',
          title: 'X',
          seendate: '20250812T120000Z',
          domain: 'example.cz',
          language: 'Czech',
          sourcecountry: 'Czech Republic',
        },
      ],
    })
    vi.mocked(sourceResolverModule.resolveSourcesByDomains).mockResolvedValue(
      new Map([
        [
          'example.cz',
          { id: 'src-example.cz', name: 'example.cz', domains: ['example.cz'], createdAt: new Date() },
        ],
      ])
    )

    const [result] = await queryGdelt(['keyword'])

    expect(result?.sourceId).toBe('src-example.cz')
    expect(result?.outlet).toBe('example.cz')
  })

  it('returns an empty array when the response has no articles field', async () => {
    mockFetchGdelt.mockResolvedValue({})
    vi.mocked(sourceResolverModule.resolveSourcesByDomains).mockResolvedValue(new Map())

    const result = await queryGdelt(['keyword'])

    expect(result).toEqual([])
    expect(sourceResolverModule.resolveSourcesByDomains).toHaveBeenCalledWith([])
  })
})
