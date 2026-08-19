import type { Job, JobResult, WorkOptions } from 'pg-boss'
import { getQueueClient } from './queueClient.js'
import type { JobNameValue, JobPayload } from './jobDefinitions.js'

export type JobHandler<K extends JobNameValue> = (
  payload: JobPayload[K],
  job: Job<JobPayload[K]>
) => Promise<void>

// Settles each job in a fetched batch independently (pg-boss's perJobResults) rather than
// letting one throw fail the whole batch — pg-boss otherwise fails/retries every job in the
// batch on a single rejection, including ones whose handler already completed (and may have
// already done a costly, non-idempotent side effect like a billed LLM call).
export async function registerJobWorker<K extends JobNameValue>(
  name: K,
  handler: JobHandler<K>,
  options: WorkOptions = {}
): Promise<string> {
  const boss = await getQueueClient()
  return boss.work<JobPayload[K]>(name, { ...options, perJobResults: true }, async (jobs) => {
    return Promise.all(
      jobs.map(async (job): Promise<JobResult> => {
        try {
          await handler(job.data, job)
          return { id: job.id, status: 'completed' }
        } catch (err) {
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
