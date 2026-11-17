(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var CREDITS = [
    ['Kiwix & openZIM', 'GPL-3.0 apps; ZIM content under each source licence', 'https://kiwix.org/'],
    ['MapLibre GL JS 5.24.1', 'BSD-3-Clause', 'https://maplibre.org/'],
    ['PMTiles 4.5.0 and Protomaps basemaps 5.7.2', 'BSD-3-Clause', 'https://protomaps.com/'],
    ['Mapbox GL RTL text plugin 0.3.0', 'BSD-2-Clause', 'https://github.com/mapbox/mapbox-gl-rtl-text'],
    ['Noto Sans map glyphs', 'SIL Open Font License 1.1', 'https://github.com/protomaps/basemaps-assets'],
    ['Sofia Sans, Sofia Sans Condensed (Lettersoup)', 'SIL Open Font License 1.1', 'https://github.com/lettersoup/Sofia-Sans'],
    ['Martian Mono (Evil Martians)', 'SIL Open Font License 1.1', 'https://github.com/evilmartians/mono'],
    ['Big Shoulders Stencil (Patric King)', 'SIL Open Font License 1.1', 'https://github.com/xotypeco/big_shoulders'],
    ['Natural Earth 5.1.2', 'Public domain', 'https://www.naturalearthdata.com/'],
    ['Unicode CLDR 49', 'Unicode License v3', 'https://cldr.unicode.org/'],
    ['OpenStreetMap data (maps you download)', 'ODbL', 'https://www.openstreetmap.org/copyright'],
    ['Lastbook (inspiration)', 'MIT', 'https://github.com/Immortal-Protocols/lastbook'],
  ];

  WB.views.settings = {
    title: function () { return t('nav.settings'); },
    render: function (el) {
      var S = WB.store, st = S.state.settings;
      el.appendChild(P.pageHead(t('settings.kicker'), t('nav.settings')));

      var langSel = h('select', { id: 'setLang' });
      WB.i18n.UI.forEach(function (u) { langSel.appendChild(h('option', { value: u.code, lang: u.code, selected: WB.i18n.lang === u.code }, u.name)); });
      langSel.addEventListener('change', function () { WB.app.setLanguage(langSel.value); });

      function seg(name, legend, values, current, label, onChange) {
        var f = h('fieldset.seg', h('legend', legend));
        values.forEach(function (v) {
          var inp = h('input', { type: 'radio', name: name, value: String(v), checked: v === current });
          inp.addEventListener('change', function () { onChange(v); });
          f.appendChild(h('label', inp, h('span', label(v))));
        });
        return f;
      }

      var server = h('input', { type: 'url', id: 'setServer', value: st.server, placeholder: 'http://192.168.1.10:8080', inputmode: 'url', autocomplete: 'off' });
      var serverMsg = h('span.field-hint', { 'aria-live': 'polite' });
      server.addEventListener('change', function () {
        var v = server.value.trim();
        if (v && !/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/.test(v)) { serverMsg.textContent = t('settings.serverBad'); return; }
        S.setSettings({ server: v });
        serverMsg.textContent = v ? t('settings.serverSaved') : '';
      });

      var strict = h('input', { type: 'checkbox', id: 'setStrict', checked: st.strict });
      strict.addEventListener('change', function () { S.setSettings({ strict: strict.checked }); });

      el.appendChild(h('div.stack', { style: { 'max-width': '46rem' } },
        h('div.field', h('label', { for: 'setLang' }, t('settings.language')), langSel, h('span.field-hint', t('settings.languageHint'))),
        seg('theme', t('settings.theme'), S.THEMES, st.theme, function (v) { return t('theme.' + v); }, function (v) { S.setSettings({ theme: v }); }),
        h('p.small.muted', t('settings.nightHint')),
        seg('scale', t('settings.textSize'), S.SCALES, st.scale, function (v) { return Math.round(v * 100) + '%'; }, function (v) { S.setSettings({ scale: v }); }),
        h('div.box-quiet', h('label.switch', { for: 'setStrict' }, strict, h('span', h('b', t('settings.strict')), h('br'), h('span.small.muted', t('settings.strictHint'))))),
        h('div.field', h('label', { for: 'setServer' }, t('settings.server')), server, h('span.field-hint', t('settings.serverHint')), serverMsg),
        !S.storageOk ? h('div.note.warn', icon('warn'), h('p', t('settings.noStorage'))) : null));

      el.appendChild(h('section.section', h('div.section-head', h('h2', t('settings.data'))),
        h('div.btn-row',
          h('button.btn', { type: 'button', on: { click: function () { WB.dom.download('waitbook-kit.json', WB.exporters.kitJson(S.state.kit), 'application/json'); } } }, icon('download'), t('kit.saveFile')),
          h('button.btn.btn-danger', { type: 'button', on: { click: function () {
            WB.dom.sheet(t('settings.resetTitle'), function (body, close) {
              body.appendChild(h('p', t('settings.resetBody')));
              body.appendChild(h('div.btn-row', h('button.btn.btn-danger', { type: 'button', on: { click: function () { S.resetAll(); close(); WB.app.setLanguage(WB.i18n.bestMatch(navigator.languages || [])); } } }, icon('trash'), t('settings.resetYes')), h('button.btn', { type: 'button', on: { click: close } }, t('kit.cancel'))));
            });
          } } }, icon('trash'), t('settings.reset')))));

      var known = root.WB_KIWIX_KNOWN || {};
      el.appendChild(h('section.section', { 'aria-labelledby': 'aboutTitle' }, h('div.section-head', h('h2', { id: 'aboutTitle' }, t('settings.about'))),
        h('p', t('settings.aboutBody')),
        h('dl.dl',
          h('dt', t('settings.catalog')), h('dd', (root.WB_CATALOG || {}).version || ''),
          h('dt', t('settings.kiwixData')), h('dd', known.updated || '—'),
          h('dt', t('settings.items')), h('dd', String(WB.catalog.items().length))),
        h('h3', { style: { 'margin-top': '1.5rem' } }, t('settings.privacy')),
        h('p', t('settings.privacyBody')),
        h('h3', t('settings.disclaimer')),
        h('p', t('settings.disclaimerBody')),
        h('h3', t('settings.credits')),
        h('ul', CREDITS.map(function (c) { return h('li', h('a', { href: c[2] }, c[0]), ' — ', h('span.small.muted', c[1])); }))));
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
