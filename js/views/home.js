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

      // Quick kits: one tap fills a kit for a typical device, in the reader's language.
      var quick = h('div.grid.cols-3');
      [['pocket', 'phone'], ['household', 'computer'], ['community', 'drive']].forEach(function (q) {
        var preset = WB.kit.PRESETS[q[0]];
        quick.appendChild(h('div.box-quiet',
          h('h3', icon(q[1] === 'phone' ? 'phone' : q[1] === 'computer' ? 'laptop' : 'drive'), ' ', t('home.preset.' + q[0]), ' ', h('span.mono.small.muted', WB.util.bytes(preset.budget, WB.i18n.lang))),
          h('p.small', t('home.preset.' + q[0] + '.d')),
          h('button.btn.btn-small', { type: 'button', on: { click: function () {
            var p = WB.app.platform;
            var langs = S.state.kit.langs.length ? S.state.kit.langs : WB.util.uniq([WB.i18n.lang, 'en']);
            var kit = WB.kit.autofill({ langs: langs, region: S.state.kit.region, device: q[1], os: WB.platform.installerOs(p), budget: preset.budget, depth: preset.depth });
            kit.done = S.state.kit.done || {};
            function save(next) { S.setKit(next); WB.dom.toast(t('pack.saved')); WB.router.go('#/kit'); }
            if (!Object.keys(S.state.kit.entries).length && !Object.keys(S.state.kit.extra).length) { save(kit); return; }
            // Never throw away a hand-picked kit without asking.
            WB.dom.sheet(t('home.preset.' + q[0]), function (body, close) {
              body.appendChild(h('p', t('home.kitStatus', { n: WB.kit.totals(S.state.kit).items, size: WB.util.bytes(WB.kit.totals(S.state.kit).bytes, WB.i18n.lang) })));
              body.appendChild(h('div.btn-row',
                h('button.btn.btn-primary', { type: 'button', on: { click: function () { close(); save(kit); } } }, t('pack.replace')),
                h('button.btn', { type: 'button', on: { click: function () { close(); save(WB.kit.merge(S.state.kit, kit)); } } }, t('pack.merge')),
                h('button.btn.btn-quiet', { type: 'button', on: { click: close } }, t('kit.cancel'))));
            });
          } } }, icon('kit'), t('home.preset.use'))));
      });
      el.appendChild(h('section.section', { 'aria-labelledby': 'quickTitle' },
        h('div.section-head', h('h2', { id: 'quickTitle' }, t('home.quick')), h('a', { href: '#/pack' }, t('home.quickCustom'), ' ', icon('chev-r', 'flip-rtl'))),
        quick));

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
