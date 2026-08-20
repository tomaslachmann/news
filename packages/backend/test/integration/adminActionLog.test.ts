import { describe, it, expect, afterAll } from 'vitest'
import { disconnect } from '../../src/repositories/analysis.js'
import { recordAdminAction } from '../../src/repositories/adminActionLog.js'

describe('AdminActionLog repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('persists an admin action entry and reads it back', async () => {
    const created = await recordAdminAction({
      actorId: 'admin-1',
      action: 'draft.approved',
      targetType: 'analysis',
      targetId: 'a1',
    })

    expect(created.id).toBeTruthy()
    expect(created.actorId).toBe('admin-1')
    expect(created.action).toBe('draft.approved')
    expect(created.targetType).toBe('analysis')
    expect(created.targetId).toBe('a1')
    expect(created.createdAt).toBeInstanceOf(Date)
  })
})
