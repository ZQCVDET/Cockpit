// Service worker : garde une copie de l'app pour qu'elle s'ouvre même sans réseau.
// Stratégie : on sert la copie en cache tout de suite, et on la met à jour en arrière-plan.
// (Les données Supabase ne passent pas par ici : elles sont gérées dans js/db.js.)
const CACHE = 'cockpit-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isApp = url.origin === location.origin;
  const isLib = url.hostname === 'cdn.jsdelivr.net';
  if (e.request.method !== 'GET' || !(isApp || isLib)) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
