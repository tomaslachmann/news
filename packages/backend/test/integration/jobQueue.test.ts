import { describe, it, expect, afterAll } from 'vitest'
import { getQueueClient, stopQueueClient } from '../../src/jobs/queueClient.js'
import { enqueueJob } from '../../src/jobs/enqueue.js'
import { registerJobWorker } from '../../src/jobs/registerWorker.js'
import { JobName, JOB_RETRY_POLICY } from '../../src/jobs/jobDefinitions.js'

describe('pg-boss job queue infrastructure against a real Postgres instance', () => {
  afterAll(async () => {
    await stopQueueClient()
  })

  it('declares every known queue with its configured retry policy on startup', async () => {
    const boss = await getQueueClient()

    for (const name of Object.values(JobName)) {
      const queue = await boss.getQueue(name)
      const policy = JOB_RETRY_POLICY[name]

      expect(queue).not.toBeNull()
      expect(queue!.retryLimit).toBe(policy.retryLimit)
      expect(queue!.retryDelay).toBe(policy.retryDelay)
      expect(Boolean(queue!.retryBackoff)).toBe(Boolean(policy.retryBackoff))
    }
  })

  it('processes an enqueued job end-to-end through a registered worker', async () => {
    const received: unknown[] = []

    await registerJobWorker(JobName.ThreadRecompute, (payload) => {
      received.push(payload)
      return Promise.resolve()
    })

    const jobId = await enqueueJob(JobName.ThreadRecompute, { seedStoryId: 'story-integration-1' })
    expect(jobId).not.toBeNull()

    await waitUntil(() => received.length > 0)

    expect(received).toEqual([{ seedStoryId: 'story-integration-1' }])
  })
})

// Small local poll helper — pg-boss's own polling interval means the job won't be picked up
// synchronously, and this suite has no other dependency that already provides a waitFor.
async function waitUntil(condition: () => boolean, timeoutMs = 15_000, intervalMs = 200): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
