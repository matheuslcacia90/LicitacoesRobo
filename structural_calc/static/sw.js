/* StructCalc – Service Worker (PWA) */
const CACHE = 'structcalc-v1';
const PRECACHE = [
  '/',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first para API, cache-first para estáticos
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"erro":"offline"}', {headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
