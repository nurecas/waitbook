/* Live lookups: current Kiwix files, Hugging Face file sizes, the newest Protomaps build.
   Every function takes an injected fetcher ({text(url), json(url)}) so the UI controls timeouts, the
   strict-offline switch and caching, and tests can run without a network. All responses are untrusted. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var O = WB.opds;
  var U = WB.util;

  function pool(items, limit, worker) {
    var i = 0, active = 0, results = new Array(items.length);
    return new Promise(function (resolve) {
      if (!items.length) return resolve(results);
      function next() {
        if (i >= items.length && active === 0) return resolve(results);
        while (active < limit && i < items.length) {
          (function (idx) {
            active++;
            Promise.resolve().then(function () { return worker(items[idx], idx); })
              .then(function (r) { results[idx] = r; }, function (e) { results[idx] = { error: String(e && e.message || e) }; })
              .then(function () { active--; next(); });
          })(i++);
        }
      }
      next();
    });
  }

  /** Resolve Kiwix stems to their newest files. Returns { stem: {date, size, url, dir, at} } for those found. */
  function kiwix(stems, fetcher, onProgress) {
    var names = {};
    stems.forEach(function (s) { if (O.STEM_RE.test(s)) { var n = O.splitStem(s).name; (names[n] = names[n] || []).push(s); } });
    var list = Object.keys(names);
    var out = {};
    var done = 0;
    return pool(list, 4, function (name) {
      return fetcher.text(O.entriesUrl({ name: name, count: 50 })).then(function (xml) {
        var feed = O.parseFeed(xml);
        names[name].forEach(function (stem) {
          var e = O.pickStem(feed.entries, stem);
          if (e && e.url) out[stem] = { date: e.date, size: e.size, url: e.url, dir: e.dir, at: Date.now() };
        });
      }).then(function () { done++; if (onProgress) onProgress(done, list.length); });
    }).then(function () { return out; });
  }

  /** Search the live Kiwix catalog (explorer). */
  function search(params, fetcher) {
    var p = { count: params.count || 30, start: params.start || 0 };
    if (params.q) p.q = String(params.q).slice(0, 120);
    if (params.lang && params.lang.length) p.lang = params.lang.map(U.lang3).join(',');
    if (params.category) p.category = String(params.category).replace(/[^a-z0-9_-]/gi, '');
    return fetcher.text(O.entriesUrl(p)).then(O.parseFeed);
  }

  /** Current size (and SHA-256 when published) of Hugging Face files. */
  function hf(refs, fetcher) {
    var byRepo = {};
    refs.forEach(function (r) {
      if (!/^[A-Za-z0-9_.-]{1,96}\/[A-Za-z0-9_.-]{1,96}$/.test(r.repo) || !/^[A-Za-z0-9_.-]{1,200}$/.test(r.file)) return;
      (byRepo[r.repo] = byRepo[r.repo] || []).push(r.file);
    });
    var out = {};
    return pool(Object.keys(byRepo), 3, function (repo) {
      return fetcher.json('https://huggingface.co/api/models/' + repo + '/tree/main').then(function (list) {
        if (!Array.isArray(list)) return;
        list.forEach(function (f) {
          if (!f || typeof f.path !== 'string' || byRepo[repo].indexOf(f.path) === -1) return;
          var size = f.lfs && typeof f.lfs.size === 'number' ? f.lfs.size : (typeof f.size === 'number' ? f.size : null);
          var sha = f.lfs && typeof f.lfs.oid === 'string' && /^[0-9a-f]{64}$/.test(f.lfs.oid) ? f.lfs.oid : null;
          out['hf:' + repo + '/' + f.path] = { size: size, sha256: sha, at: Date.now() };
        });
      });
    }).then(function () { return out; });
  }

  /** Newest Protomaps planet build key, e.g. "20261116.pmtiles". */
  function protomapsLatest(fetcher) {
    return fetcher.json('https://build-metadata.protomaps.dev/builds.json').then(function (list) {
      if (!Array.isArray(list)) return null;
      var keys = list.map(function (b) { return b && b.key; }).filter(function (k) { return typeof k === 'string' && /^\d{8}\.pmtiles$/.test(k); }).sort();
      return keys.length ? keys[keys.length - 1] : null;
    });
  }

  WB.resolve = { pool: pool, kiwix: kiwix, search: search, hf: hf, protomapsLatest: protomapsLatest };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.resolve;
})(typeof self !== 'undefined' ? self : globalThis);
