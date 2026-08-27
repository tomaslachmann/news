import type { PushSubscriptionBody } from '@news-triangulator/shared'
import { NotFoundError } from '../errors.js'
import * as threadRepo from '../repositories/thread.js'
import * as threadFollowRepo from '../repositories/threadFollow.js'

function toSubscriptionKeys(body: PushSubscriptionBody) {
  return { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth }
}

export async function followThread(slug: string, subscription: PushSubscriptionBody): Promise<void> {
  const thread = await threadRepo.findThreadIdAndTitleBySlug(slug)
  if (!thread) throw new NotFoundError('Vlákno nenalezeno')

  await threadFollowRepo.upsertThreadFollow(thread.id, toSubscriptionKeys(subscription))
}

export async function unfollowThread(slug: string, subscription: PushSubscriptionBody): Promise<void> {
  const thread = await threadRepo.findThreadIdAndTitleBySlug(slug)
  if (!thread) throw new NotFoundError('Vlákno nenalezeno')

  await threadFollowRepo.deleteThreadFollow(thread.id, subscription.endpoint)
}
