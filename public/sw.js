// Synapse PWA Service Worker
const CACHE_NAME = "synapse-cache-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.svg",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/open-dyslexic.woff",
];

// Install: Cache critical PWA app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try {
          const req = new Request(url, { credentials: "same-origin" });
          const res = await fetch(req);
          if (res.ok) {
            await cache.put(req, res);
          }
        } catch {
          // Ignore individual asset fetch failures behind auth tunnels
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// Fetch: Network first with cache fallback for HTML/assets
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Strictly ignore non-HTTP(S) schemes (chrome-extension, moz-extension, data, blob, etc.)
  if (!url.protocol.startsWith("http")) return;

  // Let all cross-origin requests (browser extensions, third-party CDNs, external media) bypass service worker
  if (url.origin !== self.location.origin) return;

  // Skip API calls from stale-cache to ensure live feed data
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache valid static responses
        if (
          response.status === 200 &&
          (url.pathname.startsWith("/icons/") ||
            url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".woff"))
        ) {
          const cloned = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, cloned))
            .catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If navigating to a page while offline, return the root app shell
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});
