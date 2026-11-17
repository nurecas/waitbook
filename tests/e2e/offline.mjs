#!/usr/bin/env node
// Offline behaviour:
//  1. After one online visit, the service worker serves the app with the network off.
//  2. index.html opened straight from disk (file://, e.g. a USB stick) works without a server.
//  3. Strict offline makes no request to any other site, even on screens that normally look things up.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockLiveApis, seedKit } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/';

const problems = [];
const browser = await chromium.launch();

// 1. Service worker
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockLiveApis(ctx);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (const r of ['#/map', '#/kiwix']) { await page.goto(base + r); await page.waitForTimeout(1500); } // cache on-demand files
  await ctx.setOffline(true);
  for (const r of ['#/', '#/library/water', '#/cards/water', '#/kit', '#/map', '#/kiwix?q=wikimed']) {
    await page.goto(base + r);
    await page.waitForTimeout(r === '#/map' || r.startsWith('#/kiwix') ? 1500 : 300);
    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
    if (!h1) problems.push(`offline ${r}: nothing rendered`);
  }
  const outline = await page.goto(base + '#/map').then(() => page.waitForTimeout(1500)).then(() => page.evaluate(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? c.width : 0; }));
  if (!outline) problems.push('offline: map did not start from cache');
  const status = await page.locator('#netStatus').innerText();
  if (!/offline/i.test(status)) problems.push('offline: status does not say offline (' + status + ')');
  console.log('service worker offline: checked');
  await ctx.close();
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
