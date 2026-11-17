// Runs a generated download script for real, against a local server that imitates the Kiwix catalog, the Kiwix
// download host (with HTTP range requests and .sha256 sidecars) and a publisher. Checks downloading, run-time
// resolution of the newest Kiwix file, checksum verification, resuming, re-running and failure reporting.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WB } = require('../unit/_load.cjs');

const ZIM = crypto.randomBytes(300000);
const OLD = crypto.randomBytes(1000);
const PDF = Buffer.from('%PDF-1.4 test document\n'.repeat(2000));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function serve() {
  const files = {
    '/zim/other/testbook_en_all_maxi_2026-10.zim': ZIM,
    '/zim/other/testbook_en_all_maxi_2026-07.zim': OLD,
    '/files/doc.pdf': PDF,
    '/files/tampered.pdf': PDF,
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/catalog/v2/entries') {
      const name = u.searchParams.get('name');
      const entry = (date, size) => `<entry><id>urn:uuid:${date}</id><title>Test</title><name>${name}</name><flavour>maxi</flavour><link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://download.kiwix.org/zim/other/${name}_maxi_${date}.zim.meta4" length="${size}"/></entry>`;
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      return res.end(name === 'testbook_en_all' ? `<feed>${entry('2026-07', OLD.length)}${entry('2026-10', ZIM.length)}</feed>` : '<feed></feed>');
    }
    if (u.pathname.endsWith('.sha256')) {
      const f = files[u.pathname.slice(0, -7)];
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200); return res.end(sha(f) + '  ' + path.basename(u.pathname.slice(0, -7)) + '\n');
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
  return ({
    date: '2026-11-17', bytes: ZIM.length + PDF.length * 2, unknown: 0, skipped: [],
    tasks: [
      { kind: 'kiwix', folder: '01-health', stem: 'testbook_en_all_maxi', opdsName: 'testbook_en_all', title: 'Test book' },
      { kind: 'url', folder: '02-water', name: 'doc.pdf', url: base + '/files/doc.pdf', sha256: sha(PDF), title: 'Doc' },
      { kind: 'url', folder: '02-water', name: 'tampered.pdf', url: base + '/files/tampered.pdf', sha256: 'f'.repeat(64), title: 'Bad sum' },
      { kind: 'url', folder: '02-water', name: 'gone.pdf', url: base + '/files/gone.pdf', title: 'Missing' },
      { kind: 'page', folder: '03-food', name: 'A page', url: 'https://example.org/page', title: 'Page' },
    ],
  });
}

function findPowerShell() {
  for (const exe of process.platform === 'win32' ? ['powershell', 'pwsh'] : ['pwsh', 'powershell']) {
    const r = spawnSync(exe, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
    if (r.status === 0) return exe;
  }
  return null;
}
// The PowerShell script is for Windows (it uses curl.exe), so it is tested there only.
const PWSH = process.platform === 'win32' ? findPowerShell() : null;
const HAS_BASH = spawnSync('bash', ['-c', 'exit 0']).status === 0 && process.platform !== 'win32';

for (const shell of ['bash', 'powershell']) test(`the ${shell} download script works end to end`, { skip: shell === 'bash' ? (!HAS_BASH && 'no bash') : (!PWSH && 'Windows only (runs in CI)') }, async () => {
  const server = await serve();
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dl-'));
  const sh = path.join(dir, shell === 'bash' ? 'waitbook-download.sh' : 'waitbook-download.ps1');
  fs.writeFileSync(sh, shell === 'bash' ? WB.exporters.bash(plan(port)) : WB.exporters.powershell(plan(port)));
  const dest = path.join(dir, 'Library');
  const env = { ...process.env, WAITBOOK_OPDS: `http://127.0.0.1:${port}/catalog/v2/entries`, WAITBOOK_DL: `http://127.0.0.1:${port}`, HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', NO_PROXY: '*', WAITBOOK_NO_PAUSE: '1' };
  const run = () => new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    const p = shell === 'bash' ? spawn('bash', [sh, dest], { env }) : spawn(PWSH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sh, dest], { env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  try {
    // A half-finished download from an earlier run should be resumed, not restarted.
    fs.mkdirSync(path.join(dest, '01-health'), { recursive: true });
    fs.writeFileSync(path.join(dest, '01-health', 'testbook_en_all_maxi_2026-10.zim.part'), ZIM.subarray(0, 100000));
    const first = await run();
    assert.notEqual(first.code, 0, 'failures make the exit status non-zero');
    const zim = path.join(dest, '01-health', 'testbook_en_all_maxi_2026-10.zim');
    assert.ok(fs.existsSync(zim), first.out);
    assert.equal(sha(fs.readFileSync(zim)), sha(ZIM), 'resumed file is complete and correct (newest version chosen)');
    assert.ok(!fs.existsSync(path.join(dest, '01-health', 'testbook_en_all_maxi_2026-07.zim')), 'older version not fetched');
    assert.equal(sha(fs.readFileSync(path.join(dest, '02-water', 'doc.pdf'))), sha(PDF));
    assert.ok(fs.existsSync(path.join(dest, '02-water', 'tampered.pdf.bad')), 'checksum mismatch kept aside');
    assert.ok(!fs.existsSync(path.join(dest, '02-water', 'tampered.pdf')));
    assert.match(first.out, /2 failed/i);
    assert.match(first.out, /gone\.pdf/);
    const index = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
    assert.match(index, /href="01-health\/testbook_en_all_maxi_2026-10\.zim"/);
    assert.ok(!/\.bad|\.part/.test(index), 'index lists only finished files');

    const second = await run();
    assert.match(second.out, /= 01-health\/testbook_en_all_maxi_2026-10\.zim \(already here\)/);
    assert.match(second.out, /= 02-water\/doc\.pdf \(already here\)/);
    assert.notEqual(second.code, 0, 'the missing file still counts as a failure');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
