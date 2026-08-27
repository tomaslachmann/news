import type { Job, JobResult, WorkOptions } from 'pg-boss'
import { getQueueClient } from './queueClient.js'
import type { JobNameValue, JobPayload } from './jobDefinitions.js'
import { createLogger } from '../logger.js'

export type JobHandler<K extends JobNameValue> = (
  payload: JobPayload[K],
  job: Job<JobPayload[K]>
) => Promise<void>

// Settles each job in a fetched batch independently (pg-boss's perJobResults) rather than
// letting one throw fail the whole batch — pg-boss otherwise fails/retries every job in the
// batch on a single rejection, including ones whose handler already completed (and may have
// already done a costly, non-idempotent side effect like a billed LLM call).
//
// This is also the single choke point every job type passes through, so it's where
// started/finished/failed tracing lives (ticket 86) — one namespaced logger per job name (already
// dot-namespaced, e.g. "entity.extract") covers all 8 job types without instrumenting each job
// file individually.
export async function registerJobWorker<K extends JobNameValue>(
  name: K,
  handler: JobHandler<K>,
  options: WorkOptions = {}
): Promise<string> {
  const log = createLogger(name)
  const boss = await getQueueClient()
  return boss.work<JobPayload[K]>(name, { ...options, perJobResults: true }, async (jobs) => {
    return Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        const startedAt = Date.now()
        log.info({ jobId: job.id }, `${name} started`)
        try {
          await handler(job.data, job)
          log.info({ jobId: job.id, durationMs: Date.now() - startedAt }, `${name} finished`)
          return { id: job.id, status: 'completed' }
        } catch (err) {
          log.error({ jobId: job.id, durationMs: Date.now() - startedAt, err }, `${name} failed`)
          return {
            id: job.id,
            status: 'failed',
            output: { message: err instanceof Error ? err.message : String(err) },
          }
        }
      })
    )
  })
}
