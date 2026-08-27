import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { supportsPush, urlBase64ToUint8Array } from '@/lib/pushSubscription'
import { fetchPushPublicKey, followThread, unfollowThread } from '@/services/thread'

function storageKey(slug: string): string {
  return `thread-follow:${slug}`
}

/** This app has no reader login to persist "am I following this Thread" against, so it's a
 *  per-browser flag — same per-browser-only posture ticket 81's copy-link confirmation already
 *  accepts, not a new precedent. Re-subscribing after this flag is lost (a cleared/private
 *  browser) is harmless: the backend's follow endpoint upserts, so a repeat POST is a no-op. */
function isFollowingLocally(slug: string): boolean {
  return localStorage.getItem(storageKey(slug)) === '1'
}

async function subscribeAndFollow(slug: string): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const publicKey = await fetchPushPublicKey()
  if (!publicKey) return

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // TS's lib.dom types for BufferSource don't narrow Uint8Array<ArrayBufferLike> to plain
    // ArrayBuffer automatically; the runtime value is exactly what pushManager.subscribe expects.
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })

  await followThread(
    slug,
    subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  )
  localStorage.setItem(storageKey(slug), '1')
}

async function unsubscribeAndUnfollow(slug: string): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()

  if (subscription) {
    await unfollowThread(
      slug,
      subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    )
    await subscription.unsubscribe()
  }
  localStorage.removeItem(storageKey(slug))
}

/** "Sledovat vlákno" (ticket 82) — subscribes this browser to Web Push notifications for new
 *  developments on this Thread (`thread.recompute`'s own `changed` flag is what triggers a send,
 *  server-side). Feature-detected: absent entirely when the browser lacks Service
 *  Worker/PushManager/Notification support, never a dead button (same convention as ticket 81's
 *  native-share button) -- most desktop browsers without this support just don't get it. No
 *  in-house toast/error surface on this page (same tradeoff ticket 81's clipboard/native-share
 *  handlers already accept): permission denial or a subscribe failure silently leaves the button
 *  in its not-following state rather than partially updating. */
export function FollowThreadButton({ slug }: { slug: string }) {
  // Lazy initializer, not an effect: this only needs to run once per mount, and ThreadPage.tsx
  // renders this keyed by slug (`key={thread.slug}`) so React remounts it fresh on navigation to
  // a different Thread anyway -- React's own recommended fix for "reset/derive state when a prop
  // changes," same pattern ArticlePage.tsx's ShareBar already uses (ticket 81, code review).
  const [following, setFollowing] = useState(() => isFollowingLocally(slug))
  const [busy, setBusy] = useState(false)

  if (!supportsPush()) return null

  async function handleClick() {
    setBusy(true)
    try {
      if (following) {
        await unsubscribeAndUnfollow(slug)
        setFollowing(false)
      } else {
        await subscribeAndFollow(slug)
        setFollowing(isFollowingLocally(slug))
      }
    } catch {
      // Permission denial, an unsupported edge case despite the feature-detection above, or a
      // network failure -- left in whatever state it was already in, same silent-degrade
      // tradeoff as ShareBar's clipboard/native-share handlers (ticket 81).
    } finally {
      setBusy(false)
    }
  }

  const label = following ? 'Přestat sledovat vlákno' : 'Sledovat vlákno — upozornit na nový vývoj'

  return (
    <div className="sharebar">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="btn btn--ghost icon-btn"
            onClick={() => void handleClick()}
            disabled={busy}
            aria-label={label}
            aria-pressed={following}
          >
            {following ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}
