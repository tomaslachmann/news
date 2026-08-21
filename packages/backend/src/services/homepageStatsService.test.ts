import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as homepageStatsRepo from '../repositories/homepageStats.js'
import {
  getHomepageContradictions,
  getHomepageEntityStats,
  getHomepageEntityStatsWindow,
  getHomepageMinuteFeed,
  getHomepageSummaryStats,
  HOMEPAGE_CONTRADICTION_LIMIT,
  HOMEPAGE_ENTITY_STATS_LIMIT,
  HOMEPAGE_MINUTE_LIMIT,
  refreshHomepageEntityStats,
} from './homepageStatsService.js'

vi.mock('../repositories/homepageStats.js')

describe('getHomepageEntityStatsWindow', () => {
  it('uses adjacent 24h windows ending at now', () => {
    const window = getHomepageEntityStatsWindow(new Date('2026-08-21T12:00:00Z'))

    expect(window).toEqual({
      currentStart: new Date('2026-08-20T12:00:00Z'),
      currentEnd: new Date('2026-08-21T12:00:00Z'),
      previousStart: new Date('2026-08-19T12:00:00Z'),
      previousEnd: new Date('2026-08-20T12:00:00Z'),
    })
  })
})

describe('refreshHomepageEntityStats', () => {
  beforeEach(() => vi.resetAllMocks())

  it('refreshes a locked snapshot over the bounded aggregate window', async () => {
    vi.mocked(homepageStatsRepo.refreshHomepageEntityStatsSnapshot).mockResolvedValue({
      snapshotId: 'snap-1',
      itemCount: 1,
    })

    const result = await refreshHomepageEntityStats(new Date('2026-08-21T12:00:00Z'))

    expect(homepageStatsRepo.refreshHomepageEntityStatsSnapshot).toHaveBeenCalledWith({
      currentStart: new Date('2026-08-20T12:00:00Z'),
      currentEnd: new Date('2026-08-21T12:00:00Z'),
      previousStart: new Date('2026-08-19T12:00:00Z'),
      previousEnd: new Date('2026-08-20T12:00:00Z'),
      limit: HOMEPAGE_ENTITY_STATS_LIMIT,
    })
    expect(result).toEqual({ snapshotId: 'snap-1', itemCount: 1, skipped: false })
  })

  it('reports skipped when another worker holds the refresh lock', async () => {
    vi.mocked(homepageStatsRepo.refreshHomepageEntityStatsSnapshot).mockResolvedValue(null)

    await expect(refreshHomepageEntityStats()).resolves.toEqual({
      snapshotId: null,
      itemCount: 0,
      skipped: true,
    })
  })
})

describe('getHomepageEntityStats', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps latest stored rows and computes trend from the previous window', async () => {
    vi.mocked(homepageStatsRepo.findLatestHomepageEntityStats).mockResolvedValue([
      {
        key: 'person:petr-fiala',
        canonicalName: 'Petr Fiala',
        type: 'PERSON',
        recentEventCount: 6,
        recentSourceCount: 11,
        previousEventCount: 4,
      },
      {
        key: 'country:ukrajina',
        canonicalName: 'Ukrajina',
        type: 'COUNTRY',
        recentEventCount: 3,
        recentSourceCount: 7,
        previousEventCount: 0,
      },
    ])

    await expect(getHomepageEntityStats(new Date('2026-08-21T12:00:00Z'))).resolves.toEqual([
      {
        key: 'person:petr-fiala',
        canonicalName: 'Petr Fiala',
        type: 'PERSON',
        recentEventCount: 6,
        recentSourceCount: 11,
        trendPercent: 50,
      },
      {
        key: 'country:ukrajina',
        canonicalName: 'Ukrajina',
        type: 'COUNTRY',
        recentEventCount: 3,
        recentSourceCount: 7,
      },
    ])
    expect(homepageStatsRepo.findLatestHomepageEntityStats).toHaveBeenCalledWith({
      minimumWindowEnd: new Date('2026-08-21T06:00:00Z'),
    })
  })
})

describe('getHomepageSummaryStats', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps the 24h homepage summary aggregate', async () => {
    vi.mocked(homepageStatsRepo.findHomepageSummaryStats).mockResolvedValue({
      processedArticleCount: 12,
      activeSourceCount: 8,
      contradictionCount: 5,
      averageSourceOverlapPercentage: 73,
    })

    await expect(getHomepageSummaryStats(new Date('2026-08-21T12:00:00Z'))).resolves.toEqual({
      processedArticleCount: 12,
      activeSourceCount: 8,
      contradictionCount: 5,
      averageSourceOverlapPercentage: 73,
    })
    expect(homepageStatsRepo.findHomepageSummaryStats).toHaveBeenCalledWith({
      windowStart: new Date('2026-08-20T12:00:00Z'),
      windowEnd: new Date('2026-08-21T12:00:00Z'),
    })
  })
})

