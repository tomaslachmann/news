import webpush from 'web-push'
import type { PushSubscriptionKeys } from '../repositories/threadFollow.js'

export interface ThreadNotificationPayload {
  title: string
  body: string
  url: string
}

export type SendThreadNotificationResult =
  | { ok: true }
  /** `expired: true` means the push service itself confirmed (404/410) this subscription is
   *  dead — the caller should delete it. `expired: false` covers everything else (VAPID not
   *  configured, a transient network/5xx failure) — never treated as "this subscription is
   *  gone," since that would delete a perfectly good subscription over a passing blip. */
  | { ok: false; expired: boolean }

let vapidConfigured = false

/** Lazily configures web-push's VAPID details from env on first real use, not at module-load
 *  time — this module is imported by the worker and by the `GET /api/push/public-key` route
 *  regardless of whether VAPID is actually set (index.ts already warns at startup if it isn't;
 *  this is what makes every call site here degrade gracefully instead of crashing). */
function ensureConfigured(): boolean {
  if (vapidConfigured) return true
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_CONTACT_EMAIL) return false
  webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidConfigured = true
  return true
}

export function isPushConfigured(): boolean {
  return ensureConfigured()
}

export function getVapidPublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY
}

export async function sendThreadNotification(
  subscription: PushSubscriptionKeys,
  payload: ThreadNotificationPayload
): Promise<SendThreadNotificationResult> {
  if (!ensureConfigured()) return { ok: false, expired: false }

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
    return { ok: true }
  } catch (err) {
    const expired = err instanceof webpush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)
    return { ok: false, expired }
  }
}
