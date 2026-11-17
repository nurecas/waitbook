(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  WB.views.item = {
    title: function (parts) { var it = WB.catalog.item(parts[0]); return it ? it.title : t('item.missing'); },
    render: function (el, parts) {
      var C = WB.catalog, K = WB.kit, S = WB.store, U = WB.util;
      var it = C.item(parts[0]);
      if (!it) {
        el.appendChild(P.pageHead('', t('item.missing')));
        el.appendChild(h('p', h('a', { href: '#/library' }, t('nav.library'))));
        return;
      }
      var axis = C.axis(it);
      var kit = S.state.kit;
      var inKit = K.has(kit, it.id);
      var choice = JSON.parse(JSON.stringify(P.choiceOf(it)));

      el.appendChild(h('nav.crumbs', { 'aria-label': t('a11y.breadcrumb') },
        h('a', { href: '#/library' }, t('nav.library')), icon('chev-r'),
        h('a', { href: '#/library/' + it.shelf }, P.shelfName(it.shelf))));

      var sizeBig = h('div.item-size', { 'aria-live': 'polite' });
      var mainBtn = h('button.btn', { type: 'button' });
      var head = h('header.item-head',
        h('div', h('h1', { lang: 'en', dir: 'auto' }, it.title), h('div.row-meta', h('span', { dir: 'auto' }, it.by), P.stamps(it))),
        h('div.item-side', h('div.small.muted', t('item.yourChoice')), sizeBig, h('div', { style: { 'margin-top': '.75rem' } }, mainBtn)));
      el.appendChild(head);
      if (C.gone(it)) {
        el.appendChild(h('div.note.warn', { role: 'note' }, icon('warn'),
          h('p', t('item.gone'), ' ', h('a', { href: '#/kiwix?q=' + encodeURIComponent(it.title) }, t('item.goneSearch')))));
      }

      var body = h('div.grid.cols-2', { style: { 'align-items': 'start', gap: '2rem' } });
      var left = h('div.stack');
      var right = h('div.stack');
      body.appendChild(left);
      body.appendChild(right);
      el.appendChild(body);

      left.appendChild(h('p', { lang: 'en', dir: 'auto' }, it.desc));
      if (it.note) left.appendChild(h('div.note', icon('info'), h('p', it.note)));
      if (it.needs) left.appendChild(h('div.note', icon('info'), h('p', t('item.needs', { needs: it.needs }))));
      if (it.kind === 'model') left.appendChild(h('div.note.warn', icon('warn'), h('p', t('item.aiCaution'))));
      var dl = h('dl.dl');
      dl.appendChild(h('dt', t('item.shelf'))); dl.appendChild(h('dd', h('a', { href: '#/library/' + it.shelf }, P.shelfName(it.shelf))));
      dl.appendChild(h('dt', t('item.priority'))); dl.appendChild(h('dd', t('prio.' + it.p)));
      dl.appendChild(h('dt', t('item.type'))); dl.appendChild(h('dd', t('kind.' + it.kind)));
      if (it.license) { dl.appendChild(h('dt', t('item.license'))); dl.appendChild(h('dd', it.license)); }
      var src = it.home || it.page;
      if (src) { dl.appendChild(h('dt', t('item.source'))); dl.appendChild(h('dd', P.extLink(src, U.hostOf(src)))); }
      if (it.ollama) { dl.appendChild(h('dt', 'Ollama')); dl.appendChild(h('dd', h('code', 'ollama pull ' + it.ollama))); }
      left.appendChild(dl);

      // ---- choices ----
      var choiceBox = h('section.box', { 'aria-labelledby': 'chooseTitle' }, h('h2', { id: 'chooseTitle' }, t('item.choose')));
      right.appendChild(choiceBox);
      var choiceBody = h('div.stack');
      choiceBox.appendChild(choiceBody);

      var filesBox = h('section', { 'aria-labelledby': 'filesTitle' }, h('div.section-head', h('h2', { id: 'filesTitle' }, t('item.files'))));
      var filesHost = h('div');
      filesBox.appendChild(filesHost);
      left.appendChild(filesBox);

      var opensBox = h('section', { 'aria-labelledby': 'opensTitle' });
      left.appendChild(opensBox);

      function save() {
        if (K.has(S.state.kit, it.id)) S.updateKit(function (k) { k.entries[it.id] = { e: choice.e, v: choice.v.slice() }; });
      }

      function renderChoices() {
        WB.dom.clear(choiceBody);
        var eds = C.editions(it);
        if (eds.length > 1) {
          var fs = h('fieldset.seg', { style: { display: 'grid', gap: '.5rem' } }, h('legend', t('item.edition')));
          var list = h('div.variant-list');
          eds.forEach(function (e) {
            var size = P.sizeInfo(it, { e: e.id, v: choice.v });
            var avail = axis !== 'lang' || !it.flavours || choice.v.every(function (v) { return C.editionsFor(it, v).some(function (x) { return x.id === e.id; }); });
            var input = h('input', { type: 'radio', name: 'edition', value: e.id, checked: choice.e === e.id });
            input.addEventListener('change', function () { choice.e = e.id; save(); refresh(); });
            list.appendChild(h('label.variant', input,
              h('span', h('b', P.editionLabel(it, e.id)), h('small', t('ed.' + e.id + '.d') !== 'ed.' + e.id + '.d' ? t('ed.' + e.id + '.d') : ''), !avail ? h('small', ' · ' + t('item.edFallback')) : null),
              h('span.mono', P.sizeText(size))));
          });
          fs.appendChild(list);
          choiceBody.appendChild(fs);
        }
        if (axis === 'lang') choiceBody.appendChild(langPicker());
        else if (axis === 'region') choiceBody.appendChild(regionPicker());
        else if (axis === 'os' || axis === 'pick') choiceBody.appendChild(multiPicker());
      }

      function multiPicker() {
        var opts = axis === 'os' ? U.uniq((it.files || []).map(function (f) { return f.os; })) : C.options(it).map(function (o) { return o.id; });
        var fs = h('fieldset.seg', { style: { display: 'block' } }, h('legend', t(axis === 'os' ? 'item.platforms' : 'item.subjects')));
        var wrap = h('div.lang-picks');
        opts.forEach(function (v) {
          var cb = h('input', { type: 'checkbox', checked: choice.v.indexOf(v) !== -1 });
          cb.addEventListener('change', function () {
            if (cb.checked) choice.v = U.uniq(choice.v.concat([v])); else choice.v = choice.v.filter(function (x) { return x !== v; });
            save(); refresh();
          });
          var sz = P.sizeInfo(it, { e: choice.e, v: [v] });
          wrap.appendChild(h('label.lang-pick', cb, h('span', P.valueLabel(it, v)), h('small.mono.muted', P.sizeText(sz))));
        });
        fs.appendChild(wrap);
        return fs;
      }

      function langPicker() {
        var have = C.langs(it);
        var mine = S.state.kit.langs;
        var fs = h('fieldset.seg', { style: { display: 'block' } }, h('legend', t('item.languages')));
        var shown = U.uniq(choice.v.concat(mine.filter(function (l) { return have.indexOf(l) !== -1; })));
        if (!shown.length && have.indexOf('en') !== -1) shown = ['en'];
        var wrap = h('div.lang-picks');
        shown.forEach(function (l) {
          var cb = h('input', { type: 'checkbox', checked: choice.v.indexOf(l) !== -1 });
          cb.addEventListener('change', function () {
            if (cb.checked) choice.v = U.uniq(choice.v.concat([l])); else choice.v = choice.v.filter(function (x) { return x !== l; });
            save(); refresh();
          });
          var sz = P.sizeInfo(it, { e: choice.e, v: [l] });
          wrap.appendChild(h('label.lang-pick', { lang: WB.util.langAttr(l) }, cb, h('span', WB.i18n.langName(l)), h('small.mono.muted', P.sizeText(sz))));
        });
        fs.appendChild(wrap);
        var others = have.filter(function (l) { return shown.indexOf(l) === -1 && /^[a-z]{2,3}$/.test(l); });
        if (others.length) {
          var coll = WB.i18n.collator();
          var opts = [{ value: '', label: t('item.addLang', { n: others.length }) }].concat(others.map(function (l) { return { value: l, label: WB.i18n.langName(l), lang: WB.util.langAttr(l) }; }).sort(function (a, b) { return coll.compare(a.label, b.label); }));
          fs.appendChild(h('div', { style: { 'margin-top': '.75rem' } }, P.select('addLang', t('item.moreLangs'), opts, '', function (v) { if (!v) return; choice.v = U.uniq(choice.v.concat([v])); save(); refresh(); })));
        }
        if (!have.length || (have.length === 1 && (have[0] === 'mul' || have[0] === '*'))) return h('p.muted.small', t('item.langNeutral'));
        return fs;
      }

      function regionPicker() {
        var regions = C.regionList();
        var countries = P.countryOptions().filter(function (o) { return it.pmtiles ? !!(root.WB_COUNTRIES[o.value] && root.WB_COUNTRIES[o.value].b) : !!regions[o.value]; });
        var groups = ['@africa', '@asia', '@europe', '@north-america', '@central-america', '@south-america', '@oceania', '@world'].filter(function (g) { return it.pmtiles ? g !== '@world' || true : !!regions[g]; });
        var opts = [{ value: '', label: t('item.pickRegion') }, { group: t('item.countries'), options: countries }, { group: t('item.continents'), options: groups.map(function (g) { return { value: g, label: WB.i18n.regionName(g) }; }) }];
        var wrap = h('div.stack');
        wrap.appendChild(P.select('regionPick', t('item.region'), opts, choice.v[0] || '', function (v) { choice.v = v ? [v] : []; save(); refresh(); }));
        if (!it.pmtiles && choice.v[0] && choice.v[0].charAt(0) !== '@') {
          var stem = regions[choice.v[0]];
          if (stem && /maps_en_(africa|asia|europe|north-america|central-america|south-america|australia-oceania)$/.test(stem)) wrap.appendChild(h('p.small.muted', t('item.regionFallback')));
        }
        return wrap;
      }

      function renderFiles() {
        WB.dom.clear(filesHost);
        var files = K.entryFiles(it, choice);
        if (!files.length) { filesHost.appendChild(h('p.muted', t('item.noFiles'))); return; }
        var ul = h('ul.links');
        files.forEach(function (f) {
          var acts = h('div.acts');
          var meta = [];
          if (f.size != null) meta.push((f.est ? '≈ ' : '') + U.bytes(f.size, WB.i18n.lang));
          if (f.date) meta.push(t('item.dated', { date: f.date }));
          if (f.lang) meta.push(WB.i18n.langName(f.lang));
          if (f.os) meta.push(P.osName(f.os));
          if (f.label) meta.push(f.label);
          if (f.kind === 'kiwix') {
            if (f.url) {
              acts.appendChild(h('a.btn.btn-small', { href: f.url }, icon('download'), t('item.download')));
              acts.appendChild(h('a.btn.btn-small.btn-quiet', { href: f.url + '.torrent' }, icon('torrent'), t('item.torrent')));
              acts.appendChild(h('a.btn.btn-small.btn-quiet', { href: f.url + '.meta4' }, t('item.metalink')));
              acts.appendChild(h('a.btn.btn-small.btn-quiet', { href: f.url + '.sha256' }, 'SHA-256'));
            } else acts.appendChild(h('span.small.muted', t('item.unresolved')));
          } else if (f.kind === 'url' || f.kind === 'hf') {
            acts.appendChild(h('a.btn.btn-small', { href: f.url, download: f.name }, icon('download'), t('item.download')));
            acts.appendChild(copyBtn(f.url));
          } else if (f.kind === 'page') {
            acts.appendChild(h('a.btn.btn-small', { href: f.url }, icon('external'), t('item.openPage')));
          } else if (f.kind === 'pmtiles') {
            acts.appendChild(h('a.btn.btn-small', { href: '#/map' }, icon('map'), t('item.mapMaker')));
            meta.push(t('item.zoom', { z: f.zoom }));
          }
          ul.appendChild(h('li', h('div', h('div.fname', f.kind === 'page' ? (f.label || f.url) : f.name), h('div.small.muted', meta.join(' · '))), acts));
        });
        filesHost.appendChild(ul);
        var stale = files.some(function (f) { return f.kind === 'kiwix' && f.src !== 'live'; });
        var hfs = files.filter(function (f) { return f.kind === 'hf'; });
        if ((stale || hfs.length) && WB.net.canFetch()) {
          var btn = h('button.btn.btn-small.btn-quiet', { type: 'button' }, icon('refresh'), t('item.checkNewest'));
          btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.lastChild.textContent = t('item.checking');
            var stems = files.filter(function (f) { return f.kind === 'kiwix'; }).map(function (f) { return f.stem; });
            Promise.all([
              stems.length ? WB.resolve.kiwix(stems, WB.net.fetcher) : Promise.resolve({}),
              hfs.length ? WB.resolve.hf(hfs.map(function (f) { return { repo: f.repo, file: f.name }; }), WB.net.fetcher) : Promise.resolve({}),
            ]).then(function (res) {
              S.mergeLive(Object.assign({}, res[0], res[1]));
              WB.dom.toast(t('item.checked'));
              refresh();
            }).catch(function () { WB.dom.toast(t('net.failed')); btn.disabled = false; });
          });
          filesHost.appendChild(h('p', { style: { 'margin-top': '.75rem' } }, btn));
        } else if (stale) {
          filesHost.appendChild(h('p.small.muted', t('item.snapshotNote', { date: (root.WB_KIWIX_KNOWN || {}).updated || '' })));
        }
      }

      function copyBtn(text) {
        var b = h('button.btn.btn-small.btn-quiet', { type: 'button' }, icon('copy'), t('item.copy'));
        b.addEventListener('click', function () { WB.dom.copyToast(text); });
        return b;
      }

      function renderOpens() {
        WB.dom.clear(opensBox);
        var ids = it.opens || (it.app ? [it.app] : []);
        if (!ids.length) return;
        opensBox.appendChild(h('div.section-head', h('h2', { id: 'opensTitle' }, t('item.opensWith')), h('a', { href: '#/apps' }, t('item.allApps'))));
        var list = h('div.opens');
        var os = WB.app.platform.os;
        ids.forEach(function (id) {
          if (id === 'waitbook-map') { list.appendChild(h('div.app-line', h('span.app-glyph', { 'aria-hidden': 'true' }, 'W'), h('div', h('b', t('item.waitbookMap')), h('div.app-links', h('a', { href: '#/map' }, t('nav.map')))))); return; }
          var app = C.app(id);
          if (!app) return;
          var links = h('div.app-links');
          WB.appLinks(app, os).forEach(function (l) { links.appendChild(l); });
          list.appendChild(h('div.app-line', h('span.app-glyph', { 'aria-hidden': 'true' }, app.name.charAt(0)), h('div', h('b', app.name), h('span.small.muted', ' ' + (app.license || '')), links)));
        });
        opensBox.appendChild(list);
      }

      function renderHead() {
        inKit = K.has(S.state.kit, it.id);
        sizeBig.textContent = P.sizeText(P.sizeInfo(it, choice));
        WB.dom.clear(mainBtn);
        mainBtn.className = 'btn ' + (inKit ? 'btn-danger' : 'btn-primary');
        mainBtn.appendChild(icon(inKit ? 'minus' : 'plus'));
        mainBtn.appendChild(document.createTextNode(inKit ? t('item.remove') : t('item.add')));
        var needsValue = axis !== 'none' && !choice.v.length;
        mainBtn.disabled = !inKit && needsValue;
        mainBtn.title = needsValue ? t('item.chooseFirst') : '';
      }
      mainBtn.addEventListener('click', function () {
        if (K.has(S.state.kit, it.id)) {
          S.updateKit(function (k) { K.remove(k, it.id); });
          WB.dom.announce(t('kit.removed', { title: it.title }));
        } else {
          S.updateKit(function (k) { K.add(k, it.id, choice.e, choice.v); });
          WB.dom.announce(t('kit.added', { title: it.title }));
        }
        renderHead();
      });

      function refresh() { renderChoices(); renderFiles(); renderHead(); }
      refresh();
      renderOpens();
    },
  };

  /** Store/download links for an app, the current platform first. */
  WB.appLinks = function (app, os) {
    var h2 = WB.dom.h;
    var order = ['ios', 'android', 'windows', 'mac', 'linux', 'web'];
    var map = { ios: 'ios', android: 'android', windows: 'windows', mac: 'mac', linux: 'linux', chromeos: 'linux' };
    var mine = map[os];
    var keys = Object.keys(app.links || {});
    keys.sort(function (a, b) {
      var pa = a.split('-')[0], pb = b.split('-')[0];
      return ((pb === mine) - (pa === mine)) || (order.indexOf(pa) - order.indexOf(pb));
    });
    return keys.map(function (k) { return h2('a', { href: app.links[k] }, WB.i18n.t('link.' + k)); });
  };
})(typeof self !== 'undefined' ? self : globalThis);
