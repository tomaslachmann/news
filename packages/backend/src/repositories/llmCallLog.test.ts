import { describe, it, expect, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { llmCallLog: { create: mockCreate } },
}))

import { recordLlmCallSafe } from './llmCallLog.js'

const CALL = {
  callSite: 'extraction',
  model: 'gpt-4o',
  systemPrompt: 'system',
  userContent: 'user',
  responseContent: null,
  error: 'some error',
}

describe('recordLlmCallSafe', () => {
  it('resolves normally when the write succeeds', async () => {
    mockCreate.mockResolvedValue({ id: 'log1', ...CALL, createdAt: new Date() })

    await expect(recordLlmCallSafe(CALL)).resolves.toBeUndefined()
  })

  it('does not throw when the underlying write fails — a logging failure must never break the call it is recording', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(recordLlmCallSafe(CALL)).resolves.toBeUndefined()
  })
})
