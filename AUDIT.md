# Waitbook — audit

Audit of the first complete build, 17 November 2026. Everything below was run, not assumed. Where something could
not be checked in the development environment it says so, and says where it is checked instead.

**How it was audited**

- **Automated tests:** unit tests, the generated download scripts run for real on Linux, macOS and Windows, every
  screen in Chromium, WebKit and Firefox at desktop, phone and tablet sizes and in a right-to-left language, an
  axe-core accessibility audit, and offline behaviour (service worker, `file://`, strict offline).
- **Live data in CI:** every link, every curated Kiwix book name against the live catalog, and whether each live API
  allows browser access (CORS).
- **Independent code review:** by a separate reviewer who was given the code but not the author's conclusions.
- **Per-language translation review:** for completeness, placeholders, plural rules and terminology.
- **Visual checks:** screenshots in English and Arabic at phone and desktop sizes.

## Results

| Area | Result |
|---|---|
| Unit tests | 51 pass: catalog integrity, kit packing, exporters and script quoting, share links (including the fallback decoder checked against zlib), live-source parsing, region areas, translations, search hints in every language, page hygiene (strict CSP, no HTML sinks, network only through one module). |
| Download scripts, end to end | **bash** on Ubuntu and macOS, and **Windows PowerShell 5.1 and PowerShell 7** on Windows, run against a local imitation of the Kiwix catalog, the Kiwix download host and publishers. The run covers:<br>• resuming an interrupted file;<br>• restarting when a server cannot resume;<br>• rejecting a stale partial file on HTTP 416;<br>• choosing the newest Kiwix file (`2026-09b` after `2026-09`) under a locale that ignores punctuation;<br>• finding a renamed book by search;<br>• SHA-256 checks, with a mismatch kept as `.bad`;<br>• keeping a complete older version until `WAITBOOK_UPDATE=1`;<br>• removing superseded partial files;<br>• failure reporting and exit status;<br>• re-runs;<br>• an index that lists only finished files in the script's own folders;<br>• the default destination next to the script. |
| Screens | 25 routes with no console errors, no untranslated keys and no horizontal scrolling:<br>• in CI, Chromium, WebKit and Firefox × desktop, iPhone 15, iPad (gen 7) and Arabic;<br>• locally, all ten interface languages at 320 px (iPhone SE). |
| Accessibility | axe-core, WCAG 2.0/2.1/2.2 A and AA: **0 violations** on 17 screens × paper, dark and night themes (English) and paper (Arabic, right-to-left). |
| Offline | After one online visit, every screen works with the network off:<br>• the map viewer works without having been opened online (fetched in the background);<br>• the language can be switched offline;<br>• a 404 page never replaces the stored app;<br>• an app update keeps what was stored;<br>• `index.html` opened from disk works;<br>• strict offline makes no request outside the app. |
| Live data (CI) | **Links:** about 140 links in each of three runs. None are broken now: the Kiwix Hotspot page had moved and was fixed, and one WHO IRIS page timed out once and loaded in the other runs. 4 sites refuse automated requests and are listed for a manual check: IFRC ×2, Sphere and OHCHR.<br>**Kiwix:** after the refresh on 17 November 2026, all 1,961 curated files resolve against the live catalog of 3,680 books, and the bundled snapshot is current.<br>**Browser access:** the Kiwix catalog and Hugging Face allow it; the Protomaps build list does not, so only the scripts read it. |
| Size | First visit: about 296 KB gzipped (39 files). The service worker then stores the shell and all ten languages (411 KB gzipped, mostly files already loaded, revalidated rather than downloaded again). Afterwards it stores the map viewer, map glyphs and the Kiwix snapshot in the background (932 KB gzipped; skipped when the browser asks to save data). |

## Findings and what was done

Severity: **H** high, **M** medium, **L** low. Every fix has a test unless the row says otherwise.

### Found by testing

