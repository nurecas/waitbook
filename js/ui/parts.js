/* Shared pieces of the interface: ledger rows, stamps, sizes, labels. */
(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon;
  function t(k, v) { return WB.i18n.t(k, v); }
  function loc() { return WB.i18n.lang; }
  var S = WB.store, C = WB.catalog, K = WB.kit, U = WB.util;

  function shelfName(id) { return t('shelf.' + id); }
  function shelfIndex(id) { return C.shelves().map(function (s) { return s.id; }).indexOf(id) + 1; }
  function num2(n) { return (n < 10 ? '0' : '') + n; }

  function editionLabel(it, ed) {
    var e = C.editionObj(it, ed);
    if (e && e.label) return e.label;
    if (WB.i18n.has('ed.' + ed)) return t('ed.' + ed);
    return ed === 'default' ? '' : ed;
  }
  function osName(os) { return t('os.' + os); }
  function valueLabel(it, v) {
    var a = C.axis(it);
    if (a === 'lang') return WB.i18n.langName(v);
    if (a === 'region') return WB.i18n.regionName(v);
    if (a === 'os') return osName(v);
    if (a === 'pick') { var o = (it.options || []).filter(function (x) { return x.id === v; })[0]; return o ? o.label : v; }
    return v;
  }
  function entrySummary(it, entry) {
    var bits = [];
    var el = editionLabel(it, entry.e);
    if (el && C.editions(it).length > 1) bits.push(el);
    if (entry.v && entry.v.length) bits.push(entry.v.map(function (v) { return valueLabel(it, v); }).join(', '));
    return bits.join(' · ');
  }

  /** Size of an item as chosen in the kit, or with default choices if not in the kit. */
  function choiceOf(it) {
    var kit = S.state.kit;
    var en = kit.entries[it.id];
    if (en) return en;
    return { e: C.defaultEdition(it), v: C.defaultValues(it, K.ctx(kit)) };
  }
  function sizeInfo(it, entry) {
    var files = K.entryFiles(it, entry || choiceOf(it));
    var s = C.sizeOf(files);
    var pageOnly = files.length > 0 && files.every(function (f) { return f.kind === 'page'; });
    var est = files.some(function (f) { return f.est; }) || !!it.est;
    return { bytes: s.bytes, unknown: s.unknown, page: pageOnly || (!files.length && !!it.page), est: est, none: !files.length && !it.page };
  }
  function sizeText(si) {
    if (si.page) return t('size.link');
    if (si.none) return t('size.choose');
    if (!si.bytes && si.unknown) return t('size.unknown');
    var s = (si.est ? '≈ ' : '') + U.bytes(si.bytes, loc());
    return si.unknown ? s + ' +?' : s;
  }

  function stamps(it) {
    var mine = (S.state.kit.langs || []);
    var langs = C.langs(it);
    var out = h('span.stamps');
    if (it.p === 1) out.appendChild(h('span.stamp.p1', t('prio.1')));
    out.appendChild(h('span.stamp.kind', t('kind.' + it.kind)));
    if (langs[0] === '*') return out;
    if (langs.indexOf('mul') !== -1 || langs.length > 8) {
      out.appendChild(h('span.stamp', { title: t('lang.manyTitle', { n: langs.length }) }, langs.indexOf('mul') !== -1 && langs.length === 1 ? t('lang.mulShort') : t('lang.count', { n: langs.length })));
      return out;
    }
    langs.slice(0, 5).forEach(function (l) {
      out.appendChild(h('span.stamp' + (mine.indexOf(l) !== -1 ? '.is-match' : ''), { title: WB.i18n.langName(l), lang: l }, l.toUpperCase()));
    });
    if (langs.length > 5) out.appendChild(h('span.stamp', '+' + (langs.length - 5)));
    return out;
  }

  function toggleItem(id, after) {
    var it = C.item(id);
    var on = !K.has(S.state.kit, id);
    S.updateKit(function (kit) { if (on) K.add(kit, id); else K.remove(kit, id); });
    var msg = on ? t('kit.added', { title: it.title }) : t('kit.removed', { title: it.title });
    WB.dom.announce(msg);
    if (after) after(on);
    return on;
  }

  /** One ledger row: tick, title, meta, size. */
  function row(it, opts) {
    opts = opts || {};
    var kit = S.state.kit;
    var on = K.has(kit, it.id);
    var en = kit.entries[it.id];
    var si = sizeInfo(it);
    var tickId = 'tick-' + it.id;
    var r = h('li.row' + (on ? '.is-on' : ''), { dataset: { id: it.id } });
    var tick = h('input.tick', { type: 'checkbox', id: tickId, checked: on, 'aria-label': t(on ? 'row.remove' : 'row.add', { title: it.title }) });
    tick.addEventListener('change', function () {
      var nowOn = toggleItem(it.id);
      r.classList.toggle('is-on', nowOn);
      tick.setAttribute('aria-label', t(nowOn ? 'row.remove' : 'row.add', { title: it.title }));
      var si2 = sizeInfo(it);
      sizeEl.firstChild.textContent = sizeText(si2);
      if (opts.onChange) opts.onChange(nowOn);
    });
    var sizeEl = h('div.row-size', h('span', sizeText(si)), si.page ? null : h('small', on && en ? '' : t('size.default')));
    r.appendChild(h('label.tick-hit', { for: tickId }, tick));
    r.appendChild(h('div',
      h('a.row-title', { href: '#/item/' + encodeURIComponent(it.id) }, h('span.hl-text', it.title)),
      h('div.row-meta', h('span', it.by), stamps(it)),
      on && en && entrySummary(it, en) ? h('div.row-variant', entrySummary(it, en)) : null,
      opts.desc === false ? null : h('p.row-desc', it.desc)));
    r.appendChild(sizeEl);
    return r;
  }

  function ledgerHead() {
    return h('div.ledger-head', { 'aria-hidden': 'true' }, h('span', t('ledger.pick')), h('span', t('ledger.item')), h('span', t('ledger.size')));
  }

  function emptyState(iconName, text, actions) {
    return h('div.empty', icon(iconName), h('p', text), actions ? h('div.btn-row', { style: { 'justify-content': 'center' } }, actions) : null);
  }

  function pageHead(kicker, title, lede) {
    return h('header.section-intro', kicker ? h('span.kicker', kicker) : null, h('h1', title), lede ? h('p.lede', lede) : null);
  }

  /** <select> helper. options: [{value, label}] */
  function select(id, label, options, value, onChange, extra) {
    var sel = h('select', { id: id });
    options.forEach(function (o) {
      if (o.group) {
        var g = h('optgroup', { label: o.group });
        o.options.forEach(function (x) { g.appendChild(h('option', { value: x.value, selected: x.value === value, lang: x.lang || null }, x.label)); });
        sel.appendChild(g);
      } else sel.appendChild(h('option', { value: o.value, selected: o.value === value, lang: o.lang || null }, o.label));
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    return h('div.field', extra, h('label', { for: id }, label), sel);
  }

  /** Languages offered in pickers: every language with content, named in the reader's language. */
  function contentLanguages() {
    var set = {};
    C.items().forEach(function (it) { C.langs(it).forEach(function (l) { if (l !== '*' && l !== 'mul' && /^[a-z]{2,3}$/.test(l)) set[l] = (set[l] || 0) + 1; }); });
    var coll = WB.i18n.collator();
    return Object.keys(set).map(function (l) { return { code: l, name: WB.i18n.langName(l), n: set[l] }; })
      .sort(function (a, b) { return coll.compare(a.name, b.name); });
  }

  function countryOptions() {
    var coll = WB.i18n.collator();
    return Object.keys(root.WB_COUNTRIES || {}).map(function (c) { return { value: c, label: WB.i18n.regionName(c) }; })
      .filter(function (o) { return o.label && o.label !== o.value; })
      .sort(function (a, b) { return coll.compare(a.label, b.label); });
  }

  function extLink(href, text, cls) { return h('a' + (cls || ''), { href: href }, text, ' ', icon('external')); }

  WB.parts = {
    shelfName: shelfName, shelfIndex: shelfIndex, num2: num2, editionLabel: editionLabel, valueLabel: valueLabel, osName: osName,
    entrySummary: entrySummary, choiceOf: choiceOf, sizeInfo: sizeInfo, sizeText: sizeText, stamps: stamps, toggleItem: toggleItem,
    row: row, ledgerHead: ledgerHead, emptyState: emptyState, pageHead: pageHead, select: select, contentLanguages: contentLanguages,
    countryOptions: countryOptions, extLink: extLink,
  };
})(typeof self !== 'undefined' ? self : globalThis);
