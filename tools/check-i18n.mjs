#!/usr/bin/env node
// Checks every translation against English: same keys, same {placeholders}, the '*' highlight marker in
// home.title, and plural objects with the right CLDR categories for the language.
//   node tools/check-i18n.mjs [code ...]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function load(code) {
  let dict = null;
  const ctx = { WB: { i18n: { register: (c, d) => { dict = d; } } } };
  vm.runInNewContext(readFileSync(join(ROOT, 'i18n', code + '.js'), 'utf8'), ctx, { filename: code + '.js' });
  return dict;
}
const en = load('en');
const codes = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(ROOT, 'i18n')).filter((f) => f.endsWith('.js') && f !== 'en.js').map((f) => f.replace('.js', ''));
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let bad = 0;
for (const code of codes) {
  const d = load(code);
  const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  const problems = [];
  for (const k of Object.keys(en)) {
    if (!(k in d)) { problems.push('missing ' + k); continue; }
    const e = en[k], v = d[k];
    if (typeof e === 'object') {
      if (typeof v !== 'object') { problems.push(k + ' should be a plural object'); continue; }
      cats.forEach((c) => { if (!(c in v)) problems.push(`${k} lacks plural "${c}"`); });
      Object.keys(v).forEach((c) => { if (!cats.includes(c)) problems.push(`${k} has plural "${c}" not used in ${code}`); if (ph(v[c]) !== ph(e.other)) problems.push(`${k}.${c} placeholders ${ph(v[c])} ≠ ${ph(e.other)}`); });
    } else {
      if (typeof v !== 'string') { problems.push(k + ' should be a string'); continue; }
      if (ph(v) !== ph(e)) problems.push(`${k} placeholders "${ph(v)}" ≠ "${ph(e)}"`);
      if (e && !v) problems.push(k + ' is empty');
    }
  }
  Object.keys(d).forEach((k) => { if (!(k in en)) problems.push('unknown key ' + k); });
  if (!/\*[^*]+\*/.test(d['home.title'] || '')) problems.push('home.title needs one *highlighted* word');
  console.log(`${code}: ${problems.length ? problems.length + ' problem(s)' : 'ok'} (${Object.keys(d).length} keys, plurals: ${cats.join('/')})`);
  problems.slice(0, 40).forEach((p) => console.log('  ' + p));
  bad += problems.length;
}
process.exit(bad ? 1 : 0);
