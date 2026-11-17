/* App shell: settings, language, navigation, running total, online state, service worker. */
(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, t = function (k, v) { return WB.i18n.t(k, v); };
  var S = WB.store;

  var NAV = [
    { id: 'home', href: '#/', icon: 'home' },
    { id: 'library', href: '#/library', icon: 'library' },
    { id: 'kit', href: '#/kit', icon: 'kit', badge: true },
    { id: 'cards', href: '#/cards', icon: 'cards' },
    { sep: true },
    { id: 'map', href: '#/map', icon: 'map' },
    { id: 'kiwix', href: '#/kiwix', icon: 'globe' },
    { id: 'apps', href: '#/apps', icon: 'apps' },
    { id: 'settings', href: '#/settings', icon: 'settings' },
  ];
  var TABS = ['home', 'library', 'kit', 'cards'];
  var activeView = 'home';

  WB.app = { platform: WB.platform.detect() };

  function applySettings(s) {
    var html = document.documentElement;
    html.dataset.theme = s.theme;
    html.style.setProperty('--text-scale', String(s.scale || 1));
    var meta = document.querySelector('meta[name="theme-color"]:not([media])') || null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = s.theme === 'night' ? '#0a0505' : s.theme === 'dark' ? '#16130f' : s.theme === 'paper' ? '#f1ead8' : '';
    if (!meta.content) meta.remove();
  }

  function kitCount() { return Object.keys(S.state.kit.entries).length + Object.keys(S.state.kit.extra).length; }

  function buildNav() {
    var list = WB.dom.clear(document.getElementById('spineList'));
    list.appendChild(h('li.spine-brand', h('a.brand', { href: '#/', 'aria-label': t('nav.homeLabel') },
      h('span.brand-mark', { 'aria-hidden': 'true' }, document.querySelector('.masthead .brand-mark svg').cloneNode(true)),
      h('span.brand-word', 'Waitbook')), h('span.tag', t('app.tagline'))));
    NAV.forEach(function (n) {
      if (n.sep) { list.appendChild(h('li.nav-sep', { role: 'presentation' })); return; }
      list.appendChild(h('li', h('a.nav', { href: n.href, dataset: { nav: n.id } }, icon(n.icon), h('span', t('nav.' + n.id)), n.badge ? h('span.badge', { 'aria-label': '' }) : null)));
    });
    var tabs = WB.dom.clear(document.getElementById('tabbar'));
    TABS.forEach(function (id) {
      var n = NAV.filter(function (x) { return x.id === id; })[0];
      tabs.appendChild(h('a', { href: n.href, dataset: { nav: n.id } }, icon(n.icon), h('span', t('nav.' + n.id)), n.badge ? h('span.badge') : null));
    });
    tabs.appendChild(h('button', { type: 'button', 'aria-haspopup': 'dialog', dataset: { nav: 'more' }, on: { click: openMore } }, icon('more'), h('span', t('nav.more'))));
    document.querySelector('.masthead .brand').setAttribute('aria-label', t('nav.homeLabel'));
    document.querySelector('.skip').textContent = t('a11y.skip');
    document.getElementById('spine').setAttribute('aria-label', t('nav.main'));
    document.getElementById('tabbar').setAttribute('aria-label', t('nav.main'));
    document.getElementById('ledgerFoot').setAttribute('aria-label', t('foot.label'));
    updateBadges();
    markActive(activeView);
  }

  function openMore() {
    WB.dom.sheet(t('nav.more'), function (body, close) {
      var ul = h('ul.option-list');
      [{ id: 'pack', href: '#/pack', icon: 'kit' }].concat(NAV.filter(function (n) { return !n.sep && TABS.indexOf(n.id) === -1; })).forEach(function (n) {
        ul.appendChild(h('li', h('a', { href: n.href, 'aria-current': activeView === n.id ? 'true' : null, on: { click: close } }, h('span', icon(n.icon), ' ', t('nav.' + n.id)), icon('chev-r', 'flip-rtl'))));
      });
      body.appendChild(ul);
    });
  }

  function markActive(name) {
    activeView = name;
    var alias = { item: 'library', pack: 'kit' };
    var navName = alias[name] || name;
    WB.dom.$$('[data-nav]').forEach(function (a) {
      var on = a.dataset.nav === navName || (a.dataset.nav === 'more' && TABS.indexOf(navName) === -1 && navName !== 'home');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    renderFoot();
  }
  WB.emitNav = markActive;

  function updateBadges() {
    var n = kitCount();
    WB.dom.$$('.badge').forEach(function (b) {
      b.textContent = n ? WB.util.num(n, WB.i18n.lang) : '';
      if (n) b.setAttribute('aria-label', t('kit.itemsCount', { n: n })); else b.removeAttribute('aria-label');
    });
  }

  /** The running total at the foot of the page, like the sum line of a ledger. */
  function renderFoot() {
    var foot = WB.dom.clear(document.getElementById('ledgerFoot'));
    var n = kitCount();
    if (!n || ['kit', 'map', 'cards', 'settings', 'pack'].indexOf(activeView) !== -1) return;
    var tot = WB.kit.totals(S.state.kit);
    var budget = S.state.kit.budget;
    var loc = WB.i18n.lang;
    var pct = budget ? Math.min(100, tot.bytes / budget * 100) : 0;
    var meter = budget ? h('div.meter' + (tot.bytes > budget ? '.is-over' : ''), { role: 'img', 'aria-label': t('foot.meter', { used: WB.util.bytes(tot.bytes, loc), budget: WB.util.bytes(budget, loc) }) }, h('i', { style: { width: pct + '%' } })) : null;
    foot.appendChild(h('div.lf-inner',
      h('span.lf-label', t('foot.title')),
      h('span.lf-sum', h('span.lf-items', t('kit.itemsCount', { n: n }) + ' · '), WB.util.bytes(tot.bytes, loc) + (budget ? ' / ' + WB.util.bytes(budget, loc) : '') + (tot.unknown ? ' +?' : '')),
      meter ? h('div.lf-meter', meter) : h('span.lf-meter'),
      h('a.btn.btn-small.lf-go', { href: '#/kit' }, t('foot.review'), icon('chev-r', 'flip-rtl'))));
  }

  function renderNet() {
    var el = WB.dom.clear(document.getElementById('netStatus'));
    var on = WB.net.online();
    var strict = S.state.settings.strict;
    el.classList.toggle('is-offline', !on || strict);
    el.appendChild(h('span.dot', { 'aria-hidden': 'true' }));
    el.appendChild(h('span.label', strict ? t('net.strict') : on ? t('net.online') : t('net.offline')));
    el.setAttribute('title', strict ? t('net.strict') : on ? t('net.online') : t('net.offline'));
  }

  function quickLang() {
    WB.dom.sheet(t('settings.language'), function (body, close) {
      var ul = h('ul.option-list');
      WB.i18n.UI.forEach(function (u) {
        ul.appendChild(h('li', h('button', { type: 'button', lang: u.code, 'aria-pressed': WB.i18n.lang === u.code ? 'true' : 'false', on: { click: function () { close(); setLanguage(u.code); } } }, h('span', u.name), WB.i18n.lang === u.code ? icon('check') : null)));
      });
      body.appendChild(ul);
    });
  }

  function setLanguage(code) {
    S.setSettings({ lang: code });
    return WB.i18n.setLang(code).then(function () {
      document.getElementById('quickLangCode').textContent = WB.i18n.lang.toUpperCase();
      document.getElementById('quickLang').setAttribute('aria-label', t('settings.language') + ': ' + (WB.i18n.UI.filter(function (u) { return u.code === WB.i18n.lang; })[0] || {}).name);
      buildNav();
      renderNet();
      WB.router.render({ soft: true });
    });
  }
  WB.app.setLanguage = setLanguage;

  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) WB.dom.toast(t('app.updated'));
        });
      });
    }).catch(function () { /* offline install is optional */ });
  }

  function boot() {
    WB.catalog.init();
    var s = S.state.settings;
    applySettings(s);
    var code = s.lang || WB.i18n.bestMatch(navigator.languages || [navigator.language]);
    WB.i18n.setLang(code).then(function () {
      document.getElementById('quickLangCode').textContent = WB.i18n.lang.toUpperCase();
      document.getElementById('quickLang').setAttribute('aria-label', t('settings.language'));
      document.getElementById('quickLang').addEventListener('click', quickLang);
      buildNav();
      renderNet();
      S.on('kit', function () { updateBadges(); renderFoot(); });
      S.on('live', renderFoot);
      S.on('settings', function (st) { applySettings(st); renderNet(); });
      root.addEventListener('online', renderNet);
      root.addEventListener('offline', renderNet);
      WB.router.start();
      registerSW();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : globalThis);
