#!/usr/bin/env node
// Refreshes what Waitbook knows about the Kiwix library.
//   node tools/refresh-kiwix.mjs                 # fetch the live catalog from opds.library.kiwix.org
//   node tools/refresh-kiwix.mjs --from feed.xml # use a saved OPDS feed instead
//   add --strict to exit non-zero when a curated name is missing from the catalog,
//   and --missing FILE to write the missing names (one per line) for a report
// Names that are missing are recorded in kiwix-known.js too, so the app can mark those items as withdrawn.
// Writes:
//   data/kiwix-known.js     small: facts for every Kiwix file the curated catalog can point to (loaded at start)
//   data/kiwix-snapshot.js  full: every book in the library, for the offline Kiwix explorer (loaded on demand)

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText } from './lib/fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
require(join(ROOT, 'data/countries.js'));
require(join(ROOT, 'js/core/util.js'));
const opds = require(join(ROOT, 'js/core/opds.js'));
const catalog = require(join(ROOT, 'js/core/catalog.js'));
require(join(ROOT, 'data/catalog.js'));
const U = globalThis.WB.util;

const args = process.argv.slice(2);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const strict = args.includes('--strict');
const missingOut = args.includes('--missing') ? args[args.indexOf('--missing') + 1] : null;

// Kiwix map archives for groups of countries, used when a country has no map of its own.
const MAP_GROUPS = {
  africa: 'maps_en_africa', europe: 'maps_en_europe', asia: 'maps_en_asia', 'north-america': 'maps_en_north-america',
  'central-america': 'maps_en_central-america', 'south-america': 'maps_en_south-america', oceania: 'maps_en_australia-oceania',
};
// Map archives that cover several countries, or whose slug differs from the English country name.
const MAP_OVERRIDES = {
  CD: 'congo-democratic-republic-kinshasa', CG: 'congo-republic-brazzaville', CI: 'ivory-coast', KP: 'north-korea',
  KR: 'south-korea', RU: 'russia', US: 'united-states-of-america', GB: 'united-kingdom', MM: 'myanmar-burma',
  MK: 'macedonia', SZ: 'swaziland', TL: 'east-timor', CZ: 'czech-republic', BA: 'bosnia-herzegovina',
  IL: 'israel-and-palestine', PS: 'israel-and-palestine', HT: 'haiti-and-dominican-republic', DO: 'haiti-and-dominican-republic',
  SN: 'senegal-and-gambia', GM: 'senegal-and-gambia', MY: 'malaysia-singapore-and-brunei', SG: 'malaysia-singapore-and-brunei',
  BN: 'malaysia-singapore-and-brunei', BH: 'gcc-states', KW: 'gcc-states', OM: 'gcc-states', QA: 'gcc-states', SA: 'gcc-states',
  AE: 'gcc-states', GG: 'guernsey-and-jersey', JE: 'guernsey-and-jersey', FM: 'micronesia', CV: 'cape-verde', KM: 'comores',
  WF: 'wallis-et-futuna', CP: 'ile-de-clipperton', PN: 'pitcairn-islands', FO: 'faroe-islands', IM: 'isle-of-man',
  IC: 'canary-islands', ID: 'indonesia-with-east-timor', VN: 'vietnam', LA: 'laos', IR: 'iran', SY: 'syria', TZ: 'tanzania',
  BO: 'bolivia', VE: 'venezuela', MD: 'moldova', XK: 'kosovo', TW: 'taiwan', LY: 'libya', BS: 'bahamas',
};

const slugify = (s) => U.fold(s).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function loadFeed() {
  if (from) return readFile(from, 'utf8');
  return fetchText(opds.entriesUrl({ count: -1 }), { maxBytes: 256 * 2 ** 20, timeoutMs: 180000 });
}

function patternRegex(p) {
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{lang\\}', '(?<lang>[a-z]{2,3}(?:-[a-z0-9]+)*)')
    .replace('\\{flavour\\}', '(?<flavour>maxi|nopic|mini)')
    .replace('\\{region\\}', '(?<region>[a-z0-9-]+)');
  return new RegExp('^' + esc + '$');
}

