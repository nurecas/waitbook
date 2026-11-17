#!/usr/bin/env node
// Renders img/icon.svg into the PNG icons browsers and phones ask for. Needs Playwright with Chromium.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(ROOT, 'img/icon.svg'), 'utf8');
// Maskable: square, full-bleed paper, artwork inside the central safe zone (80%).
const maskable = svg.replace('rx="104"', 'rx="0"').replace(/<g /, '<g transform="translate(51 51) scale(.8)" ').replace(/<path d="M150/, '<path transform="translate(51 51) scale(.8)" d="M150');
// Apple touch icon: square, no transparency (iOS rounds the corners itself).
const square = svg.replace('rx="104"', 'rx="0"');
const jobs = [['icon-192.png', svg, 192], ['icon-512.png', svg, 512], ['icon-maskable-512.png', maskable, 512], ['apple-touch-icon.png', square, 180]];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, src, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.locator('svg').screenshot({ path: join(ROOT, 'img', name), omitBackground: true });
  console.log('img/' + name);
}
await browser.close();
