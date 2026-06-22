// Little Lights offline cache. Same-origin only — no third-party calls or beacons.
//
// Update strategy (chosen so pushed updates show up on the next launch while online):
//   - HTML / JS / CSS  -> network-first: always try the live file, fall back to cache offline.
//                         This is why a fresh open of the installed app gets the latest build.
//   - images / fonts / icons / manifest -> cache-first: fast, and they change rarely.
// Bump CACHE on a release to evict everything old in one shot.
const CACHE = 'little-lights-v12';
const SHELL = [
  './', './index.html',
  './css/fonts.css', './css/coloring.css', './css/sections.css',
  './js/config.js', './js/manifest.js', './js/pages.js', './js/floodfill.js', './js/storage.js', './js/saved.js',
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

function isCode(url) {
  return url.pathname.endsWith('.html') || url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.css') || url.pathname.endsWith('/');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // app shell + navigations: network-first so updates land on next launch
  if (req.mode === 'navigate' || isCode(url)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // everything else (images, fonts, icons): cache-first for speed
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
    )
  );
});
