import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetQueueClient, mockSchedule, mockSend } = vi.hoisted(() => ({
  mockGetQueueClient: vi.fn(),
  mockSchedule: vi.fn(),
  mockSend: vi.fn(),
}))

vi.mock('./queueClient.js', () => ({
  getQueueClient: mockGetQueueClient,
}))

import { JobName } from './jobDefinitions.js'
import {
  ensureScheduledJobs,
  ENTITY_WIKIDATA_SCAN_CRON,
  ENTITY_WIKIDATA_SCAN_SCHEDULE_KEY,
  HOMEPAGE_ENTITY_STATS_CRON,
  HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY,
} from './schedule.js'

beforeEach(() => {
  vi.resetAllMocks()
  mockGetQueueClient.mockResolvedValue({ schedule: mockSchedule, send: mockSend })
  mockSchedule.mockResolvedValue(undefined)
  mockSend.mockResolvedValue('job-1')
})

describe('ensureScheduledJobs', () => {
  it('registers the homepage entity stats cron and enqueues an immediate singleton refresh', async () => {
    await ensureScheduledJobs()

    expect(mockSchedule).toHaveBeenCalledWith(
      JobName.HomepageEntityStatsRefresh,
      HOMEPAGE_ENTITY_STATS_CRON,
      {},
      {
        key: HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY,
        singletonKey: HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY,
        singletonSeconds: 60 * 60,
        tz: 'Europe/Prague',
      }
    )
    expect(mockSend).toHaveBeenCalledWith(
      JobName.HomepageEntityStatsRefresh,
      {},
      {
        singletonKey: HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY,
        singletonSeconds: 60 * 60,
      }
    )
  })

  it('registers the entity → Wikidata scan cron (no immediate send — it makes external calls)', async () => {
    await ensureScheduledJobs()

    expect(mockSchedule).toHaveBeenCalledWith(
      JobName.EntityWikidataScan,
      ENTITY_WIKIDATA_SCAN_CRON,
      {},
      {
        key: ENTITY_WIKIDATA_SCAN_SCHEDULE_KEY,
        singletonKey: ENTITY_WIKIDATA_SCAN_SCHEDULE_KEY,
        singletonSeconds: 60 * 60,
        tz: 'Europe/Prague',
      }
    )
    expect(mockSend).not.toHaveBeenCalledWith(
      JobName.EntityWikidataScan,
      expect.anything(),
      expect.anything()
    )
  })
})
