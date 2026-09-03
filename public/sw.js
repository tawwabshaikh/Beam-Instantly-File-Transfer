/* Beam service worker — installability only, deliberately cache-free.
 *
 * Every request goes straight to the network, so dev HMR, QR session links
 * and transfers are always fresh — nothing is ever served stale. The fetch
 * handler exists purely so Chromium considers the app installable
 * (manifest + service worker + fetch = installable PWA).
 */

self.addEventListener('install', () => {
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
  event.respondWith(fetch(req))
})
