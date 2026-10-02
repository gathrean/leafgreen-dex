// Offline support: app files network-first, tiles and sprites cache-first.
const SHELL = "lgdex-shell-v2";
const ASSETS = "lgdex-assets-v2";
const SHELL_FILES = ["./", "index.html", "styles.css", "app.js", "data.js", "maps.js", "sync.js", "mapview.js", "map/markers.js", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname === "api.github.com") return;
  const isAsset = url.pathname.includes("/map/tiles/") || url.pathname.includes("/map/obj/") ||
    url.hostname === "raw.githubusercontent.com" || url.hostname === "play.pokemonshowdown.com" ||
    url.hostname === "cdnjs.cloudflare.com" || url.hostname.endsWith("gstatic.com");
  if (isAsset) {
    e.respondWith(caches.open(ASSETS).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") c.put(e.request, res.clone());
      return res;
    }));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
  }
});
