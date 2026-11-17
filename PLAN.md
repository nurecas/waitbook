# Waitbook — plan

> A library that waits for you. Pick the world's best free offline knowledge — in your languages, sized to
> your device — and get a download plan that works on any phone or computer.

This document is the plan written before any code. The audit at the end of the build is in
[AUDIT.md](AUDIT.md).

## 1. What Lastbook is, and what we keep or change

Research was done on 2026-11-17 from Lastbook's public source (github.com/Immortal-Protocols/lastbook, MIT) and
public pages. lastbook.org itself is blocked by this build environment's network policy, so the site was read
through its repository (`website-next/`), search results and the code.

| | Lastbook | Waitbook |
|---|---|---|
| Form | Desktop app (Python + native web view). Mac (Apple Silicon), Windows 10/11, Ubuntu 24.04. iPad is source-only. | Installable web app (PWA). Any modern browser on iPhone, iPad, Android, Mac, Windows, Linux, ChromeOS. Also opens from a USB stick (`index.html`, no server). |
| Content | Hosts its own packs: Small 7.7 GB, Medium 66 GB, All 388 GB. | Hosts nothing. A curated **index of direct links** to the original publishers (Kiwix, Hesperian, WHO, IFRC, OpenStax, Hugging Face, Protomaps…). |
| Audience | United States: US state maps, FEMA/CDC/Red Cross sources, English only. | Global: UI in 10 languages incl. right-to-left Arabic; content filtered by the languages you choose; world maps. |
| Choice | Three fixed sizes plus add-ons. | Pick by category, language, priority and **storage budget**; or take a preset; or search the whole Kiwix library live. |
| Downloads | The app downloads and installs packs itself. | You download what you choose, your way: tap-through checklist on phones; resumable scripts (bash, PowerShell), aria2 lists, torrents and metalinks on computers. |
| Reading | Built-in reader for PDFs, ZIMs, videos, maps. | Hands each file to the best free reader on your platform (Kiwix, Organic Maps, VLC, KOReader…) and includes its own offline **map viewer** for PMTiles. |
| Guides | Curated topic guides with page-level citations into its own library. | **Field cards**: offline orientation for urgent situations — what to open, what to search for, when to get trained help. No doses or procedures written by us. |
| AI | Bundled 17 GB Gemma model with retrieval over the library. | Curated local-AI apps and models for every device class (phone to workstation); links only. |
| Privacy | No ports, no telemetry. | No accounts, no cookies, no analytics. Live lookups (Kiwix, Hugging Face, Protomaps) only when you open those screens; a strict-offline switch turns them off. |

What we keep from Lastbook's thinking: guides first; prefer authoritative sources (WHO, IFRC, MSF, Hesperian);
never invent medical steps; say plainly what's missing; privacy by default; set it up while you still have
internet and power.

## 2. Users and jobs

1. **A family preparing** for storms, outages or conflict: wants the essentials on a phone and a laptop, in
   their language, within the free space they have.
2. **A community organiser, teacher or clinic** building a shared library on a USB drive, SD card or a
   Raspberry Pi hotspot for many people.
3. **A traveller or field worker** heading somewhere with poor connectivity.
4. **Someone already offline** who needs to find the right page fast (field cards, map, what to open).

## 3. Product shape

### Screens (hash routes, so the app works from `file://` and any static host)

