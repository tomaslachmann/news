import { describe, it, expect, vi } from 'vitest'
import type { SendOptions } from 'pg-boss'

const { mockSend, mockGetQueueClient } = vi.hoisted(() => ({
  mockSend: vi.fn<(name: string, data: object, options: SendOptions) => Promise<string | null>>(),
  mockGetQueueClient: vi.fn(),
}))

vi.mock('./queueClient.js', () => ({
  getQueueClient: mockGetQueueClient,
}))

import { enqueueJob } from './enqueue.js'
import { JobName } from './jobDefinitions.js'

mockGetQueueClient.mockResolvedValue({ send: mockSend })

describe('enqueueJob', () => {
  it('sends the payload under the job name with no db option by default', async () => {
    mockSend.mockResolvedValue('job-1')

    const id = await enqueueJob(JobName.Narrative, { analysisId: 'a1' })

    expect(id).toBe('job-1')
    expect(mockSend).toHaveBeenCalledWith(JobName.Narrative, { analysisId: 'a1' }, {})
  })

  it('wraps a supplied Prisma transaction as pg-boss db option so the send is transactional', async () => {
    mockSend.mockResolvedValue('job-2')
    const tx = { $queryRawUnsafe: vi.fn() }

    await enqueueJob(JobName.EntityRelation, { analysisId: 'a2' }, { tx })

    const sendOptions = mockSend.mock.calls.at(-1)?.[2]
    expect(sendOptions?.db).toBeTypeOf('object')
  })
})
