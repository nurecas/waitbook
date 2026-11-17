#!/usr/bin/env node
// Loads every screen in Chromium and fails on console errors, page errors or untranslated keys.
//   node tests/e2e/smoke.mjs [baseURL] [--shots DIR] [--lang xx] [--device "iPhone 15"]
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { mockLiveApis, seedKit } from './lib.mjs';
const require = createRequire(import.meta.url);
const playwright = require('playwright');
const { devices } = playwright;
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/';
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const deviceName = args.includes('--device') ? args[args.indexOf('--device') + 1] : null;
const browserName = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : 'chromium';

const ROUTES = ['#/', '#/library', '#/library/health', '#/item/wikipedia', '#/item/kiwix-maps', '#/item/libretexts', '#/item/gemma4-e2b',
  '#/item/kiwix-installers', '#/item/pmtiles-area', '#/pack', '#/pack?step=2', '#/pack?step=3', '#/pack?step=4', '#/kit', '#/kit?tab=checklist',
  '#/kit?tab=script', '#/kit?tab=manager', '#/kit?tab=share', '#/cards', '#/cards/bleeding', '#/map', '#/apps', '#/settings', '#/kiwix', '#/kiwix?q=medicine'];

const KEY_RE = /\b(?:nav|home|kit|lib|item|pack|kx|kxcat|cards|map|apps|need|link|settings|shelf|kind|prio|ed|lang|size|ledger|row|os|device|region|foot|net|theme|a11y|error|app)\.[A-Za-z0-9_.-]+\b/g;

const browser = await playwright[browserName].launch();
const dev = deviceName ? { ...devices[deviceName] } : { viewport: { width: 1280, height: 900 } };
if (browserName === 'firefox') delete dev.isMobile; // Firefox has no mobile emulation
delete dev.defaultBrowserType;
// Service workers are blocked here: Playwright cannot route requests that pass through one in every browser, and
// the live APIs must come from fixtures. tests/e2e/offline.mjs covers the service worker.
const ctx = await browser.newContext({ ...dev, locale: lang, serviceWorkers: 'block' });
await mockLiveApis(ctx);
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
if (shots) await mkdir(shots, { recursive: true });

await seedKit(page, base, { lang });

for (const r of ROUTES) {
  const before = problems.length;
  await page.goto(base + r);
  await page.waitForTimeout(r.startsWith('#/map') || r.startsWith('#/kiwix') ? 1800 : 350);
  const text = await page.evaluate(() => document.body.innerText);
  const keys = [...new Set((text.match(KEY_RE) || []).filter((k) => !/\.(zim|pdf|org|com|net|gov|html|json|txt|sh|ps1|pmtiles|apk|exe|dmg|gguf)$/.test(k)))];
  if (keys.length) problems.push(`${r}: untranslated ${keys.join(', ')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`${r}: horizontal overflow ${overflow}px`);
  if (shots) await page.screenshot({ path: `${shots}/${r.replace(/[#/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home'}.png`, fullPage: false });
  console.log(`${problems.length > before ? 'FAIL' : 'ok  '} ${r}`);
}
await browser.close();
if (problems.length) { console.log('\n' + problems.join('\n')); process.exit(1); }
console.log(`\nAll screens rendered cleanly (${browserName}${deviceName ? ', ' + deviceName : ''}, ${lang}).`);
