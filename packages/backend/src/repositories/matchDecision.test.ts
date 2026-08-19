import { describe, it, expect, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { matchDecision: { create: mockCreate } },
}))

import { recordMatchDecision, recordMatchDecisionSafe } from './matchDecision.js'

const DECISION = {
  callSite: 'ingestion',
  candidateStoryId: 'story-1',
  candidateAnalysisId: 'analysis-1',
  score: 0.42,
  thresholdMatched: false,
  llmVerdict: null,
  decidedBy: 'THRESHOLD' as const,
  scorerVersion: 'storyMatching-v2',
}

describe('recordMatchDecision', () => {
  it('creates the row and returns it', async () => {
    const created = { id: 'md1', ...DECISION, createdAt: new Date() }
    mockCreate.mockResolvedValue(created)

    await expect(recordMatchDecision(DECISION)).resolves.toEqual(created)
    expect(mockCreate).toHaveBeenCalledWith({ data: DECISION })
  })

  it('propagates a thrown error rather than swallowing it', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(recordMatchDecision(DECISION)).rejects.toThrow('DB down')
  })
})

describe('recordMatchDecisionSafe', () => {
  it('resolves normally when the write succeeds', async () => {
    mockCreate.mockResolvedValue({ id: 'md1', ...DECISION, createdAt: new Date() })

    await expect(recordMatchDecisionSafe(DECISION)).resolves.toBeUndefined()
  })

  it('does not throw when the underlying write fails — a logging failure must never break the matching decision it is recording', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(recordMatchDecisionSafe(DECISION)).resolves.toBeUndefined()
  })
})
