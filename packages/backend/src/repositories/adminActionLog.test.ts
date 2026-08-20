import { describe, it, expect, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { adminActionLog: { create: mockCreate } },
}))

import { recordAdminAction, recordAdminActionSafe } from './adminActionLog.js'

const ENTRY = {
  actorId: 'admin-1',
  action: 'draft.approved' as const,
  targetType: 'analysis' as const,
  targetId: 'a1',
}

describe('recordAdminAction', () => {
  it('creates the row and returns it', async () => {
    const created = { id: 'aal1', ...ENTRY, createdAt: new Date() }
    mockCreate.mockResolvedValue(created)

    await expect(recordAdminAction(ENTRY)).resolves.toEqual(created)
    expect(mockCreate).toHaveBeenCalledWith({ data: ENTRY })
  })

  it('propagates a thrown error rather than swallowing it', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(recordAdminAction(ENTRY)).rejects.toThrow('DB down')
  })
})

describe('recordAdminActionSafe', () => {
  it('resolves normally when the write succeeds', async () => {
    mockCreate.mockResolvedValue({ id: 'aal1', ...ENTRY, createdAt: new Date() })

    await expect(recordAdminActionSafe(ENTRY)).resolves.toBeUndefined()
  })

  it('does not throw when the underlying write fails — a logging failure must never break the admin action it is recording', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))

    await expect(recordAdminActionSafe(ENTRY)).resolves.toBeUndefined()
  })
})
