import type { Job, WorkOptions } from 'pg-boss'
import { getQueueClient } from './queueClient.js'
import type { JobNameValue, JobPayload } from './jobDefinitions.js'

export type JobHandler<K extends JobNameValue> = (
  payload: JobPayload[K],
  job: Job<JobPayload[K]>
) => Promise<void>

export async function registerJobWorker<K extends JobNameValue>(
  name: K,
  handler: JobHandler<K>,
  options: WorkOptions = {}
): Promise<string> {
  const boss = await getQueueClient()
  return boss.work<JobPayload[K]>(name, options, async (jobs) => {
    for (const job of jobs) {
      await handler(job.data, job)
    }
  })
}
