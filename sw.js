// Service worker minimal pour rendre TankoBlocs installable (PWA) et
// jouable hors connexion une fois visité une première fois.
//
// Incrémenter CACHE_VERSION à chaque changement notable (en même temps
// que les ?v= de index.html) pour forcer le renouvellement du cache.
const CACHE_VERSION = 'tankoblocs-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=7',
  './js/engine.js?v=7',
  './js/runtime.js?v=7',
  './js/blocks.js?v=7',
  './js/bots.js?v=7',
  './js/missions.js?v=7',
  './js/tournament.js?v=7',
  './js/renderer.js?v=7',
  './js/audio.js?v=7',
  './js/storage.js?v=7',
  './js/app.js?v=7',
  './vendor/blockly/blockly_compressed.js',
  './vendor/blockly/blocks_compressed.js',
  './vendor/blockly/javascript_compressed.js',
  './vendor/blockly/msg/fr.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Page HTML : réseau d'abord (pour avoir la dernière version en ligne),
  // cache en secours si hors connexion.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Le reste (scripts, styles, Blockly, icônes) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
      );
    })
  );
});
