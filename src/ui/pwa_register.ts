// Service-worker registration for the PWA offline cache.
//
// A tiny, separate module rather than inlining this into main.tsx: main.tsx
// is the shared entry every screen/demo mounts through and is actively
// touched by several concurrent workstreams, so a one-call, one-import
// registration keeps this feature's footprint there to two lines. src/sw.js
// (the worker itself) is plain unbundled JS, copied verbatim into dist/sw.js
// by build_github_pages.sh -- see that file's own doc comment for the cache
// strategy.

/**
 * Register src/sw.js (copied to dist/sw.js) if the browser supports service
 * workers. A no-op in environments without `navigator.serviceWorker` (older
 * browsers, and the plain Node test runner these modules also load under). A
 * failed registration (network hiccup, unsupported context) is deliberately
 * swallowed: offline caching is a progressive enhancement, not a feature the
 * rest of the app depends on, so it must never block or crash the page.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("sw.js").catch(() => undefined);
}
