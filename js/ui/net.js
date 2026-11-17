/* The only place the app touches the network. Off by default until a screen needs it; the strict-offline
   setting blocks everything. Requests go to the two live sources allowed by the page's CSP. (The Protomaps build
   list does not allow browsers on other sites, so only the download scripts read it.) */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var ALLOWED = ['opds.library.kiwix.org', 'huggingface.co'];

  function online() { return root.navigator ? root.navigator.onLine !== false : true; }
  function allowed() { return !WB.store.state.settings.strict; }
  function canFetch() { return allowed() && online(); }

  function get(url, timeoutMs) {
    if (!allowed()) return Promise.reject(new Error('strict-offline'));
    if (!online()) return Promise.reject(new Error('offline'));
    if (ALLOWED.indexOf(WB.util.hostOf(url)) === -1) return Promise.reject(new Error('host-not-allowed'));
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 20000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var len = Number(res.headers.get('content-length') || 0);
        if (len > 40e6) throw new Error('too-big');
        return res;
      })
      .finally(function () { clearTimeout(timer); });
  }

  var fetcher = {
    text: function (url) { return get(url).then(function (r) { return r.text(); }); },
    json: function (url) { return get(url).then(function (r) { return r.json(); }); },
  };

  WB.net = { online: online, allowed: allowed, canFetch: canFetch, get: get, fetcher: fetcher, ALLOWED: ALLOWED };
})(typeof self !== 'undefined' ? self : globalThis);
