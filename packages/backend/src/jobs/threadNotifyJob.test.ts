import { describe, it, expect, vi } from 'vitest'
import { runThreadNotifyJob } from './threadNotifyJob.js'

const THREAD = { id: 't1', title: 'Vlákno tématu', slug: 'vlakno-tematu' }

function baseDeps(overrides: Partial<Parameters<typeof runThreadNotifyJob>[1]> = {}) {
  return {
    findThreadIdAndTitle: vi.fn().mockResolvedValue(THREAD),
    findFollowsForThread: vi.fn().mockResolvedValue([]),
    deleteThreadFollowsByEndpoint: vi.fn(),
    sendThreadNotification: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

describe('runThreadNotifyJob', () => {
  it('does nothing when the Thread no longer exists', async () => {
    const deps = baseDeps({ findThreadIdAndTitle: vi.fn().mockResolvedValue(null) })

    await runThreadNotifyJob({ threadId: 't1' }, deps)

    expect(deps.findFollowsForThread).not.toHaveBeenCalled()
  })

  it('does nothing when nobody follows this Thread', async () => {
    const deps = baseDeps({ findFollowsForThread: vi.fn().mockResolvedValue([]) })

    await runThreadNotifyJob({ threadId: 't1' }, deps)

    expect(deps.sendThreadNotification).not.toHaveBeenCalled()
  })

  it('sends one notification per follower, with the Thread title and its own /thread/:slug URL', async () => {
    const follow = { endpoint: 'https://push.example/a', p256dh: 'p1', auth: 'a1' }
    const deps = baseDeps({ findFollowsForThread: vi.fn().mockResolvedValue([follow]) })

    await runThreadNotifyJob({ threadId: 't1' }, deps)

    expect(deps.sendThreadNotification).toHaveBeenCalledWith(
      follow,
      expect.objectContaining({ title: 'Vlákno tématu', url: '/thread/vlakno-tematu' })
    )
  })

  it('deletes a follow whose send came back expired (404/410-confirmed dead)', async () => {
    const dead = { endpoint: 'https://push.example/dead', p256dh: 'p1', auth: 'a1' }
    const alive = { endpoint: 'https://push.example/alive', p256dh: 'p2', auth: 'a2' }
    const sendThreadNotification = vi
      .fn()
      .mockImplementation((sub: { endpoint: string }) =>
        Promise.resolve(sub.endpoint === dead.endpoint ? { ok: false, expired: true } : { ok: true })
      )
    const deps = baseDeps({
      findFollowsForThread: vi.fn().mockResolvedValue([dead, alive]),
      sendThreadNotification,
    })

    await runThreadNotifyJob({ threadId: 't1' }, deps)

    expect(deps.deleteThreadFollowsByEndpoint).toHaveBeenCalledExactlyOnceWith(dead.endpoint)
  })

  it('does not delete a follow whose send merely failed (not expired -- a transient blip)', async () => {
    const follow = { endpoint: 'https://push.example/a', p256dh: 'p1', auth: 'a1' }
    const deps = baseDeps({
      findFollowsForThread: vi.fn().mockResolvedValue([follow]),
      sendThreadNotification: vi.fn().mockResolvedValue({ ok: false, expired: false }),
    })

    await runThreadNotifyJob({ threadId: 't1' }, deps)

    expect(deps.deleteThreadFollowsByEndpoint).not.toHaveBeenCalled()
  })
})
