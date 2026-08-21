import type { FastifyBaseLogger } from 'fastify'
import { refreshHomepageEntityStats } from '../services/homepageStatsService.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export async function runHomepageEntityStatsJob(
  _payload: JobPayload[typeof JobName.HomepageEntityStatsRefresh],
  log?: FastifyBaseLogger
): Promise<void> {
  const result = await refreshHomepageEntityStats()
  if (result.skipped) {
    log?.info('homepage.entity-stats.refresh job: another worker is already refreshing, skipping')
    return
  }

  log?.info(
    { snapshotId: result.snapshotId, itemCount: result.itemCount },
    'homepage.entity-stats.refresh job: snapshot refreshed'
  )
}
