/* SteamGram service worker: app shell only. Never caches /api or Steam media. */
const VERSION = 'v1'
const SHELL = `steamgram-shell-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/site.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(request)
        if (hit) return hit
        const res = await fetch(request)
        if (res.ok) c.put(request, res.clone())
        return res
      }),
    )
    return
  }

  // Navigations and the rest: network-first, fall back to the cached shell.
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone()))
        return res
      })
      .catch(async () => (await caches.match(request)) ?? (request.mode === 'navigate' ? caches.match('/') : Response.error())),
  )
})
