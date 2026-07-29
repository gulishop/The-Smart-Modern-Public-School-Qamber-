// sw.js - Service Worker for PWA Installation
const CACHE_NAME = 'smp-v1';
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
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        return response || fetch(event.request);
      })
  );
});
