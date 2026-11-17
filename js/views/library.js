(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var KINDS = ['zim', 'pdf', 'video', 'map', 'model', 'app', 'page'];

  WB.views.library = {
    title: function (parts) { return parts[0] && WB.catalog.shelf(parts[0]) ? P.shelfName(parts[0]) : t('nav.library'); },
    render: function (el, parts, query) {
      var C = WB.catalog, S = WB.store;
      var shelf = parts[0] && C.shelf(parts[0]) ? parts[0] : '';
      var state = {
        q: query.q || '',
        lang: query.lang || (S.state.kit.langs.length ? 'mine' : 'all'),
        p: query.p || '',
        kind: KINDS.indexOf(query.kind) !== -1 ? query.kind : '',
      };

      el.appendChild(P.pageHead(t('lib.kicker'), shelf ? P.shelfName(shelf) : t('nav.library'), shelf ? t('shelf.' + shelf + '.d') : t('lib.lede')));

      var tabs = h('ul.tabs-index', { role: 'list', 'aria-label': t('lib.shelves') });
      tabs.appendChild(h('li', h('a', { href: '#/library', 'aria-current': shelf ? null : 'page' }, t('lib.all'))));
      C.shelves().forEach(function (s, i) {
        tabs.appendChild(h('li', h('a', { href: '#/library/' + s.id, 'aria-current': shelf === s.id ? 'page' : null },
          h('span.numeral', { 'aria-hidden': 'true' }, P.num2(i + 1)), P.shelfName(s.id))));
      });
      el.appendChild(tabs);

      var langs = P.contentLanguages();
      var langOpts = [{ value: 'all', label: t('lib.allLangs') }];
      if (S.state.kit.langs.length) langOpts.unshift({ value: 'mine', label: t('lib.myLangs', { langs: S.state.kit.langs.map(function (l) { return WB.i18n.langName(l); }).join(', ') }) });
      langOpts.push({ group: t('lib.oneLang'), options: langs.map(function (l) { return { value: l.code, label: l.name, lang: WB.util.langAttr(l.code) }; }) });

      var search = h('input', { type: 'search', id: 'libQ', value: state.q, placeholder: t('lib.searchPh'), autocomplete: 'off', enterkeyhint: 'search' });
      var toolbar = h('div.toolbar', { role: 'search' },
        h('div.field', h('label', { for: 'libQ' }, t('lib.search')), h('div.searchbox', icon('search'), search)),
        P.select('libLang', t('lib.language'), langOpts, state.lang, function (v) { state.lang = v; update(); }),
        P.select('libP', t('lib.priority'), [{ value: '', label: t('lib.anyPrio') }, { value: '1', label: t('prio.only1') }, { value: '2', label: t('prio.upto2') }], state.p, function (v) { state.p = v; update(); }),
        P.select('libKind', t('lib.type'), [{ value: '', label: t('lib.anyType') }].concat(KINDS.map(function (k) { return { value: k, label: t('kind.' + k) }; })), state.kind, function (v) { state.kind = v; update(); }));
      el.appendChild(toolbar);

      var count = h('p.count-line', { role: 'status', 'aria-live': 'polite' });
      var listHost = h('div');
      el.appendChild(count);
      el.appendChild(listHost);

      search.addEventListener('input', WB.util.debounce(function () { state.q = search.value; update(); }, 180));

      function update() {
        WB.router.setQuery({ q: state.q, lang: state.lang === (S.state.kit.langs.length ? 'mine' : 'all') ? '' : state.lang, p: state.p, kind: state.kind });
        var langsFilter = state.lang === 'mine' ? S.state.kit.langs : state.lang === 'all' ? [] : [state.lang];
        var items = C.filter({ shelf: shelf, q: state.q, langs: langsFilter, p: state.p ? Number(state.p) : 0, kind: state.kind });
        if (state.kind === 'page') items = items.concat([]);
        count.textContent = t('lib.count', { n: items.length });
        WB.dom.clear(listHost);
        if (!items.length) {
          listHost.appendChild(P.emptyState('search', t('lib.empty'), [h('a.btn', { href: '#/kiwix' + (state.q ? '?q=' + encodeURIComponent(state.q) : '') }, icon('globe'), t('lib.tryKiwix'))]));
          return;
        }
        if (shelf) {
          var ul = h('ul.ledger', { 'aria-label': P.shelfName(shelf) });
          items.forEach(function (it) { ul.appendChild(P.row(it)); });
          listHost.appendChild(P.ledgerHead());
          listHost.appendChild(ul);
          return;
        }
        C.shelves().forEach(function (s, i) {
          var mine = items.filter(function (it) { return it.shelf === s.id; });
          if (!mine.length) return;
          var ul = h('ul.ledger', { 'aria-labelledby': 'sg-' + s.id });
          mine.forEach(function (it) { ul.appendChild(P.row(it)); });
          listHost.appendChild(h('section.shelf-group',
            h('h3', { id: 'sg-' + s.id }, h('span.numeral', { 'aria-hidden': 'true' }, P.num2(i + 1)), icon(s.icon), h('a', { href: '#/library/' + s.id }, P.shelfName(s.id))),
            ul));
        });
      }
      update();
      var off = S.on('kit', function () { /* rows update themselves; refresh totals elsewhere */ });
      return off;
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
