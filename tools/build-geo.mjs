#!/usr/bin/env node
// Builds data/countries.js (country -> suggested languages + main bounding box) and data/world.js (a light
// world outline for the map viewer). Run: node tools/build-geo.mjs
// Sources: Unicode CLDR territory data (cldr-core, Unicode licence) and Natural Earth admin-0 countries
// (public domain), both pinned.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, npmPackage } from './lib/fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/';
const CLDR = { name: 'cldr-core', version: '49.0.0', integrity: 'sha512-2Z2dYeDO95AbKIG9dIUdZy6DD4f0hhHjTYnaHZj/9JTQ82pX5EsJlCs2BXPWi4vd1d98MwotOivh4Uthxwri4A==' };

const isoOf = (p) => [p.ISO_A2_EH, p.ISO_A2, p.WB_A2].find((v) => v && /^[A-Z]{2}$/.test(v));

function polygonsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function bboxOf(rings) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of rings[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

const area = ([w, s, e, n]) => (e - w) * (n - s);
const gap = (a, b) => Math.max(0, a[0] - b[2], b[0] - a[2]) + Math.max(0, a[1] - b[3], b[1] - a[3]);

// Main bounding box: the largest polygon plus any polygon within ~8 degrees of the growing box. This keeps a
// country's mainland and nearby islands, and drops far-away territories (e.g. French Guiana for France).
// Boxes that would wrap the antimeridian are computed in 0..360 longitude and returned with west > east.
function mainBox(geom) {
  const boxes = polygonsOf(geom).map(bboxOf);
  if (!boxes.length) return null;
  boxes.sort((a, b) => area(b) - area(a));
  const grow = (list) => {
    let box = list[0].slice();
    let changed = true;
    const used = new Set([0]);
    while (changed) {
      changed = false;
      list.forEach((b, i) => {
        if (used.has(i) || gap(box, b) > 8) return;
        used.add(i);
        box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])];
        changed = true;
      });
    }
    return box;
  };
  let box = grow(boxes);
  const touchesEdge = boxes.some((b) => b[0] <= -179.5) && boxes.some((b) => b[2] >= 179.5);
  if (touchesEdge) {
    const shifted = boxes.map(([w, s, e, n]) => (e < 0 ? [w + 360, s, e + 360, n] : [w, s, e, n]));
    const alt = grow(shifted);
    if (alt[2] - alt[0] < box[2] - box[0]) box = [alt[0] > 180 ? alt[0] - 360 : alt[0], alt[1], alt[2] > 180 ? alt[2] - 360 : alt[2], alt[3]];
  }
  return box.map((v) => Math.round(v * 100) / 100);
}

function suggestLanguages(info) {
  if (!info || !info.languagePopulation) return [];
  const merged = new Map();
  for (const [code, d] of Object.entries(info.languagePopulation)) {
    const base = code.split('_')[0];
    const pct = Number(d._populationPercent || 0);
    const official = /official/.test(d._officialStatus || '') && !/regional/.test(d._officialStatus || '');
    const cur = merged.get(base) || { pct: 0, official: false };
    merged.set(base, { pct: cur.pct + pct, official: cur.official || official });
  }
  const list = [...merged.entries()]
    .filter(([, d]) => d.official || d.pct >= 25)
    .sort((a, b) => (b[1].official - a[1].official) || (b[1].pct - a[1].pct))
    .map(([code]) => code);
  if (!list.length) {
    const top = [...merged.entries()].sort((a, b) => b[1].pct - a[1].pct)[0];
    if (top) list.push(top[0]);
  }
  return list.slice(0, 4);
}

