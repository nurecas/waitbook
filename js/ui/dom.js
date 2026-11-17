/* DOM helpers. Text is always set as text (never parsed as HTML), links are checked, styles go through the CSSOM. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var SVGNS = 'http://www.w3.org/2000/svg';

  function safeHref(v) {
    var s = String(v == null ? '' : v).trim();
    if (/^(#|\.\/|\.\.\/|\/(?!\/)|[A-Za-z0-9_.-]+\.(html|json|txt|sh|ps1)$)/.test(s)) return s;
    if (/^(https?:|mailto:|blob:)/i.test(s)) return s;
    return '#';
  }

  /** h('a.btn', {href, on: {click}}, 'text', child, ...) */
  function h(tag, attrs) {
    var m = /^([a-z0-9-]+)((?:\.[A-Za-z0-9_-]+)*)$/.exec(tag);
    var el = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) el.className = m[2].slice(1).split('.').join(' ');
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
        else if (k === 'style') Object.keys(v).forEach(function (p) { el.style.setProperty(p, v[p]); });
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k === 'href') el.setAttribute('href', safeHref(v));
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'multiple' || k === 'required') el[k] = !!v;
        else if (k === 'html') throw new Error('html is not allowed');
        else el.setAttribute(k, v === true ? '' : String(v));
      });
      if (attrs.href && /^https?:/i.test(attrs.href) && !attrs.target) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false || c === true) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function icon(name, cls) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var announceTimer;
  function announce(msg) {
    var el = $('#announcer');
    if (!el) return;
    el.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { el.textContent = msg; }, 60);
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  /** Modal sheet using <dialog>; returns {dialog, body, close}. */
  function sheet(title, build) {
    var host = $('#sheetHost');
    var dlg = h('dialog.sheet', { 'aria-labelledby': 'sheetTitle' });
    var body = h('div.sheet-body');
    var close = function () { try { dlg.close(); } catch (e) { /* closed */ } };
    dlg.appendChild(h('div.sheet-head', h('h2', { id: 'sheetTitle' }, title),
      h('button.icon-btn', { type: 'button', 'aria-label': WB.i18n.t('a11y.close'), on: { click: close } }, icon('x'))));
    dlg.appendChild(body);
    dlg.addEventListener('close', function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    host.appendChild(dlg);
    build(body, close);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return { dialog: dlg, body: body, close: close };
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { 'aria-hidden': 'true', readonly: true });
      ta.value = text;
      ta.style.setProperty('position', 'fixed');
      ta.style.setProperty('opacity', '0');
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /** Save generated text as a file (works on desktop browsers and iOS/Android). */
  function download(name, text, type) {
    var blob = new Blob([text], { type: (type || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name });
    a.style.setProperty('display', 'none');
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  /** Load a classic script once (works from file:// too). */
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loaded[src]; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function loadStyle(href) {
    if (loaded[href]) return loaded[href];
    loaded[href] = new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = function () { resolve(); };
      l.onerror = function () { resolve(); };
      document.head.appendChild(l);
    });
    return loaded[href];
  }

  /** Copy and say whether it worked (clipboards can be blocked, e.g. on file:// or without a user gesture). */
  function copyToast(text) {
    return copy(text).then(function () { toast(WB.i18n.t('item.copied')); }, function () { toast(WB.i18n.t('item.copyFailed')); });
  }

  WB.dom = { h: h, append: append, icon: icon, clear: clear, $: $, $$: $$, announce: announce, toast: toast, sheet: sheet, copy: copy, copyToast: copyToast, download: download, loadScript: loadScript, loadStyle: loadStyle, safeHref: safeHref };
})(typeof self !== 'undefined' ? self : globalThis);
