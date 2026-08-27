// Hand-written service worker (ticket 82) -- no vite-plugin-pwa or other build-step dependency,
// since this app needs exactly two event listeners (push, notificationclick), not offline
// caching or any other PWA feature. Served as-is from public/sw.js at the site root (/sw.js),
// which is required for its push scope to cover the whole origin, not just one subpath.

self.addEventListener('push', (event) => {
  if (!event.data) return

  // Always our own JSON shape (services/webPush.ts's sendThreadNotification, backend) -- never
  // an arbitrary third-party push payload this worker needs to defend against.
  const { title, body, url } = event.data.json()

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    })
  )
})

// Focuses an already-open tab on this Thread if one exists, rather than always opening a new
// one -- a reader who already has the site open in another tab shouldn't accumulate duplicate
// tabs every time a followed Thread updates.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url
  if (!url) return

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const target = new URL(url, self.location.origin).href
      const existing = clientsList.find((client) => client.url === target)
      if (existing) {
        await existing.focus()
        return
      }
      await self.clients.openWindow(url)
    })()
  )
})