| Route | Screen | Purpose |
|---|---|---|
| `#/` | Home | What Waitbook is, kit status, online/offline state, shortcuts. Offline + kit → field cards first. |
| `#/pack` | Pack wizard | 1 languages (country suggests them) → 2 device and storage budget → 3 priorities → 4 review. Auto-fills a kit by priority until the budget is met. |
| `#/library`, `#/library/:cat` | Library | The curated catalog as a ledger, by shelf (category). Filters: language, priority, type, max size, text. |
| `#/item/:id` | Item | Description, variants (language × edition), size, licence, publisher, which app opens it on your device, every link (direct, torrent, metalink, checksum). |
| `#/kiwix` | Kiwix explorer | Live search of the whole Kiwix library (opds.library.kiwix.org): text, language, category; add any archive to the kit. |
| `#/kit` | My kit (manifest) | Everything chosen, totals, storage fit, mark files as downloaded, exports, print, share link. |
| `#/cards`, `#/cards/:id` | Field cards | Offline orientation for 12 urgent situations; your own emergency numbers; printable. |
| `#/map` | Map | Offline PMTiles viewer (open a file from the device), GPS position, coordinates; "make a map of my area" command builder. |
| `#/apps` | Apps | Readers and tools per platform (auto-detected, switchable), with store/download links; how to share a library offline. |
| `#/settings` | Settings | Language, theme (paper, dark, night red-light), text size, strict offline, local library server, reset. About, privacy, credits. |

### Catalog shelves

Health & first aid · Water & sanitation · Food & farming · Shelter & building · Energy & power · Repair & making ·
Disasters & survival · Radio & communication · Maps & travel · Encyclopedias & dictionaries · Learning ·
Books & culture · Computers & code · Offline AI · Apps & installers.

Every item has a **priority**: 1 essential, 2 useful, 3 deep. Presets: *Pocket* (fits 8 GB),
*Household* (64 GB), *Community* (512 GB), *Everything* (2 TB+).

### Download plan exports (device-aware)

| Export | For |
|---|---|
| Checklist (in app) | Phones and tablets: tap each link, tick it off. |
| `links.txt` | Any download manager. |
| `download.sh` | macOS, Linux, Android (Termux). curl with resume and retries, one folder per shelf, resolves the newest Kiwix file at run time, verifies Kiwix SHA-256. |
| `download.ps1` | Windows 10/11 (uses the built-in `curl.exe`), same behaviour. |
| `aria2.txt` | aria2c: parallel, resumable; Kiwix items go through `.meta4` (mirrors + checksums). |
| Torrent / magnet links | Per Kiwix item, for very large files. |
| `library.html` | An offline index page for the downloaded folder: open PDFs and videos directly, see which app opens the rest. |
| `kit.json` and share link | Re-import, or share a kit with others (link encodes the selection). |
| Print | A paper manifest and paper field cards. |

Generated scripts treat every URL and file name as untrusted: only `https://` URLs from an allow-list of hosts,
file names reduced to `[A-Za-z0-9._-]`, and strict quoting for each shell.

## 4. Architecture

- **No build step, no framework, no runtime CDN.** Plain HTML, CSS and classic (non-module) JavaScript so that
  `index.html` also runs from a USB stick via `file://`. Data ships as `.js` files for the same reason.
- **Core logic is pure and testable** (`js/core/*.js`): sizes, kit math, filters, auto-fill, OPDS parsing,
  script generation, share codec. The same files load in Node for unit tests.
- **State** in `localStorage` (kit, settings, ticks), wrapped in try/catch; the app works without it.
- **Service worker** (only on http/https) precaches the shell and data; map assets on first use; never caches
  large downloads; network-first for live APIs with a short timeout.
- **Live sources** (all CORS-enabled, keyless, verified in their own code or config):
  - Kiwix OPDS v2 `https://opds.library.kiwix.org/catalog/v2/entries` (`q`, `lang`, `category`, `name`,
    `count`, `start`); acquisition links are `.meta4`; the `.zim` is the same URL without `.meta4`.
    Kiwix keeps only the two newest dated files per book, so the catalog stores **book names** and resolves the
    current file live, with a last-known snapshot as fallback; scripts resolve again at run time.
  - Hugging Face model API for current GGUF file names and sizes.
  - Protomaps `https://build-metadata.protomaps.dev/builds.json` for the newest planet build (read by the download scripts only: it does not allow browser access from other sites).
