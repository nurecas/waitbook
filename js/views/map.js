(function (root) {
  'use strict';
  var WB = root.WB;
  var h = WB.dom.h, icon = WB.dom.icon, P = WB.parts;
  function t(k, v) { return WB.i18n.t(k, v); }

  var openFile = null; // keep the chosen file while the app is open
  var ZOOMS = ['z10', 'z12', 'z14'];

  function abs(path) { try { return new URL(path, location.href).href; } catch (e) { return path; } }
  function themeIsDark() {
    var th = document.documentElement.dataset.theme;
    if (th === 'dark' || th === 'night') return true;
    if (th === 'auto' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    return false;
  }

  function loadLibs() {
    var D = WB.dom;
    return D.loadStyle('vendor/maplibre/maplibre-gl.css')
      .then(function () { return D.loadScript('vendor/maplibre/maplibre-gl.js'); })
      .then(function () { return Promise.all([D.loadScript('vendor/pmtiles/pmtiles.js'), D.loadScript('vendor/basemaps/basemaps.js'), D.loadScript('vendor/glyphs/ranges.js'), D.loadScript('data/world.js')]); });
  }

  var protocolsReady = false, pmProtocol = null;
  function setupProtocols() {
    if (protocolsReady) return;
    var ml = root.maplibregl;
    pmProtocol = new root.pmtiles.Protocol();
    ml.addProtocol('pmtiles', pmProtocol.tile);
    // Glyphs from vendor/: only the shipped ranges are fetched; others answer with an empty glyph set (CJK and
    // Hangul are drawn with the device's own fonts through localIdeographFontFamily).
    var ranges = root.WB_GLYPH_RANGES || [];
    ml.addProtocol('wbglyphs', function (params) {
      var m = /^wbglyphs:\/\/([^/]+)\/(\d+)-(\d+)\.pbf$/.exec(params.url);
      if (!m) return Promise.resolve({ data: new ArrayBuffer(0) });
      var stack = decodeURIComponent(m[1]).split(',')[0];
      var folder = /Medium|Bold/i.test(stack) ? 'medium' : 'regular';
      var start = Number(m[2]);
      if (ranges.indexOf(start) === -1) return Promise.resolve({ data: new ArrayBuffer(0) });
      return fetch('vendor/glyphs/' + folder + '/' + start + '-' + (start + 255) + '.pbf').then(function (r) { return r.ok ? r.arrayBuffer() : new ArrayBuffer(0); }).catch(function () { return new ArrayBuffer(0); }).then(function (b) { return { data: b }; });
    });
    if (/^https?:$/.test(location.protocol) && ml.getRTLTextPluginStatus && ml.getRTLTextPluginStatus() === 'unavailable') {
      try { ml.setRTLTextPlugin(abs('vendor/maplibre/mapbox-gl-rtl-text.js'), true); } catch (e) { /* optional */ }
    }
    protocolsReady = true;
  }

  // Waitbook's own map palette on top of Protomaps' light and dark flavours.
  function flavor(dark) {
    var b = root.basemaps;
    var f = Object.assign({}, b.namedFlavor(dark ? 'dark' : 'light'));
    var o = dark ? {
      background: '#16130f', earth: '#201c17', water: '#1d3634', park_a: '#24301f', park_b: '#24301f', wood_a: '#22301e', wood_b: '#22301e',
      scrub_a: '#28301f', scrub_b: '#28301f', sand: '#2b261d', beach: '#2b261d', buildings: '#2c271f', glacier: '#2a2f33',
      boundaries: '#8a7f6a', city_label: '#ede5d3', city_label_halo: '#16130f', subplace_label: '#c3b9a5', subplace_label_halo: '#16130f',
      state_label: '#a0957f', state_label_halo: '#16130f', country_label: '#ede5d3', ocean_label: '#74c7c1',
      roads_label_major: '#c3b9a5', roads_label_major_halo: '#16130f', roads_label_minor: '#a0957f', roads_label_minor_halo: '#16130f',
    } : {
      background: '#e9e1cc', earth: '#f1ead8', water: '#b8cdc6', park_a: '#d9dfc3', park_b: '#d9dfc3', wood_a: '#d0d9b9', wood_b: '#d0d9b9',
      scrub_a: '#dde0c6', scrub_b: '#dde0c6', sand: '#ece0bd', beach: '#ece0bd', buildings: '#e0d3b8', glacier: '#f5f3ec',
      boundaries: '#8a7f6a', city_label: '#1d1a16', city_label_halo: '#f1ead8', subplace_label: '#4a443b', subplace_label_halo: '#f1ead8',
      state_label: '#685f53', state_label_halo: '#f1ead8', country_label: '#1d1a16', ocean_label: '#155e63',
      roads_label_major: '#4a443b', roads_label_major_halo: '#f8f4ea', roads_label_minor: '#685f53', roads_label_minor_halo: '#f8f4ea',
      highway: '#fbf7ec', highway_casing_early: '#c9a76a', highway_casing_late: '#c9a76a', major: '#fbf7ec', major_casing_early: '#cdbf9f', major_casing_late: '#cdbf9f',
    };
    Object.assign(f, o, { regular: 'Noto Sans Regular', bold: 'Noto Sans Medium', italic: 'Noto Sans Regular' });
    return f;
  }

  function labelLang() {
    var pairs = (root.basemaps && root.basemaps.language_script_pairs) || [];
    var want = WB.i18n.lang;
    return pairs.some(function (p) { return p.lang === want; }) ? want : 'en';
  }

  function worldStyle(dark) {
    return {
      version: 8,
      sources: { world: { type: 'geojson', data: root.WB_WORLD || { type: 'FeatureCollection', features: [] }, attribution: 'Natural Earth' } },
      layers: [
        { id: 'sea', type: 'background', paint: { 'background-color': dark ? '#1d3634' : '#cfdcd5' } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': dark ? '#29241d' : '#f1ead8' } },
        { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': dark ? '#6b6150' : '#8a7f6a', 'line-width': 0.7 } },
      ],
    };
  }

  function fileStyle(name, dark) {
    var sprite = abs('vendor/sprites/' + (dark ? 'dark' : 'light'));
    return {
      version: 8,
      glyphs: 'wbglyphs://{fontstack}/{range}.pbf',
      sprite: sprite,
      sources: { protomaps: { type: 'vector', url: 'pmtiles://' + name, attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>' } },
      layers: root.basemaps.layers('protomaps', flavor(dark), { lang: labelLang() }),
    };
  }

  /** Is this a Protomaps basemap in the current (v4) schema? Older builds used "pmap:kind" attributes. */
  function isProtomapsV4(meta) {
    var layers = (meta && meta.vector_layers) || [];
    var ids = layers.map(function (l) { return l.id; });
    if (['earth', 'water', 'roads', 'places'].some(function (id) { return ids.indexOf(id) === -1; })) return false;
    var roads = layers.filter(function (l) { return l.id === 'roads'; })[0];
    return !!(roads && roads.fields && roads.fields.kind);
  }

  /** A plain style that draws any vector PMTiles from its own layer list (OpenMapTiles, Shortbread, older Protomaps…). */
  function genericStyle(name, meta, dark) {
    var c = dark
      ? { bg: '#201c17', water: '#1d3634', green: '#24301f', building: '#2c271f', road: '#5b5243', rail: '#4a443b', line: '#8a7f6a', text: '#ede5d3', halo: '#16130f' }
      : { bg: '#f1ead8', water: '#b8cdc6', green: '#d9dfc3', building: '#e0d3b8', road: '#fbf7ec', rail: '#a99f8a', line: '#8a7f6a', text: '#1d1a16', halo: '#f1ead8' };
    var lang = labelLang();
    var nameExpr = ['coalesce', ['get', 'name:' + lang], ['get', 'name']];
    var layers = [{ id: 'bg', type: 'background', paint: { 'background-color': c.bg } }];
    var vl = (meta && meta.vector_layers) || [];
    var polys = [], lines = [], points = [];
    vl.forEach(function (l) {
      var id = String(l.id);
      var src = { source: 'v', 'source-layer': id };
      var isWater = /water|ocean|lake|river|sea/i.test(id) && !/name/i.test(id);
      var isGreen = /land|park|natural|wood|green|earth|cover/i.test(id);
      var isBuilding = /building/i.test(id);
      var isRoad = /road|transport|street|highway|transit|rail/i.test(id) && !/name/i.test(id);
      var isBoundary = /bound|admin/i.test(id);
      polys.push(Object.assign({ id: id + '-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': isWater ? c.water : isBuilding ? c.building : isGreen ? (/earth/i.test(id) ? c.bg : c.green) : c.bg, 'fill-opacity': isBuilding ? 0.9 : 1 } }, src));
      lines.push(Object.assign({ id: id + '-line', type: 'line', filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': isWater ? c.water : isRoad ? c.road : isBoundary ? c.line : c.rail, 'line-width': isRoad ? ['interpolate', ['linear'], ['zoom'], 8, 0.6, 16, 6] : 1, 'line-dasharray': isBoundary ? [3, 2] : [1, 0] } }, src));
      if (!isBuilding) points.push(Object.assign({ id: id + '-label', type: 'symbol', filter: ['has', 'name'],
        layout: { 'text-field': nameExpr, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 16, 14], 'symbol-placement': isRoad || isWater ? 'line' : 'point', 'text-max-width': 8 },
        paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } }, src));
    });
    return {
      version: 8,
      glyphs: 'wbglyphs://{fontstack}/{range}.pbf',
      sources: { v: { type: 'vector', url: 'pmtiles://' + name, attribution: '' } }, // the file's own credit is shown as text
      layers: layers.concat(polys, lines, points),
    };
  }

  /** Text of an HTML snippet from a file (tags dropped, entities decoded), short. */
  function plainText(s) {
    if (typeof s !== 'string') return '';
    return WB.util.decodeXmlEntities(s.replace(/<[^>]*>/g, ' ').replace(/&copy;/gi, '©')).replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  function rasterStyle(name) {
    // attribution '' overrides the file's own (HTML from an unknown file); it is shown as plain text instead.
    return { version: 8, sources: { r: { type: 'raster', url: 'pmtiles://' + name, tileSize: 256, attribution: '' } }, layers: [{ id: 'r', type: 'raster', source: 'r' }] };
  }

  WB.views.map = {
    title: function () { return t('nav.map'); },
    render: function (el) {
      var S = WB.store, U = WB.util;
      el.appendChild(P.pageHead(t('map.kicker'), t('nav.map'), t('map.lede')));

      var wrap = h('div.map-wrap');
      var canvas = h('div.map-canvas', { id: 'mapCanvas', role: 'application', 'aria-label': t('map.aria') });
      var coords = h('span.coords', { 'aria-live': 'off' });
      var hud = h('div.map-hud', coords);
      var fileInput = h('input', { type: 'file', id: 'mapFile', hidden: true });
      var openBtn = h('button.btn.btn-small', { type: 'button', on: { click: function () { fileInput.click(); } } }, icon('file'), t('map.open'));
      var locBtn = h('button.btn.btn-small', { type: 'button', 'aria-label': t('map.locate'), title: t('map.locate') }, icon('locate'));
      var tools = h('div.map-tools', openBtn, locBtn);
      var placeholder = h('div.map-placeholder');
      wrap.appendChild(canvas);
      wrap.appendChild(tools);
      wrap.appendChild(hud);
      wrap.appendChild(placeholder);
      el.appendChild(wrap);
      el.appendChild(fileInput);
      var fileNote = h('p.small.muted', { role: 'status', style: { 'margin-top': '.6rem' } });
      el.appendChild(fileNote);
      var credit = h('p.small.muted', { dir: 'auto' });
      el.appendChild(credit);

      var map = null;
      var marker = null;
      var dark = themeIsDark();

      function setPlaceholder(on, msg) {
        WB.dom.clear(placeholder);
        if (!on) return;
        placeholder.appendChild(h('div.box', h('p', msg || t('map.noFile')), h('button.btn.btn-primary', { type: 'button', on: { click: function () { fileInput.click(); } } }, icon('file'), t('map.open'))));
      }

      loadLibs().then(function () {
        setupProtocols();
        var ml = root.maplibregl;
        map = new ml.Map({
          container: canvas,
          style: worldStyle(dark),
          center: [20, 15], zoom: 1.4,
          attributionControl: false,
          localIdeographFontFamily: "'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Malgun Gothic', sans-serif",
          dragRotate: false, pitchWithRotate: false,
        });
        // MapLibre places controls by physical corner; mirror them in right-to-left languages so they stay clear of
        // the app's own tools (top, inline end) and the coordinates (bottom, inline start).
        var rtl = U.isRtl(WB.i18n.lang);
        map.addControl(new ml.NavigationControl({ showCompass: false }), rtl ? 'top-right' : 'top-left');
        map.addControl(new ml.ScaleControl({ unit: 'metric' }), rtl ? 'bottom-left' : 'bottom-right');
        map.addControl(new ml.AttributionControl({ compact: true }), rtl ? 'bottom-left' : 'bottom-right');
        map.on('move', updateCoords);
        map.on('moveend', function () { if (mk.region === '@view') draw(); }); // "this view" follows the map
        updateCoords();
        var region = S.state.kit.region;
        var box = region && WB.catalog.regionBox(region);
        if (box && box[0] < box[2]) map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 30, duration: 0 });
        if (openFile) loadFile(openFile); else setPlaceholder(true);
      }).catch(function () {
        setPlaceholder(true, t('map.libFail'));
      });

      function updateCoords() {
        if (!map) return;
        var c = map.getCenter();
        coords.textContent = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) + '  z' + map.getZoom().toFixed(1);
      }

      function loadFile(file) {
        if (!file) return;
        // PMTiles v3 files start with the bytes "PMTiles".
        file.slice(0, 7).arrayBuffer().then(function (buf) {
          var magic = String.fromCharCode.apply(null, new Uint8Array(buf));
          if (magic !== 'PMTiles') { fileNote.textContent = t('map.notPmtiles'); return; }
          openFile = file;
          var pm = new root.pmtiles.PMTiles(new root.pmtiles.FileSource(file));
          pmProtocol.add(pm);
          return Promise.all([pm.getHeader(), pm.getMetadata().catch(function () { return {}; })]).then(function (res) {
            var hd = res[0], meta = res[1] || {};
            // Tile type 1 is vector (MVT); 2–5 are PNG, JPEG, WebP and AVIF images.
            if (hd.tileType !== 1) map.setStyle(rasterStyle(file.name));
            else if (isProtomapsV4(meta)) map.setStyle(fileStyle(file.name, dark));
            else map.setStyle(genericStyle(file.name, meta, dark));
            // Credit from the file, as text only (Protomaps basemaps carry theirs in the map's own credit line).
            var own = isProtomapsV4(meta) && hd.tileType === 1 ? '' : plainText(meta.attribution);
            credit.textContent = own ? t('map.credit', { text: own }) : '';
            setPlaceholder(false);
            fileNote.textContent = t('map.loaded', { name: file.name, size: U.bytes(file.size, WB.i18n.lang), z: hd.maxZoom });
            if (hd.minLon < hd.maxLon && hd.minLat < hd.maxLat) map.fitBounds([[hd.minLon, hd.minLat], [hd.maxLon, hd.maxLat]], { padding: 20, duration: 0 });
            if (location.protocol === 'file:') fileNote.textContent += ' ' + t('map.fileProtocol');
          });
        }).catch(function () { fileNote.textContent = t('map.readFail'); });
      }

      fileInput.addEventListener('change', function () { if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]); });
      wrap.addEventListener('dragover', function (e) { e.preventDefault(); });
      wrap.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });

      locBtn.addEventListener('click', function () {
        if (!navigator.geolocation || !root.isSecureContext) { WB.dom.toast(t('map.noGps')); return; }
        locBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(function (pos) {
          locBtn.disabled = false;
          if (!map) return;
          var ll = [pos.coords.longitude, pos.coords.latitude];
          if (!marker) marker = new root.maplibregl.Marker({ color: getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#c93d0a' });
          marker.setLngLat(ll).addTo(map);
          var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
          map[reduce ? 'jumpTo' : 'flyTo']({ center: ll, zoom: Math.max(map.getZoom(), 13) });
          WB.dom.announce(t('map.located', { acc: Math.round(pos.coords.accuracy) }));
        }, function () { locBtn.disabled = false; WB.dom.toast(t('map.gpsFail')); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
      });

      // ---- get a map of your area ----
      var maker = h('section.section', { 'aria-labelledby': 'makerTitle' }, h('div.section-head', h('h2', { id: 'makerTitle' }, t('map.makerTitle'))));
      maker.appendChild(h('p', t('map.makerLede')));
      var mk = { region: S.state.kit.region || '', zoom: 'z12', view: false };
      var out = h('div');
      var opts = [{ value: '', label: t('item.pickRegion') }, { value: '@view', label: t('map.thisView') }].concat(P.countryOptions().filter(function (o) { var c = root.WB_COUNTRIES[o.value]; return c && c.b; }));
      maker.appendChild(h('div.grid.cols-2', { style: { 'align-items': 'end' } },
        P.select('mkRegion', t('item.region'), opts, mk.region, function (v) { mk.region = v; draw(); }),
        (function () {
          var seg = h('fieldset.seg', h('legend', t('map.detail')));
          ZOOMS.forEach(function (z) {
            var inp = h('input', { type: 'radio', name: 'mkZoom', value: z, checked: mk.zoom === z });
            inp.addEventListener('change', function () { mk.zoom = z; draw(); });
            seg.appendChild(h('label', inp, h('span', t('ed.' + z))));
          });
          return seg;
        })()));
      maker.appendChild(out);
      el.appendChild(maker);


      /** The boxes to cut: the visible area (longitudes brought back to -180..180; west > east when the view crosses
          180°), or every part of the chosen region. */
      function areaBoxes() {
        if (mk.region === '@view') {
          if (!map) return null;
          var bb = map.getBounds();
          var w = bb.getWest(), e = bb.getEast();
          var wrap = function (x) { return ((x + 180) % 360 + 360) % 360 - 180; };
          if (e - w >= 360) { w = -180; e = 180; } else { w = wrap(w); e = wrap(e); if (e === -180) e = 180; }
          return [[w, U.clamp(bb.getSouth(), -85, 85), e, U.clamp(bb.getNorth(), -85, 85)].map(function (v) { return Math.round(v * 100) / 100; })];
        }
        return mk.region ? WB.exporters.boxesFor(mk.region) : null;
      }

      function draw() {
        WB.dom.clear(out);
        var boxes = areaBoxes();
        if (!boxes) { out.appendChild(h('p.muted.small', t('map.pickFirst'))); return; }
        var z = parseInt(mk.zoom.slice(1), 10);
        var est = WB.catalog.estimateMap(boxes, z);
        out.appendChild(h('p', t('map.estimate', { size: U.bytes(est, WB.i18n.lang) }), ' ', h('span.small.muted', t('map.estimateNote'))));
        if (mk.region && mk.region !== '@view') {
          var inKit = WB.kit.has(S.state.kit, 'pmtiles-area');
          out.appendChild(h('div.btn-row', h('button.btn.btn-primary', { type: 'button', on: { click: function () {
            S.updateKit(function (k) { k.entries['pmtiles-area'] = { e: mk.zoom, v: [mk.region] }; });
            WB.dom.toast(t('map.added'));
            draw();
          } } }, icon('plus'), inKit ? t('map.updateKit') : t('map.addKit'))));
        }
        var build = 'YYYYMMDD.pmtiles'; // the build list cannot be read from a browser; the scripts look it up
        var base = 'map-' + (mk.region === '@view' ? 'area' : mk.region.replace('@', '').toLowerCase()) + '-' + mk.zoom;
        var name = base + '.pmtiles';
        out.appendChild(h('h3', { style: { 'margin-top': '1.25rem' } }, t('map.byHand')));
        out.appendChild(h('p.small', t('map.byHandLede'), ' ', P.extLink('https://github.com/protomaps/go-pmtiles/releases', t('map.getTool'))));
        var arg = WB.exporters.areaArg(boxes);
        var areaOpt = '--bbox=' + arg;
        if (arg.charAt(0) === '{') {
          // Several parts (or across 180°): the tool takes them as a GeoJSON file.
          areaOpt = '--region=' + base + '.geojson';
          out.appendChild(h('p.small', t('map.areaParts', { n: boxes.length }), ' ',
            h('button.btn.btn-small', { type: 'button', on: { click: function () { WB.dom.download(base + '.geojson', arg, 'application/geo+json'); } } }, icon('download'), t('map.areaFile'))));
        }
        var line = 'pmtiles extract https://build.protomaps.com/' + build + ' ' + name + ' ' + areaOpt + ' --maxzoom=' + z;
        out.appendChild(cmd(line + ' --dry-run'));
        out.appendChild(cmd(line));
        out.appendChild(h('p.small.muted', t('map.buildNote')));
      }

      function cmd(text) {
        return h('div.cmd', h('pre', h('code', text)), h('button.icon-btn', { type: 'button', 'aria-label': t('item.copy'), on: { click: function () { WB.dom.copyToast(text); } } }, icon('copy')));
      }
      draw();

      el.appendChild(h('section.section', h('div.section-head', h('h2', t('map.navTitle'))), h('p', t('map.navLede')),
        h('div.btn-row', h('a.btn', { href: '#/apps' }, icon('apps'), t('map.navApps')), h('a.btn.btn-quiet', { href: '#/item/kiwix-maps' }, icon('maps'), t('map.kiwixMaps')))));

      return function () { if (map) { try { map.remove(); } catch (e) { /* ignore */ } } };
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
