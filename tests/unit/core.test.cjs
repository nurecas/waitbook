const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WB, ROOT } = require('./_load.cjs');
const U = WB.util, O = WB.opds, C = WB.catalog, K = WB.kit, X = WB.exporters;

test('bytes formats decimal units in the reader’s locale', () => {
  assert.equal(U.bytes(52.7e9, 'en'), '52.7 GB');
  assert.equal(U.bytes(127.4e9, 'en'), '127 GB');
  assert.equal(U.bytes(999, 'en'), '999 byte');
  assert.match(U.bytes(1.5e9, 'fr'), /^1,5\s?Go$/);
  assert.equal(U.bytes(null), '—');
});

test('safeName keeps only portable characters', () => {
  assert.equal(U.safeName('MSF guide (en).pdf'), 'MSF-guide-en.pdf');
  assert.equal(U.safeName('../../etc/passwd'), 'etc-passwd');
  assert.equal(U.safeName('$(rm -rf ~);`x`'), 'rm-rf-x');
  assert.equal(U.safeName(''), 'file');
  assert.ok(!/[^A-Za-z0-9._-]/.test(U.safeName('Ünïcødé ✓ name')));
});

test('isSafeUrl accepts plain https links and rejects anything a shell could misread', () => {
  const ok = ['https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-08.zim', 'https://huggingface.co/a/b/resolve/main/x.gguf', 'https://www.fao.org/3/a-i1816e.pdf', 'https://example.org/a%20b?x=1&y=2'];
  const bad = ['http://example.org/x', 'https://exa mple.org/', "https://e.org/a'b", 'https://e.org/$(id)', 'https://e.org/`id`', 'https://e.org/a;b', 'https://e.org/a|b', 'https://e.org/a\nb', 'https://user:pw@e.org/', 'https://e.org:8080/', 'javascript:alert(1)', 'https://e.org/a"b', 'https://e.org/a<b', 'https://-e.org/', 'https://e/'];
  ok.forEach((u) => assert.ok(U.isSafeUrl(u), u));
  bad.forEach((u) => assert.ok(!U.isSafeUrl(u), u));
  assert.ok(U.isSafeUrl('https://download.kiwix.org/zim/x/y.zim', O.KIWIX_HOSTS));
  assert.ok(!U.isSafeUrl('https://evil.example/zim/x/y.zim', O.KIWIX_HOSTS));
  assert.ok(!U.isSafeUrl('https://download.kiwix.org.evil.example/zim/x/y.zim', O.KIWIX_HOSTS));
});

test('shell quoting survives quotes in any position', () => {
  assert.equal(U.shQuote("a'b"), "'a'\\''b'");
  assert.equal(U.psQuote("a'b"), "'a''b'");
});

test('language codes convert between ISO 639-1 and 639-3', () => {
  assert.equal(U.lang1('fra'), 'fr');
  assert.equal(U.lang3('fr'), 'fra');
  assert.equal(U.lang3('sw'), 'swa');
  assert.equal(U.lang3('zh'), 'zho');
  assert.equal(U.lang1('pt-BR'), 'pt');
  assert.ok(U.isRtl('ar') && U.isRtl('ur') && !U.isRtl('fr'));
});

test('XML entities decode, including numeric ones, without producing surrogates', () => {
  assert.equal(U.decodeXmlEntities('L&apos;encyclop&#233;die &amp; &#x4E2D;'), "L'encyclopédie & 中");
  assert.equal(U.decodeXmlEntities('&#xD800;x'), 'x');
});

test('OPDS parser reads the real Kiwix feed fixture', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'tests/fixtures/opds-sample.xml'), 'utf8');
  const feed = O.parseFeed(xml);
  assert.equal(feed.entries.length, feed.total);
  const fr = feed.entries.find((e) => e.stem === 'wikipedia_fr_all_maxi');
  assert.ok(fr, 'French Wikipedia present');
  assert.equal(fr.name, 'wikipedia_fr_all');
  assert.equal(fr.flavour, 'maxi');
  assert.deepEqual(fr.lang, ['fra']);
  assert.match(fr.url, /^https:\/\/download\.kiwix\.org\/zim\/wikipedia\/wikipedia_fr_all_maxi_\d{4}-\d{2}[a-z]?\.zim$/);
  assert.ok(fr.size > 1e10);
  feed.entries.forEach((e) => assert.ok(U.isSafeUrl(e.url, O.KIWIX_HOSTS), e.url));
});

