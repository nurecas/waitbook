/* The kit: what the person has chosen, plus their languages, region, device and storage budget.
   Pure functions over plain objects; persistence lives in js/ui/store.js. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var U = WB.util;
  var C = WB.catalog;
  var O = WB.opds;

  var DEVICES = ['phone', 'tablet', 'computer', 'drive', 'server'];
  var OSES = ['windows', 'mac', 'linux', 'android', 'pi', 'ios'];
  var PRESETS = {
    pocket: { budget: 8e9, depth: 2 },
    household: { budget: 64e9, depth: 3 },
    community: { budget: 512e9, depth: 3 },
    everything: { budget: null, depth: 3 },
  };
  var MAX_LANGS = 12, MAX_EXTRA = 400;
  var VALUE_RE = /^[@A-Za-z0-9_-]{1,40}$/;

  function empty() {
    return { v: 1, langs: [], region: null, device: null, os: null, budget: null, entries: {}, extra: {}, done: {}, updated: 0 };
  }

  /** Coerce untrusted input (storage, shared links, imported files) into a valid kit. Unknown items are dropped. */
  function normalize(raw) {
    var k = empty();
    if (!raw || typeof raw !== 'object') return k;
    if (Array.isArray(raw.langs)) k.langs = U.uniq(raw.langs.filter(function (l) { return typeof l === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(l); }).map(function (l) { return l.toLowerCase(); })).slice(0, MAX_LANGS);
    if (typeof raw.region === 'string' && /^(@[a-z-]{2,20}|[A-Z]{2})$/.test(raw.region)) k.region = raw.region;
    if (DEVICES.indexOf(raw.device) !== -1) k.device = raw.device;
    if (OSES.indexOf(raw.os) !== -1) k.os = raw.os;
    if (typeof raw.budget === 'number' && isFinite(raw.budget) && raw.budget > 0 && raw.budget < 1e15) k.budget = Math.round(raw.budget);
    if (raw.entries && typeof raw.entries === 'object') {
      Object.keys(raw.entries).slice(0, 500).forEach(function (id) {
        var it = C.item(id);
        var e = raw.entries[id];
        if (!it || !e || typeof e !== 'object') return;
        var eds = C.editions(it).map(function (x) { return x.id; });
        var ed = eds.indexOf(e.e) !== -1 ? e.e : C.defaultEdition(it);
        var vals = Array.isArray(e.v) ? e.v.filter(function (x) { return typeof x === 'string' && VALUE_RE.test(x); }).slice(0, 40) : [];
        k.entries[id] = { e: ed, v: U.uniq(vals) };
      });
    }
    if (raw.extra && typeof raw.extra === 'object') {
      Object.keys(raw.extra).slice(0, MAX_EXTRA).forEach(function (stem) {
        var x = raw.extra[stem];
        if (!O.STEM_RE.test(stem) || !x || typeof x !== 'object') return;
        k.extra[stem] = {
          stem: stem,
          title: typeof x.title === 'string' ? x.title.replace(/[\u0000-\u001f\u2028\u2029]/g, ' ').slice(0, 200) : stem,
          size: typeof x.size === 'number' && isFinite(x.size) && x.size > 0 ? x.size : null,
          date: typeof x.date === 'string' && /^\d{4}-\d{2}[a-z]{0,2}$/.test(x.date) ? x.date : null,
          dir: typeof x.dir === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(x.dir) ? x.dir : null,
          lang: typeof x.lang === 'string' && /^[a-z,]{2,40}$/.test(x.lang) ? x.lang : '',
        };
      });
    }
    if (raw.done && typeof raw.done === 'object') {
      Object.keys(raw.done).slice(0, 2000).forEach(function (key) { if (/^[A-Za-z0-9:._@\/-]{1,200}$/.test(key) && raw.done[key]) k.done[key] = 1; });
    }
    k.updated = typeof raw.updated === 'number' ? raw.updated : 0;
    return k;
  }

  function ctx(kit) { return { langs: kit.langs, region: kit.region, os: kit.os }; }
  function has(kit, id) { return !!kit.entries[id]; }

  function add(kit, id, edition, values) {
    var it = C.item(id);
    if (!it) return kit;
    kit.entries[id] = { e: edition || C.defaultEdition(it), v: values ? values.slice() : C.defaultValues(it, ctx(kit)) };
    kit.updated = Date.now();
    return kit;
  }
  function remove(kit, id) { delete kit.entries[id]; kit.updated = Date.now(); return kit; }
  function toggle(kit, id) { return has(kit, id) ? remove(kit, id) : add(kit, id); }

  function addExtra(kit, e) {
    if (!e || !O.STEM_RE.test(e.stem)) return kit;
    kit.extra[e.stem] = { stem: e.stem, title: String(e.title || e.stem).slice(0, 200), size: e.size || null, date: e.date || null, dir: e.dir || null, lang: (e.lang || []).join ? e.lang.join(',') : String(e.lang || '') };
    kit.updated = Date.now();
    return kit;
  }
  function removeExtra(kit, stem) { delete kit.extra[stem]; kit.updated = Date.now(); return kit; }

  /** When an edition isn't published for one language, use the nearest one that is (smaller first). */
  function editionFor(it, wanted, value) {
    if (!it.flavours) return wanted;
    var avail = C.editionsFor(it, value).map(function (e) { return e.id; });
    if (!avail.length || avail.indexOf(wanted) !== -1) return wanted;
    var order = C.editions(it).map(function (e) { return e.id; });
    var w = order.indexOf(wanted);
    for (var d = 1; d < order.length; d++) {
      if (order[w + d] && avail.indexOf(order[w + d]) !== -1) return order[w + d];
      if (order[w - d] && avail.indexOf(order[w - d]) !== -1) return order[w - d];
    }
    return avail[0];
  }

  /** Files for one entry, per value, applying edition fallbacks per language. */
  function entryFiles(it, entry) {
    var a = C.axis(it);
    if (a === 'lang' && it.flavours) {
      var out = [];
      entry.v.forEach(function (val) { out = out.concat(C.filesFor(it, editionFor(it, entry.e, val), [val])); });
      return out;
    }
    return C.filesFor(it, entry.e, entry.v);
  }

  function extraFile(x) {
    var url = x.date && x.dir ? 'https://download.kiwix.org/zim/' + x.dir + '/' + x.stem + '_' + x.date + '.zim' : null;
    var lv = C.liveInfo()[x.stem];
    if (lv) url = lv.url;
    return { key: 'k:' + x.stem, kind: 'kiwix', stem: x.stem, name: x.date ? x.stem + '_' + x.date + '.zim' : x.stem + '.zim', url: url, size: lv ? lv.size : x.size, date: lv ? lv.date : x.date, src: lv ? 'live' : 'explorer' };
  }

  /** Flatten the kit into rows: { id, item, entry, files, size, unknown } grouped in catalog order. */
  function rows(kit) {
    var list = [];
    Object.keys(kit.entries).forEach(function (id) {
      var it = C.item(id);
      if (!it) return;
      var files = entryFiles(it, kit.entries[id]);
      var s = C.sizeOf(files);
      list.push({ id: id, item: it, entry: kit.entries[id], files: files, size: s.bytes, unknown: s.unknown });
    });
    var shelfOrder = C.shelves().map(function (s) { return s.id; });
    list.sort(function (a, b) { return (shelfOrder.indexOf(a.item.shelf) - shelfOrder.indexOf(b.item.shelf)) || (a.item.p - b.item.p) || (a.item._i - b.item._i); });
    Object.keys(kit.extra).forEach(function (stem) {
      var f = extraFile(kit.extra[stem]);
      list.push({ id: 'x:' + stem, item: null, extra: kit.extra[stem], entry: null, files: [f], size: f.size || 0, unknown: f.size == null ? 1 : 0 });
    });
    return list;
  }

  function totals(kit) {
    var t = { bytes: 0, unknown: 0, items: 0, files: 0, pages: 0, done: 0, seen: {} };
    rows(kit).forEach(function (r) {
      t.items++;
      r.files.forEach(function (f) {
        if (t.seen[f.key]) return; // the same file chosen twice counts once
        t.seen[f.key] = 1;
        if (f.kind === 'page') { t.pages++; return; }
        t.files++;
        if (f.size == null) t.unknown++; else t.bytes += f.size;
        if (kit.done[f.key]) t.done++;
      });
    });
    delete t.seen;
    return t;
  }

  /**
   * Fill a kit to a budget. Pass 1 covers every essential at its smallest edition, then each lower tier;
   * pass 2 upgrades editions toward each item's default; pass 3 upgrades further while space remains.
   * If several languages don't fit, the primary language alone is tried before giving up on an item.
   */
  function autofill(opts) {
    var kit = empty();
    kit.langs = (opts.langs || []).slice(0, MAX_LANGS);
    kit.region = opts.region || null;
    kit.device = opts.device || null;
    kit.os = opts.os || null;
    kit.budget = opts.budget || null;
    var budget = opts.budget || Infinity;
    var depth = opts.depth || 2;
    var shared = kit.device === 'drive' || kit.device === 'server';
    var shelves = opts.shelves || C.shelves().map(function (s) { return s.id; });
    var used = 0;
    var c = ctx(kit);
    var groups = {};
    var groupLimit = shared ? 2 : 1;

    function sizeWith(it, ed, vals) { return C.sizeOf(entryFiles(it, { e: ed, v: vals })).bytes; }
    function smallFirst(it) {
      var eds = C.editions(it).map(function (e) { return e.id; });
      return it.flavours ? eds.slice().reverse() : eds;
    }
    function valuesFor(it) {
      if (C.axis(it) === 'os' && shared) return U.uniq((it.files || []).map(function (f) { return f.os; }).filter(Boolean));
      return C.defaultValues(it, c);
    }
    function eligible(it) {
      if (shelves.indexOf(it.shelf) === -1 || it.p > depth) return false;
      if (!C.matchesLangs(it, kit.langs)) return false;
      if (it.devices && kit.device && it.devices.indexOf(kit.device) === -1) return false;
      if (C.axis(it) === 'os' && !shared && !(it.files || []).some(function (f) { return f.os === kit.os; })) return false;
      return true;
    }
    // Try to add an item at its smallest edition; with several languages or subjects, fall back to the first only.
    function tryAdd(it) {
      if (kit.entries[it.id]) return true;
      if (it.altOf && kit.entries[it.altOf]) return false;
      if (it.group && (groups[it.group] || 0) >= groupLimit) return false;
      var vals = valuesFor(it);
      var a = C.axis(it);
      if (a !== 'none' && !vals.length) return false;
      var tries = [vals];
      if ((a === 'lang' || a === 'pick') && vals.length > 1) tries.push(vals.slice(0, 1));
      var ed = smallFirst(it)[0];
      for (var t = 0; t < tries.length; t++) {
        var sz = sizeWith(it, ed, tries[t]);
        if (used + sz <= budget) {
          kit.entries[it.id] = { e: ed, v: tries[t].slice() };
          used += sz;
          if (it.group) groups[it.group] = (groups[it.group] || 0) + 1;
          return true;
        }
      }
      return false;
    }
    // Upgrade an added item toward a target edition (or as rich as fits).
    function upgrade(it, richest) {
      var en = kit.entries[it.id];
      if (!en || !it.flavours) return;
      var order = C.editions(it).map(function (e) { return e.id; });
      var target = richest ? order[0] : C.defaultEdition(it);
      var cur = order.indexOf(en.e);
      for (var i = order.indexOf(target); i >= 0 && i < cur; i++) {
        var before = sizeWith(it, en.e, en.v);
        var after = sizeWith(it, order[i], en.v);
        if (used - before + after <= budget) { used = used - before + after; en.e = order[i]; return; }
      }
    }

    var cands = C.items().filter(eligible);
    var shelfOrder = C.shelves().map(function (s) { return s.id; });
    var sizeCache = {};
    function minSize(it) {
      if (sizeCache[it.id] == null) sizeCache[it.id] = sizeWith(it, smallFirst(it)[0], valuesFor(it).slice(0, 1));
      return sizeCache[it.id];
    }
    for (var tier = 1; tier <= depth; tier++) {
      var group = cands.filter(function (it) { return it.p === tier; });
      // Smallest first within a tier, so a tight budget covers as many needs as possible.
      group.sort(function (a, b) { return (minSize(a) - minSize(b)) || (shelfOrder.indexOf(a.shelf) - shelfOrder.indexOf(b.shelf)) || (a._i - b._i); });
      group.forEach(function (it) {
        if (!tryAdd(it) && it.alt) {
          var alt = C.item(it.alt);
          if (alt && eligible(Object.assign({}, alt, { p: tier }))) tryAdd(alt);
        }
      });
      // Before moving to a lower priority, bring this tier's items up to their default edition.
      group.forEach(function (it) { upgrade(it, false); });
    }
    cands.forEach(function (it) { upgrade(it, true); });
    kit.updated = Date.now();
    return kit;
  }

  /** Merge kit b into a (used when adding a preset or a shared kit to an existing one). */
  function merge(a, b) {
    var out = normalize(JSON.parse(JSON.stringify(a)));
    Object.keys(b.entries).forEach(function (id) { if (!out.entries[id]) out.entries[id] = b.entries[id]; });
    Object.keys(b.extra).forEach(function (s) { if (!out.extra[s]) out.extra[s] = b.extra[s]; });
    out.langs = U.uniq(out.langs.concat(b.langs)).slice(0, MAX_LANGS);
    out.updated = Date.now();
    return out;
  }

  WB.kit = {
    DEVICES: DEVICES, OSES: OSES, PRESETS: PRESETS, empty: empty, normalize: normalize, ctx: ctx, has: has, add: add,
    remove: remove, toggle: toggle, addExtra: addExtra, removeExtra: removeExtra, rows: rows, totals: totals,
    autofill: autofill, merge: merge, entryFiles: entryFiles, editionFor: editionFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.kit;
})(typeof self !== 'undefined' ? self : globalThis);
