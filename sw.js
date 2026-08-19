// sw.js - Service Worker for PWA Installation
//
// CACHE_NAME AB KHUD-BA-KHUD (AUTOMATIC) SET HOTA HAI.
// Neeche '__BUILD_ID__' ek placeholder hai — GitHub Actions workflow
// (.github/workflows/deploy.yml) har push par ise khud commit SHA se
// replace kar deta hai. Isliye ab AAPKO KABHI BHI MANUALLY VERSION
// NUMBER BADHANE KI ZAROORAT NAHI — bas normal push karein, version
// khud unique ho jayega aur purana cache khud saaf ho jayega.
const CACHE_NAME = 'smp-__BUILD_ID__';
const urlsToCache = [
  '/The-Smart-Modern-Public-School-Qamber-/',
  '/The-Smart-Modern-Public-School-Qamber-/index.html',
  '/The-Smart-Modern-Public-School-Qamber-/manifest.json',
  '/The-Smart-Modern-Public-School-Qamber-/icon-192.png',
  '/The-Smart-Modern-Public-School-Qamber-/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
      .then(function(){
        // Naya service worker turant "waiting" state se nikal kar active ho jaye —
        // purane service worker ke band/close hone ka intezaar na kare.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      // Sab PURANE caches delete kar do, sirf naya CACHE_NAME wala rakho.
      return Promise.all(
        cacheNames
          .filter(function(name){ return name !== CACHE_NAME; })
          .map(function(name){ return caches.delete(name); })
      );
    }).then(function(){
      // Sab already-khule tabs ko turant is naye service worker ke control mein le lo.
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  const isHtmlPage = req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

  if (isHtmlPage) {
    // MAIN APP PAGE (index.html): hamesha pehle NETWORK se try karo taake
    // naya update turant mil jaye. Sirf offline hone par cache se dikhao.
    event.respondWith(
      fetch(req)
        .then(function(response){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, clone); });
          return response;
        })
        .catch(function(){
          return caches.match(req).then(function(cached){
            return cached || caches.match('/The-Smart-Modern-Public-School-Qamber-/index.html');
          });
        })
    );
    return;
  }

  // BAAQI static files (icons, manifest, waghera): pehle cache se turant dikhao
  // (fast + offline works), sath hi background mein network se bhi check karke
  // cache update kar do — taake agli baar naya version mile.
  event.respondWith(
    caches.match(req).then(function(cached){
      const networkFetch = fetch(req).then(function(response){
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, clone); });
        }
        return response;
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});
