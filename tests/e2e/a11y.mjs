#!/usr/bin/env node
// Accessibility audit with axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every screen, in each theme, and in a
// right-to-left language. Also checks keyboard focus lands on the page heading after navigation.
//   node tests/e2e/a11y.mjs [baseURL] [--axe path/to/axe.min.js]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mockLiveApis, seedKit } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/';
let axePath = args.includes('--axe') ? args[args.indexOf('--axe') + 1] : process.env.AXE_PATH;
if (!axePath) { try { axePath = require.resolve('axe-core/axe.min.js'); } catch { /* not installed */ } }
if (!axePath || !existsSync(axePath)) { console.error('axe-core not found: npm install axe-core, or pass --axe'); process.exit(2); }

const ROUTES = ['#/', '#/library', '#/item/wikipedia', '#/item/kiwix-maps', '#/pack', '#/pack?step=2', '#/pack?step=3', '#/pack?step=4', '#/kit', '#/kit?tab=checklist', '#/kit?tab=script', '#/kit?tab=share', '#/cards', '#/cards/burns', '#/map', '#/apps', '#/settings', '#/kiwix'];
const RUNS = (process.env.A11Y_RUNS || 'paper:en,dark:en,night:en,paper:ar').split(',').map((s) => ({ theme: s.split(':')[0], lang: s.split(':')[1] }));

const browser = await chromium.launch();
let failures = 0;
for (const run of RUNS) {
  // bypassCSP only so the test can inject axe; the app itself runs under its normal strict CSP.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: run.theme === 'dark' ? 'dark' : 'light', bypassCSP: true, serviceWorkers: 'block' });
  await mockLiveApis(ctx);
  const page = await ctx.newPage();
  await seedKit(page, base, { theme: run.theme, lang: run.lang });
  for (const r of ROUTES) {
    await page.goto(base + r);
    await page.waitForTimeout(r.startsWith('#/map') || r.startsWith('#/kiwix') ? 1500 : 300);
    await page.addScriptTag({ path: axePath });
    const res = await page.evaluate(async () => {
      // Map tiles are drawn on a canvas; MapLibre's own controls are third-party and checked separately.
      const out = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, exclude: [['.maplibregl-ctrl-attrib']] });
      return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + (n.any[0] ? ' — ' + n.any[0].message : '')) }));
    });
    const dir = await page.evaluate(() => document.documentElement.dir);
    if (run.lang === 'ar' && dir !== 'rtl') { console.log(`FAIL ${run.theme}/${run.lang} ${r}: page is not right-to-left`); failures++; }
    if (res.length) {
      failures += res.length;
      console.log(`FAIL ${run.theme}/${run.lang} ${r}`);
      res.forEach((v) => console.log(`  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`));
    } else console.log(`ok   ${run.theme}/${run.lang} ${r}`);
  }
  // Keyboard: after following a link, focus should be on the new page's heading.
  await page.goto(base + '#/');
  await page.locator('a[href="#/library"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  if (focused !== 'H1') { console.log(`FAIL ${run.theme}/${run.lang}: focus after navigation is on ${focused}, not the heading`); failures++; }
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} accessibility problem(s).` : '\nNo accessibility violations found.');
process.exit(failures ? 1 : 0);
