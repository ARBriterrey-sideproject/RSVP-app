// Minimal offline shell cache — no Workbox, hand-rolled to keep the
// dependency surface at zero. Two strategies, chosen per request:
//
//  - Static, content-hashed assets (`/_next/static/*`, `/icons/*`) are
//    cache-first: the hash in the URL guarantees a cache hit is never stale.
//  - Everything else same-origin (pages, RSC payloads) is network-first with
//    a cache fallback: a guest on good Wi-Fi always gets the current
//    schedule/contacts, and a guest on bad venue Wi-Fi gets whatever was
//    last fetched instead of a broken screen.
//
// Deliberately scoped away from:
//  - /dashboard — staff, not guests, and not the offline requirement.
//  - /manifest/[code] — `Cache-Control: private, no-store` by design; a
//    stale cached manifest could keep pointing a re-installed icon at a
//    tier or start_url that no longer matches the guest's actual reply.
//  - Cross-origin requests (Firestore, Cloud Functions, the weather API) —
//    left untouched. Caching a write endpoint or a live weather call would
//    be actively wrong, not just unhelpful.
const CACHE_NAME = "shorelines-shell-v1";

const EXCLUDED_PATH_PREFIXES = ["/dashboard", "/manifest"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

  event.respondWith(isStaticAsset ? cacheFirst(request) : networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