async function main() {
  const feed = opds.parseFeed(await loadFeed());
  if (!feed.entries.length) throw new Error('no entries parsed');
  const byStem = new Map(feed.entries.map((e) => [e.stem, e]));
  catalog.init({ catalog: globalThis.WB_CATALOG, kiwix: {} });
  const refs = catalog.allKiwixRefs();

  const files = {};
  const patterns = {};
  const missing = [];
  const dirs = [];
  const names = {}; // stem -> catalog <name>, only where it is not simply the stem without its flavour
  const keep = (e) => {
    let di = dirs.indexOf(e.dir);
    if (di === -1) { dirs.push(e.dir); di = dirs.length - 1; }
    files[e.stem] = [e.date, e.size, e.lang.join(','), di];
    if (e.name && e.name !== opds.splitStem(e.stem).name) names[e.stem] = e.name;
  };

  for (const ref of refs) {
    if (ref.startsWith('regions:')) continue;
    if (!catalog.isPattern(ref)) {
      const e = byStem.get(ref);
      if (e) keep(e); else missing.push(ref);
      continue;
    }
    if (ref.includes('{region}')) continue;
    const re = patternRegex(ref);
    const idx = {};
    for (const e of feed.entries) {
      const m = re.exec(e.stem);
      if (!m) continue;
      const code = m.groups.lang || '';
      const flavour = m.groups.flavour || '';
      const lang = U.lang1(e.lang[0] || code);
      idx[code] = idx[code] || { l: lang, f: [] };
      if (flavour && !idx[code].f.includes(flavour)) idx[code].f.push(flavour);
      keep(e);
    }
    if (!Object.keys(idx).length) missing.push(ref);
    patterns[ref] = idx;
  }

  // Country -> map archive.
  const regions = {};
  const mapStems = new Map(feed.entries.filter((e) => e.dir === 'maps').map((e) => [e.stem.replace(/^maps_en_/, ''), e]));
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const [iso, c] of Object.entries(globalThis.WB_COUNTRIES)) {
    let slug = MAP_OVERRIDES[iso];
    if (!slug || !mapStems.has(slug)) {
      let name = '';
      try { name = names.of(iso); } catch { /* unknown code */ }
      slug = slugify(name);
    }
    if (mapStems.has(slug)) {
      regions[iso] = 'maps_en_' + slug;
    } else if (c.g && MAP_GROUPS[c.g] && mapStems.has(MAP_GROUPS[c.g].replace('maps_en_', ''))) {
      regions[iso] = MAP_GROUPS[c.g];
    }
  }
  for (const [g, stem] of Object.entries(MAP_GROUPS)) if (mapStems.has(stem.replace('maps_en_', ''))) regions['@' + g] = stem;
  if (mapStems.has('all')) regions['@world'] = 'maps_en_all';
  for (const stem of new Set(Object.values(regions))) keep(byStem.get(stem));

  const updated = (feed.updated || '').slice(0, 10) || U.todayStamp();
  const source = from ? `saved OPDS feed (${updated})` : `opds.library.kiwix.org (${updated})`;
  await writeFile(join(ROOT, 'data/kiwix-known.js'),
    `// Generated by tools/refresh-kiwix.mjs from ${source}. Do not edit by hand.\n` +
    `// files: stem -> [date, bytes, languages (ISO 639-3), index into dirs]; patterns: catalog pattern -> name code -> {l, f: flavours};\n` +
    `// regions: ISO country (or @group) -> map archive stem.\n` +
    `// names: stem -> catalog <name> where it differs from the stem; missing: curated names the catalog no longer has.\n` +
    `self.WB_KIWIX_KNOWN = ${JSON.stringify({ updated, source, dirs, files, patterns, regions, names, missing })};\n`);

  const rows = feed.entries.map((e) => [e.stem, e.date, e.dir, e.lang.join(','), e.size, e.title, e.category, e.articles, e.summary.slice(0, 160)]);
  await writeFile(join(ROOT, 'data/kiwix-snapshot.js'),
    `// Generated by tools/refresh-kiwix.mjs from ${source}. Do not edit by hand.\n` +
    `// rows: [stem, date, dir, languages (ISO 639-3), bytes, title, category, articles, summary]\n` +
    `self.WB_KIWIX_SNAPSHOT = ${JSON.stringify({ updated, source, rows })};\n`);

  const nKnown = Object.keys(files).length;
  console.log(`${feed.entries.length} books in the catalog; ${nKnown} files known to the curated catalog; ${Object.keys(regions).length} region maps`);
  if (missingOut) await writeFile(missingOut, missing.map((m) => m + '\n').join(''));
  if (missing.length) {
    console.log('Curated names not found in the catalog:\n  ' + missing.join('\n  '));
    if (strict) process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
