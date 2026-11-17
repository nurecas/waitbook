/* Download plans: turn a kit into a list of tasks, then into files people can run or import.
   Security: every URL, stem and file name is validated against strict patterns before it reaches a script,
   and each value is single-quoted for its shell. Remote titles never enter scripts; curated titles appear only
   in comments, stripped of line breaks and control characters. */
(function (root) {
  'use strict';
  var WB = (root.WB = root.WB || {});
  var U = WB.util, C = WB.catalog, K = WB.kit, O = WB.opds;

  var PMTILES_VERSION = '1.31.2';
  // Published SHA-256 sums for the pmtiles CLI archives (from cashapp/hermit-packages, matching the GitHub release).
  var PMTILES_SUMS = {
    'go-pmtiles_1.31.2_Linux_x86_64.tar.gz': '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f',
    'go-pmtiles_1.31.2_Linux_arm64.tar.gz': 'f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1',
    'go-pmtiles-1.31.2_Darwin_arm64.zip': '40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d',
    'go-pmtiles-1.31.2_Darwin_x86_64.zip': '1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b',
  };
  var ZOOMS = { z8: 8, z10: 10, z12: 12, z14: 14, z15: 15 };
  var HEX64 = /^[0-9a-f]{64}$/;

  function comment(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').slice(0, 160); }

  function folderFor(shelfId) {
    var list = C.shelves().map(function (s) { return s.id; });
    var i = list.indexOf(shelfId);
    return i === -1 ? '16-more' : (i < 9 ? '0' : '') + (i + 1) + '-' + shelfId;
  }

  /** The boxes [w,s,e,n] a region's map is cut from (a little padding around each), or null. */
  function boxesFor(region) {
    var list = C.regionBoxes(region);
    if (!list) return null;
    var pad = region.charAt(0) === '@' ? 0 : 0.05;
    return list.map(function (b) {
      return [U.clamp(b[0] - pad, -180, 180), U.clamp(b[1] - pad, -85, 85), U.clamp(b[2] + pad, -180, 180), U.clamp(b[3] + pad, -85, 85)]
        .map(function (v) { return Math.round(v * 100) / 100; });
    });
  }
  /** The main box only (kept for callers that frame a map). */
  function bboxFor(region) { var l = boxesFor(region); return l ? l[0] : null; }

  /** Build the task list for a kit. */
  function plan(kit) {
    var tasks = [], skipped = [];
    var seen = Object.create(null);
    K.rows(kit).forEach(function (r) {
      var folder = r.item ? folderFor(r.item.shelf) : '16-more';
      var title = r.item ? r.item.title : (r.extra && r.extra.title) || '';
      r.files.forEach(function (f) {
        if (seen[f.key]) return;
        seen[f.key] = 1;
        var t = { key: f.key, folder: folder, kind: f.kind, title: comment(title), label: comment(f.label || ''), size: f.size == null ? null : f.size, done: !!kit.done[f.key] };
        if (f.kind === 'kiwix') {
          if (!O.STEM_RE.test(f.stem)) { skipped.push({ key: f.key, why: 'bad-name' }); return; }
          t.stem = f.stem;
          t.opdsName = C.opdsName ? C.opdsName(f.stem) : O.splitStem(f.stem).name;
          t.search = searchTerm(f.stem);
          t.name = f.date ? f.stem + '_' + f.date + '.zim' : f.stem + '.zim';
          t.url = f.url && U.isSafeUrl(f.url, O.KIWIX_HOSTS) ? f.url : null;
          t.date = f.date || null;
        } else if (f.kind === 'url' || f.kind === 'hf') {
          if (!U.isSafeUrl(f.url)) { skipped.push({ key: f.key, why: 'unsafe-url', url: f.url }); return; }
          t.url = f.url;
          t.name = U.safeName(f.name || U.basename(f.url));
          // A checksum is only used with a link pinned to the revision it was read from (a file on 'main' can be
          // replaced by its publisher at any time).
          var lv = f.kind === 'hf' ? C.liveInfo()['hf:' + f.repo + '/' + f.name] : null;
          var sum = lv && lv.rev && f.url.indexOf('/resolve/' + lv.rev + '/') !== -1 ? lv.sha256 : null;
          t.sha256 = sum && HEX64.test(sum) ? sum : null;
        } else if (f.kind === 'page') {
          if (!U.isSafeUrl(f.url)) { skipped.push({ key: f.key, why: 'unsafe-url', url: f.url }); return; }
          t.url = f.url;
          t.name = comment(f.label || title);
        } else if (f.kind === 'pmtiles') {
          var boxes = boxesFor(f.region);
          if (!boxes || !boxes.every(function (b) { return b.every(isFinite); })) { skipped.push({ key: f.key, why: 'no-area' }); return; }
          t.boxes = boxes;
          t.bbox = boxes[0];
          t.maxzoom = ZOOMS[r.entry && r.entry.e] || 12;
          t.region = f.region;
          t.name = U.safeName('map-' + String(f.region || 'area').replace('@', '').toLowerCase() + '-z' + t.maxzoom + '.pmtiles');
        } else {
          return;
        }
        tasks.push(t);
      });
    });
    var bytes = 0, unknown = 0;
    tasks.forEach(function (t) { if (t.kind === 'page') return; if (t.size == null) unknown++; else bytes += t.size; });
    return { tasks: tasks, skipped: skipped, bytes: bytes, unknown: unknown, date: U.todayStamp() };
  }

  function sizeLine(p, locale) {
    var s = p.tasks.filter(function (t) { return t.kind !== 'page'; }).length + ' files, about ' + U.bytes(p.bytes, 'en');
    if (p.unknown) s += ' plus ' + p.unknown + ' of unknown size';
    return s;
  }

  function regexStem(stem) { return stem.replace(/\./g, '\\.'); }
  /** A word to search the catalog with when a book is not found under its name (it may have been renamed). */
  function searchTerm(stem) { return stem.split('_')[0].split('.').sort(function (a, b) { return b.length - a.length; })[0]; }
  /** Total size for the scripts' free-space check: a plain integer, whatever a shared kit claims. */
  function needBytes(p) { return String(Math.min(Math.max(0, Math.round(Number(p.bytes)) || 0), 9e15)); }

  function crosses(b) { return b[0] > b[2]; }
  /** A region as GeoJSON for pmtiles --region: one polygon per box, boxes that cross 180° split in two. */
  function regionGeoJson(list) {
    if (!Array.isArray(list[0])) list = [list];
    var polys = [];
    list.forEach(function (b) {
      (crosses(b) ? [[b[0], b[1], 180, b[3]], [-180, b[1], b[2], b[3]]] : [b]).forEach(function (x) {
        polys.push([[[x[0], x[1]], [x[2], x[1]], [x[2], x[3]], [x[0], x[3]], [x[0], x[1]]]]);
      });
    });
    return JSON.stringify({ type: 'MultiPolygon', coordinates: polys });
  }
  /** What the scripts pass to pmtiles: "w,s,e,n" for one plain box, GeoJSON otherwise. */
  function areaArg(boxes) { return boxes.length === 1 && !crosses(boxes[0]) ? boxes[0].join(',') : regionGeoJson(boxes); }

  /* ---------- links.txt ---------- */
  function linksTxt(p) {
    var out = ['# Waitbook download list — ' + p.date, '# ' + sizeLine(p), '# Kiwix links point at the newest file known when this list was made; the download scripts always fetch the newest.', ''];
    var folder = '';
    p.tasks.forEach(function (t) {
      if (t.folder !== folder) { folder = t.folder; out.push('', '# ' + folder); }
      if (t.kind === 'page') out.push('# Open in a browser and download from the publisher: ' + t.name + ' — ' + t.url);
      else if (t.kind === 'pmtiles') out.push('# Map of ' + t.region + ' (zoom ' + t.maxzoom + '): made by waitbook-download.sh or .ps1');
      else if (t.url) out.push(t.url);
      else out.push('# Not resolved yet (open Waitbook online, or use the script): ' + t.stem);
    });
    if (p.skipped.length) out.push('', '# Skipped ' + p.skipped.length + ' link(s) that failed safety checks.');
    return out.join('\n') + '\n';
  }

  /* ---------- aria2 input ---------- */
  function aria2(p) {
    var out = ['# Waitbook list for aria2 — ' + p.date, '# ' + sizeLine(p),
      '# Run:  aria2c -c --follow-metalink=mem --max-concurrent-downloads=2 -i waitbook-aria2.txt',
      '# Kiwix files use .meta4 metalinks, so aria2 picks fast mirrors and checks every file.', ''];
    p.tasks.forEach(function (t) {
      if (t.kind === 'kiwix') {
        if (!t.url) { out.push('# Not resolved (use the script instead): ' + t.stem); return; }
        out.push(t.url + '.meta4', '  dir=Waitbook/' + t.folder);
      } else if (t.kind === 'url' || t.kind === 'hf') {
        out.push(t.url, '  dir=Waitbook/' + t.folder, '  out=' + t.name);
        if (t.sha256) out.push('  checksum=sha-256=' + t.sha256);
      } else if (t.kind === 'page') {
        out.push('# Open in a browser: ' + t.url);
      } else if (t.kind === 'pmtiles') {
        out.push('# Map of ' + t.region + ': aria2 cannot cut maps; use waitbook-download.sh or .ps1');
      }
    });
    return out.join('\n') + '\n';
  }

  /* ---------- bash ---------- */
  function bash(p) {
    var q = U.shQuote;
    var L = [];
    L.push('#!/usr/bin/env bash');
    L.push('# Waitbook download script — generated ' + p.date);
    L.push('# ' + sizeLine(p) + '. Kiwix files resolve to their newest version when you run it.');
    L.push('#');
    L.push('# Use it on macOS, Linux, or Android with Termux:');
    L.push('#   1. Put this file where you have space (for example on an external drive).');
    L.push('#   2. In a terminal run:                  bash waitbook-download.sh');
    L.push('#      (it makes a Waitbook folder next to this file), or choose the folder:');
    L.push('#                                          bash waitbook-download.sh /path/to/folder');
    L.push('#   3. Run it again any time: finished files are skipped and interrupted ones resume.');
    L.push('# WAITBOOK_VERIFY=0 skips checksum checks (faster on slow disks). When Kiwix publishes a newer version of a');
    L.push('# book you already have, the one you have is kept; WAITBOOK_UPDATE=1 downloads the new one and then removes it.');
    L.push('');
    L.push('set -u');
    L.push('export LC_ALL=C  # byte order and plain ASCII ranges in sort, grep and patterns, whatever the locale');
    L.push('DEST="${1:-$(dirname -- "$0")/Waitbook}"');
    L.push('OPDS="${WAITBOOK_OPDS:-https://opds.library.kiwix.org/catalog/v2/entries}"');
    L.push('DL="${WAITBOOK_DL:-https://download.kiwix.org}"');
    L.push('BUILDS="${WAITBOOK_BUILDS:-https://build-metadata.protomaps.dev/builds.json}"');
    L.push('VERIFY="${WAITBOOK_VERIFY:-1}"');
    L.push('UPDATE="${WAITBOOK_UPDATE:-0}"');
    L.push('UA="Waitbook-download/1"');
    L.push('NEED=' + needBytes(p));
    L.push('OK=0; SKIP=0; FAIL=0; FAILED=""');
    L.push('');
    L.push('command -v curl >/dev/null 2>&1 || { echo "This script needs curl. Install it and run again."; exit 1; }');
    L.push('mkdir -p "$DEST" || { echo "Cannot create $DEST"; exit 1; }');
    L.push('FREE_KB=$(df -Pk "$DEST" 2>/dev/null | awk \'NR==2 {print $4}\')');
    L.push('if [ -n "${FREE_KB:-}" ] && [ "$FREE_KB" -gt 0 ] 2>/dev/null && [ $((FREE_KB / 1000000)) -lt $((NEED / 1000000000)) ]; then');
    L.push('  echo "Warning: about $((NEED / 1000000000)) GB needed but only $((FREE_KB / 1000000)) GB free in $DEST."');
    L.push('fi');
    L.push('');
    L.push('sha256_of() {');
    L.push('  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d" " -f1');
    L.push('  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d" " -f1');
    L.push('  else echo ""; fi');
    L.push('}');
    L.push('fail() { FAIL=$((FAIL + 1)); FAILED="$FAILED|$1"; echo "  x failed: $1"; }');
    L.push('# Size of a remote file in bytes, or nothing if the server does not say.');
    L.push('remote_size() { curl -fsIL --retry 3 --connect-timeout 30 -A "$UA" "$1" 2>/dev/null | tr -d "\\r" | awk \'tolower($1) == "content-length:" { n = $2 } END { print n }\'; }');
    L.push('');
    L.push('# fetch FOLDER NAME URL [SHA256]');
    L.push('fetch() {');
    L.push('  local dir="$DEST/$1" name="$2" url="$3" want="${4:-}" code rc got size');
    L.push('  mkdir -p "$dir" || { fail "$1/$name (cannot create folder)"; return 1; }');
    L.push('  if [ -f "$dir/$name" ]; then echo "= $1/$name (already here)"; SKIP=$((SKIP + 1)); return 0; fi');
    L.push('  echo "> $1/$name"');
    L.push('  code=$(curl -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A "$UA" -C - -o "$dir/$name.part" -w "%{http_code}" "$url"); rc=$?');
    L.push('  if [ $rc -eq 33 ]; then');
    L.push('    # The server cannot resume this download: start it again from the beginning.');
    L.push('    rm -f "$dir/$name.part"');
    L.push('    code=$(curl -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A "$UA" -o "$dir/$name.part" -w "%{http_code}" "$url"); rc=$?');
    L.push('  fi');
    L.push('  if [ $rc -ne 0 ] && [ "$code" != "416" ]; then fail "$1/$name ($url)"; return 1; fi');
    L.push('  if [ "$code" = "416" ]; then');
    L.push('    # The unfinished file is already as long as the remote one (curl may report success). It is only kept if');
    L.push('    # its checksum (below) or, without one, its size matches.');
    L.push('    [ -s "$dir/$name.part" ] || { fail "$1/$name ($url)"; return 1; }');
    L.push('    if [ -z "$want" ] || [ "$VERIFY" != "1" ]; then');
    L.push('      size=$(remote_size "$url")');
    L.push('      if [ -z "$size" ] || [ "$size" != "$(wc -c < "$dir/$name.part" | tr -d " ")" ]; then');
    L.push('        rm -f "$dir/$name.part"');
    L.push('        curl -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A "$UA" -o "$dir/$name.part" "$url" || { fail "$1/$name ($url)"; return 1; }');
    L.push('      fi');
    L.push('    fi');
    L.push('  fi');
    L.push('  if [ -n "$want" ] && [ "$VERIFY" = "1" ]; then');
    L.push('    got=$(sha256_of "$dir/$name.part")');
    L.push('    if [ -n "$got" ] && [ "$got" != "$want" ]; then mv -f "$dir/$name.part" "$dir/$name.bad"; fail "$1/$name (checksum did not match; kept as $name.bad)"; return 1; fi');
    L.push('  fi');
    L.push('  mv -f "$dir/$name.part" "$dir/$name" && OK=$((OK + 1))');
    L.push('}');
    L.push('');
    L.push('# newest FEED STEM_REGEX — the newest .meta4 link for exactly this book in an OPDS feed (byte order, not locale)');
    L.push('newest() { printf "%s" "$1" | grep -o "https://[A-Za-z0-9.-]*/zim/[A-Za-z0-9_./-]*/$2_[0-9][0-9][0-9][0-9]-[0-9][0-9][a-z]*\\.zim\\.meta4" | LC_ALL=C sort | tail -n 1; }');
    L.push('# versions FOLDER STEM_REGEX [SUFFIX] — files of this book already in the folder, oldest first');
    L.push('versions() { ls -1 "$DEST/$1" 2>/dev/null | grep -E "^$2_[0-9]{4}-[0-9]{2}[a-z]{0,2}\\.zim${3:-}\\$" | LC_ALL=C sort; }');
    L.push('# kiwix FOLDER STEM OPDS_NAME STEM_REGEX SEARCH — finds the newest file for a Kiwix book, then fetches it');
    L.push('kiwix() {');
    L.push('  local feed href url file sum old f');
    L.push('  feed=$(curl -fsSL --retry 3 --connect-timeout 30 -A "$UA" "$OPDS?name=$3&count=50") || { fail "$1/$2 (cannot reach the Kiwix catalog)"; return 1; }');
    L.push('  href=$(newest "$feed" "$4")');
    L.push('  if [ -z "$href" ] && [ -n "${5:-}" ]; then');
    L.push('    # The book may be listed under another name: search for it.');
    L.push('    feed=$(curl -fsSL --retry 3 --connect-timeout 30 -A "$UA" "$OPDS?q=$5&count=50") && href=$(newest "$feed" "$4")');
    L.push('  fi');
    L.push('  [ -n "$href" ] || { fail "$1/$2 (no longer in the Kiwix catalog)"; return 1; }');
    L.push('  url="$DL/zim/${href#*/zim/}"; url="${url%.meta4}"; file="${url##*/}"');
    L.push('  # Unfinished downloads of other versions of this book can never be resumed.');
    L.push('  for f in $(versions "$1" "$4" "\\.part"); do [ "$f" = "$file.part" ] || rm -f "$DEST/$1/$f"; done');
    L.push('  if [ ! -f "$DEST/$1/$file" ] && [ "$UPDATE" != "1" ]; then');
    L.push('    old=$(versions "$1" "$4" | tail -n 1)');
    L.push('    if [ -n "$old" ]; then echo "= $1/$old (already here; newer: $file, set WAITBOOK_UPDATE=1 to replace it)"; SKIP=$((SKIP + 1)); return 0; fi');
    L.push('  fi');
    L.push('  sum=""');
    L.push('  if [ "$VERIFY" = "1" ] && [ ! -f "$DEST/$1/$file" ]; then sum=$(curl -fsSL --retry 3 -A "$UA" "$url.sha256" | cut -c1-64 | tr -cd "0-9a-f"); fi');
    L.push('  [ ${#sum} -eq 64 ] || sum=""');
    L.push('  fetch "$1" "$file" "$url" "$sum" || return 1');
    L.push('  if [ "$UPDATE" = "1" ]; then for f in $(versions "$1" "$4"); do [ "$f" = "$file" ] || rm -f "$DEST/$1/$f"; done; fi');
    L.push('}');
    L.push('');
    L.push('PMTILES=""');
    L.push('get_pmtiles() {');
    L.push('  [ -n "$PMTILES" ] && return 0');
    L.push('  if command -v pmtiles >/dev/null 2>&1; then PMTILES=pmtiles; return 0; fi');
    L.push('  local asset sum tools="$DEST/tools"');
    L.push('  case "$(uname -s)-$(uname -m)" in');
    Object.keys(PMTILES_SUMS).forEach(function (a) {
      var pat = /Linux_x86_64/.test(a) ? 'Linux-x86_64|Linux-amd64' : /Linux_arm64/.test(a) ? 'Linux-aarch64|Linux-arm64' : /Darwin_arm64/.test(a) ? 'Darwin-arm64' : 'Darwin-x86_64';
      L.push('    ' + pat + ') asset=' + q(a) + '; sum=' + q(PMTILES_SUMS[a]) + ' ;;');
    });
    L.push('    *) echo "  No ready-made pmtiles tool for this system; see https://github.com/protomaps/go-pmtiles"; return 1 ;;');
    L.push('  esac');
    L.push('  mkdir -p "$tools" || return 1');
    L.push('  curl -fL --retry 3 -A "$UA" -o "$tools/$asset" "https://github.com/protomaps/go-pmtiles/releases/download/v' + PMTILES_VERSION + '/$asset" || return 1');
    L.push('  if [ "$(sha256_of "$tools/$asset")" != "$sum" ]; then echo "  The pmtiles download did not match its published checksum; not using it."; rm -f "$tools/$asset"; return 1; fi');
    L.push('  case "$asset" in');
    L.push('    *.zip) (cd "$tools" && unzip -o -q "$asset" pmtiles) || return 1 ;;');
    L.push('    *) tar -xzf "$tools/$asset" -C "$tools" pmtiles || return 1 ;;');
    L.push('  esac');
    L.push('  chmod +x "$tools/pmtiles" && PMTILES="$tools/pmtiles"');
    L.push('}');
    L.push('latest_build() {');
    L.push('  curl -fsSL --retry 3 -A "$UA" "$BUILDS" | grep -o "[0-9]\\{8\\}\\.pmtiles" | LC_ALL=C sort | tail -n 1');
    L.push('}');
    L.push('# mapcut FOLDER NAME BBOX_OR_GEOJSON MAXZOOM — cuts an area out of the newest Protomaps planet build');
    L.push('mapcut() {');
    L.push('  local dir="$DEST/$1" name="$2" area="$3" z="$4" build');
    L.push('  mkdir -p "$dir" || return 1');
    L.push('  if [ -f "$dir/$name" ]; then echo "= $1/$name (already here)"; SKIP=$((SKIP + 1)); return 0; fi');
    L.push('  get_pmtiles || { fail "$1/$name (could not get the pmtiles tool)"; return 1; }');
    L.push('  build=$(latest_build); [ -n "$build" ] || { fail "$1/$name (cannot reach the Protomaps build list)"; return 1; }');
    L.push('  echo "> $1/$name (from Protomaps build $build)"');
    L.push('  case "$area" in');
    L.push('    "{"*) printf "%s" "$area" > "$dir/$name.area.geojson"; set -- "--region=$dir/$name.area.geojson" ;;');
    L.push('    *) set -- "--bbox=$area" ;;');
    L.push('  esac');
    L.push('  if "$PMTILES" extract "https://build.protomaps.com/$build" "$dir/$name.part" "$1" --maxzoom="$z"; then');
    L.push('    mv -f "$dir/$name.part" "$dir/$name"; rm -f "$dir/$name.area.geojson"; OK=$((OK + 1))');
    L.push('  else fail "$dir/$name (map extract)"; fi');
    L.push('}');
    L.push('');
    L.push('write_index() {');
    L.push('  local out="$DEST/index.html" d f folder n');
    L.push('  {');
    L.push('    printf "%s\\n" "<!doctype html><html><head><meta charset=\\"utf-8\\"><meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\"><title>Waitbook library</title>"');
    L.push('    printf "%s\\n" "<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5}h2{border-bottom:2px solid;margin-top:2rem}li{margin:.3rem 0}</style></head><body>"');
    L.push('    printf "%s\\n" "<h1>Waitbook library</h1><p>Open .zim files with Kiwix, .pmtiles maps in the Waitbook map screen, videos with VLC. PDFs open in a browser.</p>"');
    L.push('    for d in "$DEST"/*/; do');
    L.push('      [ -d "$d" ] || continue; folder=$(basename "$d")');
    L.push('      case "$folder" in [0-9][0-9]-*) ;; *) continue ;; esac  # only folders this script makes');
    L.push('      case "$folder" in *[!a-z0-9-]*) continue ;; esac');
    L.push('      printf "<h2>%s</h2><ul>\\n" "$folder"');
    L.push('      for f in "$d"*; do');
    L.push('        [ -f "$f" ] || continue; n=$(basename "$f")');
    L.push('        case "$n" in *.part|*.bad|*.geojson) continue ;; esac');
    L.push('        case "$n" in *[!A-Za-z0-9._-]*) continue ;; esac');
    L.push('        printf "<li><a href=\\"%s/%s\\">%s</a></li>\\n" "$folder" "$n" "$n"');
    L.push('      done');
    L.push('      printf "</ul>\\n"');
    L.push('    done');
    L.push('    printf "%s\\n" "</body></html>"');
    L.push('  } > "$out"');
    L.push('}');
    L.push('');
    L.push('echo "Waitbook: downloading into $DEST"');
    var folder = '';
    p.tasks.forEach(function (t) {
      if (t.folder !== folder) { folder = t.folder; L.push('', '# ' + folder); }
      var label = '# ' + comment(t.title + (t.label ? ' — ' + t.label : ''));
      if (t.kind === 'kiwix') {
        L.push(label);
        L.push('kiwix ' + [t.folder, t.stem, t.opdsName, regexStem(t.stem), t.search].map(q).join(' '));
      } else if (t.kind === 'url' || t.kind === 'hf') {
        L.push(label);
        L.push('fetch ' + [t.folder, t.name, t.url, t.sha256 || ''].map(q).join(' '));
      } else if (t.kind === 'pmtiles') {
        L.push(label);
        var area = areaArg(t.boxes || [t.bbox]);
        L.push('mapcut ' + [t.folder, t.name, area, String(t.maxzoom)].map(q).join(' '));
      } else if (t.kind === 'page') {
        L.push('# Open in a browser and download from the publisher: ' + comment(t.name) + ' — ' + t.url);
      }
    });
    L.push('');
    L.push('write_index');
    L.push('echo ""');
    L.push('echo "Done: $OK downloaded, $SKIP already here, $FAIL failed."');
    L.push('if [ "$FAIL" -gt 0 ]; then echo "Failed (run the script again to retry):"; printf "%s" "$FAILED" | tr "|" "\\n" | sed "/^$/d; s/^/  /"; fi');
    L.push('echo "Open $DEST/index.html to browse what you have."');
    L.push('[ "$FAIL" -eq 0 ]');
    return L.join('\n') + '\n';
  }

  /* ---------- PowerShell ---------- */
  function powershell(p) {
    var q = U.psQuote;
    var L = [];
    L.push('# Waitbook download script for Windows - generated ' + p.date);
    L.push('# ' + sizeLine(p) + '. Kiwix files resolve to their newest version when you run it.');
    L.push('#');
    L.push('# How to use (Windows 10 or 11):');
    L.push('#   1. Put this file where you have space (for example on an external drive).');
    L.push('#   2. Right-click it and choose "Run with PowerShell", or in PowerShell run:');
    L.push('#        powershell -ExecutionPolicy Bypass -File .\\waitbook-download.ps1 [destination folder]');
    L.push('#      It makes a Waitbook folder next to this file unless you name another folder.');
    L.push('#   3. Run it again any time: finished files are skipped and interrupted ones resume.');
    L.push('# Works in Windows PowerShell 5.1 and PowerShell 7. Set WAITBOOK_VERIFY=0 to skip checksum checks. When Kiwix');
    L.push('# publishes a newer version of a book you already have, yours is kept; WAITBOOK_UPDATE=1 replaces it.');
    L.push('');
    L.push('param([string]$Dest = "")');
    L.push('if (-not $Dest) { $Dest = if ($PSScriptRoot) { Join-Path $PSScriptRoot "Waitbook" } else { "Waitbook" } }');
    L.push('# A full path, because the .NET calls below do not follow PowerShell\'s current folder.');
    L.push('$Dest = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Dest)');
    L.push('$ErrorActionPreference = "Continue"');
    L.push('$Opds = if ($env:WAITBOOK_OPDS) { $env:WAITBOOK_OPDS } else { "https://opds.library.kiwix.org/catalog/v2/entries" }');
    L.push('$DL = if ($env:WAITBOOK_DL) { $env:WAITBOOK_DL } else { "https://download.kiwix.org" }');
    L.push('$Builds = if ($env:WAITBOOK_BUILDS) { $env:WAITBOOK_BUILDS } else { "https://build-metadata.protomaps.dev/builds.json" }');
    L.push('$Verify = ($env:WAITBOOK_VERIFY -ne "0")');
    L.push('$Update = ($env:WAITBOOK_UPDATE -eq "1")');
    L.push('$UA = "Waitbook-download/1"');
    L.push('$Need = [int64]' + needBytes(p));
    L.push('$script:Ok = 0; $script:Skip = 0; $script:Failed = @()');
    L.push('');
    L.push('if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { Write-Host "This script needs curl.exe, which comes with Windows 10 and 11."; exit 1 }');
    L.push('New-Item -ItemType Directory -Force -Path $Dest | Out-Null');
    L.push('try {');
    L.push('  $drive = Get-PSDrive -Name ((Resolve-Path $Dest).Path.Substring(0, 1)) -ErrorAction Stop');
    L.push('  if ($drive.Free -and $drive.Free -lt $Need) { Write-Host ("Warning: about {0:N0} GB needed but only {1:N0} GB free." -f ($Need / 1e9), ($drive.Free / 1e9)) }');
    L.push('} catch { }');
    L.push('');
    L.push('function Fail([string]$What) { $script:Failed += $What; Write-Host "  x failed: $What" }');
    L.push('');
    L.push('# Hashing and unzipping call .NET directly: Get-FileHash and Expand-Archive live in modules that Windows');
    L.push('# PowerShell 5.1 cannot load when it is started from PowerShell 7.');
    L.push('function Get-Sha256([string]$Path) {');
    L.push('  $sha = [System.Security.Cryptography.SHA256]::Create()');
    L.push('  $fs = [System.IO.File]::OpenRead($Path)');
    L.push('  try { return ([System.BitConverter]::ToString($sha.ComputeHash($fs)) -replace "-", "").ToLowerInvariant() } finally { $fs.Dispose(); $sha.Dispose() }');
    L.push('}');
    L.push('');
    L.push('# Size of a remote file in bytes, or -1 if the server does not say.');
    L.push('function Get-RemoteSize([string]$Url) {');
    L.push('  $head = (& curl.exe -fsIL --retry 3 --connect-timeout 30 -A $UA $Url) -join "`n"');
    L.push('  $m = [regex]::Matches($head, "(?im)^content-length:\\s*(\\d+)")');
    L.push('  if ($m.Count -gt 0) { return [int64]$m[$m.Count - 1].Groups[1].Value }');
    L.push('  return [int64]-1');
    L.push('}');
    L.push('');
    L.push('function Get-File([string]$Folder, [string]$Name, [string]$Url, [string]$Sha256 = "") {');
    L.push('  $dir = Join-Path $Dest $Folder');
    L.push('  New-Item -ItemType Directory -Force -Path $dir | Out-Null');
    L.push('  $out = Join-Path $dir $Name');
    L.push('  if (Test-Path -LiteralPath $out) { Write-Host "= $Folder/$Name (already here)"; $script:Skip++; return }');
    L.push('  Write-Host "> $Folder/$Name"');
    L.push('  $part = "$out.part"');
    L.push('  $code = & curl.exe -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A $UA -C - -o $part -w "%{http_code}" $Url');
    L.push('  if ($LASTEXITCODE -eq 33) {');
    L.push('    # The server cannot resume this download: start it again from the beginning.');
    L.push('    Remove-Item -Force -LiteralPath $part -ErrorAction SilentlyContinue');
    L.push('    $code = & curl.exe -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A $UA -o $part -w "%{http_code}" $Url');
    L.push('  }');
    L.push('  if ($LASTEXITCODE -ne 0 -and $code -ne "416") { Fail "$Folder/$Name ($Url)"; return }');
    L.push('  if ($code -eq "416") {');
    L.push('    # The unfinished file is already as long as the remote one (curl may report success). It is only kept if');
    L.push('    # its checksum (below) or, without one, its size matches.');
    L.push('    if (-not (Test-Path -LiteralPath $part)) { Fail "$Folder/$Name ($Url)"; return }');
    L.push('    if (-not ($Sha256 -and $Verify)) {');
    L.push('      $size = Get-RemoteSize $Url');
    L.push('      if ($size -lt 0 -or $size -ne (Get-Item -LiteralPath $part).Length) {');
    L.push('        Remove-Item -Force -LiteralPath $part');
    L.push('        & curl.exe -fL --retry 5 --retry-delay 10 --connect-timeout 30 -A $UA -o $part $Url');
    L.push('        if ($LASTEXITCODE -ne 0) { Fail "$Folder/$Name ($Url)"; return }');
    L.push('      }');
    L.push('    }');
    L.push('  }');
    L.push('  if ($Sha256 -and $Verify) {');
    L.push('    $got = Get-Sha256 $part');
    L.push('    if ($got -ne $Sha256) { Move-Item -Force -LiteralPath $part -Destination "$out.bad"; Fail "$Folder/$Name (checksum did not match; kept as $Name.bad)"; return }');
    L.push('  }');
    L.push('  Move-Item -Force -LiteralPath $part -Destination $out');
    L.push('  $script:Ok++');
    L.push('}');
    L.push('');
    L.push('# The newest .meta4 link for exactly this book in an OPDS feed (ordinal order, not the culture\'s).');
    L.push('function Get-Newest([string]$Feed, [string]$Stem) {');
    L.push('  $pattern = "https://[A-Za-z0-9.-]+/zim/[A-Za-z0-9_./-]+/" + [regex]::Escape($Stem) + "_\\d{4}-\\d{2}[a-z]{0,2}\\.zim\\.meta4"');
    L.push('  [string[]]$hrefs = @([regex]::Matches($Feed, $pattern) | ForEach-Object { $_.Value })');
    L.push('  if ($hrefs.Count -eq 0) { return $null }');
    L.push('  [Array]::Sort($hrefs, [StringComparer]::Ordinal)');
    L.push('  return $hrefs[$hrefs.Count - 1]');
    L.push('}');
    L.push('');
    L.push('# Files of this book already in the folder, oldest first.');
    L.push('function Get-Versions([string]$Folder, [string]$Stem, [string]$Suffix = "") {');
    L.push('  $dir = Join-Path $Dest $Folder');
    L.push('  if (-not (Test-Path -LiteralPath $dir)) { return }');
    L.push('  $re = "^" + [regex]::Escape($Stem) + "_\\d{4}-\\d{2}[a-z]{0,2}\\.zim" + [regex]::Escape($Suffix) + "$"');
    L.push('  [string[]]$names = @(Get-ChildItem -LiteralPath $dir -File | ForEach-Object { $_.Name } | Where-Object { $_ -cmatch $re })');
    L.push('  [Array]::Sort($names, [StringComparer]::Ordinal)');
    L.push('  $names');
    L.push('}');
    L.push('');
    L.push('function Get-Kiwix([string]$Folder, [string]$Stem, [string]$Name, [string]$Search = "") {');
    L.push('  $feed = (& curl.exe -fsSL --retry 3 --connect-timeout 30 -A $UA ($Opds + "?name=" + $Name + "&count=50")) -join "`n"');
    L.push('  if ($LASTEXITCODE -ne 0) { Fail "$Folder/$Stem (cannot reach the Kiwix catalog)"; return }');
    L.push('  $href = Get-Newest $feed $Stem');
    L.push('  if (-not $href -and $Search) {');
    L.push('    # The book may be listed under another name: search for it.');
    L.push('    $feed = (& curl.exe -fsSL --retry 3 --connect-timeout 30 -A $UA ($Opds + "?q=" + $Search + "&count=50")) -join "`n"');
    L.push('    if ($LASTEXITCODE -eq 0) { $href = Get-Newest $feed $Stem }');
    L.push('  }');
    L.push('  if (-not $href) { Fail "$Folder/$Stem (no longer in the Kiwix catalog)"; return }');
    L.push('  $url = $DL + "/zim/" + $href.Substring($href.IndexOf("/zim/") + 5)');
    L.push('  $url = $url.Substring(0, $url.Length - 6)');
    L.push('  $file = $url.Substring($url.LastIndexOf("/") + 1)');
    L.push('  $dir = Join-Path $Dest $Folder');
    L.push('  # Unfinished downloads of other versions of this book can never be resumed.');
    L.push('  foreach ($f in @(Get-Versions $Folder $Stem ".part")) { if ($f -ne "$file.part") { Remove-Item -Force -LiteralPath (Join-Path $dir $f) } }');
    L.push('  if (-not (Test-Path -LiteralPath (Join-Path $dir $file)) -and -not $Update) {');
    L.push('    $old = @(Get-Versions $Folder $Stem) | Select-Object -Last 1');
    L.push('    if ($old) { Write-Host "= $Folder/$old (already here; newer: $file, set WAITBOOK_UPDATE=1 to replace it)"; $script:Skip++; return }');
    L.push('  }');
    L.push('  $sum = ""');
    L.push('  if ($Verify -and -not (Test-Path -LiteralPath (Join-Path $dir $file))) {');
    L.push('    $raw = (& curl.exe -fsSL --retry 3 -A $UA ($url + ".sha256")) -join ""');
    L.push('    if ($raw -match "^([0-9a-f]{64})") { $sum = $Matches[1] }');
    L.push('  }');
    L.push('  Get-File $Folder $file $url $sum');
    L.push('  if ($Update -and (Test-Path -LiteralPath (Join-Path $dir $file))) {');
    L.push('    foreach ($f in @(Get-Versions $Folder $Stem)) { if ($f -ne $file) { Remove-Item -Force -LiteralPath (Join-Path $dir $f) } }');
    L.push('  }');
    L.push('}');
    L.push('');
    L.push('$script:Pmtiles = $null');
    L.push('function Get-Pmtiles {');
    L.push('  if ($script:Pmtiles) { return $true }');
    L.push('  $onPath = Get-Command pmtiles.exe -ErrorAction SilentlyContinue');
    L.push('  if ($onPath) { $script:Pmtiles = $onPath.Source; return $true }');
    L.push('  $tools = Join-Path $Dest "tools"; New-Item -ItemType Directory -Force -Path $tools | Out-Null');
    L.push('  $asset = "go-pmtiles_' + PMTILES_VERSION + '_Windows_x86_64.zip"');
    L.push('  $zip = Join-Path $tools $asset');
    L.push('  & curl.exe -fL --retry 3 -A $UA -o $zip ("https://github.com/protomaps/go-pmtiles/releases/download/v' + PMTILES_VERSION + '/" + $asset)');
    L.push('  if ($LASTEXITCODE -ne 0) { return $false }');
    L.push('  # No checksum is published for the Windows build; it comes over HTTPS from the official GitHub release.');
    L.push('  $exe = Join-Path $tools "pmtiles.exe"');
    L.push('  try { Add-Type -AssemblyName System.IO.Compression.FileSystem } catch { }');
    L.push('  $unz = Join-Path $tools "unzip"');
    L.push('  try {');
    L.push('    if (Test-Path -LiteralPath $unz) { Remove-Item -Recurse -Force -LiteralPath $unz }');
    L.push('    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $unz)');
    L.push('    Move-Item -Force -LiteralPath (Join-Path $unz "pmtiles.exe") -Destination $exe');
    L.push('    Remove-Item -Recurse -Force -LiteralPath $unz');
    L.push('  } catch { Write-Host "  could not unpack $zip"; return $false }');
    L.push('  if (Test-Path -LiteralPath $exe) { $script:Pmtiles = $exe; return $true }');
    L.push('  return $false');
    L.push('}');
    L.push('');
    L.push('function Get-Map([string]$Folder, [string]$Name, [string]$Area, [int]$Zoom) {');
    L.push('  $dir = Join-Path $Dest $Folder; New-Item -ItemType Directory -Force -Path $dir | Out-Null');
    L.push('  $out = Join-Path $dir $Name');
    L.push('  if (Test-Path -LiteralPath $out) { Write-Host "= $Folder/$Name (already here)"; $script:Skip++; return }');
    L.push('  if (-not (Get-Pmtiles)) { Fail "$Folder/$Name (could not get the pmtiles tool)"; return }');
    L.push('  $builds = (& curl.exe -fsSL --retry 3 -A $UA $Builds) -join ""');
    L.push('  [string[]]$keys = @([regex]::Matches($builds, "\\d{8}\\.pmtiles") | ForEach-Object { $_.Value })');
    L.push('  if ($keys.Count -eq 0) { Fail "$Folder/$Name (cannot reach the Protomaps build list)"; return }');
    L.push('  [Array]::Sort($keys, [StringComparer]::Ordinal)');
    L.push('  $build = $keys[$keys.Count - 1]');
    L.push('  Write-Host "> $Folder/$Name (from Protomaps build $build)"');
    L.push('  if ($Area.StartsWith("{")) { $geo = "$out.area.geojson"; Set-Content -LiteralPath $geo -Value $Area -Encoding ASCII; $areaArg = "--region=$geo" } else { $areaArg = "--bbox=$Area" }');
    L.push('  & $script:Pmtiles extract ("https://build.protomaps.com/" + $build) "$out.part" $areaArg "--maxzoom=$Zoom"');
    L.push('  if ($LASTEXITCODE -eq 0) { Move-Item -Force -LiteralPath "$out.part" -Destination $out; $script:Ok++ } else { Fail "$Folder/$Name (map extract)" }');
    L.push('}');
    L.push('');
    L.push('function Write-Index {');
    L.push('  $sb = New-Object System.Text.StringBuilder');
    L.push('  [void]$sb.AppendLine(\'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Waitbook library</title>\')');
    L.push('  [void]$sb.AppendLine(\'<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5}h2{border-bottom:2px solid;margin-top:2rem}li{margin:.3rem 0}</style></head><body>\')');
    L.push('  [void]$sb.AppendLine(\'<h1>Waitbook library</h1><p>Open .zim files with Kiwix, .pmtiles maps in the Waitbook map screen, videos with VLC. PDFs open in a browser.</p>\')');
    L.push('  # Only the folders this script makes (NN-name), whatever else the destination holds.');
    L.push('  Get-ChildItem -LiteralPath $Dest -Directory | Where-Object { $_.Name -cmatch "^\\d\\d-[a-z0-9-]+$" } | Sort-Object Name | ForEach-Object {');
    L.push('    $folder = $_.Name');
    L.push('    [void]$sb.AppendLine("<h2>$folder</h2><ul>")');
    L.push('    Get-ChildItem -LiteralPath $_.FullName -File | Where-Object { $_.Name -match "^[A-Za-z0-9._-]+$" -and $_.Name -notmatch "\\.(part|bad|geojson)$" } | ForEach-Object {');
    L.push('      [void]$sb.AppendLine(("<li><a href=""{0}/{1}"">{1}</a></li>" -f $folder, $_.Name))');
    L.push('    }');
    L.push('    [void]$sb.AppendLine("</ul>")');
    L.push('  }');
    L.push('  [void]$sb.AppendLine("</body></html>")');
    L.push('  Set-Content -LiteralPath (Join-Path $Dest "index.html") -Value $sb.ToString() -Encoding UTF8');
    L.push('}');
    L.push('');
    L.push('Write-Host "Waitbook: downloading into $Dest"');
    var folder = '';
    p.tasks.forEach(function (t) {
      if (t.folder !== folder) { folder = t.folder; L.push('', '# ' + folder); }
      var label = '# ' + comment(t.title + (t.label ? ' - ' + t.label : ''));
      if (t.kind === 'kiwix') {
        L.push(label);
        L.push('Get-Kiwix ' + [t.folder, t.stem, t.opdsName, t.search].map(q).join(' '));
      } else if (t.kind === 'url' || t.kind === 'hf') {
        L.push(label);
        L.push('Get-File ' + [t.folder, t.name, t.url, t.sha256 || ''].map(q).join(' '));
      } else if (t.kind === 'pmtiles') {
        L.push(label);
        var area = areaArg(t.boxes || [t.bbox]);
        L.push('Get-Map ' + [t.folder, t.name, area].map(q).join(' ') + ' ' + String(t.maxzoom | 0));
      } else if (t.kind === 'page') {
        L.push('# Open in a browser and download from the publisher: ' + comment(t.name) + ' - ' + t.url);
      }
    });
    L.push('');
    L.push('Write-Index');
    L.push('Write-Host ""');
    L.push('Write-Host ("Done: {0} downloaded, {1} already here, {2} failed." -f $script:Ok, $script:Skip, $script:Failed.Count)');
    L.push('if ($script:Failed.Count -gt 0) { Write-Host "Failed (run the script again to retry):"; $script:Failed | ForEach-Object { Write-Host "  $_" } }');
    L.push('Write-Host "Open $Dest\\index.html to browse what you have."');
    L.push('# When started by right-click > Run with PowerShell, keep the window open so the summary can be read.');
    L.push('if (-not [Console]::IsInputRedirected -and -not $env:WAITBOOK_NO_PAUSE) { Read-Host "Press Enter to close" | Out-Null }');
    L.push('if ($script:Failed.Count -gt 0) { exit 1 }');
    // A UTF-8 byte-order mark makes Windows PowerShell 5.1 read the file as UTF-8 instead of the legacy code page.
    return String.fromCharCode(0xfeff) + L.join('\r\n') + '\r\n';
  }

  function kitJson(kit) {
    return JSON.stringify({ app: 'waitbook', v: 1, exported: U.todayStamp(), kit: K.normalize(kit) }, null, 2) + '\n';
  }

  WB.exporters = { plan: plan, linksTxt: linksTxt, aria2: aria2, bash: bash, powershell: powershell, kitJson: kitJson, folderFor: folderFor, boxesFor: boxesFor, areaArg: areaArg, regionGeoJson: regionGeoJson, bboxFor: bboxFor, PMTILES_SUMS: PMTILES_SUMS, ZOOMS: ZOOMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = WB.exporters;
})(typeof self !== 'undefined' ? self : globalThis);
