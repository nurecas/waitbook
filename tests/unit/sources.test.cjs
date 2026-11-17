// Live sources and the data they feed: Kiwix name resolution, Hugging Face pinning, withdrawn books, map regions,
// the share-link decoder, and names that collide with object properties.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { WB } = require('./_load.cjs');
const C = WB.catalog, K = WB.kit, X = WB.exporters, R = WB.resolve;

const feed = (entries) => '<feed>' + entries.map(([name, stem, date, size]) =>
  `<entry><id>urn:uuid:${stem}-${date}</id><title>${stem}</title><name>${name}</name><link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://download.kiwix.org/zim/other/${stem}_${date}.zim.meta4" length="${size}"/></entry>`).join('') + '</feed>';

test('Kiwix lookup falls back to a search when a book is listed under another name', async () => {
  const asked = [];
  const fetcher = { text: async (u) => {
    asked.push(u);
    const q = new URL(u).searchParams;
    if (q.get('name')) return feed([]); // not under the expected name
    if (q.get('q') === 'gardenology') return feed([['gardenology-renamed', 'gardenology.org_en_all', '2026-09', 112499712], ['other', 'other_en_all', '2026-10', 5]]);
    return feed([]);
  } };
  const out = await R.kiwix(['gardenology.org_en_all'], fetcher);
  assert.equal(out['gardenology.org_en_all'].date, '2026-09');
  assert.ok(asked.some((u) => /[?&]q=gardenology(&|$)/.test(u)), 'searched for the first part of the name');
});

test('names that look like object properties are harmless', async () => {
  const fetcher = { text: async () => feed([]) };
  const out = await R.kiwix(['constructor', 'toString', 'valueOf'], fetcher);
  assert.deepEqual(Object.keys(out), []);
  assert.ok(!C.kiwixFacts('constructor').url, 'no facts for a name that is not a book');
  const k = K.normalize({ extra: { constructor: { title: 'x', size: 1e300 }, toString: { title: 'y' } } });
  assert.equal(k.extra.constructor.size, null, 'absurd sizes are dropped');
  assert.doesNotThrow(() => X.bash(X.plan(k)));
});

test('Hugging Face sizes and checksums come from one revision, and links are pinned to it', async () => {
  const REV = 'a'.repeat(40), SHA = 'b'.repeat(64);
  const asked = [];
  const fetcher = { json: async (u) => {
    asked.push(u);
    if (u.endsWith('/revision/main')) return { sha: REV };
    if (u.endsWith('/tree/' + REV)) return [{ path: 'model.gguf', size: 100, lfs: { oid: SHA, size: 5e9 } }];
    throw new Error('unexpected ' + u);
  } };
  const out = await R.hf([{ repo: 'org/repo', file: 'model.gguf' }], fetcher);
  assert.deepEqual({ ...out['hf:org/repo/model.gguf'], at: 0 }, { size: 5e9, sha256: SHA, rev: REV, at: 0 });
  // Without the revision, sizes still come through but no checksum is trusted.
  const noRev = await R.hf([{ repo: 'org/repo', file: 'model.gguf' }], { json: async (u) => { if (u.endsWith('/revision/main')) throw new Error('down'); return [{ path: 'model.gguf', lfs: { oid: SHA, size: 7 } }]; } });
  assert.equal(noRev['hf:org/repo/model.gguf'].sha256, null);
  assert.equal(noRev['hf:org/repo/model.gguf'].size, 7);
});