function simplify(geom, precision) {
  const q = (v) => Math.round(v * 10 ** precision) / 10 ** precision;
  const ring = (r) => {
    const out = [];
    for (const [x, y] of r) {
      const p = [q(x), q(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out.length >= 4 ? out : null;
  };
  const polys = polygonsOf(geom).map((rings) => rings.map(ring).filter(Boolean)).filter((p) => p.length);
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

async function main() {
  const cldr = await npmPackage(CLDR);
  const territory = JSON.parse(cldr.get('package/supplemental/territoryInfo.json').toString('utf8')).supplemental.territoryInfo;
  // Continent group for each territory (used to fall back to a regional map when a country has none of its own).
  const containment = JSON.parse(cldr.get('package/supplemental/territoryContainment.json').toString('utf8')).supplemental.territoryContainment;
  const GROUPS = { '002': 'africa', '150': 'europe', '142': 'asia', '021': 'north-america', '013': 'central-america', '029': 'central-america', '005': 'south-america', '009': 'oceania' };
  const groupOf = {};
  for (const [code, g] of Object.entries(GROUPS)) {
    const walk = (c) => (containment[c] && containment[c]._contains ? containment[c]._contains.flatMap(walk) : [c]);
    for (const t of walk(code)) if (/^[A-Z]{2}$/.test(t) && !groupOf[t]) groupOf[t] = g;
  }
  groupOf.MX = 'north-america';
  const ne50 = JSON.parse(await fetchText(NE + 'ne_50m_admin_0_countries.geojson'));
  const ne110 = JSON.parse(await fetchText(NE + 'ne_110m_admin_0_countries.geojson'));

  const countries = {};
  for (const f of ne50.features) {
    const iso = isoOf(f.properties);
    if (!iso || countries[iso]) continue;
    const b = mainBox(f.geometry);
    if (!b) continue;
    countries[iso] = { b, l: suggestLanguages(territory[iso]), g: groupOf[iso] || null };
  }
  // Territories CLDR knows but Natural Earth 50m merges or omits still get languages (no box).
  for (const [iso, info] of Object.entries(territory)) {
    if (!/^[A-Z]{2}$/.test(iso) || countries[iso] || iso === 'ZZ') continue;
    const l = suggestLanguages(info);
    if (l.length) countries[iso] = { b: null, l, g: groupOf[iso] || null };
  }
  const sorted = Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b)));
  // ISO 639-3 -> 639-1 for every language that has a two-letter code (CLDR "overlong" aliases). Kiwix's OPDS
  // feed labels books with three-letter codes; the app and book names use two-letter ones where they exist.
  const aliases = JSON.parse(cldr.get('package/supplemental/aliases.json').toString('utf8')).supplemental.metadata.alias.languageAlias;
  const lang3 = {};
  for (const [three, d] of Object.entries(aliases)) {
    if (/^[a-z]{3}$/.test(three) && d._reason === 'overlong' && /^[a-z]{2}$/.test(d._replacement)) lang3[three] = d._replacement;
  }
  await writeFile(join(ROOT, 'data/countries.js'),
    '// Generated by tools/build-geo.mjs from Unicode CLDR 49 territory data and Natural Earth 5.1.2 (public domain).\n' +
    '// b = main bounding box [west, south, east, north] (west > east wraps the antimeridian); l = suggested languages;\n// g = continent group (CLDR containment).\n' +
    `self.WB_COUNTRIES = ${JSON.stringify(sorted)};\n` +
    '// ISO 639-3 -> ISO 639-1, from CLDR language aliases.\n' +
    `self.WB_LANG3 = ${JSON.stringify(Object.fromEntries(Object.entries(lang3).sort()))};\n`);

  const world = { type: 'FeatureCollection', features: ne110.features.map((f) => ({ type: 'Feature', properties: { c: isoOf(f.properties) || '' }, geometry: simplify(f.geometry, 1) })) };
  await writeFile(join(ROOT, 'data/world.js'),
    '// Generated by tools/build-geo.mjs from Natural Earth 1:110m admin-0 countries 5.1.2 (public domain).\n' +
    `self.WB_WORLD = ${JSON.stringify(world)};\n`);
  console.log(`${Object.keys(sorted).length} countries; world outline ${world.features.length} features`);
}

main().catch((e) => { console.error(e); process.exit(1); });
