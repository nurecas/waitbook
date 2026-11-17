/* Waitbook service worker: keeps the app working offline.
   - Install stores the app shell, its data and every interface language (so the language can be changed offline).
   - Other same-origin files (map viewer, map glyphs, extra fonts, the full Kiwix snapshot) are stored when first used,
     in a cache that survives app updates. Once the app has loaded, it also asks for the map viewer and the snapshot to
     be fetched in the background, plus any file it used before this worker took over, so they work offline even if
     they were never opened online. Skipped when the browser asks to save data.
   - Only the app's own page is stored from navigations, and only a real, successful HTML answer.
   - Requests to other sites (Kiwix catalog, Hugging Face, Protomaps) are never cached here. Large downloads never
     pass through the app. */
'use strict';
var VERSION = 'waitbook-2026-11-17-2';
var SHELL_CACHE = 'waitbook-shell-' + VERSION.replace(/^waitbook-/, '');
var RUNTIME_CACHE = 'waitbook-runtime';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/app.css', 'css/print.css',
  'js/core/util.js', 'js/core/i18n.js', 'js/core/catalog.js', 'js/core/kit.js', 'js/core/opds.js', 'js/core/resolve.js',
  'js/core/exporters.js', 'js/core/share.js', 'js/core/platform.js',
  'js/ui/dom.js', 'js/ui/store.js', 'js/ui/net.js', 'js/ui/router.js', 'js/ui/parts.js', 'js/ui/app.js',
  'js/views/home.js', 'js/views/pack.js', 'js/views/library.js', 'js/views/item.js', 'js/views/kiwix.js', 'js/views/kit.js',
  'js/views/cards.js', 'js/views/map.js', 'js/views/apps.js', 'js/views/settings.js',
  'data/countries.js', 'data/catalog.js', 'data/kiwix-known.js', 'data/apps.js', 'data/cards.js',
  'vendor/fonts/sofia-sans-latin.woff2', 'vendor/fonts/sofia-sans-condensed-latin.woff2', 'vendor/fonts/martian-mono-latin.woff2', 'vendor/fonts/stencil-800.woff2',
  'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png',
  'i18n/en.js', 'i18n/es.js', 'i18n/fr.js', 'i18n/pt.js', 'i18n/ar.js', 'i18n/hi.js', 'i18n/zh.js', 'i18n/sw.js', 'i18n/ru.js', 'i18n/id.js',
];
// Fetched in the background after the app loads (see the 'warm' message).
var WARM = [
  'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css', 'vendor/maplibre/mapbox-gl-rtl-text.js',
  'vendor/pmtiles/pmtiles.js', 'vendor/basemaps/basemaps.js', 'vendor/glyphs/ranges.js', 'data/world.js', 'data/kiwix-snapshot.js',
  'vendor/sprites/light.json', 'vendor/sprites/light.png', 'vendor/sprites/light@2x.json', 'vendor/sprites/light@2x.png',
  'vendor/sprites/dark.json', 'vendor/sprites/dark.png', 'vendor/sprites/dark@2x.json', 'vendor/sprites/dark@2x.png',
  'vendor/glyphs/regular/0-255.pbf', 'vendor/glyphs/regular/256-511.pbf', 'vendor/glyphs/regular/8192-8447.pbf',
  'vendor/glyphs/medium/0-255.pbf', 'vendor/glyphs/medium/256-511.pbf', 'vendor/glyphs/medium/8192-8447.pbf',
];
var SCOPE = new URL(self.registration.scope).pathname;
var IN_SHELL = {};
SHELL.forEach(function (u) { IN_SHELL[new URL(u, self.location).pathname] = true; });

function noop() {}

/** Store a copy if it is a complete, successful same-origin answer of reasonable size. A worker that has been
    replaced never writes to its old shell cache again (that would bring back a cache the new version removed). */
function keep(cacheName, req, res) {
  if (res.status !== 200 || res.type !== 'basic' || Number(res.headers.get('content-length') || 0) > 25e6) return;
  var copy = res.clone();
  return (cacheName === SHELL_CACHE ? caches.has(cacheName) : Promise.resolve(true)).then(function (ok) {
    if (ok) return caches.open(cacheName).then(function (c) { return c.put(req, copy); });
  }).catch(noop);
}

self.addEventListener('install', function (event) {
  // cache: 'reload' skips the browser's HTTP cache so a new version never precaches old files.
  event.waitUntil(caches.open(SHELL_CACHE).then(function (cache) {
    return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  // Older app versions are removed; the runtime cache (files stored when first used) is kept.
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('waitbook-') === 0 && k !== SHELL_CACHE && k !== RUNTIME_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party: straight to the network, never cached here
  if (req.mode === 'navigate') {
    var isApp = url.pathname === SCOPE || url.pathname === SCOPE + 'index.html';
    event.respondWith(fetch(req).then(function (res) {
      if (isApp && /^text\/html\b/i.test(res.headers.get('content-type') || '')) event.waitUntil(Promise.resolve(keep(SHELL_CACHE, 'index.html', res)));
      return res;
    }).catch(function () {
      return caches.match('index.html', { cacheName: SHELL_CACHE }).then(function (hit) { return hit || caches.match('index.html'); });
    }));
    return;
  }
  // Stale-while-revalidate: answer from the cache at once (works offline) and refresh the copy in the background, so
  // a newly deployed file is used on the next visit even if this worker's version did not change.
  var target = IN_SHELL[url.pathname] ? SHELL_CACHE : RUNTIME_CACHE;
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var refresh = fetch(req).then(function (res) { var p = keep(target, req, res); if (p) event.waitUntil(p); return res; });
    if (hit) { event.waitUntil(refresh.catch(noop)); return hit; }
    return refresh;
  }));
});

/** Fetch files that are not stored yet into the runtime cache, a few at a time. Only the app's own folders. */
function warm(list) {
  var seen = {}, todo = [];
  list.forEach(function (u) {
    var abs;
    try { abs = new URL(u, self.location); } catch (e) { return; }
    if (abs.origin !== self.location.origin || abs.pathname.indexOf(SCOPE) !== 0) return;
    if (!/^(vendor|data|i18n|css|js|img)\/[A-Za-z0-9._@\/-]+$/.test(abs.pathname.slice(SCOPE.length))) return;
    if (seen[abs.pathname]) return;
    seen[abs.pathname] = true;
    todo.push(abs.origin + abs.pathname);
  });
  function next() {
    var u = todo.shift();
    if (!u) return Promise.resolve();
    return caches.match(u).then(function (hit) {
      if (hit) return;
      return fetch(u).then(function (res) { return keep(IN_SHELL[new URL(u).pathname] ? SHELL_CACHE : RUNTIME_CACHE, u, res); });
    }).catch(noop).then(next);
  }
  return Promise.all([next(), next(), next()]);
}

self.addEventListener('message', function (event) {
  var d = event.data || {};
  if (d.type !== 'warm') return;
  var conn = self.navigator && self.navigator.connection;
  var list = conn && conn.saveData ? [] : WARM.slice();
  if (Array.isArray(d.urls)) list = list.concat(d.urls.slice(0, 400).filter(function (u) { return typeof u === 'string'; }));
  event.waitUntil(warm(list));
});
