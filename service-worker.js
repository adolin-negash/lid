/* global caches, fetch, Response, self, URL */

const CACHE_VERSION = 'v6';
const CACHE_NAME = `training-app-cache-${CACHE_VERSION}`;
const INDEX_CACHE_KEY = './index.html';
const APP_SHELL = [INDEX_CACHE_KEY, './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
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

const isNavigationRequest = (request) => request.mode === 'navigate' || request.destination === 'document';

const isDataRequest = (request) => getUrlPath(request.url).startsWith('/src/data/');

const cacheFreshUrls = async (cache, urls) => {
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) {
        throw new Error(`Unable to cache ${url}`);
      }
      await cache.put(url, response);
    })
  );
};

const getIndexAssetUrls = async () => {
  const response = await fetch('./index.html', { cache: 'no-cache' });
  const html = await response.text();
  const urls = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]);

  return [...new Set(urls.filter(isCacheableUrl))];
};

const networkFirst = async (request, fallbackKey = request) => {
  try {
    // Revalidate through the browser HTTP cache instead of accepting a stale app shell.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackKey, copy);
    }

    return response;
  } catch {
    return (await caches.match(fallbackKey)) || Response.error();
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }

    return response;
  } catch {
    return Response.error();
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cacheFreshUrls(cache, APP_SHELL);

      const assetUrls = await getIndexAssetUrls().catch(() => []);

      if (assetUrls.length > 0) {
        await cacheFreshUrls(cache, assetUrls);
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

  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cacheFreshUrls(cache, resourceUrls)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (isNavigationRequest(event.request)) {
    event.respondWith(networkFirst(event.request, INDEX_CACHE_KEY));
    return;
  }

  if (isDataRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Vite emits hashed build assets under /assets; other listed paths are static offline resources.
  if (isCacheableUrl(event.request.url)) {
    event.respondWith(cacheFirst(event.request));
  }
});
