// The search boxes show example searches in the reader's language. Every example must find something: the library
// matches the English catalog plus the shelf names, shelf descriptions and type labels of the current language; the
// Kiwix explorer (offline) matches the titles and summaries in the Kiwix snapshot.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WB, ROOT } = require('./_load.cjs');

require(path.join(ROOT, 'data/kiwix-snapshot.js'));
const LANGS = fs.readdirSync(path.join(ROOT, 'i18n')).filter((f) => /^[a-z]{2}\.js$/.test(f)).map((f) => f.slice(0, 2));
LANGS.forEach((l) => require(path.join(ROOT, 'i18n', l + '.js')));

const examples = (s) => s.split(/[,،、，]/).map((x) => x.replace(/(…|\.\.\.)\s*$/, '').trim()).filter(Boolean);
const U = WB.util;
const rows = globalThis.WB_KIWIX_SNAPSHOT.rows.map((r) => U.fold(r[0] + ' ' + r[5] + ' ' + (r[8] || '')));

for (const lang of LANGS) {
  test(`${lang}: every example in the search hints finds something`, async () => {
    await WB.i18n.setLang(lang);
    for (const ex of examples(WB.i18n.t('lib.searchPh'))) {
      assert.ok(WB.catalog.filter({ q: ex }).length > 0, `library search for "${ex}" (${lang}) finds nothing`);
    }
    for (const ex of examples(WB.i18n.t('kx.searchPh'))) {
      const words = U.fold(ex).split(' ');
      assert.ok(rows.some((hay) => words.every((w) => hay.includes(w))), `Kiwix search for "${ex}" (${lang}) finds nothing offline`);
    }
  });
}

test('searching in the reader\'s language reaches whole shelves', async () => {
  await WB.i18n.setLang('es');
  const water = WB.catalog.filter({ q: 'agua' });
  assert.ok(water.length >= 3 && water.every((it) => it.shelf === 'water' || /agua|water/i.test(it.title + it.desc)), 'es "agua" finds the water shelf');
  await WB.i18n.setLang('en');
});