test('a model link uses the looked-up revision while it is recent, and verifies only then', () => {
  const it = C.items().find((x) => x.hf);
  const key = 'hf:' + it.hf.repo + '/' + it.hf.file;
  const REV = 'c'.repeat(40), SHA = 'd'.repeat(64);
  const kit = K.empty(); K.add(kit, it.id);
  C.setLive({ [key]: { size: 1, sha256: SHA, rev: REV, at: Date.now() } });
  let t = X.plan(kit).tasks.find((x) => x.kind === 'hf');
  assert.match(t.url, new RegExp('/resolve/' + REV + '/'));
  assert.equal(t.sha256, SHA);
  C.setLive({ [key]: { size: 1, sha256: SHA, rev: REV, at: Date.now() - 40 * 864e5 } });
  t = X.plan(kit).tasks.find((x) => x.kind === 'hf');
  assert.match(t.url, /\/resolve\/main\//, 'old lookups fall back to main');
  assert.equal(t.sha256, null, 'and then nothing is verified against a file that may have changed');
  C.setLive({});
});

test('books Kiwix withdrew are left out of lists, quick kits and pick lists', () => {
  const known = globalThis.WB_KIWIX_KNOWN;
  const it = C.items().find((x) => typeof x.kiwix === 'string' && !x.variants && x.axis !== 'region');
  const picky = C.items().find((x) => x.options && x.options.length > 1);
  try {
    C.init({ kiwix: Object.assign({}, known, { missing: [it.kiwix, picky.options[0].kiwix] }) });
    assert.ok(C.gone(it));
    assert.ok(!C.filter({}).includes(it), 'not listed');
    assert.ok(C.filter({ all: true }).includes(it), 'still reachable');
    const auto = K.autofill({ langs: ['en'], budget: 1e13, depth: 3 });
    assert.ok(!auto.entries[it.id], 'not packed');
    assert.ok(!C.options(picky).some((o) => o.id === picky.options[0].id), 'withdrawn subject not offered');
    assert.ok(!C.gone(picky));
  } finally {
    C.init();
  }
});

test('the scripts look Kiwix books up under the name the catalog uses', () => {
  const known = globalThis.WB_KIWIX_KNOWN;
  try {
    C.init({ kiwix: Object.assign({}, known, { names: { 'gardenology.org_en_all': 'gardenology_en' } }) });
    const k = K.empty(); K.add(k, 'gardenology');
    const sh = X.bash(X.plan(k));
    assert.match(sh, /kiwix '03-food' 'gardenology\.org_en_all' 'gardenology_en' 'gardenology\\\.org_en_all' 'gardenology'/);
  } finally {
    C.init();
  }
});

test('a country map covers all of the country, also across 180 degrees', () => {
  const us = X.boxesFor('US');
  assert.equal(us.length, 3, 'mainland, Alaska, Hawaii');
  assert.ok(us.some((b) => b[0] > b[2]), 'Alaska crosses 180 degrees');
  const geo = JSON.parse(X.areaArg(us));
  assert.equal(geo.type, 'MultiPolygon');
  assert.equal(geo.coordinates.length, 4, 'the crossing part is split in two');
  geo.coordinates.forEach((p) => p[0].forEach(([x, y]) => assert.ok(x >= -180 && x <= 180 && y >= -85 && y <= 85)));
  assert.match(X.areaArg(X.boxesFor('DE')), /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, 'one plain box stays a bbox');
  assert.ok(C.regionBoxes('ES').length >= 2, 'Spain includes the Canaries');
  assert.ok(C.regionBoxes('EC').length >= 2, 'Ecuador includes the Galápagos');
  const oceania = C.regionBoxes('@oceania');
  const inside = (lon, lat) => oceania.some(([w, s, e, n]) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e));
  [[-171.8, -13.8], [-175.2, -21.1], [-149.6, -17.5], [158.2, 6.9], [171.4, 7.1], [134.5, 7.5], [144.8, 13.4], [-159.8, -21.2]]
    .forEach(([lon, lat]) => assert.ok(inside(lon, lat), `Oceania covers ${lon},${lat}`));
  assert.ok(C.estimateMap(oceania, 10) > 0, 'continents have a size estimate');
});

test('the share-link decoder matches zlib and refuses oversized or broken input', () => {
  const kitJson = JSON.stringify(WB.share.compact(K.autofill({ langs: ['en', 'sw'], budget: 64e9, depth: 3 })));
  const samples = [Buffer.from(''), Buffer.from('a'), Buffer.from(kitJson), crypto.randomBytes(5000), Buffer.from('abc'.repeat(30000)), Buffer.concat([crypto.randomBytes(300), Buffer.alloc(40000, 7), crypto.randomBytes(300)])];
  const settings = [{ level: 0 }, { level: 1 }, { level: 6 }, { level: 9 }, { level: 6, strategy: zlib.constants.Z_FIXED }, { level: 6, strategy: zlib.constants.Z_HUFFMAN_ONLY }, { level: 9, strategy: zlib.constants.Z_RLE }];
  for (const s of samples) for (const o of settings) {
    const packed = zlib.deflateRawSync(s, o);
    assert.deepEqual(Buffer.from(WB.share.inflateRaw(new Uint8Array(packed), 1e6)), s, JSON.stringify(o) + ' ' + s.length);
  }
  const bomb = zlib.deflateRawSync(Buffer.alloc(5e6));
  assert.throws(() => WB.share.inflateRaw(new Uint8Array(bomb), 300001), /too-big/);
  assert.throws(() => WB.share.inflateRaw(new Uint8Array([0xff, 0xff, 0xff]), 1000));
  const truncated = zlib.deflateRawSync(Buffer.from(kitJson)).subarray(0, 20);
  assert.throws(() => WB.share.inflateRaw(new Uint8Array(truncated), 1e6));
});

test('the scripts\' free-space figure is a plain integer whatever a kit claims', () => {
  const p = X.plan(K.empty());
  p.bytes = 1e300;
  assert.match(X.bash(p), /\nNEED=9000000000000000\n/);
  assert.match(X.powershell(p), /\$Need = \[int64\]9000000000000000\r\n/);
  p.bytes = NaN;
  assert.match(X.bash(p), /\nNEED=0\n/);
});
