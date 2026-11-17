/* App state with localStorage persistence. Storage can be missing or blocked (private mode, file://, quota):
   every access is wrapped, and the app keeps working in memory. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var KEYS = { kit: 'wb.kit.v1', settings: 'wb.settings.v1', live: 'wb.live.v1', draft: 'wb.draft.v1' };
  var LIVE_MAX_AGE = 14 * 864e5;

  function read(key) {
    try { var s = root.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function write(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function drop(key) { try { root.localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  var THEMES = ['auto', 'paper', 'dark', 'night'];
  var SCALES = [1, 1.15, 1.3, 1.5];
  function normalizeSettings(s) {
    s = s && typeof s === 'object' ? s : {};
    var out = {
      lang: typeof s.lang === 'string' && /^[a-z]{2,3}$/.test(s.lang) ? s.lang : null,
      theme: THEMES.indexOf(s.theme) !== -1 ? s.theme : 'auto',
      scale: SCALES.indexOf(s.scale) !== -1 ? s.scale : 1,
      strict: s.strict === true,
      server: typeof s.server === 'string' && /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/.test(s.server) ? s.server.replace(/\/$/, '') : '',
      numbers: typeof s.numbers === 'string' ? s.numbers.slice(0, 2000) : '',
      exportOs: ['bash', 'ps1'].indexOf(s.exportOs) !== -1 ? s.exportOs : null,
    };
    return out;
  }

  var listeners = {};
  var state = {
    kit: WB.kit.normalize(read(KEYS.kit)),
    settings: normalizeSettings(read(KEYS.settings)),
    live: {},
  };
  (function loadLive() {
    var raw = read(KEYS.live) || {};
    var now = Date.now();
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (!v || typeof v !== 'object' || typeof v.at !== 'number' || now - v.at > LIVE_MAX_AGE) return;
      if (k.indexOf('hf:') === 0) { state.live[k] = { size: typeof v.size === 'number' ? v.size : null, sha256: /^[0-9a-f]{64}$/.test(v.sha256 || '') ? v.sha256 : null, at: v.at }; return; }
      if (!WB.opds.STEM_RE.test(k) || !WB.util.isSafeUrl(v.url || '', WB.opds.KIWIX_HOSTS)) return;
      state.live[k] = { date: String(v.date || '').slice(0, 12), size: typeof v.size === 'number' ? v.size : null, url: v.url, dir: String(v.dir || '').slice(0, 40), at: v.at };
    });
    WB.catalog.setLive(state.live);
  })();

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return function () { listeners[ev] = listeners[ev].filter(function (f) { return f !== fn; }); }; }
  function emit(ev, data) { (listeners[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { if (root.console) console.error(e); } }); }

  function setKit(kit) {
    state.kit = kit;
    kit.updated = Date.now();
    write(KEYS.kit, kit);
    emit('kit', kit);
  }
  function updateKit(fn) { fn(state.kit); setKit(state.kit); }

  function setSettings(patch) {
    state.settings = normalizeSettings(Object.assign({}, state.settings, patch));
    write(KEYS.settings, state.settings);
    emit('settings', state.settings);
  }

  function mergeLive(map) {
    Object.keys(map || {}).forEach(function (k) { state.live[k] = map[k]; });
    WB.catalog.setLive(state.live);
    write(KEYS.live, state.live);
    emit('live', state.live);
  }

  function draft(value) {
    if (value === undefined) return read(KEYS.draft);
    if (value === null) return drop(KEYS.draft);
    write(KEYS.draft, value);
  }

  function resetAll() {
    Object.keys(KEYS).forEach(function (k) { drop(KEYS[k]); });
    state.kit = WB.kit.empty();
    state.settings = normalizeSettings({});
    state.live = {};
    WB.catalog.setLive({});
    emit('kit', state.kit);
    emit('settings', state.settings);
  }

  WB.store = { state: state, on: on, emit: emit, setKit: setKit, updateKit: updateKit, setSettings: setSettings, mergeLive: mergeLive, draft: draft, resetAll: resetAll, THEMES: THEMES, SCALES: SCALES, storageOk: write('wb.test', 1) };
})(typeof self !== 'undefined' ? self : globalThis);
