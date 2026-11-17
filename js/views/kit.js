(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var TABS = ['checklist', 'script', 'manager', 'share', 'print'];

  WB.views.kit = {
    title: function () { return t('nav.kit'); },
    render: function (el, parts, query, route) {
      var S = WB.store, K = WB.kit, U = WB.util, X = WB.exporters;
      // Shared kit links: #/import/<code>
      if (route.parts[0] === 'import' && parts[0]) return importShared(el, parts[0]);

      var kit = S.state.kit;
      var tot = K.totals(kit);
      var plat = WB.app.platform;
      var tab = TABS.indexOf(query.tab) !== -1 ? query.tab : (plat.scripts ? 'script' : 'checklist');

      el.appendChild(P.pageHead(t('kit.kicker'), t('nav.kit'), tot.items ? null : t('kit.emptyLede')));
      if (!tot.items) {
        el.appendChild(P.emptyState('kit', t('kit.empty'), [h('a.btn.btn-primary', { href: '#/pack' }, icon('kit'), t('home.pack')), h('a.btn', { href: '#/library' }, icon('library'), t('home.browse'))]));
        el.appendChild(importBox());
        return;
      }

      var budget = kit.budget;
      var pct = budget ? Math.min(100, tot.bytes / budget * 100) : 0;
      var loc = WB.i18n.lang;
      var budgetSel = h('select', { id: 'kitBudget' });
      [[0, t('kit.noBudget')]].concat([4e9, 8e9, 16e9, 32e9, 64e9, 128e9, 256e9, 512e9, 1e12, 2e12, 4e12].map(function (b) { return [b, U.bytes(b, loc)]; })).forEach(function (o) {
        budgetSel.appendChild(h('option', { value: String(o[0]), selected: (budget || 0) === o[0] }, o[1]));
      });
      if (budget && [4e9, 8e9, 16e9, 32e9, 64e9, 128e9, 256e9, 512e9, 1e12, 2e12, 4e12].indexOf(budget) === -1) budgetSel.appendChild(h('option', { value: String(budget), selected: true }, U.bytes(budget, loc)));
      budgetSel.addEventListener('change', function () { S.updateKit(function (k) { k.budget = Number(budgetSel.value) || null; }); WB.router.render({ soft: true }); });

      el.appendChild(h('section.kit-summary', { 'aria-label': t('kit.summary') },
        h('div',
          h('div.big-sum', U.bytes(tot.bytes, loc), budget ? h('small', ' / ' + U.bytes(budget, loc)) : null),
          h('p.muted', t('kit.counts', { n: tot.items, files: tot.files, links: tot.pages }) + (tot.unknown ? ' ' + t('kit.unknownSizes', { n: tot.unknown }) : '')),
          tot.files ? h('p.small', t('kit.doneCount', { done: tot.done, n: tot.files })) : null),
        h('div',
          budget ? h('div.meter' + (tot.bytes > budget ? '.is-over' : ''), { role: 'img', 'aria-label': t('foot.meter', { used: U.bytes(tot.bytes, loc), budget: U.bytes(budget, loc) }) }, h('i', { style: { width: pct + '%' } })) : null,
          budget && tot.bytes > budget ? h('p.small', { style: { color: 'var(--stop)', 'margin-top': '.35rem' } }, t('kit.over', { size: U.bytes(tot.bytes - budget, loc) })) : null,
          h('div.field', { style: { 'margin-top': '.75rem' } }, h('label', { for: 'kitBudget' }, t('kit.budget')), budgetSel))));

      var actions = h('div.btn-row', { style: { margin: '1rem 0 0' } },
        h('a.btn.btn-small', { href: '#/pack' }, icon('kit'), t('kit.repack')),
        h('a.btn.btn-small.btn-quiet', { href: '#/library' }, icon('plus'), t('kit.addMore')));
      if (WB.net.canFetch()) {
        var resolveBtn = h('button.btn.btn-small.btn-quiet', { type: 'button' }, icon('refresh'), t('kit.resolve'));
        resolveBtn.addEventListener('click', function () { resolveAll(resolveBtn); });
        actions.appendChild(resolveBtn);
      }
      actions.appendChild(h('button.btn.btn-small.btn-danger', { type: 'button', on: { click: clearKit } }, icon('trash'), t('kit.clear')));
      el.appendChild(actions);

      // ---- export ----
      var exp = h('section.section', { 'aria-labelledby': 'expTitle' }, h('div.section-head', h('h2', { id: 'expTitle' }, t('kit.getIt'))));
      var tabRow = h('div.export-tabs', { role: 'tablist', 'aria-label': t('kit.getIt') });
      var panel = h('div', { role: 'tabpanel', id: 'expPanel', tabindex: '0' });
      TABS.forEach(function (id) {
        var b = h('button.btn.btn-small' + (tab === id ? '' : '.btn-quiet'), { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': tab === id ? 'true' : 'false', 'aria-controls': 'expPanel', tabindex: tab === id ? '0' : '-1' }, t('kit.tab.' + id));
        b.addEventListener('click', function () { tab = id; WB.router.setQuery({ tab: id }); drawExport(); document.getElementById('tab-' + id).focus(); });
        b.addEventListener('keydown', function (e) {
          var i = TABS.indexOf(id);
          var dir = document.documentElement.dir === 'rtl' ? -1 : 1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            var n = TABS[(i + (e.key === 'ArrowRight' ? dir : -dir) + TABS.length) % TABS.length];
            tab = n; WB.router.setQuery({ tab: n }); drawExport(); document.getElementById('tab-' + n).focus(); e.preventDefault();
          }
        });
        tabRow.appendChild(b);
      });
      exp.appendChild(tabRow);
      exp.appendChild(panel);
      el.appendChild(exp);

      function drawExport() {
        TABS.forEach(function (id) {
          var b = document.getElementById('tab-' + id);
          if (!b) return;
          b.className = 'btn btn-small' + (tab === id ? '' : ' btn-quiet');
          b.setAttribute('aria-selected', tab === id ? 'true' : 'false');
          b.tabIndex = tab === id ? 0 : -1;
        });
        panel.setAttribute('aria-labelledby', 'tab-' + tab);
        WB.dom.clear(panel);
        ({ checklist: drawChecklist, script: drawScript, manager: drawManager, share: drawShare, print: drawPrint })[tab]();
      }

      function plan() { return X.plan(S.state.kit); }

      function drawChecklist() {
        var p = plan();
        panel.appendChild(h('p.muted', t('kit.checklistLede')));
        if (plat.os === 'ios') panel.appendChild(h('div.note', icon('info'), h('p', t('kit.iosTip'))));
        var ul = h('ul.checklist');
        p.tasks.forEach(function (task) {
          var done = !!S.state.kit.done[task.key];
          var cb = h('input.tick', { type: 'checkbox', checked: done, 'aria-label': t('kit.markDone', { name: task.name }) });
          var li = h('li' + (done ? '.is-done' : ''));
          cb.addEventListener('change', function () {
            S.updateKit(function (k) { if (cb.checked) k.done[task.key] = 1; else delete k.done[task.key]; });
            li.classList.toggle('is-done', cb.checked);
          });
          var links = h('div.cl-links');
          if (task.kind === 'kiwix') {
            if (task.url) { links.appendChild(h('a', { href: task.url }, t('item.download'))); links.appendChild(h('a', { href: task.url + '.torrent' }, t('item.torrent'))); }
            else links.appendChild(h('span.muted', t('item.unresolved')));
          } else if (task.kind === 'url' || task.kind === 'hf') links.appendChild(h('a', { href: task.url, download: task.name }, t('item.download')));
          else if (task.kind === 'page') links.appendChild(h('a', { href: task.url }, t('item.openPage')));
          else if (task.kind === 'pmtiles') links.appendChild(h('a', { href: '#/map' }, t('kit.mapNeedsComputer')));
          var size = task.size != null ? ' · ' + (task.kind === 'url' || task.kind === 'pmtiles' ? '≈ ' : '') + U.bytes(task.size, loc) : '';
          li.appendChild(h('label.tick-hit', cb));
          li.appendChild(h('div', h('div.cl-name', task.kind === 'page' ? task.title : task.name), h('div.small.muted', task.title + size), links));
          ul.appendChild(li);
        });
        panel.appendChild(ul);
        if (p.skipped.length) panel.appendChild(h('p.small.muted', t('kit.skipped', { n: p.skipped.length })));
      }

      function drawScript() {
        var p = plan();
        var which = S.state.settings.exportOs || (plat.os === 'windows' ? 'ps1' : 'bash');
        var seg = h('fieldset.seg', h('legend', t('kit.scriptFor')));
        [['bash', t('kit.scriptBash')], ['ps1', t('kit.scriptPs1')]].forEach(function (o) {
          var inp = h('input', { type: 'radio', name: 'scriptOs', value: o[0], checked: which === o[0] });
          inp.addEventListener('change', function () { S.setSettings({ exportOs: o[0] }); drawExport(); });
          seg.appendChild(h('label', inp, h('span', o[1])));
        });
        panel.appendChild(seg);
        var isPs = which === 'ps1';
        var name = isPs ? 'waitbook-download.ps1' : 'waitbook-download.sh';
        panel.appendChild(h('div.export-card', { style: { 'margin-top': '1rem' } }, h('span.glyph', icon('download')),
          h('div',
            h('p', t(isPs ? 'kit.ps1Lede' : 'kit.bashLede', { size: U.bytes(p.bytes, loc), n: p.tasks.filter(function (x) { return x.kind !== 'page'; }).length })),
            h('div.btn-row', h('button.btn.btn-primary', { type: 'button', on: { click: function () { WB.dom.download(name, isPs ? X.powershell(plan()) : X.bash(plan()), isPs ? 'text/plain' : 'text/x-shellscript'); } } }, icon('download'), t('kit.downloadFile', { name: name }))),
            h('ol.small', { style: { 'margin-top': '1rem' } },
              h('li', t(isPs ? 'kit.ps1Step1' : 'kit.bashStep1')),
              h('li', t(isPs ? 'kit.ps1Step2' : 'kit.bashStep2'), cmd(isPs ? 'powershell -ExecutionPolicy Bypass -File .\\waitbook-download.ps1' : 'bash waitbook-download.sh')),
              h('li', t('kit.scriptStep3'))),
            h('p.small.muted', t('kit.scriptSafety')))));
      }

      function drawManager() {
        var p = plan();
        panel.appendChild(h('div.grid.cols-2',
          h('div.export-card', h('span.glyph', icon('file')), h('div', h('h3', t('kit.linksTitle')), h('p.small', t('kit.linksLede')),
            h('button.btn', { type: 'button', on: { click: function () { WB.dom.download('waitbook-links.txt', X.linksTxt(plan())); } } }, icon('download'), 'waitbook-links.txt'))),
          h('div.export-card', h('span.glyph', icon('torrent')), h('div', h('h3', t('kit.aria2Title')), h('p.small', t('kit.aria2Lede')),
            h('button.btn', { type: 'button', on: { click: function () { WB.dom.download('waitbook-aria2.txt', X.aria2(plan())); } } }, icon('download'), 'waitbook-aria2.txt'),
            cmd('aria2c -c --follow-metalink=mem --max-concurrent-downloads=2 -i waitbook-aria2.txt')))));
        var unresolved = p.tasks.filter(function (x) { return x.kind === 'kiwix' && !x.url; }).length;
        if (unresolved) panel.appendChild(h('p.small.muted', t('kit.unresolvedNote', { n: unresolved })));
      }

      function drawShare() {
        var linkOut = h('div');
        var btn = h('button.btn.btn-primary', { type: 'button' }, icon('share'), t('kit.makeLink'));
        btn.addEventListener('click', function () {
          WB.share.encode(S.state.kit).then(function (code) {
            var base = location.protocol === 'file:' ? null : location.href.split('#')[0];
            WB.dom.clear(linkOut);
            if (!base) { linkOut.appendChild(h('p.small.muted', t('kit.fileShare'))); return; }
            var url = base + '#/import/' + code;
            var input = h('input', { type: 'text', readonly: true, value: url, 'aria-label': t('kit.shareLink') });
            linkOut.appendChild(h('div.field', { style: { 'margin-top': '1rem' } }, h('label', t('kit.shareLink')), input));
            var row = h('div.btn-row', { style: { 'margin-top': '.5rem' } }, h('button.btn.btn-small', { type: 'button', on: { click: function () { WB.dom.copyToast(url); } } }, icon('copy'), t('item.copy')));
            if (navigator.share) row.appendChild(h('button.btn.btn-small', { type: 'button', on: { click: function () { navigator.share({ title: 'Waitbook kit', url: url }).catch(function () {}); } } }, icon('share'), t('kit.systemShare')));
            linkOut.appendChild(row);
            input.select();
          }).catch(function () { WB.dom.toast(t('kit.shareFailed')); });
        });
        panel.appendChild(h('p', t('kit.shareLede')));
        panel.appendChild(btn);
        panel.appendChild(linkOut);
        panel.appendChild(h('hr'));
        panel.appendChild(h('div.btn-row', h('button.btn', { type: 'button', on: { click: function () { WB.dom.download('waitbook-kit.json', X.kitJson(S.state.kit), 'application/json'); } } }, icon('download'), t('kit.saveFile'))));
        panel.appendChild(importBox());
      }

      function drawPrint() {
        panel.appendChild(h('p', t('kit.printLede')));
        panel.appendChild(h('button.btn.btn-primary', { type: 'button', on: { click: function () { root.print(); } } }, icon('print'), t('kit.print')));
      }

      function cmd(text) {
        return h('div.cmd', h('pre', h('code', text)), h('button.icon-btn', { type: 'button', 'aria-label': t('item.copy'), on: { click: function () { WB.dom.copyToast(text); } } }, icon('copy')));
      }

      drawExport();

      // ---- manifest ----
      var man = h('section.section.manifest', { 'aria-labelledby': 'manTitle' }, h('div.section-head', h('h2', { id: 'manTitle' }, t('kit.manifest')), h('span.small.muted', t('kit.printedOn', { date: U.todayStamp() }))));
      var rows = K.rows(kit);
      var groups = {};
      rows.forEach(function (r) { var s = r.item ? r.item.shelf : 'more'; (groups[s] = groups[s] || []).push(r); });
      WB.catalog.shelves().map(function (s) { return s.id; }).concat(['more']).forEach(function (sid, i) {
        if (!groups[sid]) return;
        var ul = h('ul.ledger', { 'aria-labelledby': 'mg-' + sid });
        var sub = 0;
        groups[sid].forEach(function (r) {
          sub += r.size;
          var removeBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('row.remove', { title: r.item ? r.item.title : r.extra.title }) }, icon('x'));
          removeBtn.addEventListener('click', function () {
            S.updateKit(function (k) { if (r.item) K.remove(k, r.id); else K.removeExtra(k, r.extra.stem); });
            WB.dom.announce(t('kit.removed', { title: r.item ? r.item.title : r.extra.title }));
            WB.router.render({ soft: true });
          });
          var si = r.item ? P.sizeInfo(r.item, r.entry) : { bytes: r.size, unknown: r.unknown };
          ul.appendChild(h('li.row.is-on',
            h('span.tick-hit', removeBtn),
            h('div',
              r.item ? h('a.row-title', { href: '#/item/' + encodeURIComponent(r.id) }, h('span.hl-text', r.item.title)) : h('span.row-title', { dir: 'auto' }, h('span.hl-text', r.extra.title)),
              h('div.row-meta', r.item ? h('span', P.entrySummary(r.item, r.entry)) : h('span.mono', r.extra.stem))),
            h('div.row-size', P.sizeText(si))));
        });
        man.appendChild(h('div.shelf-group',
          h('h3', { id: 'mg-' + sid }, sid === 'more' ? t('kit.fromKiwix') : P.shelfName(sid), h('span.small.muted.mono', { style: { 'margin-inline-start': 'auto' } }, U.bytes(sub, loc))),
          ul));
      });
      man.appendChild(h('div.ledger-total', h('span'), h('span', t('kit.total')), h('span.row-size', U.bytes(tot.bytes, loc) + (tot.unknown ? ' +?' : ''))));
      el.appendChild(man);

      function resolveAll(btn) {
        var stems = [], hfs = [];
        K.rows(S.state.kit).forEach(function (r) { r.files.forEach(function (f) { if (f.kind === 'kiwix') stems.push(f.stem); if (f.kind === 'hf') hfs.push({ repo: f.repo, file: f.name }); }); });
        btn.disabled = true;
        var label = btn.lastChild;
        label.textContent = t('item.checking');
        Promise.all([
          WB.resolve.kiwix(U.uniq(stems), WB.net.fetcher, function (d, n) { label.textContent = t('kit.resolving', { done: d, n: n }); }),
          hfs.length ? WB.resolve.hf(hfs, WB.net.fetcher) : Promise.resolve({}),
        ]).then(function (res) {
          S.mergeLive(Object.assign({}, res[0], res[1]));
          WB.dom.toast(t('kit.resolved', { n: Object.keys(res[0]).length }));
          WB.router.render({ soft: true });
        }).catch(function () { WB.dom.toast(t('net.failed')); btn.disabled = false; label.textContent = t('kit.resolve'); });
      }

      function clearKit() {
        WB.dom.sheet(t('kit.clearTitle'), function (body, close) {
          body.appendChild(h('p', t('kit.clearBody')));
          body.appendChild(h('div.btn-row', h('button.btn.btn-danger', { type: 'button', on: { click: function () { var k = WB.kit.empty(); k.langs = S.state.kit.langs; k.region = S.state.kit.region; k.device = S.state.kit.device; k.budget = S.state.kit.budget; S.setKit(k); close(); WB.router.render({ soft: true }); } } }, icon('trash'), t('kit.clearYes')),
            h('button.btn', { type: 'button', on: { click: close } }, t('kit.cancel'))));
        });
      }
    },
  };

  function importBox() {
    var S = WB.store;
    var input = h('input', { type: 'file', accept: '.json,application/json', id: 'kitImport' });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 2e6) { WB.dom.toast(WB.i18n.t('kit.importBad')); return; }
      f.text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || data.app !== 'waitbook' || !data.kit) throw new Error('bad');
        var kit = WB.kit.normalize(data.kit);
        S.setKit(WB.kit.merge(S.state.kit, kit));
        WB.dom.toast(WB.i18n.t('kit.imported'));
        WB.router.render({ soft: true });
      }).catch(function () { WB.dom.toast(WB.i18n.t('kit.importBad')); });
    });
    return h('div.field', { style: { 'margin-top': '1.25rem' } }, h('label', { for: 'kitImport' }, WB.i18n.t('kit.importFile')), input, h('span.field-hint', WB.i18n.t('kit.importHint')));
  }

  function importShared(el, code) {
    var S = WB.store;
    el.appendChild(P.pageHead(WB.i18n.t('kit.kicker'), WB.i18n.t('kit.importTitle')));
    var host = h('div', h('div.loading-line', h('span.spinner', { 'aria-hidden': 'true' }), WB.i18n.t('kit.importing')));
    el.appendChild(host);
    WB.share.decode(code).then(function (kit) {
      WB.dom.clear(host);
      var tot = WB.kit.totals(kit);
      host.appendChild(h('p', WB.i18n.t('kit.importSummary', { n: tot.items, size: WB.util.bytes(tot.bytes, WB.i18n.lang) })));
      var ul = h('ul.ledger');
      WB.kit.rows(kit).forEach(function (r) { ul.appendChild(h('li.row', h('span.tick-hit', icon('check')), h('div', h('span.row-title', r.item ? r.item.title : r.extra.title)), h('div.row-size', WB.util.bytes(r.size, WB.i18n.lang)))); });
      host.appendChild(ul);
      host.appendChild(h('div.btn-row', { style: { 'margin-top': '1.25rem' } },
        h('button.btn.btn-primary', { type: 'button', on: { click: function () { S.setKit(WB.kit.merge(S.state.kit, kit)); WB.dom.toast(WB.i18n.t('kit.imported')); WB.router.go('#/kit'); } } }, icon('plus'), WB.i18n.t('kit.importMerge')),
        h('button.btn', { type: 'button', on: { click: function () { var k = kit; k.done = {}; S.setKit(k); WB.dom.toast(WB.i18n.t('kit.imported')); WB.router.go('#/kit'); } } }, WB.i18n.t('kit.importReplace')),
        h('a.btn.btn-quiet', { href: '#/kit' }, WB.i18n.t('kit.cancel'))));
    }).catch(function () {
      WB.dom.clear(host);
      host.appendChild(h('div.note.stop', icon('warn'), h('p', WB.i18n.t('kit.importBad'))));
    });
  }
})(typeof self !== 'undefined' ? self : globalThis);
