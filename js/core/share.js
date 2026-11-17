/* Share a kit as a link: compact JSON, deflate-compressed when the browser can, base64url-encoded.
   Decoding is strict: size limits, JSON only, and everything passes through WB.kit.normalize. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var MAX_CODE = 60000, MAX_JSON = 300000;

  function b64urlFromBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function compact(kit) {
    var o = { v: 1, l: kit.langs, e: [], x: [] };
    if (kit.region) o.r = kit.region;
    if (kit.device) o.d = kit.device;
    if (kit.os) o.o = kit.os;
    if (kit.budget) o.b = kit.budget;
    Object.keys(kit.entries).forEach(function (id) { var en = kit.entries[id]; o.e.push([id, en.e].concat(en.v)); });
    Object.keys(kit.extra).forEach(function (s) { var x = kit.extra[s]; o.x.push([s, x.title, x.size, x.date, x.dir, x.lang]); });
    return o;
  }

  function expand(o) {
    if (!o || o.v !== 1) return null;
    var raw = { langs: o.l, region: o.r, device: o.d, os: o.o, budget: o.b, entries: {}, extra: {} };
    (Array.isArray(o.e) ? o.e : []).slice(0, 500).forEach(function (a) {
      if (Array.isArray(a) && typeof a[0] === 'string') raw.entries[a[0]] = { e: a[1], v: a.slice(2) };
    });
    (Array.isArray(o.x) ? o.x : []).slice(0, 400).forEach(function (a) {
      if (Array.isArray(a) && typeof a[0] === 'string') raw.extra[a[0]] = { title: a[1], size: a[2], date: a[3], dir: a[4], lang: a[5] };
    });
    return WB.kit.normalize(raw);
  }

  function canCompress() { return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined'; }

  function encode(kit) {
    var json = JSON.stringify(compact(kit));
    var bytes = new TextEncoder().encode(json);
    if (!canCompress()) return Promise.resolve('j' + b64urlFromBytes(bytes));
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) { return 'z' + b64urlFromBytes(new Uint8Array(buf)); });
  }

  function decode(code) {
    return new Promise(function (resolve, reject) {
      if (typeof code !== 'string' || code.length < 2 || code.length > MAX_CODE || !/^[jz][A-Za-z0-9_-]+$/.test(code)) return reject(new Error('bad-code'));
      var bytes = bytesFromB64url(code.slice(1));
      var toText = code[0] === 'j' ? Promise.resolve(new TextDecoder().decode(bytes)) : (function () {
        if (!canCompress()) return Promise.reject(new Error('no-decompress'));
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return readCapped(stream);
      })();
      toText.then(function (text) {
        if (text.length > MAX_JSON) throw new Error('too-big');
        var kit = expand(JSON.parse(text));
        if (!kit) throw new Error('bad-kit');
        resolve(kit);
      }).catch(reject);
    });
  }

  // Stop reading a decompressed stream once it passes the limit, so a tiny "zip bomb" link can't hang the page.
  function readCapped(stream) {
    var reader = stream.getReader();
    var chunks = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var all = new Uint8Array(total), off = 0;
          chunks.forEach(function (c) { all.set(c, off); off += c.length; });
          return new TextDecoder().decode(all);
        }
        total += r.value.length;
        if (total > MAX_JSON) { reader.cancel(); throw new Error('too-big'); }
        chunks.push(r.value);
        return pump();
      });
    }
    return pump();
  }

  WB.share = { encode: encode, decode: decode, compact: compact, expand: expand };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.share;
})(typeof self !== 'undefined' ? self : globalThis);
