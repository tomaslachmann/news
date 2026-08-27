import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as threadRepo from '../repositories/thread.js'
import * as threadFollowRepo from '../repositories/threadFollow.js'
import { followThread, unfollowThread } from './threadFollowService.js'
import { NotFoundError } from '../errors.js'

vi.mock('../repositories/thread.js')
vi.mock('../repositories/threadFollow.js')

const SUBSCRIPTION = {
  endpoint: 'https://push.example/x',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
}

describe('followThread', () => {
  beforeEach(() => vi.resetAllMocks())

  it('upserts a ThreadFollow keyed on the resolved threadId, flattening keys.p256dh/auth', async () => {
    vi.mocked(threadRepo.findThreadIdAndTitleBySlug).mockResolvedValue({ id: 't1', title: 'x' })

    await followThread('vlakno', SUBSCRIPTION)

    expect(threadFollowRepo.upsertThreadFollow).toHaveBeenCalledWith('t1', {
      endpoint: SUBSCRIPTION.endpoint,
      p256dh: SUBSCRIPTION.keys.p256dh,
      auth: SUBSCRIPTION.keys.auth,
    })
  })

  it('throws NotFoundError for an unknown slug, without ever calling the repository', async () => {
    vi.mocked(threadRepo.findThreadIdAndTitleBySlug).mockResolvedValue(null)

    await expect(followThread('missing', SUBSCRIPTION)).rejects.toThrow(NotFoundError)
    expect(threadFollowRepo.upsertThreadFollow).not.toHaveBeenCalled()
  })
})

describe('unfollowThread', () => {
  beforeEach(() => vi.resetAllMocks())

  it('deletes the ThreadFollow row for the resolved threadId and the subscription endpoint', async () => {
    vi.mocked(threadRepo.findThreadIdAndTitleBySlug).mockResolvedValue({ id: 't1', title: 'x' })

    await unfollowThread('vlakno', SUBSCRIPTION)

    expect(threadFollowRepo.deleteThreadFollow).toHaveBeenCalledWith('t1', SUBSCRIPTION.endpoint)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    vi.mocked(threadRepo.findThreadIdAndTitleBySlug).mockResolvedValue(null)

    await expect(unfollowThread('missing', SUBSCRIPTION)).rejects.toThrow(NotFoundError)
  })
})
