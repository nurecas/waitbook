/* Waitbook service worker: keeps the app working offline.
   - The app shell and data are cached on install (precache).
   - Other same-origin files (map library, glyphs, other languages, the full Kiwix snapshot) are cached the first
     time they are used.
   - Requests to other sites (Kiwix catalog, Hugging Face, Protomaps) are never cached here; the app keeps its own
     small record of what it learned. Large downloads never pass through the app. */
'use strict';
var VERSION = 'waitbook-2026-11-17-1';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/app.css', 'css/print.css',
  'js/core/util.js', 'js/core/i18n.js', 'js/core/catalog.js', 'js/core/kit.js', 'js/core/opds.js', 'js/core/resolve.js',
  'js/core/exporters.js', 'js/core/share.js', 'js/core/platform.js',
  'js/ui/dom.js', 'js/ui/store.js', 'js/ui/net.js', 'js/ui/router.js', 'js/ui/parts.js', 'js/ui/app.js',
  'js/views/home.js', 'js/views/pack.js', 'js/views/library.js', 'js/views/item.js', 'js/views/kiwix.js', 'js/views/kit.js',
  'js/views/cards.js', 'js/views/map.js', 'js/views/apps.js', 'js/views/settings.js',
  'i18n/en.js', 'data/countries.js', 'data/catalog.js', 'data/kiwix-known.js', 'data/apps.js', 'data/cards.js',
  'vendor/fonts/sofia-sans-latin.woff2', 'vendor/fonts/sofia-sans-condensed-latin.woff2', 'vendor/fonts/martian-mono-latin.woff2', 'vendor/fonts/stencil-800.woff2',
  'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('waitbook-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party: straight to the network, never cached here
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put('index.html', copy); });
      return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic' && Number(res.headers.get('content-length') || 0) < 25e6) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }));
});
