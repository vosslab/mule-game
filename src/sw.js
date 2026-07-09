// Offline-cache service worker for the static build.
//
// Copied verbatim into dist/sw.js by build_github_pages.sh, exactly like
// src/index.html and src/style.css -- this file is plain, unbundled JS (a
// service worker cannot be an ES module import target the way main.js is; it
// runs in its own worker global scope), so it is never passed through
// pipeline/build.mjs.
//
// Strategy: cache-first for every precached static asset, with a network
// fallback that also (re-)populates the cache -- so a first visit online
// warms the cache, and a later offline reload still finds every precached
// file. This is a pragmatic "installable + works offline once visited" cache,
// not a full stale-while-revalidate strategy; a cache-name bump (bumping
// CACHE_NAME below) is the mechanism for invalidating a stale cache after a
// content change; there is no more automated per-build invalidation.

const CACHE_NAME = "mule-game-cache-v1";

/** Every file the app needs to render once, listed relative to this file's own scope. */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./main.js",
  "./style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached !== undefined) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // Only cache a well-formed same-origin response; opaque/error
        // responses would poison the cache with an unusable entry.
        if (!response.ok || response.type !== "basic") {
          return response;
        }
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      });
    }),
  );
});
