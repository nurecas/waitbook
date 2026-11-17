#!/usr/bin/env node
// Offline behaviour:
//  1. After one online visit, the service worker serves the app with the network off: every screen, the map viewer
//     (stored in the background, never opened online), every language; a 404 never replaces the app; an update keeps
//     the files stored on first use.
//  2. index.html opened straight from disk (file://, e.g. a USB stick) works without a server.
//  3. Strict offline makes no request to any other site, even on screens that normally look things up.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockLiveApis, seedKit } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/';

const problems = [];
const browser = await chromium.launch();

// 1. Service worker, against a small local server whose worker version can be changed (to imitate a deploy).
{
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.pbf': 'application/x-protobuf' };
  let swVersion = null;
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }
    try {
      let body = await readFile(file);
      if (p === '/sw.js' && swVersion) body = Buffer.from(body.toString().replace(/var VERSION = '[^']*';/, `var VERSION = '${swVersion}';`));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>Error response 404</h1>'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const site = `http://127.0.0.1:${server.address().port}/`;
  const cached = (page, path) => page.evaluate(async (u) => !!(await caches.match(new URL(u, location.href).href)), path);
  // page.waitForFunction does not wait for a promise, so poll.
  const until = async (page, fn, ms = 30000) => {
    for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(300)) if (await page.evaluate(fn).catch(() => false)) return true;
    return false;
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockLiveApis(ctx);
  const page = await ctx.newPage();
  await page.goto(site);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  // The map viewer and the Kiwix snapshot are fetched in the background without opening those screens.
  const warmed = await until(page, async () => !!(await caches.match(new URL('data/kiwix-snapshot.js', location.href).href)) && !!(await caches.match(new URL('vendor/maplibre/maplibre-gl.js', location.href).href)) && !!(await caches.match(new URL('vendor/glyphs/medium/0-255.pbf', location.href).href)));
  if (!warmed) problems.push('warm-up: map viewer or snapshot not stored in the background');
  // A page that does not exist must not replace the stored app.
  await page.goto(site + 'no-such-page');
  // A new version is deployed: the app shell is replaced, files stored on first use are kept.
  swVersion = 'waitbook-test-2';
  await page.goto(site);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  const updated = await until(page, async () => { const k = await caches.keys(); return k.includes('waitbook-shell-test-2') && !k.some((x) => x.startsWith('waitbook-shell-') && x !== 'waitbook-shell-test-2'); });
  if (!updated) problems.push('update: new version did not take over');
  await page.waitForTimeout(1500); // let the old worker finish anything in flight
  const names = await page.evaluate(() => caches.keys());
  if (names.some((x) => x.startsWith('waitbook-shell-') && x !== 'waitbook-shell-test-2')) problems.push('update: an old shell cache came back: ' + names.join(', '));
  if (!(await cached(page, 'vendor/maplibre/maplibre-gl.js'))) problems.push('update: map viewer was dropped from the cache');
  if (!(await cached(page, 'i18n/ar.js'))) problems.push('update: dictionaries are not precached');

  await ctx.setOffline(true);
  for (const r of ['', '#/', '#/library/water', '#/cards/water', '#/kit', '#/map', '#/kiwix?q=wikimed']) {
    await page.goto(site + r);
    await page.waitForTimeout(r === '#/map' || r.startsWith('#/kiwix') ? 1500 : 300);
    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
    if (!h1) problems.push(`offline ${r || 'start page'}: nothing rendered (${(await page.locator('body').innerText().catch(() => '')).slice(0, 40)})`);
  }
  const outline = await page.goto(site + '#/map').then(() => page.waitForTimeout(1500)).then(() => page.evaluate(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? c.width : 0; }));
  if (!outline) problems.push('offline: map did not start from cache (never opened online)');
  const status = await page.locator('#netStatus').innerText();
  if (!/offline/i.test(status)) problems.push('offline: status does not say offline (' + status + ')');
  // Switching language works offline (every dictionary is stored).
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wb.settings.v1') || '{}'); s.lang = 'ar'; localStorage.setItem('wb.settings.v1', JSON.stringify(s)); });
  await page.goto(site + '#/');
  await page.reload();
  await page.waitForTimeout(500);
  const ar = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, text: document.querySelector('main h1') ? document.querySelector('main h1').innerText : '' }));
  if (ar.lang !== 'ar' || ar.dir !== 'rtl' || !/[؀-ۿ]/.test(ar.text)) problems.push('offline: switching to Arabic did not work (' + JSON.stringify(ar) + ')');
  console.log('service worker offline, update and warm-up: checked');
  await ctx.close();
  server.close();
}

// 2. file://
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = pathToFileURL(join(ROOT, 'index.html')).href;
  for (const r of ['#/', '#/library/health', '#/item/wikimed', '#/cards/bleeding', '#/pack?step=4']) {
    await page.goto(url + r);
    await page.waitForTimeout(400);
    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
    if (!h1) problems.push(`file:// ${r}: nothing rendered`);
  }
  if (errors.length) problems.push('file:// page errors: ' + errors.join(' | '));
  console.log('file:// launch: checked');
  await ctx.close();
}

// 3. Strict offline: no request leaves the app's own origin.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockLiveApis(ctx);
  const page = await ctx.newPage();
  await seedKit(page, base, { strict: true });
  const outside = [];
  page.on('request', (req) => { if (!req.url().startsWith(base) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) outside.push(req.url()); });
  for (const r of ['#/', '#/kiwix?q=medicine', '#/kit', '#/item/gemma4-e2b', '#/map', '#/library']) { await page.goto(base + r); await page.waitForTimeout(r === '#/map' ? 1500 : 500); }
  if (outside.length) problems.push('strict offline still contacted: ' + [...new Set(outside)].join(', '));
  console.log('strict offline: checked');
  await ctx.close();
}

await browser.close();
if (problems.length) { console.log('\n' + problems.join('\n')); process.exit(1); }
console.log('\nOffline behaviour is correct.');
