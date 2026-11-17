// Loads the browser modules into Node's global scope the same way index.html does (classic scripts).
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
globalThis.self = globalThis;
const files = [
  'data/countries.js', 'js/core/util.js', 'js/core/i18n.js', 'js/core/opds.js', 'data/catalog.js', 'data/kiwix-known.js',
  'data/apps.js', 'data/cards.js', 'js/core/catalog.js', 'js/core/kit.js', 'js/core/resolve.js', 'js/core/exporters.js',
  'js/core/share.js', 'js/core/platform.js',
];
for (const f of files) require(path.join(ROOT, f));
globalThis.WB.catalog.init();
module.exports = { WB: globalThis.WB, ROOT };
