import { describe, it, expect, vi } from 'vitest'

const { mockUpdate, mockDeleteMany } = vi.hoisted(() => ({ mockUpdate: vi.fn(), mockDeleteMany: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { synthesisResult: { update: mockUpdate, deleteMany: mockDeleteMany } },
}))

import {
  markNarrativeGenerationFailed,
  markNarrativeGenerationFailedSafe,
  deleteSynthesisResult,
} from './synthesisResult.js'

describe('markNarrativeGenerationFailed', () => {
  it('propagates a thrown error rather than swallowing it', async () => {
    mockUpdate.mockRejectedValue(new Error('DB down'))

    await expect(markNarrativeGenerationFailed('a1')).rejects.toThrow('DB down')
  })
})

describe('markNarrativeGenerationFailedSafe', () => {
  it('resolves normally when the write succeeds', async () => {
    mockUpdate.mockResolvedValue({})

    await expect(markNarrativeGenerationFailedSafe('a1')).resolves.toBeUndefined()
  })

  it('does not throw when the underlying write fails — a marker-write failure must never turn the graceful no-narrative degrade into a hard error', async () => {
    mockUpdate.mockRejectedValue(new Error('DB down'))

    await expect(markNarrativeGenerationFailedSafe('a1')).resolves.toBeUndefined()
  })
})

describe('deleteSynthesisResult', () => {
  it('deletes by analysisId', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })

    await deleteSynthesisResult('a1')

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { analysisId: 'a1' } })
  })

  it('is a no-op, not an error, when no SynthesisResult exists yet', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })

    await expect(deleteSynthesisResult('a1')).resolves.toBeUndefined()
  })
})
