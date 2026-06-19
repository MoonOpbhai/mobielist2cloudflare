const CACHE = 'moon-flix-shell-v8';
const SHELL = [
  './',
  './style.css?v=moon-ui-v32',
  './app.js?v=moon-ui-v32',
  './config.js?v=moon-ui-v32',
  './icon-192.png?v=2',
  './icon-512.png?v=2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isShellAsset = isSameOrigin && SHELL.some((s) => req.url.endsWith(s.replace('./', '')));

  if (!isSameOrigin || !isShellAsset) {
    // Supabase calls, fonts, TMDB, etc. — always go straight to the network untouched
    return;
  }

  // Shell assets: cache-first → instant on repeat opens. Safe because the
  // ?v= query string changes on every deploy, so a new version is a new URL.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
