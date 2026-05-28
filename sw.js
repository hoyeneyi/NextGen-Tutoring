/**
 * NextGen Tutoring — Service Worker
 * Enables PWA install, offline shell, and fast repeat loads
 */

const CACHE_NAME    = 'nextgen-v2';
const SHELL_ASSETS  = [
  '/',
  '/index.html',
  '/pages/dashboard.html',
  '/pages/login.html',
  '/pages/about.html',
  '/styles/main.css',
  '/assets/images/logo-trans.png',
  '/assets/favicon.ico',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL: cache shell assets ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('Service worker: some assets failed to cache', err);
      });
    })
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for API, cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network for: Firebase, Cloudflare Worker, Calendly, Formspree
  const networkOnly = [
    'firebaseapp.com',
    'googleapis.com',
    'workers.dev',
    'calendly.com',
    'formspree.io',
    'api.anthropic.com',
    'simpleanalyticscdn.com',
  ];
  if (networkOnly.some(domain => url.hostname.includes(domain))) {
    return; // let browser handle it normally
  }

  // For navigation requests (page loads) — network first, fall back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Offline fallback — show dashboard if logged in, else login
          return caches.match('/pages/dashboard.html') || caches.match('/pages/login.html');
        }))
    );
    return;
  }

  // For static assets — cache first, network fallback
  if (['style', 'script', 'image', 'font'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
