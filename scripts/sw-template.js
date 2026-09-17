/* Generated build substitutes an immutable shell version and exact asset list. */
const CACHE_PREFIX = "card-game-shell-";
const CACHE_NAME = CACHE_PREFIX + __SHELL_VERSION__;
const PRECACHE = __PRECACHE__;
const SHELL_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // A broken mandatory asset rejects the new worker. Keep the old shell.
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: "reload" })));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const owned = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
    // Keep the previous version for tabs still using its hashed JS/CSS.
    await Promise.all(owned.slice(0, -1).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) return response;
      } catch { /* Use a complete, version-consistent offline shell. */ }
      return (await (await caches.open(CACHE_NAME)).match(SHELL_URL)) ?? Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    let response;
    try {
      response = await fetch(request);
      if (response.ok) return response;
    } catch { /* Network failure and HTTP failure both allow exact old assets. */ }
    // Pages may delete the previous build's hashed assets while its tab is
    // still open. HTTP 404 does not throw, so it must reach this fallback too.
    for (const key of await caches.keys()) {
      if (!key.startsWith(CACHE_PREFIX)) continue;
      const older = await (await caches.open(key)).match(request);
      if (older) return older;
    }
    // Never substitute index.html for a missing script or image.
    return response ?? Response.error();
  })());
});
