/* Generated build substitutes an immutable shell version and exact asset list. */
const CACHE_PREFIX = "card-game-shell-";
const CACHE_NAME = CACHE_PREFIX + __SHELL_VERSION__;
const PRECACHE = __PRECACHE__;
const SHELL_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Install is atomic from the application's point of view. A broken asset
      // rejects the new worker, so the previous working shell remains active.
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
    try {
      return await fetch(request);
    } catch {
      for (const key of await caches.keys()) {
        if (!key.startsWith(CACHE_PREFIX)) continue;
        const older = await (await caches.open(key)).match(request);
        if (older) return older;
      }
      // Never substitute HTML for a missing script/image request.
      return Response.error();
    }
  })());
});
