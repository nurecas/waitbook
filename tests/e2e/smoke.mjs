#!/usr/bin/env node
// Loads every screen in Chromium and fails on console errors, page errors or untranslated keys.
//   node tests/e2e/smoke.mjs [baseURL] [--shots DIR] [--lang xx] [--device "iPhone 15"]
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Serve the three live APIs from fixtures, so tests never touch the network. Exported for other tests. */
export async function mockLiveApis(ctx) {
  const feed = await readFile(join(FIX, 'opds-sample.xml'), 'utf8');
  const head = feed.split('<entry>')[0];
  const entries = feed.split('<entry>').slice(1).map((e) => '<entry>' + e.split('</entry>')[0] + '</entry>');
  await ctx.route('https://opds.library.kiwix.org/**', (route) => {
    const u = new URL(route.request().url());
    const name = u.searchParams.get('name');
    const q = (u.searchParams.get('q') || '').toLowerCase();
    const hits = entries.filter((e) => (!name || e.includes('<name>' + name + '</name>')) && (!q || e.toLowerCase().includes(q)));
    const body = head.replace(/<totalResults>\d+/, '<totalResults>' + hits.length) + hits.join('\n') + '\n</feed>';
    route.fulfill({ status: 200, contentType: 'application/atom+xml', headers: { 'access-control-allow-origin': '*' }, body });
  });
  await ctx.route('https://build-metadata.protomaps.dev/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await readFile(join(FIX, 'builds.json'), 'utf8') }));
  await ctx.route('https://huggingface.co/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await readFile(join(FIX, 'hf-tree.json'), 'utf8') }));
}

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/';
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const deviceName = args.includes('--device') ? args[args.indexOf('--device') + 1] : null;

const ROUTES = ['#/', '#/library', '#/library/health', '#/item/wikipedia', '#/item/kiwix-maps', '#/item/libretexts', '#/item/gemma4-e2b',
  '#/item/kiwix-installers', '#/item/pmtiles-area', '#/pack', '#/pack?step=2', '#/pack?step=3', '#/pack?step=4', '#/kit', '#/kit?tab=checklist',
  '#/kit?tab=script', '#/kit?tab=manager', '#/kit?tab=share', '#/cards', '#/cards/bleeding', '#/map', '#/apps', '#/settings', '#/kiwix', '#/kiwix?q=medicine'];

const KEY_RE = /\b(?:nav|home|kit|lib|item|pack|kx|kxcat|cards|map|apps|need|link|settings|shelf|kind|prio|ed|lang|size|ledger|row|os|device|region|foot|net|theme|a11y|error|app)\.[A-Za-z0-9_.-]+\b/g;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...(deviceName ? devices[deviceName] : { viewport: { width: 1280, height: 900 } }), locale: lang });
await mockLiveApis(ctx);
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
if (shots) await mkdir(shots, { recursive: true });

// Seed a kit through the real wizard so kit screens have content.
await page.goto(base + '#/');
await page.evaluate((l) => localStorage.setItem('wb.settings.v1', JSON.stringify({ lang: l })), lang);
await page.goto(base + '#/pack?step=4');
await page.waitForTimeout(400);
const useBtn = page.locator('.wizard-nav, main').locator('button.btn-primary').first();
if (await useBtn.count()) await useBtn.click();
await page.waitForTimeout(300);

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
console.log('\nAll screens rendered cleanly.');
