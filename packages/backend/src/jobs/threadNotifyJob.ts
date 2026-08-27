import type { FastifyBaseLogger } from 'fastify'
import type { PushSubscriptionKeys } from '../repositories/threadFollow.js'
import type { JobPayload } from './jobDefinitions.js'
import { JobName } from './jobDefinitions.js'

export interface ThreadNotifyJobDeps {
  findThreadIdAndTitle: (threadId: string) => Promise<{ id: string; title: string; slug: string } | null>
  findFollowsForThread: (threadId: string) => Promise<PushSubscriptionKeys[]>
  deleteThreadFollowsByEndpoint: (endpoint: string) => Promise<void>
  sendThreadNotification: (
    subscription: PushSubscriptionKeys,
    payload: { title: string; body: string; url: string }
  ) => Promise<{ ok: true } | { ok: false; expired: boolean }>
}

/** Handler for the `thread.notifySubscribers` job (ticket 82) — chained from
 *  `threadRecomputeJob.ts`'s own `if (changed)` block, same trigger point
 *  `thread.synthesizeOpenQuestions`/`thread.trackClaimSeries` already chain from. Sends one Web
 *  Push notification per `ThreadFollow` row for this Thread; a subscription the push service
 *  itself confirms is dead (404/410 — `sendThreadNotification`'s own `expired` flag) is deleted,
 *  same self-heal-on-confirmed-dead posture as this codebase's other "clean up on the next pass"
 *  state (e.g. a stale `IngestionRunLock`). A merely-failed send (VAPID not configured, a
 *  transient network/5xx) is left alone — pg-boss's own retry policy
 *  (`EXTERNAL_HTTP_JOB_RETRY_POLICY`) is what gives that one another chance, not a delete. */
export async function runThreadNotifyJob(
  payload: JobPayload[typeof JobName.ThreadNotifySubscribers],
  deps: ThreadNotifyJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const thread = await deps.findThreadIdAndTitle(payload.threadId)
  if (!thread) {
    log?.warn({ threadId: payload.threadId }, 'thread.notifySubscribers job: Thread no longer exists')
    return
  }

  const follows = await deps.findFollowsForThread(payload.threadId)
  if (follows.length === 0) return

  const notificationPayload = {
    title: thread.title,
    body: 'Nový vývoj v tématu, které sledujete.',
    url: `/thread/${thread.slug}`,
  }

  const results = await Promise.all(
    follows.map((follow) => deps.sendThreadNotification(follow, notificationPayload))
  )

  const expiredEndpoints = follows
    .filter((_, i) => {
      const result = results[i]
      return result && !result.ok && result.expired
    })
    .map((f) => f.endpoint)

  // Best-effort cleanup, its own try/catch: sends above have already gone out by this point, so a
  // failure here must never throw and fail the whole job -- pg-boss would then retry it from
  // scratch (JOB_RETRY_POLICY), re-sending a real push to every follower a second time, including
  // ones already successfully notified on this attempt (code review). A dead subscription this
  // pass couldn't clean up just stays around until the Thread's next genuine development retries
  // the same self-heal, same "eventually, not immediately" convention as IngestionRunLock's own
  // staleAfterMinutes self-heal.
  try {
    await Promise.all(expiredEndpoints.map((endpoint) => deps.deleteThreadFollowsByEndpoint(endpoint)))
  } catch (err) {
    log?.error(
      { threadId: payload.threadId, expiredEndpoints, err },
      'thread.notifySubscribers job: failed to clean up an expired ThreadFollow row; will retry on the next notify'
    )
  }

  log?.info(
    { threadId: payload.threadId, sent: follows.length, expired: expiredEndpoints.length },
    'thread.notifySubscribers job: done'
  )
}
