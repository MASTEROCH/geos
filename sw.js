// GEOS service worker — офлайн-запас: страница «сеть первой, кэш запасной», плитки мест и карты городов «кэш первым».
const V = "geos-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const cacheFirst = u.pathname.startsWith("/cities/") || u.pathname.startsWith("/earth/") || (u.pathname === "/api/area" && (u.searchParams.get("tier") === "p" || u.searchParams.has("id")));
  const netFirst = e.request.mode === "navigate" || u.pathname === "/" || u.pathname === "/index.html";
  if (!cacheFirst && !netFirst) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    if (cacheFirst) { const hit = await c.match(e.request); if (hit) return hit;
      const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
    try { const r = await fetch(e.request); if (r.ok) c.put("/", r.clone()); return r; }
    catch { return (await c.match("/")) || Response.error(); }
  })());
});
