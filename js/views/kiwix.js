(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var CATS = ['wikipedia', 'wiktionary', 'wikivoyage', 'wikibooks', 'wikisource', 'wikiversity', 'wikiquote', 'gutenberg', 'ted', 'stack_exchange', 'phet', 'vikidia', 'ifixit', 'libretexts', 'devdocs', 'freecodecamp', 'mooc', 'other'];
  var PAGE = 30;

  function snapshotRows() {
    var s = root.WB_KIWIX_SNAPSHOT;
    return s ? s.rows : null;
  }
  function rowToEntry(r) {
    return { stem: r[0], date: r[1], dir: r[2], lang: String(r[3] || '').split(',').filter(Boolean), size: r[4], title: r[5], category: r[6], articles: r[7], summary: r[8] || '', url: 'https://download.kiwix.org/zim/' + r[2] + '/' + r[0] + '_' + r[1] + '.zim' };
  }

  WB.views.kiwix = {
    title: function () { return t('nav.kiwix'); },
    render: function (el, parts, query) {
      var S = WB.store, U = WB.util;
      var state = { q: query.q || '', lang: query.lang || (S.state.kit.langs.length ? 'mine' : ''), cat: CATS.indexOf(query.cat) !== -1 ? query.cat : '', start: 0 };
      var live = WB.net.canFetch();

      el.appendChild(P.pageHead(t('kx.kicker'), t('nav.kiwix'), t('kx.lede')));
      el.appendChild(h('div.note', icon(live ? 'online' : 'offline'), h('p', live ? t('kx.liveNote') : t('kx.offlineNote', { date: (root.WB_KIWIX_KNOWN || {}).updated || '' }))));

      var q = h('input', { type: 'search', id: 'kxQ', value: state.q, placeholder: t('kx.searchPh'), enterkeyhint: 'search', autocomplete: 'off' });
      var langOpts = [{ value: '', label: t('lib.allLangs') }];
      if (S.state.kit.langs.length) langOpts.unshift({ value: 'mine', label: t('lib.myLangs', { langs: S.state.kit.langs.map(function (l) { return WB.i18n.langName(l); }).join(', ') }) });
      langOpts.push({ group: t('lib.oneLang'), options: P.contentLanguages().map(function (l) { return { value: l.code, label: l.name, lang: l.code }; }) });
      var form = h('form.toolbar', { role: 'search', on: { submit: function (e) { e.preventDefault(); state.q = q.value; state.start = 0; run(false); } } },
        h('div.field', h('label', { for: 'kxQ' }, t('lib.search')), h('div.searchbox', icon('search'), q)),
        P.select('kxLang', t('lib.language'), langOpts, state.lang, function (v) { state.lang = v; state.start = 0; run(false); }),
        P.select('kxCat', t('kx.category'), [{ value: '', label: t('kx.anyCat') }].concat(CATS.map(function (c) { return { value: c, label: t('kxcat.' + c) }; })), state.cat, function (v) { state.cat = v; state.start = 0; run(false); }),
        h('div.field', h('span.field-label', { 'aria-hidden': 'true' }, ' '), h('button.btn.btn-primary', { type: 'submit' }, icon('search'), t('lib.search'))));
      el.appendChild(form);

      var status = h('p.count-line', { role: 'status', 'aria-live': 'polite' });
      var list = h('ul.ledger');
      var more = h('div', { style: { 'margin-top': '1rem' } });
      el.appendChild(status);
      el.appendChild(P.ledgerHead());
      el.appendChild(list);
      el.appendChild(more);

      var curatedStems = {};
      WB.catalog.items().forEach(function (it) {
        WB.kit.entryFiles(it, { e: WB.catalog.defaultEdition(it), v: WB.catalog.defaultValues(it, WB.kit.ctx(S.state.kit)) }).forEach(function (f) { if (f.stem) curatedStems[f.stem] = it.id; });
        if (typeof it.kiwix === 'string' && !WB.catalog.isPattern(it.kiwix)) curatedStems[it.kiwix] = it.id;
      });

      function langsParam() { return state.lang === 'mine' ? S.state.kit.langs : state.lang ? [state.lang] : []; }

      function run(append) {
        WB.router.setQuery({ q: state.q, lang: state.lang === (S.state.kit.langs.length ? 'mine' : '') ? '' : state.lang, cat: state.cat });
        if (!append) { WB.dom.clear(list); }
        WB.dom.clear(more);
        status.textContent = t('kx.searching');
        if (live) {
          WB.resolve.search({ q: state.q, lang: langsParam(), category: state.cat, count: PAGE, start: state.start }, WB.net.fetcher)
            .then(function (feed) { show(feed.entries, feed.total, append); })
            .catch(function () { live = false; status.textContent = t('kx.fellBack'); offline(append); });
        } else offline(append);
      }

      function offline(append) {
        WB.dom.loadScript('data/kiwix-snapshot.js').then(function () {
          var rows = snapshotRows() || [];
          var f = U.fold(state.q);
          var words = f ? f.split(' ') : [];
          var l3 = langsParam().map(U.lang3);
          var hits = rows.filter(function (r) {
            if (state.cat && (r[6] || r[2]) !== state.cat && r[2] !== state.cat) return false;
            if (l3.length && !String(r[3]).split(',').some(function (x) { return l3.indexOf(x) !== -1; })) return false;
            if (!words.length) return true;
            var hay = U.fold(r[0] + ' ' + r[5] + ' ' + (r[8] || ''));
            return words.every(function (w) { return hay.indexOf(w) !== -1; });
          });
          show(hits.slice(state.start, state.start + PAGE).map(rowToEntry), hits.length, append);
        }, function () { status.textContent = t('kx.noSnapshot'); });
      }

      function show(entries, total, append) {
        status.textContent = t('kx.results', { n: total });
        if (!entries.length && !append) list.appendChild(h('li', P.emptyState('search', t('kx.none'))));
        entries.forEach(function (e) { list.appendChild(resultRow(e)); });
        if (state.start + PAGE < total) {
          more.appendChild(h('button.btn', { type: 'button', on: { click: function () { state.start += PAGE; run(true); } } }, t('kx.more')));
        }
      }

      function resultRow(e) {
        var inKit = !!S.state.kit.extra[e.stem];
        var curated = curatedStems[e.stem];
        var r = h('li.row' + (inKit ? '.is-on' : ''));
        var id = 'kx-' + e.stem.replace(/[^A-Za-z0-9_-]/g, '_');
        var cb = h('input.tick', { type: 'checkbox', id: id, checked: inKit, 'aria-label': t(inKit ? 'row.remove' : 'row.add', { title: e.title }) });
        cb.addEventListener('change', function () {
          S.updateKit(function (k) { if (cb.checked) WB.kit.addExtra(k, e); else WB.kit.removeExtra(k, e.stem); });
          r.classList.toggle('is-on', cb.checked);
          WB.dom.announce(t(cb.checked ? 'kit.added' : 'kit.removed', { title: e.title }));
        });
        var langs = e.lang.map(function (l) { return h('span.stamp', { title: WB.i18n.langName(U.lang1(l)) }, U.lang1(l).toUpperCase()); });
        var flavour = /_(maxi|nopic|mini)$/.exec(e.stem);
        r.appendChild(h('label.tick-hit', { for: id }, cb));
        r.appendChild(h('div',
          h('span.row-title', h('span.hl-text', e.title)),
          h('div.row-meta', h('span.mono.small', e.stem), h('span.stamps', langs, flavour ? h('span.stamp.kind', t('ed.' + flavour[1])) : null, e.category ? h('span.stamp', t('kxcat.' + e.category) !== 'kxcat.' + e.category ? t('kxcat.' + e.category) : e.category) : null)),
          e.summary ? h('p.row-desc', e.summary) : null,
          h('div.row-meta', e.date ? h('span', t('item.dated', { date: e.date })) : null, e.articles ? h('span', t('kx.articles', { n: e.articles })) : null,
            e.url ? h('a', { href: e.url }, t('item.download')) : null, curated ? h('a', { href: '#/item/' + curated }, t('kx.curated')) : null)));
        r.appendChild(h('div.row-size', e.size ? U.bytes(e.size, WB.i18n.lang) : '—'));
        return r;
      }

      run(false);
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
