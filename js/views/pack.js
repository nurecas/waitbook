(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var BUDGETS = [4e9, 8e9, 16e9, 32e9, 64e9, 128e9, 256e9, 512e9, 1e12, 2e12, 4e12];
  var DEVICE_ICON = { phone: 'phone', tablet: 'tablet', computer: 'laptop', drive: 'drive', server: 'server' };
  var DEVICE_BUDGET = { phone: 8e9, tablet: 16e9, computer: 64e9, drive: 512e9, server: 1e12 };

  function defaults() {
    var S = WB.store, p = WB.app.platform;
    var kit = S.state.kit;
    var langs = kit.langs.length ? kit.langs.slice() : [WB.i18n.lang];
    var device = kit.device || (p.device === 'phone' ? 'phone' : p.device === 'tablet' ? 'tablet' : 'computer');
    return { step: 1, region: kit.region || '', langs: langs, device: device, budget: kit.budget || DEVICE_BUDGET[device], depth: 3,
      shelves: WB.catalog.shelves().map(function (s) { return s.id; }).filter(function (s) { return !(s === 'tools' && (device === 'phone' || device === 'tablet') && p.os === 'ios'); }) };
  }

  // Slider position <-> bytes on a log scale from 1 GB to 8 TB.
  function toBytes(pos) { return Math.round(Math.pow(10, 9 + pos / 100 * Math.log10(8000)) / 1e8) * 1e8; }
  function toPos(bytes) { return Math.round((Math.log10(bytes) - 9) / Math.log10(8000) * 100); }

  WB.views.pack = {
    title: function () { return t('pack.title'); },
    render: function (el, parts, query) {
      var S = WB.store, C = WB.catalog, U = WB.util;
      var d = Object.assign(defaults(), S.draft() || {});
      if (query.step) d.step = Math.min(4, Math.max(1, parseInt(query.step, 10) || 1));
      function persist() { S.draft(d); }

      el.appendChild(P.pageHead(t('pack.kicker'), t('pack.title'), t('pack.lede')));
      var steps = h('ol.wizard-steps', { 'aria-label': t('pack.progress') });
      el.appendChild(steps);
      var body = h('div');
      el.appendChild(body);
      var nav = h('div.wizard-nav');
      el.appendChild(nav);

      function go(step) { d.step = step; persist(); WB.router.setQuery({ step: step }); draw(); var h1 = body.querySelector('h2'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); } }

      function draw() {
        WB.dom.clear(steps);
        [1, 2, 3, 4].forEach(function (n) {
          steps.appendChild(h('li' + (n < d.step ? '.is-done' : ''), { 'aria-current': n === d.step ? 'step' : null },
            h('span.numeral', { 'aria-hidden': 'true' }, '0' + n), h('span.lbl', t('pack.step' + n))));
        });
        WB.dom.clear(body);
        WB.dom.clear(nav);
        [null, stepPlace, stepDevice, stepPriorities, stepReview][d.step]();
        var back = d.step > 1 ? h('button.btn.btn-quiet', { type: 'button', on: { click: function () { go(d.step - 1); } } }, icon('chev-l', 'flip-rtl'), t('pack.back')) : h('span');
        nav.appendChild(back);
        if (d.step < 4) nav.appendChild(h('button.btn.btn-primary', { type: 'button', disabled: d.step === 1 && !d.langs.length, on: { click: function () { go(d.step + 1); } } }, t('pack.next'), icon('chev-r', 'flip-rtl')));
      }

      function stepPlace() {
        body.appendChild(h('h2', t('pack.placeTitle')));
        body.appendChild(h('p.muted', t('pack.placeLede')));
        var countries = P.countryOptions();
        var suggest = h('div');
        body.appendChild(h('div.grid.cols-2', { style: { 'align-items': 'end' } },
          P.select('packCountry', t('pack.country'), [{ value: '', label: t('pack.countryNone') }].concat(countries), d.region, function (v) {
            d.region = v; persist(); showSuggest();
          })));
        body.appendChild(suggest);
        var chips = h('div.chips', { role: 'list', 'aria-label': t('pack.chosenLangs') });
        body.appendChild(h('h3', { style: { 'margin-top': '1.5rem' } }, t('pack.langsTitle')));
        body.appendChild(h('p.small.muted', t('pack.langsHint')));
        body.appendChild(chips);

        function showSuggest() {
          WB.dom.clear(suggest);
          var c = root.WB_COUNTRIES[d.region];
          if (!c || !c.l.length) return;
          var have = P.contentLanguages().map(function (l) { return l.code; });
          var sl = c.l.filter(function (l) { return have.indexOf(l) !== -1 && d.langs.indexOf(l) === -1; });
          if (!sl.length) return;
          suggest.appendChild(h('div.note', { style: { 'margin-top': '1rem' } }, icon('globe'),
            h('div', h('p', t('pack.suggested', { country: WB.i18n.regionName(d.region) }), ' ', h('b', sl.map(function (l) { return WB.i18n.langName(l); }).join(', '))),
              h('button.btn.btn-small', { type: 'button', on: { click: function () { d.langs = U.uniq(d.langs.concat(sl)); persist(); drawChips(); showSuggest(); } } }, icon('plus'), t('pack.addThese')))));
        }

        function drawChips() {
          WB.dom.clear(chips);
          d.langs.forEach(function (l, i) {
            chips.appendChild(h('span.chip' + (i === 0 ? '.is-primary' : ''), { role: 'listitem', lang: l },
              h('span', WB.i18n.langName(l), i === 0 ? ' · ' + t('pack.primary') : ''),
              i > 0 ? h('button', { type: 'button', 'aria-label': t('pack.makePrimary', { lang: WB.i18n.langName(l) }), on: { click: function () { d.langs.splice(i, 1); d.langs.unshift(l); persist(); drawChips(); } } }, icon('chev-l', 'flip-rtl')) : null,
              h('button', { type: 'button', 'aria-label': t('pack.removeLang', { lang: WB.i18n.langName(l) }), on: { click: function () { d.langs.splice(i, 1); persist(); drawChips(); draw(); } } }, icon('x'))));
          });
          var all = P.contentLanguages().filter(function (l) { return d.langs.indexOf(l.code) === -1; });
          var sel = h('select', { id: 'packAddLang', 'aria-label': t('pack.addLang') });
          sel.appendChild(h('option', { value: '' }, '+ ' + t('pack.addLang')));
          all.forEach(function (l) { sel.appendChild(h('option', { value: l.code, lang: l.code }, l.name)); });
          sel.addEventListener('change', function () { if (!sel.value) return; d.langs.push(sel.value); persist(); drawChips(); draw(); var s2 = document.getElementById('packAddLang'); if (s2) s2.focus(); });
          chips.appendChild(h('span', { role: 'listitem', style: { 'min-width': '14rem' } }, sel));
        }
        drawChips();
        showSuggest();
      }

      function stepDevice() {
        body.appendChild(h('h2', t('pack.deviceTitle')));
        var seg = h('fieldset.seg', h('legend', t('pack.deviceLegend')));
        WB.kit.DEVICES.forEach(function (dev) {
          var inp = h('input', { type: 'radio', name: 'device', value: dev, checked: d.device === dev });
          inp.addEventListener('change', function () { d.device = dev; d.budget = DEVICE_BUDGET[dev]; persist(); draw(); });
          seg.appendChild(h('label', inp, h('span', icon(DEVICE_ICON[dev]), t('device.' + dev))));
        });
        body.appendChild(seg);
        body.appendChild(h('p.small.muted', { style: { 'margin-top': '.75rem' } }, t('device.' + d.device + '.tip')));

        body.appendChild(h('h3', { style: { 'margin-top': '1.75rem' } }, t('pack.spaceTitle')));
        var readout = h('div.budget-readout', { 'aria-live': 'polite' });
        var range = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(toPos(d.budget)), id: 'packBudget', 'aria-label': t('pack.spaceTitle') });
        function show() { readout.textContent = U.bytes(d.budget, WB.i18n.lang); range.setAttribute('aria-valuetext', readout.textContent); }
        range.addEventListener('input', function () { d.budget = toBytes(Number(range.value)); persist(); show(); });
        var presets = h('div.chips', { style: { 'margin-top': '.75rem' } });
        BUDGETS.forEach(function (b) {
          presets.appendChild(h('button.btn.btn-small' + (Math.abs(d.budget - b) < 1e8 ? '' : '.btn-quiet'), { type: 'button', on: { click: function () { d.budget = b; persist(); draw(); } } }, U.bytes(b, WB.i18n.lang)));
        });
        body.appendChild(readout);
        body.appendChild(range);
        body.appendChild(presets);
        body.appendChild(h('p.small.muted', { style: { 'margin-top': '.75rem' } }, t('pack.spaceTip')));
        show();
      }

      function stepPriorities() {
        body.appendChild(h('h2', t('pack.prioTitle')));
        var depth = h('fieldset.seg', h('legend', t('pack.depth')));
        [1, 2, 3].forEach(function (n) {
          var inp = h('input', { type: 'radio', name: 'depth', value: String(n), checked: d.depth === n });
          inp.addEventListener('change', function () { d.depth = n; persist(); });
          depth.appendChild(h('label', inp, h('span', t('pack.depth' + n))));
        });
        body.appendChild(depth);
        body.appendChild(h('h3', { style: { 'margin-top': '1.75rem' } }, t('pack.shelvesTitle')));
        var grid = h('div.shelf-toggles');
        C.shelves().forEach(function (s) {
          var cb = h('input.tick', { type: 'checkbox', checked: d.shelves.indexOf(s.id) !== -1 });
          cb.addEventListener('change', function () {
            if (cb.checked) d.shelves = U.uniq(d.shelves.concat([s.id])); else d.shelves = d.shelves.filter(function (x) { return x !== s.id; });
            persist();
          });
          grid.appendChild(h('label.shelf-toggle', cb, icon(s.icon), h('span', P.shelfName(s.id))));
        });
        body.appendChild(grid);
      }

      function stepReview() {
        var p = WB.app.platform;
        var kit = WB.kit.autofill({ langs: d.langs, region: d.region || null, device: d.device, os: WB.platform.installerOs(p), budget: d.budget, depth: d.depth, shelves: d.shelves });
        var tot = WB.kit.totals(kit);
        body.appendChild(h('h2', t('pack.reviewTitle')));
        var pct = Math.min(100, tot.bytes / d.budget * 100);
        body.appendChild(h('div.kit-summary',
          h('div', h('div.big-sum', U.bytes(tot.bytes, WB.i18n.lang), h('small', ' / ' + U.bytes(d.budget, WB.i18n.lang))),
            h('p.muted', t('pack.reviewCounts', { n: tot.items, files: tot.files, links: tot.pages }))),
          h('div', h('div.meter', { role: 'img', 'aria-label': t('foot.meter', { used: U.bytes(tot.bytes, WB.i18n.lang), budget: U.bytes(d.budget, WB.i18n.lang) }) }, h('i', { style: { width: pct + '%' } })),
            h('div.meter-legend', h('span', '0'), h('span', U.bytes(d.budget, WB.i18n.lang))))));
        var ul = h('ul.ledger', { style: { 'margin-top': '1rem' } });
        WB.kit.rows(kit).forEach(function (r) {
          var si = P.sizeInfo(r.item, r.entry);
          ul.appendChild(h('li.row.is-on', h('span.tick-hit', { 'aria-hidden': 'true' }, icon('check')),
            h('div', h('a.row-title', { href: '#/item/' + encodeURIComponent(r.id) }, h('span.hl-text', r.item.title)),
              h('div.row-meta', h('span', P.shelfName(r.item.shelf)), P.entrySummary(r.item, r.entry) ? h('span.row-variant', P.entrySummary(r.item, r.entry)) : null)),
            h('div.row-size', P.sizeText(si))));
        });
        body.appendChild(ul);
        var hasKit = Object.keys(S.state.kit.entries).length > 0;
        body.appendChild(h('div.btn-row', { style: { 'margin-top': '1.5rem' } },
          h('button.btn.btn-primary', { type: 'button', on: { click: function () { save(kit, false); } } }, icon('check'), hasKit ? t('pack.replace') : t('pack.use')),
          hasKit ? h('button.btn', { type: 'button', on: { click: function () { save(kit, true); } } }, icon('plus'), t('pack.merge')) : null));
      }

      function save(kit, merge) {
        var next = merge ? WB.kit.merge(S.state.kit, kit) : kit;
        next.done = S.state.kit.done || {};
        next.budget = d.budget; next.device = d.device; next.region = d.region || null; next.os = WB.platform.installerOs(WB.app.platform);
        if (!merge) next.langs = d.langs.slice();
        S.setKit(next);
        S.draft(null);
        WB.dom.toast(t('pack.saved'));
        WB.router.go('#/kit');
      }

      draw();
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
