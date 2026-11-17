// Runs a generated download script for real, against a local server that imitates the Kiwix catalog, the Kiwix
// download host (with HTTP range requests and .sha256 sidecars) and publishers. Checks downloading, run-time
// resolution of the newest Kiwix file (byte order, whatever the locale), finding a renamed book by search, checksum
// verification, resuming, restarting when a server cannot resume or a partial file is stale, keeping an older
// complete version until WAITBOOK_UPDATE=1, re-running, failure reporting and the index page.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { WB } = require('../unit/_load.cjs');

const bytes = (n) => crypto.randomBytes(n);
const ZIM = bytes(300000), OLD = bytes(1000), OLDBOOK_NEW = bytes(2000), S9 = bytes(1500), S9B = bytes(1700), REN = bytes(1200);
const PDF = Buffer.from('%PDF-1.4 test document\n'.repeat(2000));
const STALE_NEW = Buffer.from('%PDF-1.4 new edition\n'.repeat(500));
const PLAIN = Buffer.from('%PDF-1.4 no ranges here\n'.repeat(800));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// OPDS books: catalog <name>, file stem, and dated files.
const BOOKS = [
  { name: 'testbook_en_all', stem: 'testbook_en_all_maxi', files: { '2026-07': OLD, '2026-10': ZIM } },
  { name: 'oldbook_en_all', stem: 'oldbook_en_all', files: { '2026-10': OLDBOOK_NEW } },
  { name: 'sortbook_en_all', stem: 'sortbook_en_all', files: { '2026-09': S9, '2026-09b': S9B } },
  { name: 'listed-under-another-name', stem: 'renamed_en_all', files: { '2026-10': REN } },
];

