const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WB } = require('./_load.cjs');
const K = WB.kit, X = WB.exporters, C = WB.catalog;

function sampleKit() {
  return K.autofill({ langs: ['sw', 'en'], region: 'KE', device: 'drive', os: 'linux', budget: 64e9, depth: 3 });
}

test('the download script parses in a strict POSIX shell and in bash', (t) => {
  const file = path.join(os.tmpdir(), 'wb-test-' + process.pid + '.sh');
  const script = X.bash(X.plan(sampleKit()));
  assert.ok(script.startsWith('#!/bin/sh\n'));
  fs.writeFileSync(file, script);
  try {
    // dash is what /bin/sh is on Debian and Ubuntu, and is strict about POSIX; bash --posix catches bash-only habits too.
    for (const [exe, args] of [['dash', ['-n']], ['sh', ['-n']], ['bash', ['--posix', '-n']], ['bash', ['-n']]]) {
      try { execFileSync('sh', ['-c', 'command -v ' + exe], { stdio: 'ignore' }); } catch { t.diagnostic(exe + ' not installed'); continue; }
      execFileSync(exe, args.concat(file));
    }
  } finally {
    fs.unlinkSync(file);
  }
});

test('every command line in the scripts uses only quoted, validated arguments', () => {
  const p = X.plan(sampleKit());
  const sh = X.bash(p);
  const lines = sh.split('\n').filter((l) => /^(kiwix|fetch|mapcut) /.test(l));
  assert.ok(lines.length > 10);
  lines.forEach((l) => {
    const args = l.replace(/^\w+ /, '');
    assert.match(args, /^('[^']*'\s?)+$/, l);
  });
  const ps = X.powershell(p);
  ps.split('\r\n').filter((l) => /^(Get-Kiwix|Get-File|Get-Map) /.test(l)).forEach((l) => {
    assert.match(l.replace(/^[\w-]+ /, ''), /^('[^']*'\s?)+(\d+)?$/, l);
  });
  assert.ok(!/\r?\n/.test(ps.replace(/\r\n/g, '')), 'PowerShell uses CRLF only');
  assert.equal(ps.charCodeAt(0), 0xfeff, 'PowerShell script starts with a UTF-8 BOM');
  assert.notEqual(X.bash(p).charCodeAt(0), 0xfeff, 'bash script has no BOM (it would break the #! line)');
});

test('hostile live data never reaches a script', () => {
  C.setLive({ wikipedia_sw_all_maxi: { date: '2026-07', size: 1, url: "https://download.kiwix.org/zim/w/x'$(touch /tmp/pwned)'.zim", dir: 'w', at: Date.now() } });
  const k = K.empty();
  K.add(k, 'wikipedia', 'maxi', ['sw']);
  const p = X.plan(k);
  assert.equal(p.tasks[0].url, null, 'unsafe live URL is dropped');
  const sh = X.bash(p);
  assert.ok(!sh.includes('pwned'));
  C.setLive({});
});

test('curated titles cannot break out of script comments', () => {
  const it = C.item('wikimed');
  const saved = it.title;
  it.title = 'Evil\nrm -rf ~\r\u2028echo pwned';
  const k = K.empty();
  K.add(k, 'wikimed', 'mini', ['en']);
  const sh = X.bash(X.plan(k));
  const ps = X.powershell(X.plan(k));
  it.title = saved;
  // The injected lines must never appear as commands of their own.
  sh.split('\n').concat(ps.split('\r\n')).forEach((l) => assert.ok(!/^(rm -rf ~|echo pwned)/.test(l.trim()), l));
});

test('links.txt and aria2 lists contain only validated URLs', () => {
  const p = X.plan(sampleKit());
  X.linksTxt(p).split('\n').filter((l) => l && !l.startsWith('#')).forEach((l) => assert.ok(WB.util.isSafeUrl(l), l));
  X.aria2(p).split('\n').filter((l) => /^https:/.test(l)).forEach((l) => assert.ok(WB.util.isSafeUrl(l), l));
});

test('map areas crossing the antimeridian become a two-part region', () => {
  const k = K.empty();
  K.add(k, 'pmtiles-area', 'z10', ['FJ']);
  globalThis.WB_COUNTRIES.FJ = Object.assign({}, globalThis.WB_COUNTRIES.FJ, { b: [177, -21, -178, -12] });
  const sh = X.bash(X.plan(k));
  assert.match(sh, /mapcut '09-maps' 'map-fj-z10.pmtiles' '\{"type":"MultiPolygon"/);
});

test('kit file round-trips through JSON and normalize', () => {
  const kit = sampleKit();
  const back = K.normalize(JSON.parse(X.kitJson(kit)).kit);
  assert.deepEqual(Object.keys(back.entries).sort(), Object.keys(kit.entries).sort());
});
