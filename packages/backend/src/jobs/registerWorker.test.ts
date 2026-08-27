import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JobResult, WorkOptions } from 'pg-boss'

const { mockWork, mockGetQueueClient, mockLog } = vi.hoisted(() => ({
  mockWork:
    vi.fn<
      (
        name: string,
        options: WorkOptions,
        batchHandler: (jobs: unknown[]) => Promise<JobResult[]>
      ) => Promise<string>
    >(),
  mockGetQueueClient: vi.fn(),
  mockLog: {
    info: vi.fn<(obj: unknown, msg?: string) => void>(),
    error: vi.fn<(obj: unknown, msg?: string) => void>(),
  },
}))

vi.mock('./queueClient.js', () => ({
  getQueueClient: mockGetQueueClient,
}))
vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => mockLog),
}))

import { registerJobWorker } from './registerWorker.js'
import { JobName } from './jobDefinitions.js'

mockGetQueueClient.mockResolvedValue({ work: mockWork })

describe('registerJobWorker', () => {
  beforeEach(() => {
    mockLog.info.mockReset()
    mockLog.error.mockReset()
  })

  it('registers with perJobResults so pg-boss settles each job independently', async () => {
    mockWork.mockResolvedValue('worker-1')

    await registerJobWorker(JobName.ThreadRecompute, vi.fn(), { batchSize: 5 })

    expect(mockWork).toHaveBeenCalledWith(
      JobName.ThreadRecompute,
      { batchSize: 5, perJobResults: true },
      expect.any(Function)
    )
  })

  it('fans a batch out to the per-job handler and reports each job completed', async () => {
    mockWork.mockImplementation(async (_name, _options, batchHandler) => {
      const results = await batchHandler([
        { id: 'j1', data: { analysisId: 'a1' } },
        { id: 'j2', data: { analysisId: 'a2' } },
      ])
      expect(results).toEqual([
        { id: 'j1', status: 'completed' },
        { id: 'j2', status: 'completed' },
      ])
      return 'worker-2'
    })
    const handler = vi.fn().mockResolvedValue(undefined)

    const workerId = await registerJobWorker(JobName.Narrative, handler)

    expect(workerId).toBe('worker-2')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(1, { analysisId: 'a1' }, { id: 'j1', data: { analysisId: 'a1' } })
    expect(handler).toHaveBeenNthCalledWith(2, { analysisId: 'a2' }, { id: 'j2', data: { analysisId: 'a2' } })
  })

  it('isolates one job failing in a batch so its already-succeeded sibling is not retried too', async () => {
    mockWork.mockImplementation(async (_name, _options, batchHandler) => {
      const results = await batchHandler([
        { id: 'ok', data: { analysisId: 'a1' } },
        { id: 'bad', data: { analysisId: 'a2' } },
      ])
      expect(results).toEqual([
        { id: 'ok', status: 'completed' },
        { id: 'bad', status: 'failed', output: { message: 'boom' } },
      ])
      return 'worker-3'
    })
    const handler = vi.fn().mockImplementation((payload: { analysisId: string }) => {
      if (payload.analysisId === 'a2') return Promise.reject(new Error('boom'))
      return Promise.resolve()
    })

    await registerJobWorker(JobName.Narrative, handler)
  })

  it("logs each job's start and successful finish via a logger namespaced to the job name (ticket 86)", async () => {
    mockWork.mockImplementation(async (_name, _options, batchHandler) => {
      await batchHandler([{ id: 'j1', data: { analysisId: 'a1' } }])
      return 'worker-4'
    })

    await registerJobWorker(JobName.Narrative, vi.fn().mockResolvedValue(undefined))

    expect(mockLog.info).toHaveBeenCalledWith({ jobId: 'j1' }, `${JobName.Narrative} started`)
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j1', durationMs: expect.any(Number) as number }),
      `${JobName.Narrative} finished`
    )
    expect(mockLog.error).not.toHaveBeenCalled()
  })

  it('logs a failed job via error, not info, including the thrown error', async () => {
    mockWork.mockImplementation(async (_name, _options, batchHandler) => {
      await batchHandler([{ id: 'bad', data: { analysisId: 'a1' } }])
      return 'worker-5'
    })
    const err = new Error('boom')

    await registerJobWorker(JobName.Narrative, vi.fn().mockRejectedValue(err))

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'bad', durationMs: expect.any(Number) as number, err }),
      `${JobName.Narrative} failed`
    )
  })
})
