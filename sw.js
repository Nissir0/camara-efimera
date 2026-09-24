/**
 * Service worker mínimo.
 *
 * Su único trabajo es que la PWA sea instalable y abra en modo standalone
 * sin la barra de Safari, cacheando los assets estáticos. NO cachea fotos:
 * las imágenes capturadas nunca pasan por la red ni por la Cache API.
 *
 * Subí el número de versión cada vez que cambies un archivo, para que
 * el cache viejo se descarte.
 */

const VERSION = 'v1';
const CACHE = `camara-efimera-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/state.js',
  './js/camera.js',
  './js/share.js',
  './js/destinations.js',
  './js/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET del mismo origen; lo demás va derecho a la red.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Navegaciones: red primero, cache como respaldo offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Assets: cache primero, y si falta lo buscamos y lo guardamos.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
