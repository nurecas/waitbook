(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  WB.views.home = {
    title: function () { return ''; },
    render: function (el) {
      var S = WB.store, C = WB.catalog;
      var kit = S.state.kit;
      var tot = WB.kit.totals(kit);
      var online = WB.net.online() && !S.state.settings.strict;
      var hasKit = tot.items > 0;

      // When there's no connection but there is a kit, put the urgent things first.
      if (!online && hasKit) {
        el.appendChild(h('div.note.warn', { role: 'note' }, icon('offline'),
          h('div', h('p', h('strong', t('home.offlineTitle')), ' ', t('home.offlineBody')),
            h('div.btn-row', h('a.btn.btn-primary', { href: '#/cards' }, icon('cards'), t('home.openCards')), h('a.btn', { href: '#/map' }, icon('map'), t('nav.map')), h('a.btn', { href: '#/kit' }, icon('kit'), t('nav.kit'))))));
        el.appendChild(h('div', { style: { height: '1.5rem' } }));
      }

      var title = h('h1');
      var parts = t('home.title').split('*');
      parts.forEach(function (p, i) { title.appendChild(i % 2 ? h('span.hl', p) : document.createTextNode(p)); });

      el.appendChild(h('section.hero',
        h('div',
          h('span.kicker', t('home.kicker')),
          title,
          h('p.lede', t('home.lede')),
          h('div.btn-row', h('a.btn.btn-primary', { href: '#/pack' }, icon('kit'), t('home.pack')), h('a.btn', { href: '#/library' }, icon('library'), t('home.browse')))),
        h('aside.hero-card', { 'aria-labelledby': 'howTitle' },
          h('h2', { id: 'howTitle' }, t('home.how')),
          h('ol.steps',
            [1, 2, 3].map(function (n) { return h('li', h('span.numeral', { 'aria-hidden': 'true' }, '0' + n), h('div', h('b', t('home.step' + n)), h('span', t('home.step' + n + 'd')))); })))));

      el.appendChild(h('div.status-strip', { role: 'status' },
        h('span', icon(online ? 'online' : 'offline'), ' ', h('strong', online ? t('home.onlineNow') : t('home.offlineNow'))),
        hasKit ? h('span', t('home.kitStatus', { n: tot.items, size: WB.util.bytes(tot.bytes, WB.i18n.lang) }), ' ', h('a', { href: '#/kit' }, t('home.openKit'))) : h('span', t('home.noKit')),
        h('a', { href: '#/cards' }, icon('cards'), ' ', t('home.cardsLink'))));

      var shelves = h('ul.shelf-index');
      C.shelves().forEach(function (s, i) {
        var n = C.filter({ shelf: s.id }).length;
        shelves.appendChild(h('li', h('a', { href: '#/library/' + s.id },
          h('span.numeral', { 'aria-hidden': 'true' }, P.num2(i + 1)),
          h('span', h('b', P.shelfName(s.id)), h('small', t('home.shelfCount', { n: n }))),
          icon(s.icon))));
      });
      el.appendChild(h('section.section', { 'aria-labelledby': 'shelvesTitle' },
        h('div.section-head', h('h2', { id: 'shelvesTitle' }, t('home.shelves')), h('a', { href: '#/kiwix' }, t('home.moreKiwix'), ' ', icon('chev-r', 'flip-rtl'))),
        shelves));

      el.appendChild(h('section.section', { 'aria-labelledby': 'devTitle' },
        h('div.section-head', h('h2', { id: 'devTitle' }, t('home.devices'))),
        h('div.grid.cols-3',
          h('div.box-quiet', h('h3', icon('phone'), ' ', t('home.devPhone')), h('p.small', t('home.devPhoneD'))),
          h('div.box-quiet', h('h3', icon('laptop'), ' ', t('home.devComputer')), h('p.small', t('home.devComputerD'))),
          h('div.box-quiet', h('h3', icon('server'), ' ', t('home.devShare')), h('p.small', t('home.devShareD'))))));

      el.appendChild(h('p.footer-note', t('home.footer'), ' ', h('a', { href: '#/settings' }, t('home.about'))));
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
