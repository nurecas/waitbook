const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { WB } = require('./_load.cjs');
const K = WB.kit, S = WB.share;

test('share links round-trip a kit', async () => {
  const kit = K.autofill({ langs: ['fr'], region: 'FR', device: 'computer', os: 'windows', budget: 64e9, depth: 2 });
  K.addExtra(kit, { stem: 'ham.stackexchange.com_en_all', title: 'Ham', size: 1, date: '2026-08', dir: 'stack_exchange', lang: ['eng'] });
  const code = await S.encode(kit);
  assert.match(code, /^z[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 3000, 'compact: ' + code.length);
  const back = await S.decode(code);
  assert.deepEqual(Object.keys(back.entries).sort(), Object.keys(kit.entries).sort());
  assert.equal(back.region, 'FR');
  assert.ok(back.extra['ham.stackexchange.com_en_all']);
});

test('share links reject garbage', async () => {
  for (const bad of ['', 'x', 'zz', 'z!!!!', 'j' + Buffer.from('{"v":2}').toString('base64url'), 'j' + Buffer.from('not json').toString('base64url'), 'a'.repeat(70000)]) {
    await assert.rejects(S.decode(bad), undefined, bad.slice(0, 20));
  }
});

test('a decompression bomb is stopped, not expanded', async () => {
  const bomb = zlib.deflateRawSync(Buffer.alloc(35e6, 32));
  const code = 'z' + bomb.toString('base64url');
  assert.ok(code.length < 60000, 'bomb fits in a link: ' + code.length);
  await assert.rejects(S.decode(code), /too-big/);
});