describe('getHomepageMinuteFeed', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns latest complete Articles in feed shape', async () => {
    vi.mocked(homepageStatsRepo.findHomepageMinuteRows).mockResolvedValue([
      {
        id: 'a-1',
        seedHeadline: 'Seed title',
        headline: 'Generated title',
        createdAt: new Date('2026-08-21T11:45:00Z'),
        sourceCount: 4,
        dimensions: {
          agreement: [],
          contradiction: [{ id: 'c-1', prose: 'Rozpor', attributions: [] }],
          uniqueReporting: [],
          framing: [],
          agreementCategory: 'DISPUTED',
        },
      },
    ])

    await expect(getHomepageMinuteFeed()).resolves.toEqual([
      {
        analysisId: 'a-1',
        title: 'Generated title',
        createdAt: '2026-08-21T11:45:00.000Z',
        sourceCount: 4,
        hasConflict: true,
      },
    ])
    expect(homepageStatsRepo.findHomepageMinuteRows).toHaveBeenCalledWith(HOMEPAGE_MINUTE_LIMIT)
  })
})

describe('getHomepageContradictions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('ranks contradiction items by attributed source count, then recency', async () => {
    vi.mocked(homepageStatsRepo.findHomepageContradictionAnalysisRows).mockResolvedValue([
      {
        id: 'older',
        seedHeadline: 'Older seed',
        headline: null,
        createdAt: new Date('2026-08-21T09:00:00Z'),
        sourceOverlapPercentage: 62,
        dimensions: {
          agreement: [],
          contradiction: [
            {
              id: 'old-1',
              prose: '  Více zdrojů uvádí jiné číslo.  ',
              attributions: [
                { outlet: 'ČTK', czechQuote: 'x', articleUrl: 'https://a.test' },
                { outlet: 'iRozhlas', czechQuote: 'y', articleUrl: 'https://b.test' },
              ],
            },
          ],
          uniqueReporting: [],
          framing: [],
          agreementCategory: 'DISPUTED',
        },
      },
      {
        id: 'newer',
        seedHeadline: 'Newer seed',
        headline: 'Newer generated',
        createdAt: new Date('2026-08-21T10:00:00Z'),
        sourceOverlapPercentage: null,
        dimensions: {
          agreement: [],
          contradiction: [
            {
              id: 'new-1',
              prose: 'Jeden zdroj tvrdí opak.',
              attributions: [{ outlet: 'ČTK', czechQuote: 'x', articleUrl: 'https://c.test' }],
            },
          ],
          uniqueReporting: [],
          framing: [],
          agreementCategory: 'PARTIAL',
        },
      },
    ])

    await expect(getHomepageContradictions(new Date('2026-08-21T12:00:00Z'))).resolves.toEqual([
      {
        analysisId: 'older',
        title: 'Older seed',
        createdAt: '2026-08-21T09:00:00.000Z',
        prose: 'Více zdrojů uvádí jiné číslo.',
        sourceCount: 2,
        sourceOverlapPercentage: 62,
      },
      {
        analysisId: 'newer',
        title: 'Newer generated',
        createdAt: '2026-08-21T10:00:00.000Z',
        prose: 'Jeden zdroj tvrdí opak.',
        sourceCount: 1,
      },
    ])
    expect(homepageStatsRepo.findHomepageContradictionAnalysisRows).toHaveBeenCalledWith({
      windowStart: new Date('2026-08-20T12:00:00Z'),
      windowEnd: new Date('2026-08-21T12:00:00Z'),
    })
  })

  it('limits contradiction rail rows', async () => {
    vi.mocked(homepageStatsRepo.findHomepageContradictionAnalysisRows).mockResolvedValue([
      {
        id: 'a-1',
        seedHeadline: 'Seed',
        headline: null,
        createdAt: new Date('2026-08-21T10:00:00Z'),
        sourceOverlapPercentage: null,
        dimensions: {
          agreement: [],
          contradiction: Array.from({ length: HOMEPAGE_CONTRADICTION_LIMIT + 1 }, (_, index) => ({
            id: `c-${index}`,
            prose: `Rozpor ${index}`,
            attributions: [{ outlet: `Zdroj ${index}`, czechQuote: 'x', articleUrl: 'https://example.test' }],
          })),
          uniqueReporting: [],
          framing: [],
          agreementCategory: 'DISPUTED',
        },
      },
    ])

    await expect(getHomepageContradictions()).resolves.toHaveLength(HOMEPAGE_CONTRADICTION_LIMIT)
  })
})
