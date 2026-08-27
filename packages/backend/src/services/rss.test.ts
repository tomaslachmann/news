import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as sourceRepo from '../repositories/source.js'
import type { SourceFeedWithSource } from '../repositories/source.js'

const { mockParseURL } = vi.hoisted(() => ({ mockParseURL: vi.fn() }))

vi.mock('rss-parser', () => ({
  default: class {
    parseURL = mockParseURL
  },
}))
vi.mock('../repositories/source.js')

import { queryRssFeeds } from './rss.js'

const SOURCE = { id: 'src-1', name: 'iDnes', domains: ['idnes.cz'], createdAt: new Date() }

function feedWith(overrides: Partial<Pick<SourceFeedWithSource, 'url' | 'parserKind' | 'category'>> = {}) {
  return {
    id: 'feed-1',
    sourceId: 'src-1',
    source: SOURCE,
    url: 'https://idnes.cz/rss',
    parserKind: 'rss2',
    category: null,
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
        feedCategory: null,
      },
    ])
    expect(mockParseURL).toHaveBeenCalledWith('https://idnes.cz/rss')
  })

  it("captures an item's raw <category> value(s) as rawCategories, in feed order", async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Headline',
          link: 'https://idnes.cz/a1',
          pubDate: '2026-01-01',
          categories: ['Domácí', 'Krimi'],
        },
      ],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toEqual(['Domácí', 'Krimi'])
  })

  it('normalizes a <category domain="..."> tag (rss-parser hands back {_, $}, not a plain string) into just its text (ticket 85 -- a real crash for Aktuálně/ČT24/CNN Prima before this fix)', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Headline',
          link: 'https://idnes.cz/a1',
          pubDate: '2026-01-01',
          categories: [{ _: 'Sport', $: { domain: 'https://sport.example.cz/' } }, 'Fotbal'],
        },
      ],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toEqual(['Sport', 'Fotbal'])
  })

  it("falls back to szn:sections values as rawCategories when <category> is absent (ticket 85 -- Novinky/Seznam Zprávy's real signal)", async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Headline',
          link: 'https://idnes.cz/a1',
          pubDate: '2026-01-01',
          sznSections: { value: ['Evropa', 'Zahraniční', 'Stalo se'] },
        },
      ],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toEqual(['Evropa', 'Zahraniční', 'Stalo se'])
  })

  it('normalizes a single szn:sections value (xml2js collapses a lone repeated element out of array form) into a one-element array', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Headline',
          link: 'https://idnes.cz/a1',
          pubDate: '2026-01-01',
          sznSections: { value: 'Kultura' },
        },
      ],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toEqual(['Kultura'])
  })

  it('prefers <category> over szn:sections when an item somehow has both', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Headline',
          link: 'https://idnes.cz/a1',
          pubDate: '2026-01-01',
          categories: ['Domácí'],
          sznSections: { value: ['Svět'] },
        },
      ],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toEqual(['Domácí'])
  })

  it('leaves rawCategories undefined for an item with no <category> tag at all', async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith()])
    mockParseURL.mockResolvedValue({
      items: [{ title: 'Headline', link: 'https://idnes.cz/a1', pubDate: '2026-01-01' }],
    })

    const result = await queryRssFeeds()

    expect(result[0].rawCategories).toBeUndefined()
  })

  it("carries a category-scoped feed's own category as feedCategory on every item it returns (ticket 79)", async () => {
    vi.mocked(sourceRepo.findAllSourceFeeds).mockResolvedValue([feedWith({ category: 'ECONOMY' })])
    mockParseURL.mockResolvedValue({
      items: [{ title: 'Headline', link: 'https://idnes.cz/a1', pubDate: '2026-01-01' }],
    })

    const result = await queryRssFeeds()

    expect(result[0].feedCategory).toBe('ECONOMY')
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
