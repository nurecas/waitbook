/* Waitbook core utilities. Pure functions; loads in browsers (classic script) and in Node (tests). */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});

  var GB = 1e9;

  /** Locale-aware byte formatting with decimal units (what download sites and disks use). */
  function bytes(n, locale, opts) {
    opts = opts || {};
    if (n == null || !isFinite(n)) return opts.unknown || '—';
    var units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
    var i = 0;
    var v = Math.abs(n);
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    var digits = v >= 100 || i <= 1 ? 0 : v >= 10 ? 1 : (opts.precise ? 2 : 1);
    try {
      return new Intl.NumberFormat(locale || 'en', { style: 'unit', unit: units[i], unitDisplay: 'short', maximumFractionDigits: digits }).format(v);
    } catch (e) {
      var short = ['B', 'kB', 'MB', 'GB', 'TB'];
      return v.toFixed(digits) + ' ' + short[i];
    }
  }

  function num(n, locale) {
    try { return new Intl.NumberFormat(locale || 'en').format(n); } catch (e) { return String(n); }
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** Lower-case, strip diacritics and collapse spaces, for forgiving search across scripts. */
  function fold(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** File names we write to disk: letters, digits, dot, dash, underscore only. */
  function safeName(s, fallback) {
    var out = String(s == null ? '' : s)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/-\./g, '.')
      .replace(/\.-/g, '.')
      .replace(/^[.-]+/, '')
      .replace(/[-.]+$/, '')
      .slice(0, 150);
    return out || fallback || 'file';
  }

  // Characters allowed in a download URL we put into a shell script. Excludes quotes, backticks, $, spaces,
  // backslashes, ; | & < > and control characters. Percent-encoding is fine.
  var URL_SAFE = /^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[A-Za-z0-9._~%!*()+,=:@\/-]*)?(?:\?[A-Za-z0-9._~%!*()+,=:@\/&-]*)?$/;

  /** Strict check for URLs that go into generated scripts and link lists. */
  function isSafeUrl(url, allowedHosts) {
    if (typeof url !== 'string' || url.length > 2048 || !URL_SAFE.test(url)) return false;
    var host = url.slice(8).split(/[/:?]/)[0].toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return false;
    if (allowedHosts && allowedHosts.length) {
      return allowedHosts.some(function (h) { return host === h || (h.charAt(0) === '.' && host.slice(-h.length) === h); });
    }
    return true;
  }

  function hostOf(url) {
    var m = /^https?:\/\/([^/:?#]+)/i.exec(url || '');
    return m ? m[1].toLowerCase() : '';
  }

  function basename(url) {
    var path = String(url || '').split(/[?#]/)[0];
    var last = path.split('/').pop() || '';
    try { last = decodeURIComponent(last); } catch (e) { /* keep raw */ }
    return last;
  }

  /** POSIX shell single-quoting. */
  function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  /** PowerShell single-quoted string. */
  function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function decodeXmlEntities(s) {
    return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      var k = e.toLowerCase();
      if (k === 'amp') return '&';
      if (k === 'lt') return '<';
      if (k === 'gt') return '>';
      if (k === 'quot') return '"';
      if (k === 'apos') return "'";
      var code = k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      if (!isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    });
  }

  // ISO 639 helpers. WB_LANG3 maps three-letter codes to two-letter ones (generated from CLDR).
  // Read lazily: data/countries.js (which defines WB_LANG3) may load after this file.
  function three2two() { return root.WB_LANG3 || {}; }
  var two2three = null;
  function lang1(code) {
    code = String(code || '').toLowerCase().split(/[-_]/)[0];
    return three2two()[code] || code;
  }
  function lang3(code) {
    if (!two2three && root.WB_LANG3) {
      two2three = {};
      Object.keys(root.WB_LANG3).forEach(function (k) { two2three[root.WB_LANG3[k]] = k; });
      // Kiwix uses the individual-language code for these macrolanguages.
      two2three.zh = 'zho'; two2three.ar = 'ara'; two2three.ms = 'msa'; two2three.fa = 'fas'; two2three.sw = 'swa';
    }
    code = lang1(code);
    return (two2three && two2three[code]) || code;
  }

  var RTL = { ar: 1, fa: 1, ur: 1, he: 1, ps: 1, sd: 1, ug: 1, yi: 1, dv: 1, ckb: 1, arz: 1, ary: 1 };
  function isRtl(code) { return !!RTL[lang1(code)]; }

  /** A code safe to put in an HTML lang attribute (two-letter primary language), or null. */
  function langAttr(code) { var c = lang1(code); return /^[a-z]{2}$/.test(c) ? c : null; }

  function uniq(list) {
    var seen = Object.create(null);
    return list.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }

  function todayStamp(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  WB.util = {
    GB: GB, bytes: bytes, num: num, clamp: clamp, debounce: debounce, fold: fold, safeName: safeName,
    isSafeUrl: isSafeUrl, hostOf: hostOf, basename: basename, shQuote: shQuote, psQuote: psQuote,
    escapeHtml: escapeHtml, decodeXmlEntities: decodeXmlEntities, lang1: lang1, lang3: lang3, isRtl: isRtl, langAttr: langAttr,
    uniq: uniq, todayStamp: todayStamp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.util;
})(typeof self !== 'undefined' ? self : globalThis);
