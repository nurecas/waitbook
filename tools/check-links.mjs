#!/usr/bin/env node
// Checks every link Waitbook offers: direct downloads, publisher pages, app-store and installer links, AI model
// files, the pmtiles tool, and that every curated Kiwix name still resolves in the live catalog.
//   node tools/check-links.mjs [--out report.md] [--strict]
// --strict exits non-zero when anything is broken. Sites that refuse automated requests (403/429) are listed
// separately for a manual check rather than counted as broken.

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
for (const f of ['data/countries.js', 'js/core/util.js', 'js/core/opds.js', 'data/catalog.js', 'data/kiwix-known.js', 'data/apps.js', 'js/core/catalog.js', 'js/core/kit.js', 'js/core/resolve.js', 'js/core/exporters.js']) require(join(ROOT, f));
const WB = globalThis.WB;
WB.catalog.init();

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const strict = args.includes('--strict');
const UA = 'waitbook-link-check (+https://github.com/)';
const U_uniq = (a) => [...new Set(a)];

function collect() {
  const urls = new Map(); // url -> where it is used
  const add = (u, where) => { if (u && /^https:/.test(u)) urls.set(u, (urls.get(u) || []).concat(where)); };
  WB.catalog.items().forEach((it) => {
    add(it.page, it.id + ' (page)');
    add(it.home, it.id + ' (publisher)');
    (it.files || []).forEach((f) => add(f.url, it.id + (f.os ? ' ' + f.os : '') + (f.lang ? ' ' + f.lang : '')));
    if (it.hf) add('https://huggingface.co/' + it.hf.repo + '/resolve/main/' + it.hf.file, it.id + ' (model)');
  });
  Object.entries(globalThis.WB_APPS.apps).forEach(([id, a]) => Object.entries(a.links).forEach(([k, u]) => add(u, 'app ' + id + ' ' + k)));
  Object.keys(WB.exporters.PMTILES_SUMS).forEach((a) => add('https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/' + a, 'pmtiles tool'));
  add('https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Windows_x86_64.zip', 'pmtiles tool (Windows)');
  add('https://build-metadata.protomaps.dev/builds.json', 'map builds list');
  return urls;
}

async function check(url) {
  const attempt = async (method, headers) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(url, { method, headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: ctl.signal });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return res.status;
    } finally { clearTimeout(timer); }
  };
  try {
    let status = await attempt('HEAD', {});
    if (status === 405 || status === 403 || status === 400 || status === 501) status = await attempt('GET', { range: 'bytes=0-0' });
    return status;
  } catch (e) {
    return 'error: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
  }
}

async function main() {
  const urls = collect();
  const list = [...urls.keys()];
  const results = await WB.resolve.pool(list, 6, async (u) => ({ url: u, status: await check(u) }));
  const ok = [], broken = [], blocked = [];
  results.forEach((r) => {
    const s = r.status;
    if (typeof s === 'number' && s < 400) ok.push(r);
    else if (s === 403 || s === 429 || s === 401) blocked.push(r);
    else broken.push(r);
  });

  // Kiwix: every curated stem (including every expansion of every pattern) must resolve in the live catalog.
  const stems = new Set();
  const known = globalThis.WB_KIWIX_KNOWN;
  Object.keys(known.files).forEach((s) => stems.add(s));
  const fetcher = { text: async (u) => { const r = await fetch(u, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }, json: async (u) => (await fetch(u)).json() };
  const live = await WB.resolve.kiwix([...stems], fetcher);
  const missing = [...stems].filter((s) => !live[s]);
  // For each missing name, list books whose name shares its first part: often the same book under a new name.
  const suggest = {};
  for (const s of missing) {
    const first = s.split('_')[0];
    const core = first.split('.').sort((a, b) => b.length - a.length)[0];
    const found = new Set();
    for (const q of U_uniq([first, core])) {
      try {
        const feed = WB.opds.parseFeed(await fetcher.text('https://opds.library.kiwix.org/catalog/v2/entries?count=40&q=' + encodeURIComponent(q)));
        feed.entries.forEach((e) => { if (e.stem && e.stem.toLowerCase().includes(core.toLowerCase())) found.add(e.stem + ' (' + e.date + ')'); });
      } catch { /* report without suggestions */ }
    }
    suggest[s] = [...found].slice(0, 8);
  }
  const moved = [...stems].filter((s) => live[s] && live[s].date !== known.files[s][0]);

  // The app reads three APIs straight from the browser, which only works if they allow other sites (CORS).
  const hfItem = WB.catalog.items().find((it) => it.hf);
  const apis = [
    ['Kiwix catalog', 'https://opds.library.kiwix.org/catalog/v2/entries?count=1'],
    ['Hugging Face', hfItem ? 'https://huggingface.co/api/models/' + hfItem.hf.repo + '/tree/main' : null],
    ['Protomaps build list', 'https://build-metadata.protomaps.dev/builds.json'],
  ].filter((a) => a[1]);
  const cors = await Promise.all(apis.map(async ([name, u]) => {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, origin: 'https://example.github.io' } });
      try { await r.body?.cancel(); } catch { /* ignore */ }
      const allow = r.headers.get('access-control-allow-origin');
      return { name, u, ok: r.ok && (allow === '*' || allow === 'https://example.github.io'), note: `HTTP ${r.status}, access-control-allow-origin: ${allow || '(none)'}` };
    } catch (e) { return { name, u, ok: false, note: 'error: ' + e.message }; }
  }));

  const lines = [
    `# Waitbook link check — ${new Date().toISOString().slice(0, 10)}`, '',
    ...cors.map((c) => `- Browser access to ${c.name}: ${c.ok ? 'allowed' : 'NOT allowed'} (${c.note})`),
    `- ${ok.length} links OK, ${broken.length} broken, ${blocked.length} refused automated checks`,
    `- Kiwix: ${stems.size - missing.length} of ${stems.size} curated files resolve; ${moved.length} have a newer version than the snapshot (run tools/refresh-kiwix.mjs)`, '',
  ];
  if (broken.length) { lines.push('## Broken', ''); broken.forEach((r) => lines.push(`- ${r.status} ${r.url} — ${urls.get(r.url).join(', ')}`)); lines.push(''); }
  if (blocked.length) { lines.push('## Check by hand (the site refused an automated request)', ''); blocked.forEach((r) => lines.push(`- ${r.status} ${r.url} — ${urls.get(r.url).join(', ')}`)); lines.push(''); }
  if (missing.length) {
    lines.push('## Kiwix names no longer in the catalog', '');
    missing.forEach((s) => lines.push('- ' + s + (suggest[s] && suggest[s].length ? ' — similar now: ' + suggest[s].join(', ') : ' — nothing similar found')));
    lines.push('');
  }
  const report = lines.join('\n');
  console.log(report);
  if (out) await writeFile(out, report + '\n');
  if (strict && (broken.length || missing.length)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
