/* Hash router (works on any static host and from file://). Moves focus to the new page heading for screen
   readers and keyboard users, and keeps the browser title in step. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  WB.views = WB.views || {};

  var current = { name: null, cleanup: null, path: '' };

  function parse() {
    var raw = (root.location.hash || '#/').replace(/^#\/?/, '');
    var qi = raw.indexOf('?');
    var path = qi === -1 ? raw : raw.slice(0, qi);
    var query = {};
    if (qi !== -1) raw.slice(qi + 1).split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { query[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { /* ignore bad escapes */ }
    });
    var parts = path.split('/').filter(Boolean).map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
    return { parts: parts, query: query, path: path };
  }

  var ROUTES = {
    '': 'home', pack: 'pack', library: 'library', item: 'item', kiwix: 'kiwix', kit: 'kit', cards: 'cards',
    map: 'map', apps: 'apps', settings: 'settings', import: 'kit',
  };

  function render(opts) {
    var r = parse();
    var name = ROUTES[r.parts[0] || ''] || 'home';
    var view = WB.views[name];
    var main = document.getElementById('main');
    var samePage = current.name === name && current.path === r.path && opts && opts.soft;
    if (current.cleanup) { try { current.cleanup(); } catch (e) { /* ignore */ } }
    current.cleanup = null;
    WB.dom.clear(main);
    try {
      current.cleanup = view.render(main, r.parts.slice(1), r.query, r) || null;
    } catch (e) {
      if (root.console) console.error(e);
      main.appendChild(WB.dom.h('div.note.stop', WB.dom.icon('warn'), WB.dom.h('p', WB.i18n.t('error.render'))));
    }
    current.name = name;
    current.path = r.path;
    var title = typeof view.title === 'function' ? view.title(r.parts.slice(1)) : '';
    document.title = (title ? title + ' · ' : '') + 'Waitbook';
    WB.emitNav && WB.emitNav(name);
    if (!samePage) {
      root.scrollTo(0, 0);
      var h1 = main.querySelector('h1');
      var target = h1 || main;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      if (!opts || !opts.initial) target.focus({ preventScroll: true });
    }
  }

  function go(hash) {
    if (root.location.hash === hash) render();
    else root.location.hash = hash;
  }

  /** Change the query string without re-rendering the whole page. */
  function setQuery(q) {
    var r = parse();
    var parts = Object.keys(q).filter(function (k) { return q[k] !== '' && q[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); });
    var hash = '#/' + r.path + (parts.length ? '?' + parts.join('&') : '');
    if (root.history && root.history.replaceState) root.history.replaceState(null, '', hash);
    else root.location.replace(hash);
  }

  function start() {
    root.addEventListener('hashchange', function () { render(); });
    render({ initial: true });
  }

  WB.router = { start: start, render: render, go: go, parse: parse, setQuery: setQuery, current: current };
})(typeof self !== 'undefined' ? self : globalThis);
