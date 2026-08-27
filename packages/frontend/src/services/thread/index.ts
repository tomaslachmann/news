import type {
  AgreementCategory,
  ClaimSeriesItem,
  ClaimSeriesPoint,
  EntityMentionItem,
  HomepageThreadItem,
  Page,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadOpenQuestionItem,
  ThreadSourceRow,
  ThreadStatusLabel,
  ThreadTimelineItem,
} from '@news-triangulator/shared'
import { MIN_SOURCES_FOR_GAUGE } from '@news-triangulator/shared'
import { cursorQueryParam } from '../pagination'

export { MIN_SOURCES_FOR_GAUGE }
export type {
  AgreementCategory,
  ClaimSeriesItem,
  ClaimSeriesPoint,
  EntityMentionItem,
  HomepageThreadItem,
  ThreadArticleRow,
  ThreadArticleTag,
  ThreadDetail,
  ThreadOpenQuestionItem,
  ThreadSourceRow,
  ThreadStatusLabel,
  ThreadTimelineItem,
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

/** Distinguishes "this Thread doesn't exist / dropped below 2 visible members" (the backend's
 *  deliberate never-leak-existence 404, `threadDetailService.ts`) from a genuine fetch failure —
 *  `ThreadPage.tsx` renders `NotFoundPage` for the former, its retryable `ErrorState` for the
 *  latter. Without this, both looked identical to `useThreadDetail`'s `isError`. */
export class ThreadNotFoundError extends Error {}

export async function fetchThreadDetail(slug: string): Promise<ThreadDetail> {
  const res = await fetch(`/api/thread/${slug}`, { credentials: 'include' })

  if (res.status === 404) throw new ThreadNotFoundError('Vlákno nenalezeno')
  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst vlákno')

  return res.json() as Promise<ThreadDetail>
}

/** `/threads` browse-all listing (ticket 71) — same row shape as ticket 70's homepage teaser
 *  (`HomepageThreadItem`), just paginated. */
export async function fetchThreadsPage(cursor?: string): Promise<Page<HomepageThreadItem>> {
  const res = await fetch(`/api/threads${cursorQueryParam(cursor)}`, { credentials: 'include' })

  if (!res.ok) return throwApiError(res, 'Nepodařilo se načíst vlákna')

  return res.json() as Promise<Page<HomepageThreadItem>>
}

/** Ticket 82 — "Sledovat vlákno": the VAPID public key `pushManager.subscribe()` needs. `null`
 *  when Web Push isn't configured on this server (backend's own `GET /api/push/public-key`
 *  returns 503 in that case) — `FollowThreadButton.tsx` treats that the same as "unsupported",
 *  never a dead button. */
export async function fetchPushPublicKey(): Promise<string | null> {
  const res = await fetch('/api/push/public-key', { credentials: 'include' })
  if (!res.ok) return null
  const { publicKey } = (await res.json()) as { publicKey: string }
  return publicKey
}

/** The browser's own `PushSubscription.toJSON()` shape — what `POST .../follow` and
 *  `.../unfollow` both expect (`PushSubscriptionBodySchema`, shared). */
export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function followThread(slug: string, subscription: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`/api/thread/${slug}/follow`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) return throwApiError(res, 'Nepodařilo se nastavit sledování vlákna')
}

export async function unfollowThread(slug: string, subscription: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`/api/thread/${slug}/unfollow`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) return throwApiError(res, 'Nepodařilo se zrušit sledování vlákna')
}