| # | Finding | Sev. | Fix |
|---|---|---|---|
| T1 | When Windows PowerShell 5.1 starts from PowerShell 7 (as in CI, or from Windows Terminal), it cannot load `Get-FileHash` (inherited module path), so every checksum "failed". `Expand-Archive` has the same problem. | H | Hash and unzip with .NET directly. Tested with 5.1 started from 7, and with 7. |
| T2 | The script's default destination was relative to wherever PowerShell was started, and .NET calls resolve paths differently from PowerShell. | M | The default is a `Waitbook` folder next to the script; the destination is made absolute. |
| T3 | On a resume request answered with HTTP 416, curl reports **success**, so a stale or over-long partial file was accepted as finished. | H | A partial file is kept after a 416 only if its checksum or exact size matches; otherwise the download restarts. |
| T4 | The Protomaps build list sends no CORS header (confirmed by a CI probe), so the app's "newest map build" lookup could never work in a browser and logged an error. | M | Removed from the app and from its CSP; the scripts still read the list. |
| T5 | Phones: the "default choice" caption and long Kiwix book names overflowed the screen by 3–24 px (worse in some languages). | M | Those columns wrap; every language is checked at 320 px. |
| T6 | Arabic: the map's zoom buttons were partly covered by the app's own map tools (MapLibre places controls by physical corner). | M | The map controls are mirrored in right-to-left languages. |
| T7 | In WebKit, Playwright cannot intercept requests from a page a service worker controls, so the tests reached the real servers. | — | The smoke and accessibility tests block service workers; the offline test covers the worker. |
| T8 | Kiwix renamed `www.ready.gov_*` to `ready.gov_*_all` and withdrew WikEM. One book (`gardenology.org_en_all`) is listed under a name that differs from its file name, so lookups by name missed it. | M | Catalog updated. The refresh now records each book's catalog name and marks withdrawn books (they drop out of lists, quick kits and field cards). Lookups fall back to a search. The weekly job reports what disappeared, with suggested replacements, instead of refusing to refresh. |
| T9 | Kiwix Hotspot's page moved (404). | L | Link updated. |
| T10 | The library search only matched the English catalog, so the translated example searches found nothing (noticed by the translators). | M | Search also matches shelf names, shelf descriptions and type labels in the reader's language. The examples were changed to words that do match, and a test checks every example in every language. |
| T11 | macOS: bash bracket ranges follow the locale's collation, so the index's folder filter let `99-Notes` through (found by the end-to-end test on the macOS runner). | L | The bash script runs with `LC_ALL=C`. |

### Found by the independent review