- **Map viewer**: MapLibre GL JS + PMTiles + Protomaps basemap layers, vendored from npm; glyphs and sprites
  vendored; a custom palette matching the app; a low-resolution world outline is built in so the map is useful
  before any file is loaded.
- **Maintenance tooling** (Node, no dependencies): `tools/refresh-kiwix.mjs` rebuilds the Kiwix snapshot and
  checks every curated book name; `tools/check-links.mjs` checks every direct link. A GitHub Actions workflow
  runs both weekly and on demand, and another deploys to GitHub Pages.

## 5. Design direction — "field ledger"

Not a card grid with soft shadows. Waitbook is designed as a **supply ledger in a field notebook**:

- **Paper and ink.** Warm paper ground with a faint survey grid, near-black ink, hairline rules. Items are ledger
  rows with a tick box, a title, language stamps and a right-aligned size in monospace, totalled at the foot like
  an account.
- **Highlighter selection.** Choosing an item sweeps a marker-yellow highlight across its title — the kit is
  literally what you've marked.
- **Signal orange** for the few primary actions (the colour of life jackets and survival gear), deep
  **survey teal** for structure. Hard offset shadows (stamped, not floating), 2 px corners.
- **Index tabs** for shelves, numbered 01–15 in stencil numerals; the wordmark is a stencil, like a stamped
  supply crate.
- **Night (red-light) theme** alongside dark: everything in deep red on black, to keep night vision and save
  battery — a theme chosen for the situation, not decoration.
- **Type:** Sofia Sans (text), Sofia Sans Condensed (headings), Martian Mono (sizes, file names, coordinates),
  all OFL and self-hosted; non-Latin scripts fall back to good native fonts per script (`:lang()` stacks).
- **Accessible by default:** WCAG 2.2 AA contrast in every theme, visible focus, 44 px touch targets, text-size
  control, reduced-motion support, logical CSS properties for right-to-left.

## 6. Internationalisation

- UI strings in English, Español, Français, Português, العربية, हिन्दी, 中文 (简体), Kiswahili, Русский,
  Bahasa Indonesia. Language and country names come from the browser (`Intl.DisplayNames`), so they appear in
  the reader's own language without shipping name tables.
- Country → suggested languages from Unicode CLDR territory data (generated, small).
- Catalog descriptions and field-card text are English in this version; their structure is translation-ready.

## 7. Safety and honesty rules for content

- Link only to the original publisher or the official mirror; record licence and publisher for every item.
- Field cards never give doses, quantities or step-by-step procedures; they say what to open, what to search
  for, and when to get trained help, and they name their sources.
- Sizes are labelled as approximate until resolved live; anything we could not verify is marked.
- "Not medical advice. Learn first aid in person."

## 8. Build order

1. Design tokens, layout shell, router, i18n plumbing, settings, themes.
2. Core logic + unit tests (sizes, kit, filters, auto-fill, OPDS, exports, share codec).
3. Catalog data (curated, verified) and country/language data.
4. Library, item, kit, pack wizard, exports.
5. Kiwix explorer (live OPDS), Hugging Face resolution.
6. Field cards, apps guide, map viewer and extract builder.
7. Service worker, manifest, icons; translations.
8. Tooling, workflows, README.

## 9. Audit plan

- **Security:** CSP, no `innerHTML` with remote data, script-generation injection tests, URL allow-list,
  share-link decoding limits, no third-party requests except the three live sources.
- **Privacy:** confirm no requests on load; strict-offline mode blocks all network calls.
- **Accessibility:** axe-core on every screen and theme, keyboard-only walkthrough, focus management on route
  change, RTL check in Arabic.
- **Cross-device:** Playwright with iPhone, iPad, Android phone and tablet profiles and desktop widths; no
  horizontal scroll; offline reload through the service worker; `file://` launch.
- **Data:** every curated Kiwix name and direct link checked (from CI where this environment's network can't
  reach), sizes sanity-checked, licences present.
- **Performance:** first load weight, map assets lazy, long lists responsive.
