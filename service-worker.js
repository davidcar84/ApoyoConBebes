const CACHE = 'apoyoconbebes-v1';
const PRECACHE = [
  './', './index.html', './padres.html', './colaborador.html', './offline.html',
  './app.css', './padres.js', './colaborador.js', './firebase.js', './config.json',
  './manifest.json', './icons/icon-192.svg', './icons/icon-512.svg', './icons/maskable.svg'
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('firebaseio.com')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./offline.html')))
  );
});
