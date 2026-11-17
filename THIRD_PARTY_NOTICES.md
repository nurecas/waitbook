# Third-party notices

Waitbook bundles the following files in `vendor/` and `data/`. Each keeps its own licence; licence texts are
next to the files where the package ships one.

## Code

| Component | Version | Licence | Files |
|---|---|---|---|
| MapLibre GL JS | 5.24.1 | BSD-3-Clause | `vendor/maplibre/maplibre-gl.js`, `maplibre-gl.css`, `LICENSE.txt` |
| Mapbox GL RTL Text plugin | 0.3.0 | BSD-2-Clause | `vendor/maplibre/mapbox-gl-rtl-text.js`, `RTL-LICENSE.md` |
| PMTiles (JavaScript) | 4.5.0 | BSD-3-Clause | `vendor/pmtiles/pmtiles.js`, `LICENSE` |
| Protomaps basemaps (layers) | 5.7.2 | BSD-3-Clause | `vendor/basemaps/basemaps.js`, `LICENSE` |
| Protomaps sprites | basemaps-assets @ 028c18f | see `vendor/basemaps/LICENSE` | `vendor/sprites/` |

## Fonts (SIL Open Font License 1.1)

| Font | Designer | Files |
|---|---|---|
| Sofia Sans, Sofia Sans Condensed | Lettersoup (Botio Nikoltchev, Ani Petrova) | `vendor/fonts/sofia-sans-*.woff2`, `OFL-sofia-sans*.txt` |
| Martian Mono | Evil Martians | `vendor/fonts/martian-mono-*.woff2`, `OFL-martian-mono.txt` |
| Big Shoulders Stencil Display | Patric King (XO Type) | `vendor/fonts/stencil-800.woff2`, `OFL-big-shoulders.txt` |
| Noto Sans map glyphs | Google / Protomaps build | `vendor/glyphs/`, `OFL.txt` |

## Data

| Data | Source | Licence | Files |
|---|---|---|---|
| Country languages, ISO 639 aliases, continent groups | Unicode CLDR 49 (cldr-core) | Unicode License v3 | `data/countries.js` |
| Country boundaries and boxes | Natural Earth 5.1.2 (1:50m, 1:110m) | Public domain | `data/countries.js`, `data/world.js` |
| Kiwix catalog facts and snapshot | Kiwix OPDS catalog (opds.library.kiwix.org); initial snapshot from openzim/content-classification-system @ 14e8e27, 2026-09-29 | Catalog metadata; each archive under its own licence | `data/kiwix-known.js`, `data/kiwix-snapshot.js` |
| Test fixture | Excerpt of the same Kiwix catalog | as above | `tests/fixtures/opds-sample.xml` |

## Inspiration

Lastbook (MIT), github.com/Immortal-Protocols/lastbook — Waitbook shares no code with it; its approach to curation,
safety wording for guides and privacy informed this project.
