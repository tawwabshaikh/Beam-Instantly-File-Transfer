/* Beam service worker — network-first with an offline fallback page.
 *
 * Every request goes straight to the network, so dev HMR, QR session links
 * and transfers are always fresh — nothing is ever served stale. The ONLY
 * thing cached is offline.html: if a navigation fails (device offline /
 * server unreachable) we show a friendly Beam-branded page instead of the
 * browser's error. The fetch handler also keeps the app installable
 * (manifest + service worker + fetch = installable PWA).
 */

const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open('beam-offline-v1')
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined), // best-effort; page still works without it
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // Range requests (media seeking) must bypass the worker entirely.
  if (req.headers.has('range')) return

  // Navigations: network first, friendly offline page when unreachable.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((res) => res ?? new Response('You are offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })),
      ),
    )
    return
  }

  event.respondWith(fetch(req))
})
