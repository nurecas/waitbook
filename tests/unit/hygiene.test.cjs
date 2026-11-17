// Static checks on the source tree: things that are easy to break and hard to notice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const appJs = [...walk('js'), ...walk('data'), ...walk('i18n'), 'sw.js'].filter((f) => f.endsWith('.js'));

const SEP = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']');
test('no literal line or paragraph separators in sources (they break JS parsing)', () => {
  appJs.forEach((f) => assert.ok(!SEP.test(read(f)), f));
});

test('app code never writes HTML strings into the DOM', () => {
  walk('js').forEach((f) => {
    const s = read(f);
    assert.ok(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(s), f);
    assert.ok(!/\beval\(|new Function\(/.test(s), f);
  });
});

test('the page has a strict CSP and every script it loads exists and is precached', () => {
  const html = read('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", '')), 'no unsafe-inline/unsafe-eval');
  const sw = read('sw.js');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  [...scripts, ...styles].forEach((s) => {
    assert.ok(fs.existsSync(path.join(ROOT, s)), 'missing ' + s);
    assert.ok(sw.includes("'" + s + "'"), 'not precached: ' + s);
  });
  [...sw.matchAll(/'([a-z0-9_./-]+\.(?:js|css|png|svg|woff2|webmanifest|html))'/g)].forEach((m) => assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'sw lists missing ' + m[1]));
});

test('network access only goes through js/ui/net.js and the map’s local glyph fetch', () => {
  walk('js').forEach((f) => {
    const s = read(f);
    if (f.endsWith('net.js')) return;
    const fetches = s.match(/(?<![\w'])fetch\((?!\))/g) || [];
    if (f.endsWith('map.js')) { assert.ok(/fetch\('vendor\/glyphs\//.test(s)); assert.equal(fetches.length, 1, f); return; }
    assert.equal(fetches.length, 0, f + ' calls fetch directly');
    assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket/.test(s), f);
  });
});

test('every i18n key used in code exists in English', () => {
  global.self = global;
  global.WB = { i18n: { register: (code, d) => { global.__dict = d; } } };
  require(path.join(ROOT, 'i18n/en.js'));
  const en = global.__dict;
  const used = new Set();
  walk('js').forEach((f) => { for (const m of read(f).matchAll(/\bt\('([a-zA-Z0-9_.-]+)'(?!\s*\+)/g)) used.add(m[1]); });
  const missing = [...used].filter((k) => !k.endsWith('.') && !(k in en));
  assert.deepEqual(missing, []);
});
