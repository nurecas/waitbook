#!/usr/bin/env node
// Rebuilds vendor/ from pinned upstream releases. Run: node tools/vendor.mjs
// Everything the app needs at run time is copied into the repository so it works offline and from file://.
// npm tarballs are checked against the registry's published sha512; glyphs come from a pinned commit.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBytes, npmPackage } from './lib/fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = (p) => join(ROOT, 'vendor', p);

const PACKAGES = [
  {
    name: 'maplibre-gl', version: '5.24.1',
    integrity: 'sha512-HyiYBwtsbk3L1n1EPLJHWqdoyMiF80n7tEYXFZyu2m1TjvaNx6KMLiFeDdmszt1/mq2zvsR1TJuX/NMu5BonXQ==',
    files: { 'package/dist/maplibre-gl.js': 'maplibre/maplibre-gl.js', 'package/dist/maplibre-gl.css': 'maplibre/maplibre-gl.css', 'package/LICENSE.txt': 'maplibre/LICENSE.txt' },
  },
  {
    name: 'pmtiles', version: '4.5.0',
    integrity: 'sha512-CBeD4SoUluFziGdy/8k7FOjQxQy486n+929W/tWophauvMICpkZ26vGBWhDt/6b1FZQWNaf4jFdT/5+q0Wii5w==',
    files: { 'package/dist/pmtiles.js': 'pmtiles/pmtiles.js' },
    license: 'https://raw.githubusercontent.com/protomaps/PMTiles/main/LICENSE',
  },
  {
    name: '@protomaps/basemaps', version: '5.7.2',
    integrity: 'sha512-K1Yk6bWdULulYg+R2QRVXx4NzJZan5YQhpejEG0c1/sXruJrfPIPZuakpf3jwAgVmjIRVQwAv+yRafDeN0aaUQ==',
    files: { 'package/dist/basemaps.js': 'basemaps/basemaps.js' },
    license: 'https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE.md',
  },
  {
    name: '@mapbox/mapbox-gl-rtl-text', version: '0.3.0',
    integrity: 'sha512-OwQplFqAAEYRobrTKm2wiVP+wcpUVlgXXiUMNQ8tcm5gPN5SQRXFADmITdQOaec4LhDhuuFchS7TS8ua8dUl4w==',
    files: { 'package/dist/mapbox-gl-rtl-text.js': 'maplibre/mapbox-gl-rtl-text.js', 'package/LICENSE.md': 'maplibre/RTL-LICENSE.md' },
  },
  {
    name: '@fontsource-variable/sofia-sans', version: '5.3.0',
    integrity: 'sha512-lVLpBgrjxSMjrrBF70Jr9qBLdFac5tDAvVn9oHlS+vAaVyhUN6dWmr0nNjWzwTh6tYIECP45h4zDfllQbXtqtA==',
    files: Object.fromEntries(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek'].map((s) => [`package/files/sofia-sans-${s}-wght-normal.woff2`, `fonts/sofia-sans-${s}.woff2`]).concat([['package/LICENSE', 'fonts/OFL-sofia-sans.txt']])),
  },
  {
    name: '@fontsource-variable/sofia-sans-condensed', version: '5.3.0',
    integrity: 'sha512-pfyjEn5plOBRtnQqXMDVR49QSdP9hYzgUi7J0w1bW5UG01MqQO8WGT9xdbPSt0+eZ6zrmaNzmk8QKUSkVltGMg==',
    files: Object.fromEntries(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek'].map((s) => [`package/files/sofia-sans-condensed-${s}-wght-normal.woff2`, `fonts/sofia-sans-condensed-${s}.woff2`]).concat([['package/LICENSE', 'fonts/OFL-sofia-sans-condensed.txt']])),
  },
  {
    name: '@fontsource-variable/martian-mono', version: '5.3.0',
    integrity: 'sha512-0wVODx9ILwNnaYC4XCuSaFRYtj1Prd89MRVaSuv2ng6zLiQkS4SepaWEPefs7vqCZS8sbEOA8jb/4F5KNMnGdg==',
    files: Object.fromEntries(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'].map((s) => [`package/files/martian-mono-${s}-standard-normal.woff2`, `fonts/martian-mono-${s}.woff2`]).concat([['package/LICENSE', 'fonts/OFL-martian-mono.txt']])),
  },
  {
    name: '@fontsource/big-shoulders-stencil-display', version: '5.3.0',
    integrity: 'sha512-xZfOmq5/66j90rw2SipYr1skJUDrDBCcCZZY8aNU3oDpvqzHjcA1KADdl/4AMZNs7aPc61KbV5P696ggmF81Tw==',
    files: { 'package/files/big-shoulders-stencil-display-latin-800-normal.woff2': 'fonts/stencil-800.woff2', 'package/LICENSE': 'fonts/OFL-big-shoulders.txt' },
  },
];

// Protomaps basemap glyphs (Noto Sans, OFL) at a pinned commit. We keep every 256-codepoint range below U+3000
// (Latin, Greek, Cyrillic, Armenian, Hebrew, Arabic, Indic, Thai, Georgian, Ethiopic, ...), the Arabic
// presentation forms the RTL plugin shapes into, and half/full-width forms. CJK ideographs and Hangul are drawn
// by MapLibre from the device's own fonts (localIdeographFontFamily), so those large ranges are not shipped.
const GLYPH_COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const GLYPH_FONTS = { 'Noto Sans Regular': 'regular', 'Noto Sans Medium': 'medium' };
const GLYPH_STARTS = [];
for (let s = 0; s < 0x3000; s += 256) GLYPH_STARTS.push(s);
GLYPH_STARTS.push(0xfb00, 0xfc00, 0xfd00, 0xfe00, 0xff00);
const SPRITES = ['light', 'light@2x', 'dark', 'dark@2x', 'black', 'black@2x'];

async function main() {
  await rm(join(ROOT, 'vendor'), { recursive: true, force: true });
  for (const pkg of PACKAGES) {
    const files = await npmPackage(pkg);
    for (const [from, to] of Object.entries(pkg.files)) {
      const buf = files.get(from);
      if (!buf) throw new Error(`${pkg.name}@${pkg.version} has no ${from}`);
      await mkdir(dirname(V(to)), { recursive: true });
      await writeFile(V(to), buf);
      console.log(`${String(buf.length).padStart(9)}  vendor/${to}`);
    }
    if (pkg.license) {
      const dir = dirname(Object.values(pkg.files)[0]);
      await writeFile(V(`${dir}/LICENSE`), await fetchBytes(pkg.license));
    }
  }
  const raw = (p) => `https://raw.githubusercontent.com/protomaps/basemaps-assets/${GLYPH_COMMIT}/${p.split('/').map(encodeURIComponent).join('/')}`;
  const ranges = [];
  for (const [font, slug] of Object.entries(GLYPH_FONTS)) {
    let total = 0;
    await mkdir(V(`glyphs/${slug}`), { recursive: true });
    for (const s of GLYPH_STARTS) {
      const name = `${s}-${s + 255}.pbf`;
      const buf = await fetchBytes(raw(`fonts/${font}/${name}`), { maxBytes: 4 * 2 ** 20 });
      await writeFile(V(`glyphs/${slug}/${name}`), buf);
      total += buf.length;
      if (slug === 'regular') ranges.push(s);
    }
    console.log(`${String(total).padStart(9)}  vendor/glyphs/${slug}/ (${GLYPH_STARTS.length} ranges)`);
  }
  await writeFile(V('glyphs/OFL.txt'), await fetchBytes(raw('fonts/OFL.txt')));
  await mkdir(V('sprites'), { recursive: true });
  for (const s of SPRITES) {
    for (const ext of ['json', 'png']) {
      const buf = await fetchBytes(raw(`sprites/v4/${s}.${ext}`), { maxBytes: 4 * 2 ** 20 });
      await writeFile(V(`sprites/${s}.${ext}`), buf);
    }
  }
  // The list of shipped glyph ranges, so the map can answer missing ranges with an empty glyph set
  // instead of a failed request.
  await writeFile(V('glyphs/ranges.js'), `// Generated by tools/vendor.mjs\nself.WB_GLYPH_RANGES = ${JSON.stringify(ranges)};\n`);
  console.log('vendor/ rebuilt');
}

main().catch((e) => { console.error(e); process.exit(1); });
