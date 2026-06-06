/* global caches, fetch, Response, self */

const CACHE_NAME = 'training-app-cache-v4';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const PRECACHE_PATH_PREFIXES = ['./assets/', './icons/', './resources/', './src/data/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PRECACHE_URLS' || !Array.isArray(event.data.urls)) {
    return;
  }

  const resourceUrls = [...new Set(event.data.urls)].filter(
    (url) => typeof url === 'string' && PRECACHE_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))
  );

  if (resourceUrls.length === 0) {
    return;
  }

  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(resourceUrls)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }

          return Response.error();
        });
    })
  );
});
