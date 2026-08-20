import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as sourceRepo from '../repositories/source.js'

const { mockParseURL } = vi.hoisted(() => ({ mockParseURL: vi.fn() }))

vi.mock('rss-parser', () => ({
  default: class {
    parseURL = mockParseURL
  },
}))
vi.mock('../repositories/source.js')

import { queryRssFeeds } from './rss.js'

const SOURCE = { id: 'src-1', name: 'iDnes', domains: ['idnes.cz'], createdAt: new Date() }

function feedWith(overrides: Partial<{ url: string; parserKind: string }> = {}) {
  return {
    id: 'feed-1',
    sourceId: 'src-1',
    source: SOURCE,
    url: 'https://idnes.cz/rss',
    parserKind: 'rss2',
    createdAt: new Date(),
    ...overrides,
  }
}

describe('queryRssFeeds', () => {
  beforeEach(() => {
    mockParseURL.mockReset()
  })

  it('dispatches an "rss2" feed through rss-parser and maps items to CandidateArticle', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        { title: 'Headline', link: 'https://idnes.cz/a1', pubDate: '2026-01-01', contentSnippet: 'excerpt' },
      ],
    })

    const result = await queryRssFeeds()

    expect(result).toEqual([
      {
        sourceId: 'src-1',
        outlet: 'iDnes',
        title: 'Headline',
        url: 'https://idnes.cz/a1',
        publishedAt: new Date('2026-01-01').toISOString(),
        excerpt: 'excerpt',
      },
    ])
    expect(mockParseURL).toHaveBeenCalledWith('https://idnes.cz/rss')
  })

  it('logs a warning and skips a feed with an unrecognized parserKind, without throwing', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith({ parserKind: 'atom' })])
    const warn = vi.fn()

    const result = await queryRssFeeds({ warn } as never)

    expect(result).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('atom'))
    expect(mockParseURL).not.toHaveBeenCalled()
  })

  it('treats an inherited Object.prototype property name as an unrecognized parserKind, not a real handler', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith({ parserKind: 'constructor' })])
    const warn = vi.fn()

    const result = await queryRssFeeds({ warn } as never)

    expect(result).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('constructor'))
    expect(mockParseURL).not.toHaveBeenCalled()
  })

  it('still swallows a parse failure from a recognized parserKind and returns no items for that feed', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockRejectedValue(new Error('network down'))

    const result = await queryRssFeeds()

    expect(result).toEqual([])
  })
})
