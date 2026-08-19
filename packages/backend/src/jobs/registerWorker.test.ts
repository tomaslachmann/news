import { describe, it, expect, vi } from 'vitest'

const { mockWork, mockGetQueueClient } = vi.hoisted(() => ({
  mockWork: vi.fn(),
  mockGetQueueClient: vi.fn(),
}))

vi.mock('./queueClient.js', () => ({
  getQueueClient: mockGetQueueClient,
}))

import { registerJobWorker } from './registerWorker.js'
import { JobName } from './jobDefinitions.js'

mockGetQueueClient.mockResolvedValue({ work: mockWork })

describe('registerJobWorker', () => {
  it('registers a pg-boss batch handler that fans out to the per-job handler', async () => {
    mockWork.mockImplementation(
      async (_name: string, _options: object, batchHandler: (jobs: unknown[]) => Promise<void>) => {
        await batchHandler([
          { id: 'j1', data: { analysisId: 'a1' } },
          { id: 'j2', data: { analysisId: 'a2' } },
        ])
        return 'worker-1'
      }
    )
    const handler = vi.fn().mockResolvedValue(undefined)

    const workerId = await registerJobWorker(JobName.Narrative, handler)

    expect(workerId).toBe('worker-1')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(1, { analysisId: 'a1' }, { id: 'j1', data: { analysisId: 'a1' } })
    expect(handler).toHaveBeenNthCalledWith(2, { analysisId: 'a2' }, { id: 'j2', data: { analysisId: 'a2' } })
  })

  it('passes through work options', async () => {
    mockWork.mockResolvedValue('worker-2')

    await registerJobWorker(JobName.ThreadRecompute, vi.fn(), { batchSize: 5 })

    expect(mockWork).toHaveBeenCalledWith(JobName.ThreadRecompute, { batchSize: 5 }, expect.any(Function))
  })
})
