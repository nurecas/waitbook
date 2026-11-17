/* Kiwix OPDS v2 client helpers: URL building and a small, forgiving Atom parser.
   Everything parsed here is untrusted remote data: callers render it as text only, and URLs are checked
   against the Kiwix hosts before they reach links or scripts. Shared by the app and tools/refresh-kiwix.mjs. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var U = WB.util || (typeof require !== 'undefined' ? require('./util.js') : null);

  var OPDS = 'https://opds.library.kiwix.org/catalog/v2';
  var DL = 'https://download.kiwix.org/zim/';
  var KIWIX_HOSTS = ['download.kiwix.org', 'lb.download.kiwix.org', 'mirror.download.kiwix.org'];
  // A dated Kiwix file: <stem>_<YYYY-MM>[a-z]{0,2}.zim  (letters mark same-month rebuilds)
  var FILE_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*?)_(\d{4}-\d{2}[a-z]{0,2})\.zim$/;
  var STEM_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
  var FLAVOURS = ['maxi', 'nopic', 'mini'];

  function entriesUrl(params) {
    var q = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v)));
    });
    return OPDS + '/entries' + (q.length ? '?' + q.join('&') : '');
  }

  /** Split a stem into the OPDS <name> and <flavour> (the name never includes the flavour). */
  function splitStem(stem) {
    var parts = String(stem).split('_');
    var last = parts[parts.length - 1];
    if (parts.length > 1 && FLAVOURS.indexOf(last) !== -1) return { name: parts.slice(0, -1).join('_'), flavour: last };
    return { name: stem, flavour: '' };
  }

  function parseFile(file) {
    var m = FILE_RE.exec(file || '');
    return m ? { stem: m[1], date: m[2] } : null;
  }

  function attrs(tag) {
    var out = {};
    var re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    var m;
    while ((m = re.exec(tag))) out[m[1]] = U.decodeXmlEntities(m[3] !== undefined ? m[3] : m[4]);
    return out;
  }

  function text(block, tag) {
    var m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>').exec(block);
    if (!m) return '';
    return U.decodeXmlEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  }

  /** Normalise one acquisition href to the canonical download.kiwix.org URL of the .zim (or null). */
  function zimUrlFromHref(href) {
    if (!href || !U.isSafeUrl(href, KIWIX_HOSTS)) return null;
    var path = href.replace(/^https:\/\/[^/]+/, '');
    var m = /^\/zim\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)\/([^/]+?)(\.meta4)?$/.exec(path);
    if (!m) return null;
    var file = m[2];
    if (m[1].split('/').some(function (seg) { return seg === '.' || seg === '..'; })) return null;
    if (!parseFile(file)) return null;
    return { dir: m[1], file: file, url: DL + m[1] + '/' + file };
  }

  function parseEntry(block) {
    var e = {
      id: text(block, 'id').replace(/^urn:uuid:/, ''),
      title: text(block, 'title').slice(0, 300),
      summary: text(block, 'summary').slice(0, 600),
      name: text(block, 'name'),
      flavour: text(block, 'flavour'),
      category: text(block, 'category'),
      tags: text(block, 'tags').split(';').filter(Boolean),
      lang: text(block, 'language').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      articles: parseInt(text(block, 'articleCount'), 10) || 0,
      media: parseInt(text(block, 'mediaCount'), 10) || 0,
      issued: text(block, 'dc:issued').slice(0, 10),
      updated: text(block, 'updated').slice(0, 10),
      size: null, url: null, dir: '', file: '', stem: '', date: '', thumb: null,
    };
    var linkRe = /<link\b[^>]*>/g;
    var m;
    while ((m = linkRe.exec(block))) {
      var a = attrs(m[0]);
      if (a.rel === 'http://opds-spec.org/acquisition/open-access' && /zim/.test(a.type || '')) {
        var z = zimUrlFromHref(a.href);
        if (z) {
          var f = parseFile(z.file);
          e.url = z.url; e.dir = z.dir; e.file = z.file; e.stem = f.stem; e.date = f.date;
          var len = Number(a.length);
          e.size = isFinite(len) && len > 0 ? len : null;
        }
      } else if (a.rel === 'http://opds-spec.org/image/thumbnail' && /^\/catalog\/v2\/illustration\/[0-9a-f-]+\/\?size=\d+$/.test(a.href || '')) {
        e.thumb = 'https://opds.library.kiwix.org' + a.href;
      }
    }
    if (!STEM_RE.test(e.stem)) return null;
    return e;
  }

  function parseFeed(xml) {
    xml = String(xml || '');
    var total = parseInt(text(xml.split('<entry>')[0], 'totalResults'), 10);
    var entries = [];
    var re = /<entry>([\s\S]*?)<\/entry>/g;
    var m;
    while ((m = re.exec(xml))) {
      var e = parseEntry(m[1]);
      if (e) entries.push(e);
    }
    return { total: isFinite(total) ? total : entries.length, updated: text(xml.split('<entry>')[0], 'updated'), entries: entries };
  }

  /** From the entries returned for a name, pick the newest file whose stem matches exactly. */
  function pickStem(entries, stem) {
    var best = null;
    entries.forEach(function (e) {
      if (e.stem !== stem) return;
      if (!best || e.date > best.date) best = e;
    });
    return best;
  }

  /** Extra links Kiwix publishes next to every file. */
  function sidecars(zimUrl) {
    return { meta4: zimUrl + '.meta4', torrent: zimUrl + '.torrent', magnet: zimUrl + '.magnet', sha256: zimUrl + '.sha256' };
  }

  /** Best-guess directory for a stem when we only know its name (scripts resolve the real one at run time). */
  function guessDir(stem) {
    var s = String(stem);
    var prefixes = ['wikipedia', 'wiktionary', 'wikivoyage', 'wikibooks', 'wikisource', 'wikiquote', 'wikiversity', 'wikinews', 'gutenberg', 'ted', 'phet', 'vikidia', 'ifixit', 'devdocs', 'freecodecamp', 'libretexts', 'mooc', 'maps', 'videos'];
    for (var i = 0; i < prefixes.length; i++) if (s.indexOf(prefixes[i] + '_') === 0) return prefixes[i];
    if (/(stackexchange\.com|stackoverflow\.com|superuser\.com|serverfault\.com|askubuntu\.com|mathoverflow\.net)_/.test(s)) return 'stack_exchange';
    if (/^[a-z0-9-]+\.[a-z0-9.-]+_/.test(s)) return 'zimit';
    return 'other';
  }

  WB.opds = {
    OPDS: OPDS, DL: DL, KIWIX_HOSTS: KIWIX_HOSTS, FILE_RE: FILE_RE, STEM_RE: STEM_RE,
    entriesUrl: entriesUrl, splitStem: splitStem, parseFile: parseFile, parseFeed: parseFeed,
    parseEntry: parseEntry, pickStem: pickStem, sidecars: sidecars, zimUrlFromHref: zimUrlFromHref, guessDir: guessDir,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.opds;
})(typeof self !== 'undefined' ? self : globalThis);
