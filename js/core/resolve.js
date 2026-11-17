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
    var C = WB.catalog;
    var names = Object.create(null);
    stems.forEach(function (s) { if (O.STEM_RE.test(s)) { var n = C && C.opdsName ? C.opdsName(s) : O.splitStem(s).name; (names[n] = names[n] || []).push(s); } });
    var list = Object.keys(names);
    var out = Object.create(null);
    var done = 0;
    function take(xml, wanted) {
      var feed = O.parseFeed(xml);
      wanted.forEach(function (stem) {
        var e = O.pickStem(feed.entries, stem);
        if (e && e.url) out[stem] = { date: e.date, size: e.size, url: e.url, dir: e.dir, at: Date.now() };
      });
    }
    return pool(list, 4, function (name) {
      return fetcher.text(O.entriesUrl({ name: name, count: 50 })).then(function (xml) { take(xml, names[name]); })
        .then(function () { done++; if (onProgress) onProgress(done, list.length); });
    }).then(function () {
      // A book listed under another name than expected: search for the first part of its name.
      var terms = Object.create(null);
      stems.forEach(function (s) { if (O.STEM_RE.test(s) && !out[s]) { var q = searchTerm(s); (terms[q] = terms[q] || []).push(s); } });
      return pool(Object.keys(terms), 3, function (q) {
        return fetcher.text(O.entriesUrl({ q: q, count: 50 })).then(function (xml) { take(xml, terms[q]); }, function () { /* keep what we have */ });
      });
    }).then(function () { return out; });
  }

  /** The longest part of a stem's first segment, e.g. "gardenology" for "gardenology.org_en_all". */
  function searchTerm(stem) { return stem.split('_')[0].split('.').sort(function (a, b) { return b.length - a.length; })[0]; }

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
    var byRepo = Object.create(null);
    refs.forEach(function (r) {
      if (!/^[A-Za-z0-9_.-]{1,96}\/[A-Za-z0-9_.-]{1,96}$/.test(r.repo) || !/^[A-Za-z0-9_.-]{1,200}$/.test(r.file)) return;
      (byRepo[r.repo] = byRepo[r.repo] || []).push(r.file);
    });
    var out = {};
    return pool(Object.keys(byRepo), 3, function (repo) {
      // The current revision first, then the files at exactly that revision: a checksum then always belongs to the
      // file a link pinned to that revision downloads, even if the publisher uploads a new version later.
      return fetcher.json('https://huggingface.co/api/models/' + repo + '/revision/main').then(function (info) {
        return info && typeof info.sha === 'string' && /^[0-9a-f]{40}$/.test(info.sha) ? info.sha : null;
      }, function () { return null; }).then(function (rev) {
        return fetcher.json('https://huggingface.co/api/models/' + repo + '/tree/' + (rev || 'main')).then(function (list) {
          if (!Array.isArray(list)) return;
          list.forEach(function (f) {
            if (!f || typeof f.path !== 'string' || byRepo[repo].indexOf(f.path) === -1) return;
            var size = f.lfs && typeof f.lfs.size === 'number' ? f.lfs.size : (typeof f.size === 'number' ? f.size : null);
            var sha = f.lfs && typeof f.lfs.oid === 'string' && /^[0-9a-f]{64}$/.test(f.lfs.oid) ? f.lfs.oid : null;
            out['hf:' + repo + '/' + f.path] = { size: size, sha256: rev ? sha : null, rev: rev, at: Date.now() };
          });
        });
      });
    }).then(function () { return out; });
  }

  WB.resolve = { pool: pool, kiwix: kiwix, search: search, hf: hf };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.resolve;
})(typeof self !== 'undefined' ? self : globalThis);
