import { prisma } from '../db.js'

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/** Re-following an already-followed Thread from the same browser (same `endpoint`) is a no-op,
 *  not a duplicate row -- upsert on the (threadId, endpoint) unique constraint, refreshing
 *  p256dh/auth in case the browser silently rotated its subscription's own keys without changing
 *  its endpoint (the Push API allows this). */
export async function upsertThreadFollow(
  threadId: string,
  subscription: PushSubscriptionKeys
): Promise<void> {
  await prisma.threadFollow.upsert({
    where: { threadId_endpoint: { threadId, endpoint: subscription.endpoint } },
    create: { threadId, ...subscription },
    update: { p256dh: subscription.p256dh, auth: subscription.auth },
  })
}

export async function deleteThreadFollow(threadId: string, endpoint: string): Promise<void> {
  await prisma.threadFollow.deleteMany({ where: { threadId, endpoint } })
}

/** The push service confirming a subscription is dead (404/410) is keyed on `endpoint` alone, not
 *  one Thread -- the same dead browser subscription could be following more than one Thread, and
 *  all of it needs to go, not just the row for whichever Thread happened to trigger the send. */
export async function deleteThreadFollowsByEndpoint(endpoint: string): Promise<void> {
  await prisma.threadFollow.deleteMany({ where: { endpoint } })
}

export async function findFollowsForThread(threadId: string): Promise<PushSubscriptionKeys[]> {
  return prisma.threadFollow.findMany({
    where: { threadId },
    select: { endpoint: true, p256dh: true, auth: true },
  })
}
