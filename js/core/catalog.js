/* Catalog model: items, their choices (edition x language/region/platform), and how each choice turns into files.
   Data comes from data/catalog.js (curated), data/kiwix-known.js (generated facts about Kiwix files) and
   data/apps.js. Live lookups can override Kiwix facts at run time (WB.catalog.setLive). */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var U = WB.util || (typeof require !== 'undefined' ? require('./util.js') : null);

  var data = { shelves: [], items: [] };
  var byId = Object.create(null);
  var known = Object.create(null);    // stem -> [date, bytes, 'eng', dirIndex]
  var dirs = [];
  var patterns = Object.create(null); // pattern -> { code: { l: 'fr', f: ['maxi', 'nopic'] } }
  var regions = Object.create(null); // ISO2 or group id -> stem (maps)
  var missing = Object.create(null); // names the last refresh did not find
  var names = Object.create(null); // stem -> catalog <name>, where it is not simply the stem without its flavour
  var live = Object.create(null); // stem -> { date, size, url, dir, at }
  var apps = {};

  function init(opts) {
    opts = opts || {};
    data = opts.catalog || root.WB_CATALOG || data;
    var k = opts.kiwix || root.WB_KIWIX_KNOWN || {};
    // Lookups by name use maps without a prototype, so a name like "constructor" from a shared kit finds nothing.
    known = bare(k.files);
    dirs = k.dirs || [];
    patterns = bare(k.patterns);
    regions = bare(k.regions);
    missing = Object.create(null);
    (k.missing || []).forEach(function (r) { missing[r] = true; });
    names = bare(k.names);
    apps = opts.apps || (root.WB_APPS && root.WB_APPS.apps) || {};
    byId = Object.create(null);
    data.items.forEach(function (it, i) {
      it._i = i;
      byId[it.id] = it;
    });
    return api;
  }

  function bare(o) { return Object.assign(Object.create(null), o || {}); }
  function setLive(map) { live = bare(map); }
  function liveInfo() { return live; }
  function item(id) { return byId[id] || null; }
  function items() { return data.items; }
  function shelves() { return data.shelves; }
  function shelf(id) { return data.shelves.filter(function (s) { return s.id === id; })[0] || null; }
  function app(id) { return apps[id] || null; }

  function isPattern(k) { return typeof k === 'string' && k.indexOf('{') !== -1; }

  /** The name the Kiwix catalog lists a book under (usually the stem without its flavour, but not always). */
  function opdsName(stem) { return names[stem] || WB.opds.splitStem(stem).name; }

  /** The last catalog refresh looked for this Kiwix name (or pattern) and did not find it, and no live answer since. */
  function isMissing(ref) { return !!missing[ref] && !live[ref]; }

  /** Subjects an item lets you pick from, without those Kiwix no longer offers. */
  function options(it) { return (it.options || []).filter(function (o) { return !o.kiwix || !isMissing(o.kiwix); }); }

  /** Kiwix has withdrawn everything this item points to. It stays reachable by link (with a note) but is left out of
      lists, quick kits and field cards until the catalog is updated. */
  function gone(it) {
    if (it.options) return !options(it).length;
    if (!it.kiwix || it.variants || it.axis === 'region') return false;
    return isMissing(it.kiwix);
  }

  /** The axis an item varies along: 'lang' (default), 'region', 'os' or 'none'. */
  function axis(it) {
    if (it.axis) return it.axis;
    if (it.options) return 'pick';
    if (isPattern(it.kiwix) && it.kiwix.indexOf('{lang}') !== -1) return 'lang';
    if (it.files && it.files.some(function (f) { return f.lang; })) return 'lang';
    if (it.files && it.files.some(function (f) { return f.os; })) return 'os';
    return 'none';
  }

  /** Editions an item offers (Kiwix flavours or declared variants). Always at least one. */
  function editions(it) {
    if (it.flavours) return it.flavours;
    if (it.variants) return it.variants;
    return [{ id: 'default' }];
  }

  function defaultEdition(it) {
    var eds = editions(it);
    return (it.defaultEdition && eds.some(function (e) { return e.id === it.defaultEdition; })) ? it.defaultEdition : eds[0].id;
  }

  /** Expand a Kiwix pattern for one choice into a concrete stem. */
  function stemFor(it, edition, value) {
    var p = edition && it.variants ? (editionObj(it, edition).kiwix || it.kiwix) : it.kiwix;
    if (!p) return null;
    if (!isPattern(p)) return p;
    var a = axis(it);
    var s = p;
    if (s.indexOf('{flavour}') !== -1) s = s.replace('{flavour}', edition);
    if (a === 'lang') {
      var code = codeForLang(p, value);
      if (!code) return null;
      s = s.replace('{lang}', code);
    } else if (a === 'region') {
      var r = regions[value];
      if (!r) return null;
      return r;
    }
    return s;
  }

  function editionObj(it, id) {
    return editions(it).filter(function (e) { return e.id === id; })[0] || editions(it)[0];
  }

  /** Find the name code a pattern uses for a language (e.g. PhET's own codes) from the generated index. */
  function codeForLang(pattern, lang) {
    var idx = patterns[pattern];
    if (!idx) return null;
    var want = U.lang1(lang);
    var codes = Object.keys(idx);
    for (var i = 0; i < codes.length; i++) if (idx[codes[i]].l === want && codes[i] === want) return codes[i];
    for (var j = 0; j < codes.length; j++) if (idx[codes[j]].l === want) return codes[j];
    return null;
  }

  /** Languages (two-letter where possible) an item is available in. ['*'] means language-neutral. */
  function langs(it) {
    if (it._langs) return it._langs;
    var out = [];
    var p = it.kiwix;
    if (isPattern(p) && patterns[p]) {
      Object.keys(patterns[p]).forEach(function (c) { out.push(patterns[p][c].l); });
    } else if (it.variants && it.variants.some(function (v) { return v.kiwix && isPattern(v.kiwix); })) {
      it.variants.forEach(function (v) { if (patterns[v.kiwix]) Object.keys(patterns[v.kiwix]).forEach(function (c) { out.push(patterns[v.kiwix][c].l); }); });
    } else if (it.files && it.files.some(function (f) { return f.lang; })) {
      it.files.forEach(function (f) { if (f.lang) out.push(f.lang); });
    } else if (it.langs) {
      out = it.langs.slice();
    } else if (options(it)[0] && known[options(it)[0].kiwix]) {
      out = known[options(it)[0].kiwix][2].split(',').map(U.lang1);
    } else if (p && known[p]) {
      out = known[p][2].split(',').map(U.lang1);
    } else {
      out = ['*'];
    }
    it._langs = U.uniq(out).sort();
    return it._langs;
  }

  /** Editions available for a given language (patterns may not publish every flavour everywhere). */
  function editionsFor(it, value) {
    var eds = editions(it);
    var a = axis(it);
    if (!it.flavours || !it.kiwix) return eds;
    return eds.filter(function (e) {
      if (a === 'lang' && isPattern(it.kiwix)) {
        var code = codeForLang(it.kiwix, value);
        return !!(code && patterns[it.kiwix][code].f.indexOf(e.id) !== -1);
      }
      if (a !== 'lang' && isPattern(it.kiwix) && patterns[it.kiwix] && patterns[it.kiwix]['']) {
        return patterns[it.kiwix][''].f.indexOf(e.id) !== -1;
      }
      var stem = stemFor(it, e.id, value);
      return !!(stem && (known[stem] || live[stem]));
    });
  }

  /** Facts about a Kiwix file: live first, then the generated snapshot. */
  function kiwixFacts(stem) {
    var lv = live[stem];
    if (lv) return { stem: stem, date: lv.date, size: lv.size, dir: lv.dir, url: lv.url, src: 'live' };
    var k = known[stem];
    if (k) {
      var dir = dirs[k[3]] || 'other';
      return { stem: stem, date: k[0], size: k[1], dir: dir, url: 'https://download.kiwix.org/zim/' + dir + '/' + stem + '_' + k[0] + '.zim', src: 'snapshot' };
    }
    return { stem: stem, date: null, size: null, dir: null, url: null, src: 'none' };
  }

  /**
   * Concrete files for a choice. Each file: { key, kind: 'kiwix'|'url'|'page'|'hf'|'pmtiles',
   *   name, url, size, lang, os, stem, label }. size null = unknown.
   */
  function filesFor(it, edition, values) {
    var a = axis(it);
    var out = [];
    var vals = a === 'none' ? [null] : (values && values.length ? values : []);
    var ed = edition || defaultEdition(it);
    if (a === 'pick') {
      (it.options || []).forEach(function (o) {
        if (vals.indexOf(o.id) === -1 || !o.kiwix) return;
        var f = kiwixFacts(o.kiwix);
        out.push({ key: 'k:' + o.kiwix, kind: 'kiwix', stem: o.kiwix, name: f.date ? o.kiwix + '_' + f.date + '.zim' : o.kiwix + '.zim', url: f.url, size: f.size, date: f.date, pick: o.id, label: o.label, src: f.src });
      });
      return out;
    }
    if (it.kiwix || (it.variants && it.variants.some(function (v) { return v.kiwix; }))) {
      vals.forEach(function (v) {
        var stem = stemFor(it, ed, v);
        if (!stem) return;
        var f = kiwixFacts(stem);
        out.push({ key: 'k:' + stem, kind: 'kiwix', stem: stem, name: f.date ? stem + '_' + f.date + '.zim' : stem + '.zim', url: f.url, size: f.size, date: f.date, lang: a === 'lang' ? v : null, region: a === 'region' ? v : null, src: f.src });
      });
      return out;
    }
    if (it.files) {
      var eo = editionObj(it, ed);
      it.files.forEach(function (f, i) {
        if (f.edition && f.edition !== eo.id) return;
        if (a === 'lang' && vals.indexOf(f.lang) === -1) return;
        if (a === 'os' && vals.indexOf(f.os) === -1) return;
        out.push({ key: 'u:' + it.id + ':' + i, kind: f.page ? 'page' : 'url', url: f.url, name: f.name || U.basename(f.url), size: f.size == null ? null : f.size, lang: f.lang || null, os: f.os || null, label: f.label || null });
      });
      return out;
    }
    if (it.hf) {
      var hv = editionObj(it, ed);
      var hf = hv.hf || it.hf;
      var lvh = live['hf:' + hf.repo + '/' + hf.file];
      // A recent lookup pins the link to the revision it read (its checksum belongs to that file); otherwise 'main'.
      var rev = lvh && typeof lvh.rev === 'string' && /^[0-9a-f]{40}$/.test(lvh.rev) && Date.now() - (lvh.at || 0) < 30 * 864e5 ? lvh.rev : 'main';
      out.push({ key: 'h:' + hf.repo + '/' + hf.file, kind: 'hf', url: 'https://huggingface.co/' + hf.repo + '/resolve/' + rev + '/' + hf.file, name: hf.file, size: lvh ? lvh.size : (hv.size || it.size || null), repo: hf.repo, src: lvh ? 'live' : 'catalog' });
      return out;
    }
    if (it.pmtiles) {
      var z = parseInt(String(ed).replace(/\D/g, ''), 10) || 12;
      vals.forEach(function (v) {
        out.push({ key: 'm:' + it.id + ':' + (v || 'custom'), kind: 'pmtiles', region: v, zoom: z, name: 'map-' + String(v || 'area').toLowerCase() + '.pmtiles', size: estimateMap(regionBoxes(v), z), est: true, url: null });
      });
      return out;
    }
    if (it.page) {
      out.push({ key: 'p:' + it.id, kind: 'page', url: it.page, name: it.title, size: null });
    }
    return out;
  }

  /** Default choice values for an item, given the user's languages/region/platform. */
  function defaultValues(it, ctx) {
    ctx = ctx || {};
    var a = axis(it);
    if (a === 'none') return [];
    if (a === 'region') {
      if (it.pmtiles) return ctx.region ? [ctx.region] : [];
      return ctx.region && regions[ctx.region] ? [ctx.region] : [];
    }
    if (a === 'pick') {
      var avail = options(it).map(function (o) { return o.id; });
      var dp = (it.defaultPick || []).filter(function (id) { return avail.indexOf(id) !== -1; });
      return dp.length ? dp : avail.slice(0, 1);
    }
    if (a === 'os') {
      var oss = (it.files || []).map(function (f) { return f.os; });
      var pick = ctx.os && oss.indexOf(ctx.os) !== -1 ? [ctx.os] : [];
      if (!pick.length && oss.length) pick = [oss[0]];
      return pick;
    }
    var have = langs(it);
    if (have[0] === '*' || have[0] === 'mul') return [];
    var mine = (ctx.langs || []).map(U.lang1).filter(function (l) { return have.indexOf(l) !== -1; });
    if (mine.length) return it.oneLang ? mine.slice(0, 1) : mine;
    if (it.fallbackEn !== false && have.indexOf('en') !== -1) return ['en'];
    return have.slice(0, 1);
  }

  // Rough size of a Protomaps extract: the planet at that zoom (about 120 GB at z15, halving per level) times the
  // share of the Earth's surface in the box, weighted up because mapped detail concentrates on land and in towns.
  var EARTH_KM2 = 510e6;
  /** Size estimate for one box or a list of boxes [w,s,e,n] (west > east crosses the antimeridian). */
  function estimateMap(b, z) {
    if (!b || !b.length) return null;
    var list = Array.isArray(b[0]) ? b : [b];
    var planet = 120e9 / Math.pow(2, 15 - Math.min(15, Math.max(0, z)));
    var share = 0;
    list.forEach(function (x) {
      var w = x[0] > x[2] ? (180 - x[0]) + (x[2] + 180) : x[2] - x[0];
      var midLat = (x[1] + x[3]) / 2 * Math.PI / 180;
      share += Math.abs(w * 111.32 * Math.cos(midLat)) * Math.abs((x[3] - x[1]) * 110.57) / EARTH_KM2 * 6;
    });
    return Math.max(20e6, Math.round(planet * Math.min(1, share)));
  }

  // Continents, as the boxes their maps are cut from. Oceania is several boxes so it reaches the Pacific islands
  // (Palau to French Polynesia) without the empty ocean between them.
  var GROUP_BOXES = {
    '@world': [[-180, -85, 180, 85]],
    '@africa': [[-25.4, -35.0, 63.6, 37.6]],
    '@europe': [[-31.3, 34.5, 45.0, 71.2]],
    '@asia': [[25.0, -11.0, 180, 77.8]],
    '@north-america': [[-168.0, 7.0, -52.0, 83.2]],
    '@central-america': [[-92.3, 7.0, -59.4, 27.3]],
    '@south-america': [[-81.4, -56.0, -34.7, 13.4]],
    '@oceania': [[112, -44, 156, 0], [165, -48, 179.9, -34], [156, -23, -169, 0], [130, 0, 173, 21], [-166, -28, -134, 5]],
  };
  /** Every box a region covers: a country's main part and its far parts (islands, exclaves), or a continent. */
  function regionBoxes(v) {
    if (GROUP_BOXES[v]) return GROUP_BOXES[v].map(function (b) { return b.slice(); });
    var c = (root.WB_COUNTRIES || {})[v];
    if (!c || !c.b) return null;
    return [c.b].concat(c.x || []).map(function (b) { return b.slice(); });
  }
  /** The main box (for framing the map view). */
  function regionBox(v) { var l = regionBoxes(v); return l ? l[0] : null; }

  function sizeOf(files) {
    var total = 0, unknown = 0;
    files.forEach(function (f) { if (f.size == null) { if (f.kind !== 'page') unknown++; } else total += f.size; });
    return { bytes: total, unknown: unknown };
  }

  /** Does the item have anything in these languages? */
  function matchesLangs(it, ls) {
    if (!ls || !ls.length) return true;
    var have = langs(it);
    if (have[0] === '*' || have.indexOf('mul') !== -1) return true;
    return ls.some(function (l) { return have.indexOf(U.lang1(l)) !== -1; });
  }

  /** Words in the reader's language that describe an item: its shelf's name and description and its type. Titles and
      descriptions come from publishers (mostly in English), so this is what lets people search in their own language. */
  function localText(it) {
    var I = WB.i18n;
    if (!I) return '';
    if (it._loc && it._loc.k === I.lang) return it._loc.v;
    var v = U.fold([I.t('shelf.' + it.shelf), I.t('shelf.' + it.shelf + '.d'), I.t('kind.' + it.kind)].join(' '));
    it._loc = { k: I.lang, v: v };
    return v;
  }

  function search(list, q) {
    var f = U.fold(q);
    if (!f) return list;
    var words = f.split(' ');
    return list.filter(function (it) {
      var hay = it._hay || (it._hay = U.fold([it.title, it.by, it.desc, (it.tags || []).join(' '), it.id, typeof it.kiwix === 'string' ? it.kiwix : ''].join(' ')));
      var loc = localText(it);
      return words.every(function (w) { return hay.indexOf(w) !== -1 || loc.indexOf(w) !== -1; });
    });
  }

  function filter(opts) {
    opts = opts || {};
    var list = data.items.filter(function (it) {
      if (!opts.all && gone(it)) return false;
      if (opts.shelf && it.shelf !== opts.shelf) return false;
      if (opts.p && it.p > opts.p) return false;
      if (opts.kind && it.kind !== opts.kind) return false;
      if (opts.langs && opts.langs.length && !matchesLangs(it, opts.langs)) return false;
      return true;
    });
    if (opts.q) list = search(list, opts.q);
    return list;
  }

  /** Every Kiwix stem or pattern the curated catalog refers to (used by the refresh tool). */
  function allKiwixRefs(cat) {
    var refs = [];
    (cat || data).items.forEach(function (it) {
      if (it.kiwix) refs.push(it.kiwix);
      (it.variants || []).forEach(function (v) { if (v.kiwix) refs.push(v.kiwix); });
      (it.options || []).forEach(function (o) { if (o.kiwix) refs.push(o.kiwix); });
      if (it.axis === 'region' && it.kiwix) refs.push('regions:' + it.kiwix);
    });
    return U.uniq(refs);
  }

  function regionList() { return regions; }

  var api = {
    init: init, setLive: setLive, liveInfo: liveInfo, item: item, items: items, shelves: shelves, shelf: shelf, app: app,
    axis: axis, editions: editions, editionsFor: editionsFor, defaultEdition: defaultEdition, editionObj: editionObj,
    stemFor: stemFor, langs: langs, kiwixFacts: kiwixFacts, filesFor: filesFor, defaultValues: defaultValues,
    sizeOf: sizeOf, matchesLangs: matchesLangs, search: search, filter: filter, allKiwixRefs: allKiwixRefs,
    isPattern: isPattern, isMissing: isMissing, opdsName: opdsName, options: options, gone: gone, regionList: regionList, codeForLang: codeForLang, estimateMap: estimateMap, regionBox: regionBox, regionBoxes: regionBoxes,
  };
  WB.catalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