test('OPDS parser rejects hostile acquisition links', () => {
  const entry = (href) => `<entry><id>urn:uuid:1</id><title>x</title><name>x</name><link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="${href}" length="10"/></entry>`;
  const hrefs = ['https://evil.example/zim/a/x_2026-01.zim.meta4', 'https://download.kiwix.org/zim/../../x_2026-01.zim.meta4', 'https://download.kiwix.org/zim/a/x$(id)_2026-01.zim.meta4', 'javascript:alert(1)', 'https://download.kiwix.org/zim/a/x_2026-01.zim.meta4&quot;onmouseover=1'];
  hrefs.forEach((h) => assert.equal(O.parseFeed('<feed>' + entry(h) + '</feed>').entries.length, 0, h));
});

test('stems split into OPDS name and flavour; letter-suffixed dates are newest', () => {
  assert.deepEqual(O.splitStem('wikipedia_en_all_maxi'), { name: 'wikipedia_en_all', flavour: 'maxi' });
  assert.deepEqual(O.splitStem('ifixit_en_all'), { name: 'ifixit_en_all', flavour: '' });
  assert.deepEqual(O.parseFile('nhs.uk_en_medicines_2026-09b.zim'), { stem: 'nhs.uk_en_medicines', date: '2026-09b' });
  const pick = O.pickStem([{ stem: 's', date: '2026-07' }, { stem: 's', date: '2026-07a' }, { stem: 'other', date: '2026-12' }], 's');
  assert.equal(pick.date, '2026-07a');
});

test('catalog: every item is well formed and every reference resolves', () => {
  const shelves = C.shelves().map((s) => s.id);
  const ids = new Set();
  C.items().forEach((it) => {
    assert.ok(!ids.has(it.id), 'duplicate id ' + it.id); ids.add(it.id);
    assert.ok(/^[a-z0-9-]+$/.test(it.id), it.id);
    assert.ok(shelves.includes(it.shelf), it.id + ' shelf');
    assert.ok([1, 2, 3].includes(it.p), it.id + ' priority');
    ['title', 'by', 'desc', 'license', 'kind'].forEach((k) => assert.ok(it[k], it.id + ' missing ' + k));
    (it.files || []).forEach((f) => assert.ok(U.isSafeUrl(f.url), it.id + ' unsafe url ' + f.url));
    if (it.page) assert.ok(U.isSafeUrl(it.page), it.id + ' page');
    if (it.home) assert.ok(U.isSafeUrl(it.home), it.id + ' home');
    (it.opens || []).forEach((a) => assert.ok(a === 'waitbook-map' || C.app(a), it.id + ' opens unknown app ' + a));
    if (it.alt) assert.ok(C.item(it.alt), it.id + ' alt');
    const vals = C.defaultValues(it, { langs: ['en'], region: 'KE', os: 'windows' });
    const files = K.entryFiles(it, { e: C.defaultEdition(it), v: vals });
    if (C.axis(it) !== 'region' || it.pmtiles || vals.length) assert.ok(files.length || it.page || C.axis(it) === 'os', it.id + ' produces no files');
  });
  shelves.forEach((s) => assert.ok(C.filter({ shelf: s }).length > 0, 'empty shelf ' + s));
});

test('catalog: Kiwix names and patterns exist in the catalog snapshot', () => {
  const known = globalThis.WB_KIWIX_KNOWN;
  C.allKiwixRefs().forEach((ref) => {
    if (ref.startsWith('regions:') || ref.includes('{region}')) return;
    if (C.isPattern(ref)) assert.ok(Object.keys(known.patterns[ref] || {}).length > 0, 'pattern matches nothing: ' + ref);
    else assert.ok(known.files[ref], 'missing stem: ' + ref);
  });
  assert.ok(C.langs(C.item('wikipedia')).length > 250, 'Wikipedia in hundreds of languages');
  assert.ok(C.langs(C.item('phet')).includes('id'), 'PhET Indonesian via its own code');
  const regions = C.regionList();
  Object.keys(globalThis.WB_COUNTRIES).forEach((iso) => assert.ok(regions[iso], 'no map for ' + iso));
});

