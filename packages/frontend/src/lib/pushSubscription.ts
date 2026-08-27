/** Decodes a base64url string (the VAPID public key, as the backend serves it) into the raw
 *  `Uint8Array` `pushManager.subscribe()`'s `applicationServerKey` option requires — the Push API
 *  never accepts the string form directly. Standard, well-documented conversion (MDN's own Web
 *  Push guide uses the same one); pure and DOM-free, so it's the one piece of this ticket's
 *  frontend work that's actually unit-testable (this frontend has no component-render test infra
 *  — see ticket 76/81's own Implementation notes). */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function supportsPush(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}
