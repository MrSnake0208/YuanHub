/*
 * YuanHub promo PWA worker.
 *
 * The promo site is temporary content for the same YuanHub origin, so this
 * worker deliberately does not precache or persist page responses. Requests
 * stay network-first/network-only, allowing the future main YuanHub deployment
 * at the same origin to replace the promo page without stale PWA shell caches.
 */
self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request))
})
