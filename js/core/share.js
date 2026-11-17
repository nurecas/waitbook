/* Share a kit as a link: compact JSON, deflate-compressed when the browser can, base64url-encoded.
   Decoding is strict: size limits, JSON only, and everything passes through WB.kit.normalize.
   Browsers without CompressionStream('deflate-raw') (iOS before 16.4, Chrome before 103) make uncompressed links,
   and open compressed ones with the small decoder below. */
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

  var native = null;
  /** Does this browser really support 'deflate-raw' streams (not just the API)? */
  function canCompress() {
    if (native === null) {
      try {
        new CompressionStream('deflate-raw');
        new DecompressionStream('deflate-raw');
        native = typeof Response !== 'undefined' && typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function';
      } catch (e) { native = false; }
    }
    return native;
  }

  /* ---- Raw DEFLATE decoder (RFC 1951), after zlib's "puff". Stops once the output passes `max` bytes. ---- */
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  /** Canonical Huffman table from code lengths: how many codes of each length, and the symbols in code order. */
  function huffman(lengths) {
    var count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lengths.length), i;
    for (i = 0; i < lengths.length; i++) count[lengths[i]]++;
    count[0] = 0;
    for (var len = 1, left = 1; len < 16; len++) { left = left * 2 - count[len]; if (left < 0) throw new Error('bad-deflate'); }
    for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (i = 0; i < lengths.length; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
    return { count: count, sym: sym };
  }
  var FIXED = (function () {
    var l = new Uint8Array(288), d = new Uint8Array(30), i;
    for (i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    for (i = 0; i < 30; i++) d[i] = 5;
    return [huffman(l), huffman(d)];
  })();

  function inflateRaw(src, max) {
    var out = new Uint8Array(Math.min(max, 1 << 16)), n = 0, pos = 0, bit = 0;
    function put(b) {
      if (n >= max) throw new Error('too-big');
      if (n === out.length) { var grown = new Uint8Array(Math.min(max, out.length * 2)); grown.set(out); out = grown; }
      out[n++] = b;
    }
    function bits(k) {
      var v = 0;
      for (var i = 0; i < k; i++) {
        if (pos >= src.length) throw new Error('bad-deflate');
        v |= ((src[pos] >> bit) & 1) << i;
        if (++bit === 8) { bit = 0; pos++; }
      }
      return v;
    }
    function decode(h) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len < 16; len++) {
        code |= bits(1);
        var c = h.count[len];
        if (code - c < first) return h.sym[index + (code - first)];
        index += c; first = (first + c) << 1; code <<= 1;
      }
      throw new Error('bad-deflate');
    }
    function dynamic() {
      var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, i;
      if (nlen > 286 || ndist > 30) throw new Error('bad-deflate');
      var cl = new Uint8Array(19);
      for (i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
      var ch = huffman(cl), all = new Uint8Array(nlen + ndist);
      for (i = 0; i < nlen + ndist;) {
        var s = decode(ch);
        if (s < 16) { all[i++] = s; continue; }
        var val = 0, rep;
        if (s === 16) { if (!i) throw new Error('bad-deflate'); val = all[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
        if (i + rep > nlen + ndist) throw new Error('bad-deflate');
        while (rep--) all[i++] = val;
      }
      if (!all[256]) throw new Error('bad-deflate');
      return [huffman(all.subarray(0, nlen)), huffman(all.subarray(nlen))];
    }
    var last;
    do {
      last = bits(1);
      var type = bits(2);
      if (type === 0) {
        if (bit) { bit = 0; pos++; }
        if (pos + 4 > src.length) throw new Error('bad-deflate');
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
        pos += 4;
        if (len !== (~nlen & 0xffff) || pos + len > src.length) throw new Error('bad-deflate');
        while (len--) put(src[pos++]);
      } else if (type === 1 || type === 2) {
        var t = type === 1 ? FIXED : dynamic();
        for (;;) {
          var s = decode(t[0]);
          if (s < 256) { put(s); continue; }
          if (s === 256) break;
          s -= 257;
          if (s >= 29) throw new Error('bad-deflate');
          var count = LBASE[s] + bits(LEXT[s]);
          var ds = decode(t[1]);
          if (ds >= 30) throw new Error('bad-deflate');
          var dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > n) throw new Error('bad-deflate');
          while (count--) put(out[n - dist]);
        }
      } else throw new Error('bad-deflate');
    } while (!last);
    return out.subarray(0, n);
  }

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
        if (!canCompress()) {
          try { return Promise.resolve(new TextDecoder().decode(inflateRaw(bytes, MAX_JSON + 1))); } catch (e) { return Promise.reject(e); }
        }
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

  WB.share = { encode: encode, decode: decode, compact: compact, expand: expand, inflateRaw: inflateRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.share;
})(typeof self !== 'undefined' ? self : globalThis);
