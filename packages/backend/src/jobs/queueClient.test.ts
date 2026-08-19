import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStart, mockStop, mockCreateQueue, MockPgBoss } = vi.hoisted(() => {
  const mockStart = vi.fn()
  const mockStop = vi.fn()
  const mockCreateQueue = vi.fn()
  const MockPgBoss = vi.fn().mockImplementation(function (this: object) {
    Object.assign(this, { start: mockStart, stop: mockStop, createQueue: mockCreateQueue })
  })
  return { mockStart, mockStop, mockCreateQueue, MockPgBoss }
})

vi.mock('pg-boss', () => ({ PgBoss: MockPgBoss }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env.DATABASE_URL = 'postgres://test'
  mockStart.mockResolvedValue(undefined)
  mockStop.mockResolvedValue(undefined)
  mockCreateQueue.mockResolvedValue(undefined)
})

describe('getQueueClient', () => {
  it('clears the wedged startup promise on failure so a later call can retry', async () => {
    const { getQueueClient } = await import('./queueClient.js')

    mockStart.mockRejectedValueOnce(new Error('db unreachable'))
    await expect(getQueueClient()).rejects.toThrow('db unreachable')

    mockStart.mockResolvedValueOnce(undefined)
    await expect(getQueueClient()).resolves.toBeDefined()
    expect(MockPgBoss).toHaveBeenCalledTimes(2)
  })
})

describe('stopQueueClient', () => {
  it('coalesces concurrent stop calls into a single underlying stop()', async () => {
    const { getQueueClient, stopQueueClient } = await import('./queueClient.js')
    await getQueueClient()

    let resolveStop: () => void = () => {}
    mockStop.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveStop = resolve
      })
    )

    const first = stopQueueClient()
    const second = stopQueueClient()
    resolveStop()
    await Promise.all([first, second])

    expect(mockStop).toHaveBeenCalledTimes(1)
  })
})
