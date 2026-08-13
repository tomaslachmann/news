import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetchGdelt } = vi.hoisted(() => ({ mockFetchGdelt: vi.fn() }))

vi.mock('./gdeltClient.js', () => ({ fetchGdelt: mockFetchGdelt }))

import { queryGdelt } from './gdelt.js'

describe('queryGdelt', () => {
  beforeEach(() => {
    mockFetchGdelt.mockReset()
  })

  it('maps GDELT articles to CandidateArticle, resolving known domains to outlet names', async () => {
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

    const result = await queryGdelt(['keyword'])

    expect(result).toEqual([
      {
        outlet: 'iDnes',
        title: 'Some headline',
        url: 'https://idnes.cz/some-article',
        publishedAt: '2025-08-12T12:00:00Z',
      },
    ])
  })

  it('falls back to the raw domain when it is not a known outlet', async () => {
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

    const [result] = await queryGdelt(['keyword'])

    expect(result?.outlet).toBe('example.cz')
  })

  it('returns an empty array when the response has no articles field', async () => {
    mockFetchGdelt.mockResolvedValue({})

    const result = await queryGdelt(['keyword'])

    expect(result).toEqual([])
  })
})
