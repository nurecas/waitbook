(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  function cards() { return root.WB_CARDS || []; }
  function card(id) { return cards().filter(function (c) { return c.id === id; })[0] || null; }

  WB.views.cards = {
    title: function (parts) { var c = parts[0] && card(parts[0]); return c ? c.title : t('nav.cards'); },
    render: function (el, parts) {
      if (parts[0]) return renderCard(el, parts[0]);
      var S = WB.store;
      el.appendChild(P.pageHead(t('cards.kicker'), t('nav.cards'), t('cards.lede')));
      el.appendChild(h('div.note.warn', icon('warn'), h('p', t('cards.disclaimer'))));
      if (WB.i18n.lang !== 'en') el.appendChild(h('p.small.muted', t('cards.englishOnly')));

      var ta = h('textarea', { id: 'numbers', rows: '4', placeholder: t('cards.numbersPh'), spellcheck: 'false' });
      ta.value = S.state.settings.numbers || '';
      ta.addEventListener('input', WB.util.debounce(function () { S.setSettings({ numbers: ta.value }); WB.dom.announce(t('cards.saved')); }, 500));
      el.appendChild(h('section.box.numbers-pad', { style: { margin: '1.5rem 0' } },
        h('label.field-label', { for: 'numbers' }, h('h2', { style: { 'font-size': '1.15rem' } }, icon('comms'), ' ', t('cards.numbers'))),
        h('p.small.muted', t('cards.numbersHint')), ta));

      var ul = h('ul.cards-grid');
      cards().forEach(function (c, i) {
        ul.appendChild(h('li', h('a.index-card', { href: '#/cards/' + c.id },
          h('span.num', { 'aria-hidden': 'true' }, P.num2(i + 1)),
          h('h3', icon(c.icon), c.title), h('p', c.summary))));
      });
      el.appendChild(ul);
      el.appendChild(h('div.btn-row', { style: { 'margin-top': '1.5rem' } }, h('button.btn', { type: 'button', on: { click: function () { document.documentElement.classList.add('print-cards'); root.print(); setTimeout(function () { document.documentElement.classList.remove('print-cards'); }, 500); } } }, icon('print'), t('cards.printAll'))));
      // Hidden full text of every card for printing all at once.
      var printAll = h('div.print-only.all-cards');
      cards().forEach(function (c, i) { printAll.appendChild(sheet(c, i)); });
      el.appendChild(printAll);
    },
  };

  function renderCard(el, id) {
    var c = card(id);
    if (!c) { el.appendChild(P.pageHead('', t('item.missing'))); return; }
    var i = cards().indexOf(c);
    el.appendChild(h('nav.crumbs', { 'aria-label': t('a11y.breadcrumb') }, h('a', { href: '#/cards' }, t('nav.cards')), icon('chev-r')));
    el.appendChild(sheet(c, i, true));
    var prev = cards()[i - 1], next = cards()[i + 1];
    el.appendChild(h('div.wizard-nav',
      prev ? h('a.btn.btn-quiet', { href: '#/cards/' + prev.id }, icon('chev-l', 'flip-rtl'), prev.title) : h('span'),
      next ? h('a.btn.btn-quiet', { href: '#/cards/' + next.id }, next.title, icon('chev-r', 'flip-rtl')) : h('span')));
  }

  function sheet(c, i, interactive) {
    var S = WB.store, C = WB.catalog, K = WB.kit;
    var s = h('article.card-sheet', { lang: 'en' });
    s.appendChild(h('span.num', { 'aria-hidden': 'true' }, P.num2(i + 1)));
    s.appendChild(h(interactive ? 'h1' : 'h2', c.title));
    s.appendChild(h('p.muted', c.summary));
    var numbers = S.state.settings.numbers;
    if (numbers) s.appendChild(h('div.card-block', h('h2', icon('comms'), t('cards.yourNumbers')), h('pre.mono', { style: { 'white-space': 'pre-wrap', margin: 0 } }, numbers)));
    s.appendChild(h('div.card-block.first', h('h2', icon('chev-r', 'flip-rtl'), t('cards.first')), h('ul', c.first.map(function (x) { return h('li', x); }))));
    if (c.flags && c.flags.length) s.appendChild(h('div.card-block.flags', h('h2', icon('warn'), t('cards.flags')), h('ul', c.flags.map(function (x) { return h('li', x); }))));

    var open = h('ul');
    (c.open || []).forEach(function (o) {
      var it = C.item(o.item);
      if (!it || C.gone(it)) return;
      var inKit = K.has(S.state.kit, it.id);
      var li = h('li', h('a', { href: '#/item/' + it.id }, it.title), o.note ? ' — ' + o.note : '', ' ',
        inKit ? h('span.stamp.is-match', t('cards.inKit')) : (interactive ? h('button.btn.btn-small.btn-quiet', { type: 'button', on: { click: function (e) { S.updateKit(function (k) { K.add(k, it.id); }); e.currentTarget.replaceWith(h('span.stamp.is-match', t('cards.inKit'))); WB.dom.announce(t('kit.added', { title: it.title })); } } }, icon('plus'), t('cards.addToKit')) : null));
      if (o.search && o.search.length) {
        var terms = h('div.search-terms', h('span.small.muted', t('cards.searchFor')), o.search.map(function (q) { return h('code', q); }));
        li.appendChild(terms);
        var server = S.state.settings.server;
        if (server && interactive) {
          var entry = S.state.kit.entries[it.id] || P.choiceOf(it);
          // kiwix-serve publishes each book under a date-less alias too, so this works with any downloaded version.
          var stems = K.entryFiles(it, entry).filter(function (f) { return f.kind === 'kiwix'; }).map(function (f) { return f.stem; });
          if (stems.length) {
            var links = h('div.search-terms', h('span.small.muted', t('cards.onServer')));
            o.search.forEach(function (q) { links.appendChild(h('a', { href: server + '/search?books.name=' + encodeURIComponent(stems[0]) + '&pattern=' + encodeURIComponent(q) }, q)); });
            li.appendChild(links);
          }
        }
      }
      open.appendChild(li);
    });
    s.appendChild(h('div.card-block', h('h2', icon('library'), t('cards.open')), open));
    if (c.prepare && c.prepare.length) s.appendChild(h('div.card-block', h('h2', icon('kit'), t('cards.prepare')), h('ul', c.prepare.map(function (x) { return h('li', x); }))));
    s.appendChild(h('p.small.muted', { style: { 'margin-top': '1.5rem' } }, t('cards.sources'), ' ', c.sources.join('; ') + '.'));
    s.appendChild(h('p.small.muted', t('cards.disclaimerShort')));
    return s;
  }
})(typeof self !== 'undefined' ? self : globalThis);
