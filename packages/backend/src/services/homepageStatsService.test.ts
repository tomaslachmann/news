import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as homepageStatsRepo from '../repositories/homepageStats.js'
import {
  getHomepageEntityStats,
  getHomepageEntityStatsWindow,
  HOMEPAGE_ENTITY_STATS_LIMIT,
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

  it('computes the bounded aggregate and stores a ranked snapshot', async () => {
    vi.mocked(homepageStatsRepo.withHomepageStatsAdvisoryLock).mockImplementation(async (fn) => fn())
    vi.mocked(homepageStatsRepo.computeHomepageEntityStats).mockResolvedValue([
      { entityId: 'e-1', recentEventCount: 3, recentSourceCount: 5, previousEventCount: 2 },
    ])
    vi.mocked(homepageStatsRepo.replaceHomepageEntityStatSnapshot).mockResolvedValue('snap-1')

    const result = await refreshHomepageEntityStats(new Date('2026-08-21T12:00:00Z'))

    expect(homepageStatsRepo.computeHomepageEntityStats).toHaveBeenCalledWith({
      currentStart: new Date('2026-08-20T12:00:00Z'),
      currentEnd: new Date('2026-08-21T12:00:00Z'),
      previousStart: new Date('2026-08-19T12:00:00Z'),
      previousEnd: new Date('2026-08-20T12:00:00Z'),
      limit: HOMEPAGE_ENTITY_STATS_LIMIT,
    })
    expect(homepageStatsRepo.replaceHomepageEntityStatSnapshot).toHaveBeenCalledWith({
      windowStart: new Date('2026-08-20T12:00:00Z'),
      windowEnd: new Date('2026-08-21T12:00:00Z'),
      items: [{ entityId: 'e-1', recentEventCount: 3, recentSourceCount: 5, previousEventCount: 2 }],
    })
    expect(result).toEqual({ snapshotId: 'snap-1', itemCount: 1, skipped: false })
  })

  it('reports skipped when another worker holds the refresh lock', async () => {
    vi.mocked(homepageStatsRepo.withHomepageStatsAdvisoryLock).mockResolvedValue(null)

    await expect(refreshHomepageEntityStats()).resolves.toEqual({
      snapshotId: null,
      itemCount: 0,
      skipped: true,
    })
    expect(homepageStatsRepo.computeHomepageEntityStats).not.toHaveBeenCalled()
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

    await expect(getHomepageEntityStats()).resolves.toEqual([
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
  })
})
