/* global caches, fetch, Response, self, URL */

const CACHE_NAME = 'training-app-cache-v5';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const CACHEABLE_PATH_PREFIXES = ['/assets/', '/icons/', '/resources/', '/src/data/'];

const getUrlPath = (url) => {
  try {
    const parsedUrl = new URL(url, self.location.origin);

    if (parsedUrl.origin !== self.location.origin) {
      return '';
    }

    return parsedUrl.pathname;
  } catch {
    return '';
  }
};

const isCacheableUrl = (url) => {
  const path = getUrlPath(url);

  return CACHEABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const getIndexAssetUrls = async () => {
  const response = await fetch('./index.html', { cache: 'no-cache' });
  const html = await response.text();
  const urls = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]);

  return [...new Set(urls.filter(isCacheableUrl))];
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);

      const assetUrls = await getIndexAssetUrls().catch(() => []);

      if (assetUrls.length > 0) {
        await cache.addAll(assetUrls);
      }
    })
  );
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

  const resourceUrls = [...new Set(event.data.urls)].filter((url) => typeof url === 'string' && isCacheableUrl(url));

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
