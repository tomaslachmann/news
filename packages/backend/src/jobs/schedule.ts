import { getQueueClient } from './queueClient.js'
import { JobName } from './jobDefinitions.js'

export const HOMEPAGE_ENTITY_STATS_CRON = '0 */3 * * *'
export const HOMEPAGE_ENTITY_STATS_SCHEDULE_KEY = 'homepage-entity-stats'

// Ticket 93 / ADR 0042 — once a day, well outside peak ingestion hours: the scan makes serial
// Wikidata + reconciliation calls and is deliberately unhurried (research §5).
export const ENTITY_WIKIDATA_SCAN_CRON = '30 4 * * *'
export const ENTITY_WIKIDATA_SCAN_SCHEDULE_KEY = 'entity-wikidata-scan'

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

  await boss.schedule(
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
}
