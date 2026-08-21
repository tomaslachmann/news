import { getQueueClient } from './queueClient.js'
import { JobName } from './jobDefinitions.js'

export const HOMEPAGE_ENTITY_STATS_CRON = '0 */3 * * *'
export const HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY = 'homepage-entity-stats'

export async function ensureScheduledJobs(): Promise<void> {
  const boss = await getQueueClient()
  await boss.schedule(
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
  await boss.send(
    JobName.HomepageEntityStatsRefresh,
    {},
    {
      singletonKey: HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY,
      singletonSeconds: 60 * 60,
    }
  )
}
