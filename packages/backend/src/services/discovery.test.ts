import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as gdeltModule from './gdelt.js'
import * as rssModule from './rss.js'
import { discoverCoverage } from './discovery.js'

vi.mock('./gdelt.js')
vi.mock('./rss.js')

const GDELT_ARTICLE = (n: number) => ({
  sourceId: `src-outlet${n}`,
  outlet: `Outlet${n}`,
  title: `T${n}`,
  url: `https://outlet${n}.cz/x`,
  publishedAt: '2025-01-01T00:00:00Z',
})

describe('discoverCoverage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns only GDELT candidates and their count when GDELT clears the confidence threshold', async () => {
    vi.mocked(gdeltModule.queryGdelt).mockResolvedValue([1, 2, 3, 4, 5].map(GDELT_ARTICLE))

    const result = await discoverCoverage(['keyword'])

    expect(result.candidates).toHaveLength(5)
    expect(result.gdeltCount).toBe(5)
    expect(rssModule.queryRssFeeds).not.toHaveBeenCalled()
  })

  it('falls back to RSS and reports gdeltCount 0 when GDELT is unreachable', async () => {
    vi.mocked(gdeltModule.queryGdelt).mockRejectedValue(new Error('network down'))
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([
      {
        sourceId: 'src-idnes',
        outlet: 'iDnes',
        title: 'T',
        url: 'https://idnes.cz/x',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ])

    const result = await discoverCoverage(['keyword'])

    expect(result.gdeltCount).toBe(0)
    expect(result.candidates).toHaveLength(1)
  })

  it('reports a partial gdeltCount when GDELT returns some but not enough results', async () => {
    vi.mocked(gdeltModule.queryGdelt).mockResolvedValue([1, 2].map(GDELT_ARTICLE))
    vi.mocked(rssModule.queryRssFeeds).mockResolvedValue([
      {
        sourceId: 'src-novinky',
        outlet: 'Novinky',
        title: 'T',
        url: 'https://novinky.cz/x',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ])

    const result = await discoverCoverage(['keyword'])

    expect(result.gdeltCount).toBe(2)
    expect(result.candidates.length).toBeGreaterThan(2)
  })
})