| # | Finding | Sev. | Fix |
|---|---|---|---|
| R1 | The service worker stored **any** page opened in its scope as the offline app (a 404 could become the app). | H | Only a successful HTML answer for the app's own page is stored. |
| R2 | Each deploy deleted the files stored on first use (map viewer, glyphs, other languages), so the map and non-English text broke offline after an update. | H | Every language is precached, and files stored on first use live in a cache that survives updates. The map viewer and snapshot are fetched in the background. *Settings → Ready for offline use* shows the state. |
| R3 | bash `sort` under a UTF-8 locale ignores punctuation, so `2026-09` sorted after `2026-09b` and the older file was chosen. | M | `LC_ALL=C sort` in bash; ordinal sort in PowerShell. |
| R4 | A server that cannot resume (curl exit 33) failed forever; a stale partial file was accepted on 416. | M | A fresh download on exit 33; see T3 for 416. |
| R5 | Hugging Face checksums were checked against a `main` link that the publisher can replace. | M | The lookup reads the current revision first, then the files at that revision, and the link is pinned to it. Without a recent lookup there is no checksum. |
| R6 | Map areas left out populated parts of countries (Alaska, Hawaii, the Canaries, the Azores, the Galápagos, Tarawa); Fiji and Russia were cut at 180°; the Oceania box missed most Pacific islands. | M | Every land cluster of a country is kept (16 countries gained parts), clusters may cross 180°, and the scripts cut a multi-part GeoJSON region. Oceania is five boxes from Palau to French Polynesia. |
| R7 | Kiwix explorer: a slow answer to an older search was appended to a newer one. | L | Answers to older searches are ignored. |
| R8 | The weekly data refresh pushed with `GITHUB_TOKEN`, which does not start the Pages deploy, so the live site never got fresh data. | M | The refresh dispatches the deploy (allowed for `GITHUB_TOKEN`). |
| R9 | English text (field cards, catalog descriptions) was laid out right-to-left in the Arabic interface. | L | English blocks carry `lang="en"` and their own direction. |
| R10 | Share links failed on browsers without `CompressionStream('deflate-raw')` (iOS before 16.4, Chrome 80–102), and the share button failed silently. | L | Real support is detected; otherwise links are made uncompressed, and compressed links are opened with a small built-in decoder (RFC 1951, tested against zlib, with a size cap). Failures are reported. |
| R11 | The map's "this view" box could exceed ±180° and did not follow the map. | L | Normalised, and updated as the map moves. |
| R12 | Continent map sizes were unknown (counted as 0 toward the budget). | L | One set of continent areas is used for sizes and scripts. |
| R13 | A raster `.pmtiles` file's own attribution HTML was rendered (links and classes allowed). | L | MapLibre's attribution is empty for files; the file's credit is shown as plain text. |
| R14 | A shared kit with an extra named `constructor` broke size checks. | L | Lookup maps without prototypes; absurd sizes are dropped. |
| R15 | Unhandled promise rejections when copying or sharing failed. | L | Copy and share failures show a message. |
| R16 | Re-running after a monthly Kiwix release downloaded every book again next to the old one; unescaped folder names in the index; `NEED=1e+300` with a crafted kit. | L | The older complete version is kept until `WAITBOOK_UPDATE=1`, and superseded partial files are removed. The index lists only the script's own folders. The size figure is clamped. |

The reviewer found **no** way to inject commands through the scripts. Every value is validated against a strict
pattern and quoted, and comments cannot be broken out of. The reviewer also found no problems in:
- DOM building (no HTML parsing; links are allow-listed);
- the OPDS parser (Kiwix hosts only, no `..` segments);
- the share decoder (size limits, `__proto__` dropped);
- the kit-packing budget logic.

## What was not verified here

- **Real devices.** iPhone, iPad and Android were emulated in WebKit and Chromium with device profiles, and Safari's
  engine was tested through Playwright's WebKit. No physical device was used. On iOS, a site that is *not* added to
  the Home Screen can have its storage cleared after about seven days without a visit; the README tells people to
  install it.
- **Full-size downloads.** The scripts were tested against local imitations of the real servers, not by downloading
  real multi-gigabyte archives. The real endpoints were checked for reachability and CORS in CI.
- **PowerShell** runs only on the Windows CI runners (none was available in the development environment).
- **The pmtiles tool** was verified by checksum against its official release but not executed in the development
  environment.
- **Translations** are complete and machine-checked: every key, placeholder and plural category, and every search
  hint finds something. They were written carefully with platform terminology, but **a native-speaker review is
  recommended**, especially for Arabic, Hindi and Swahili.
- **Field cards are English on purpose.** Emergency guidance should not be machine-translated; the interface around
  them is translated.
- **kiwix-serve search links** on field cards assume kiwix-serve's usual book names; they were not tested against a
  running kiwix-serve.
- **Map sizes** are estimates (the real size depends on how built-up an area is); the scripts report the real size
  as they download.
- **Pinned model revisions:** a Hugging Face link pinned to a revision stops working if the publisher rewrites
  history. The script then reports a failure, and checking sizes again in the app pins the new revision.

## Re-running the audit

```bash
npm install                                   # Playwright and axe-core, for the browser tests
npm test                                      # unit tests + download scripts end to end
npm run serve &                               # http://127.0.0.1:8765
node tests/e2e/smoke.mjs --device "iPhone 15" --lang ar
node tests/e2e/a11y.mjs
node tests/e2e/offline.mjs
node tools/check-i18n.mjs
node tools/check-links.mjs --out link-report.md   # needs internet
```

CI runs all of these on every push (`.github/workflows/ci.yml`). The weekly refresh (`refresh.yml`) re-checks the
live data.
