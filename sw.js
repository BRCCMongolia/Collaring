// BRCC Collaring — offline service worker. Шинэ хувилбар гаргахдаа VERSION-ийг өөрчилнө.
const VERSION = "collaring-v0.4.2";
const FILES = ["./", "./index.html", "./app.js", "./manifest.json", "./vendor/htm-preact.js", "./vendor/admin.js", "./vendor/collars.js", "./vendor/qrcode.js", "./vendor/jsQR.js",
  "./logo-small.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