test('apps and cards reference real things', () => {
  const apps = globalThis.WB_APPS;
  apps.needs.forEach((n) => n.apps.forEach((a) => assert.ok(apps.apps[a], 'need ' + n.id + ' → ' + a)));
  Object.values(apps.apps).forEach((a) => Object.values(a.links).forEach((u) => assert.ok(U.isSafeUrl(u), a.name + ' ' + u)));
  globalThis.WB_CARDS.forEach((c) => {
    assert.ok(c.first.length && c.sources.length, c.id);
    c.open.forEach((o) => assert.ok(C.item(o.item), c.id + ' → ' + o.item));
    // Cards must not prescribe doses or quantities.
    const text = [].concat(c.first, c.flags, c.prepare || []).join(' ');
    assert.ok(!/\b\d+\s?(mg|ml|millilit|drops?|teaspoons?|tablets?|minutes?|seconds?|litres?|liters?)\b/i.test(text), c.id + ' contains a dose or duration');
  });
});

test('kit.normalize drops junk and hostile input', () => {
  const raw = JSON.parse('{"langs":["en","x\\"y","__proto__","fr"],"region":"<b>","budget":-5,"device":"toaster","entries":{"wikipedia":{"e":"maxi","v":["fr","$(id)"]},"nope":{"e":"x","v":[]},"__proto__":{"e":"x"}},"extra":{"bad stem;rm":{"title":"x"},"ok_stem":{"title":"line\\nbreak","size":"big","date":"2026-07a","dir":"../x"}},"done":{"k:ok":1,"bad key with spaces":1,"__proto__":1,"constructor":1}}');
  const k = K.normalize(raw);
  assert.deepEqual(k.langs, ['en', 'fr']);
  assert.equal(k.region, null);
  assert.equal(k.budget, null);
  assert.equal(k.device, null);
  assert.deepEqual(Object.keys(k.entries), ['wikipedia']);
  assert.deepEqual(k.entries.wikipedia.v, ['fr']);
  assert.deepEqual(Object.keys(k.extra), ['ok_stem']);
  assert.equal(k.extra.ok_stem.title, 'line break');
  assert.equal(k.extra.ok_stem.size, null);
  assert.equal(k.extra.ok_stem.dir, null);
  assert.deepEqual(Object.keys(k.done), ['k:ok']);
  assert.equal(Object.getPrototypeOf(k.entries), Object.prototype);
});

test('autofill never exceeds the budget and puts essentials first', () => {
  const langsets = [['en'], ['fr'], ['sw', 'en'], ['ar', 'en'], ['hi'], ['zh'], ['es', 'pt'], ['ru', 'uk'], ['yo'], []];
  const budgets = [1e9, 4e9, 8e9, 16e9, 64e9, 256e9, 1e12];
  const devices = ['phone', 'computer', 'drive'];
  const regions = ['KE', 'FR', 'IN', 'BR', 'US', null];
  let n = 0;
  langsets.forEach((langs, i) => budgets.forEach((budget, j) => {
    const device = devices[(i + j) % 3];
    const kit = K.autofill({ langs, region: regions[(i + j) % regions.length], device, os: 'windows', budget, depth: 3 });
    const t = K.totals(kit);
    assert.ok(t.bytes <= budget, `over budget: ${langs} ${budget} → ${t.bytes}`);
    const ps = K.rows(kit).map((r) => r.item.p);
    if (ps.includes(3)) assert.ok(ps.includes(1), 'deep items without essentials');
    n++;
  }));
  assert.ok(n > 60);
});

test('autofill: a phone gets the small AI model, a computer the larger one, never both', () => {
  const phone = K.autofill({ langs: ['en'], device: 'phone', os: 'android', budget: 64e9, depth: 3 });
  const pc = K.autofill({ langs: ['en'], device: 'computer', os: 'windows', budget: 256e9, depth: 3 });
  assert.ok(phone.entries['gemma4-e2b'] && !phone.entries['gemma4-e4b']);
  assert.ok(!pc.entries['gemma4-e2b'] && pc.entries['gemma4-e4b']);
});

test('the same file chosen twice counts once in totals', () => {
  const k = K.empty();
  K.add(k, 'gutenberg-agri');
  K.add(k, 'gutenberg-subjects', 'default', ['s']);
  const t = K.totals(k);
  assert.equal(t.files, 1);
});
