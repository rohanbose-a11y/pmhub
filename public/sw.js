// Bump CACHE_NAME on every deploy that changes JS/CSS so the activate event
// deletes the old cache and users get fresh code immediately.
const CACHE_NAME = 'erpnext-pm-v4'

// Only the HTML shell is cached for offline support.
// JS/CSS assets already have immutable HTTP cache headers set by nginx — the
// browser handles those without SW involvement.  API calls must NEVER be
// served from SW cache (stale field lists / wrong query parameters).
const APP_SHELL_ASSETS = ['/', '/manifest.webmanifest', '/app-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const { pathname } = new URL(event.request.url)

  // API calls — always network, never cache.
  if (pathname.startsWith('/frappe/')) return

  // JS/CSS assets — immutable HTTP cache (nginx) handles these; caching in SW
  // would lock users onto old bundles across deploys.
  if (pathname.startsWith('/assets/')) return

  // Only cache the explicit shell assets listed above.
  if (!APP_SHELL_ASSETS.includes(pathname)) return

  // Network-first for HTML shell: always fetch fresh when online so the browser
  // never gets a blank page from a stale cached index.html with outdated asset
  // hashes.  Cache is kept only as an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request)),
  )
})