function serve() {
  const files = { '/files/doc.pdf': PDF, '/files/tampered.pdf': PDF, '/files/stale.pdf': STALE_NEW };
  BOOKS.forEach((b) => Object.entries(b.files).forEach(([d, body]) => { files[`/zim/other/${b.stem}_${d}.zim`] = body; }));
  const entry = (b, d) => `<entry><id>urn:uuid:${b.stem}-${d}</id><title>${b.stem}</title><name>${b.name}</name><link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://download.kiwix.org/zim/other/${b.stem}_${d}.zim.meta4" length="${b.files[d].length}"/></entry>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/catalog/v2/entries') {
      const name = u.searchParams.get('name');
      const q = u.searchParams.get('q');
      const hits = BOOKS.filter((b) => (name && b.name === name) || (q && b.stem.includes(q)));
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      return res.end('<feed>' + hits.map((b) => Object.keys(b.files).map((d) => entry(b, d)).join('')).join('') + '</feed>');
    }
    if (u.pathname.endsWith('.sha256')) {
      const f = files[u.pathname.slice(0, -7)];
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200); return res.end(sha(f) + '  ' + path.basename(u.pathname.slice(0, -7)) + '\n');
    }
    if (u.pathname === '/norange/plain.pdf') { // a server that ignores Range requests
      res.writeHead(200, { 'content-length': PLAIN.length });
      return res.end(PLAIN);
    }
    const body = files[u.pathname];
    if (!body) { res.writeHead(404); return res.end('missing'); }
    const range = /^bytes=(\d+)-$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      if (start >= body.length) { res.writeHead(416, { 'content-range': `bytes */${body.length}` }); return res.end(); }
      res.writeHead(206, { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}`, 'content-length': body.length - start, 'accept-ranges': 'bytes' });
      return res.end(body.subarray(start));
    }
    res.writeHead(200, { 'content-length': body.length, 'accept-ranges': 'bytes' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function plan(port) {
  const base = `http://127.0.0.1:${port}`;
  // Plans normally come from WB.exporters.plan (https only); here we hand-build one that points at the local server.
  const kiwix = (stem, name, search) => ({ kind: 'kiwix', folder: '01-health', stem, opdsName: name, search, title: stem });
  return ({
    date: '2026-11-17', bytes: ZIM.length + PDF.length * 2, unknown: 0, skipped: [],
    tasks: [
      kiwix('testbook_en_all_maxi', 'testbook_en_all', 'testbook'),
      kiwix('oldbook_en_all', 'oldbook_en_all', 'oldbook'),
      kiwix('sortbook_en_all', 'sortbook_en_all', 'sortbook'),
      kiwix('renamed_en_all', 'renamed_en_all', 'renamed'),
      { kind: 'url', folder: '02-water', name: 'doc.pdf', url: base + '/files/doc.pdf', sha256: sha(PDF), title: 'Doc' },
      { kind: 'url', folder: '02-water', name: 'tampered.pdf', url: base + '/files/tampered.pdf', sha256: 'f'.repeat(64), title: 'Bad sum' },
      { kind: 'url', folder: '02-water', name: 'gone.pdf', url: base + '/files/gone.pdf', title: 'Missing' },
      { kind: 'url', folder: '02-water', name: 'stale.pdf', url: base + '/files/stale.pdf', title: 'Stale partial file, no checksum' },
      { kind: 'url', folder: '02-water', name: 'plain.pdf', url: base + '/norange/plain.pdf', title: 'Server without ranges' },
      { kind: 'page', folder: '03-food', name: 'A page', url: 'https://example.org/page', title: 'Page' },
    ],
  });
}

function findPowerShells() {
  return ['powershell', 'pwsh'].filter((exe) => spawnSync(exe, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0);
}
// The PowerShell script is for Windows (it uses curl.exe), so it is tested there only: with Windows PowerShell 5.1
// and, when installed, PowerShell 7. CI starts node from PowerShell 7, so the 5.1 run also covers "5.1 started from 7"
// (an inherited module path that hides Get-FileHash and Expand-Archive).
const PS = process.platform === 'win32' ? findPowerShells() : [];
// The .sh script is plain POSIX sh (it also has to run in a-Shell on iPad), so it runs under bash and under sh,
// which is dash on Debian and Ubuntu and bash's POSIX mode on macOS.
const has = (exe) => process.platform !== 'win32' && spawnSync(exe, ['-c', 'exit 0']).status === 0;
// "minimal" runs sh with only the tools a small environment such as a-Shell on iPad offers: no sort, tail, cut, tr,
// sha256sum, shasum or df (checksums then come from python3).
const MINIMAL = ['sh', 'curl', 'grep', 'sed', 'awk', 'ls', 'mkdir', 'mv', 'rm', 'wc', 'python3'];
function minimalBin() {
  if (process.platform === 'win32') return null;
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-bin-'));
  for (const tool of MINIMAL) {
    const r = spawnSync('sh', ['-c', 'command -v ' + tool], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    fs.symlinkSync(r.stdout.trim(), path.join(bin, tool));
  }
  return bin;
}
const MIN_BIN = minimalBin();
test.after(() => { if (MIN_BIN) fs.rmSync(MIN_BIN, { recursive: true, force: true }); });
const RUNS = [['bash', 'sh'], ['sh', 'sh'], ['sh', 'minimal']].concat(PS.length ? PS.map((exe) => [exe, 'ps']) : [['powershell', 'ps']]);

for (const [exe, kind] of RUNS) test(`the download script works end to end (${kind === 'minimal' ? 'sh with a minimal toolset' : exe})`, { skip: kind === 'sh' ? (!has(exe) && 'no ' + exe) : kind === 'minimal' ? (!MIN_BIN && 'tools missing') : (!PS.includes(exe) && 'Windows only (runs in CI)') }, async () => {
  const shell = kind === 'ps' ? 'powershell' : 'sh';
  const server = await serve();
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dl-'));
  const sh = path.join(dir, shell === 'sh' ? 'waitbook-download.sh' : 'waitbook-download.ps1');
  fs.writeFileSync(sh, shell === 'sh' ? WB.exporters.bash(plan(port)) : WB.exporters.powershell(plan(port)));
  const dest = path.join(dir, 'Library');
  // A locale whose collation ignores punctuation: picking the newest file must not depend on it.
  const env = { ...process.env, ...(kind === 'minimal' ? { PATH: MIN_BIN } : {}), LC_ALL: 'en_US.UTF-8', WAITBOOK_OPDS: `http://127.0.0.1:${port}/catalog/v2/entries`, WAITBOOK_DL: `http://127.0.0.1:${port}`, HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', NO_PROXY: '*', WAITBOOK_NO_PAUSE: '1' };
  // Without a destination the library goes next to the script, wherever the shell was started.
  const run = (target = dest, extraEnv = {}) => new Promise((resolve) => {
    const args = target ? [target] : [];
    const opts = { env: { ...env, ...extraEnv }, cwd: os.tmpdir() };
    const p = shell === 'sh' ? spawn(exe, [sh, ...args], opts) : spawn(exe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sh, ...args], opts);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const at = (...p) => path.join(dest, ...p);
  const same = (file, body) => fs.existsSync(file) && sha(fs.readFileSync(file)) === sha(body);
  try {
    fs.mkdirSync(at('01-health'), { recursive: true });
    fs.mkdirSync(at('02-water'), { recursive: true });
    fs.writeFileSync(at('01-health', 'testbook_en_all_maxi_2026-10.zim.part'), ZIM.subarray(0, 100000)); // resume this
    fs.writeFileSync(at('01-health', 'testbook_en_all_maxi_2026-07.zim.part'), OLD.subarray(0, 10)); // superseded: remove
    fs.writeFileSync(at('01-health', 'oldbook_en_all_2026-07.zim'), Buffer.from('a complete older version'));
    fs.writeFileSync(at('02-water', 'stale.pdf.part'), Buffer.concat([PDF, PDF])); // longer than the file now is
    fs.writeFileSync(at('02-water', 'plain.pdf.part'), PLAIN.subarray(0, 1000)); // the server cannot resume
    fs.mkdirSync(at('photos')); // folders the script did not make stay out of the index
    fs.mkdirSync(at('99-Notes'));

    const first = await run();
    const log = '\n' + first.out;
    assert.notEqual(first.code, 0, 'failures make the exit status non-zero' + log);
    assert.ok(same(at('01-health', 'testbook_en_all_maxi_2026-10.zim'), ZIM), 'resumed file is complete and correct (newest version chosen)' + log);
    assert.ok(!fs.existsSync(at('01-health', 'testbook_en_all_maxi_2026-07.zim')), 'older version not fetched');
    assert.ok(!fs.existsSync(at('01-health', 'testbook_en_all_maxi_2026-07.zim.part')), 'unfinished older version removed');
    assert.ok(fs.existsSync(at('01-health', 'oldbook_en_all_2026-07.zim')), 'complete older version kept');
    assert.ok(!fs.existsSync(at('01-health', 'oldbook_en_all_2026-10.zim')), 'newer version not fetched without WAITBOOK_UPDATE');
    assert.match(first.out, /oldbook_en_all_2026-07\.zim \(already here; newer: oldbook_en_all_2026-10\.zim/);
    assert.ok(same(at('01-health', 'sortbook_en_all_2026-09b.zim'), S9B), '2026-09b is newer than 2026-09' + log);
    assert.ok(!fs.existsSync(at('01-health', 'sortbook_en_all_2026-09.zim')));
    assert.ok(same(at('01-health', 'renamed_en_all_2026-10.zim'), REN), 'a book listed under another name is found by searching' + log);
    assert.ok(same(at('02-water', 'doc.pdf'), PDF));
    assert.ok(fs.existsSync(at('02-water', 'tampered.pdf.bad')), 'checksum mismatch kept aside');
    assert.ok(!fs.existsSync(at('02-water', 'tampered.pdf')));
    assert.ok(same(at('02-water', 'stale.pdf'), STALE_NEW), 'a stale partial file is replaced, not kept' + log);
    assert.ok(same(at('02-water', 'plain.pdf'), PLAIN), 'a server that cannot resume gets a fresh download' + log);
    assert.match(first.out, /2 failed/i);
    assert.match(first.out, /gone\.pdf/);
    const index = fs.readFileSync(at('index.html'), 'utf8');
    assert.match(index, /href="01-health\/testbook_en_all_maxi_2026-10\.zim"/);
    assert.ok(!/\.bad|\.part/.test(index), 'index lists only finished files');
    assert.ok(!/photos|99-Notes/.test(index), 'index lists only the folders the script makes');

    const second = await run();
    assert.match(second.out, /= 01-health\/testbook_en_all_maxi_2026-10\.zim \(already here\)/);
    assert.match(second.out, /= 02-water\/doc\.pdf \(already here\)/);
    assert.notEqual(second.code, 0, 'the missing file still counts as a failure');

    const third = await run(dest, { WAITBOOK_UPDATE: '1' });
    assert.ok(same(at('01-health', 'oldbook_en_all_2026-10.zim'), OLDBOOK_NEW), 'WAITBOOK_UPDATE=1 fetches the newer version\n' + third.out);
    assert.ok(!fs.existsSync(at('01-health', 'oldbook_en_all_2026-07.zim')), 'and removes the older one after it is complete');

    const fourth = await run(null);
    assert.ok(fs.existsSync(path.join(dir, 'Waitbook', '02-water', 'doc.pdf')), 'default destination is next to the script\n' + fourth.out);
    assert.ok(fs.existsSync(path.join(dir, 'Waitbook', 'index.html')));
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
