// ==========================================================================
// Prompt Helper — Optimized Offline-First PWA Service Worker (sw.js)
// ==========================================================================

const CACHE_NAME = 'prompt-helper-v1.9';
const FONT_CACHE_NAME = 'prompt-helper-fonts-v1';

const GOOGLE_FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';

const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'templates.js',
  'chains.js',
  'manifest.json'
];

// 1. Install Event: Pre-cache all core static assets and pre-cache font stylesheet
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      }),
      caches.open(FONT_CACHE_NAME).then((fontCache) => {
        return fetch(GOOGLE_FONT_STYLESHEET)
          .then((response) => {
            if (response && response.status === 200) {
              return fontCache.put(GOOGLE_FONT_STYLESHEET, response);
            }
          })
          .catch((err) => {
            console.warn('Pre-caching Google Fonts stylesheet failed (will cache on first online load):', err);
          });
      })
    ]).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up stale legacy application caches while preserving font cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== FONT_CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Specialized routing for Fonts (Cache-First) and App Assets (Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests with http/https schemes
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Strategy A: External Google Fonts & Font Binaries (Cache-First with dynamic caching)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((fontCache) => {
        return fontCache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                fontCache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              return cachedResponse;
            });
        });
      })
    );
    return;
  }

  // Strategy B: Core Application Assets (Stale-While-Revalidate for 0ms load & auto-update)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and page navigation fails, fallback to cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
