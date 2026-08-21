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
})
