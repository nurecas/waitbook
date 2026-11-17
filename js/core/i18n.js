/* Interface translations. Dictionaries live in i18n/<code>.js and register themselves; English is the fallback.
   Language and country names come from the browser (Intl.DisplayNames), so they appear in the reader's language. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});

  var UI = [
    { code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
    { code: 'pt', name: 'Português' }, { code: 'ar', name: 'العربية' }, { code: 'hi', name: 'हिन्दी' },
    { code: 'zh', name: '中文（简体）' }, { code: 'sw', name: 'Kiswahili' }, { code: 'ru', name: 'Русский' },
    { code: 'id', name: 'Bahasa Indonesia' },
  ];
  var dicts = {};
  var lang = 'en';
  var names = {};

  function register(code, dict) { dicts[code] = Object.assign(dicts[code] || {}, dict); }

  function lookup(key) {
    var d = dicts[lang];
    if (d && d[key] != null) return d[key];
    return dicts.en && dicts.en[key] != null ? dicts.en[key] : null;
  }

  function plural(form, n) {
    if (typeof form === 'string') return form;
    var cat = 'other';
    try { cat = new Intl.PluralRules(lang).select(n); } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return form[cat] != null ? form[cat] : (form.other != null ? form.other : '');
  }

  /** t('kit.items', {n: 3}) — {name} placeholders; plural objects keyed by CLDR category. */
  function t(key, vars) {
    var v = lookup(key);
    if (v == null) return key;
    if (typeof v === 'object') v = plural(v, vars && typeof vars.n === 'number' ? vars.n : 0);
    if (!vars) return v;
    return v.replace(/\{(\w+)\}/g, function (m, k) {
      if (vars[k] == null) return m;
      return typeof vars[k] === 'number' ? WB.util.num(vars[k], lang) : String(vars[k]);
    });
  }

  function has(key) { return lookup(key) != null; }

  function displayNames(type) {
    var k = lang + ':' + type;
    if (!(k in names)) {
      try { names[k] = new Intl.DisplayNames([lang, 'en'], { type: type }); } catch (e) { names[k] = null; }
    }
    return names[k];
  }

  function langName(code) {
    if (code === 'mul') return t('lang.mul');
    if (code === '*') return t('lang.any');
    var dn = displayNames('language');
    var n = null;
    try { n = dn ? dn.of(code) : null; } catch (e) { n = null; }
    return n && n !== code ? n : code;
  }
  /** A language's name in its own language ("Kiswahili", "العربية"). */
  function endonym(code) {
    try { var n = new Intl.DisplayNames([code], { type: 'language' }).of(code); return n && n !== code ? n : langName(code); } catch (e) { return langName(code); }
  }
  function regionName(code) {
    if (code && code.charAt(0) === '@') return t('region.' + code.slice(1));
    var dn = displayNames('region');
    try { return (dn && dn.of(code)) || code; } catch (e) { return code; }
  }

  function bestMatch(prefs) {
    var codes = UI.map(function (u) { return u.code; });
    for (var i = 0; i < (prefs || []).length; i++) {
      var p = String(prefs[i] || '').toLowerCase().split('-')[0];
      if (codes.indexOf(p) !== -1) return p;
    }
    return 'en';
  }

  function apply(code) {
    lang = code;
    var html = document.documentElement;
    html.lang = code;
    html.dir = WB.util.isRtl(code) ? 'rtl' : 'ltr';
  }

  /** Switch language, loading its dictionary on first use. */
  function setLang(code) {
    if (!UI.some(function (u) { return u.code === code; })) code = 'en';
    if (dicts[code] || code === 'en') { apply(code); return Promise.resolve(code); }
    return WB.dom.loadScript('i18n/' + code + '.js').then(function () { apply(code); return code; }, function () { apply('en'); return 'en'; });
  }

  function collator() { try { return new Intl.Collator(lang); } catch (e) { return { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } }; } }

  WB.i18n = {
    UI: UI, register: register, t: t, has: has, langName: langName, endonym: endonym, regionName: regionName, bestMatch: bestMatch,
    setLang: setLang, collator: collator, get lang() { return lang; },
  };
})(typeof self !== 'undefined' ? self : globalThis);
