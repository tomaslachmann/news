import { describe, it, expect, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { analysisView: { create: mockCreate } },
}))

import { createAnalysisView } from './analysisView.js'

describe('createAnalysisView', () => {
  it('creates a view row for the given Analysis, with no other data', async () => {
    mockCreate.mockResolvedValue(undefined)

    await createAnalysisView('a1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { analysisId: 'a1' } })
  })
})
