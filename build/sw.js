// Little Lights offline cache. Same-origin only — no third-party or network beacons.
// Cache-first for instant launches; falls back to the app shell when offline.
const CACHE = 'little-lights-v1';
const SHELL = [
  './', './index.html',
  './css/fonts.css', './css/coloring.css', './css/sections.css',
  './js/config.js', './js/manifest.js', './js/pages.js', './js/floodfill.js',
  './js/screens.js', './js/home.js', './js/sections.js', './js/gallery.js',
  './js/coloring.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
