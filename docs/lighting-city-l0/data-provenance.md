# Phase L0 — data provenance, coordinates and estimates

**What this data is:** a citywide classification of OSM highway ways into lit / partly lit / dark with
a reason each, plus *preliminary, estimated* lamp positions. Only `lit=yes/no` tags and
`highway=street_lamp` nodes are mapped source data. Everything lit "by rule" or "by gap fill", every
lamp position, type and spacing, and the district names are **estimates**. No municipal asset ID,
photometry, pole height or switching schedule was used or invented.

## Sources

| Source | Version / date | Licence | Accuracy | Used for |
|---|---|---|---|---|
| OpenStreetMap via Overpass (`way[highway]`, signals, crossings, level crossings, street lamps, suburb/neighbourhood names) | OSM base **2026-10-24T19:51:21Z**, retrieved 2026-10-24T19:52:03Z, 11 513 315 B, SHA-256 `e2858621…ce0b` | ODbL-1.0 © OpenStreetMap contributors | mapped geometry (metre-level in town); tag completeness varies: only 14 % of length has `lit` | ways, tags, `lit` evidence, junction marks, district names |
| SCB Statistiska tätorter 2023 (`stat:Tatorter_2023`, WFS, EPSG:3006) | valid from 2023-12-31; retrieved 2026-10-24T19:51:48Z; SHA-256 `37fd1ada…b44e`; 11 tätorter intersect the map (Norrköping 98 229 inh., Åby, Svärtinge, Lindö …) | CC0-1.0 (SCB open geodata, https://www.scb.se/omscbse); "Källa: SCB", processed | statistical delineation of built-up areas, not a lighting boundary | inside/outside tätort |
| NASA Black Marble 2016 (GIBS WMS layer `VIIRS_Black_Marble`) | 2016 annual composite; retrieved 2026-10-24T19:51:48Z; 56 × 23 px PNG, SHA-256 `e2e9f863…ee70` | NASA: no use restriction; acknowledgement | 15″ cells (≈ 241 m E-W × 463 m N-S here); visualised 8-bit, saturates in the core; predates later LED retrofits | plausibility check only |
| Rendered map `src/lib/data/norrkoping-map.json` (`wood` areas) | OSM base 2026-10-16T13:35:36Z (unchanged) | ODbL-1.0 | as mapped | "path in forest" test |
| Existing fixtures `streetlights*.json` (pilot, A1–A3) and zones (`corridorA1/2/3.ts`, pilot bounds) | unchanged, read-only (hashes in the provenance JSON) | ODbL / project estimates | as documented in their phases | no new station inside; slot and capacity checks |
| Fixture-type table (Step 6 pilot) | unchanged | project assumption | — | station spacing and range |
| Norrköping *Riktlinje för belysning* 2023-06-07, §2.4.1 (pp. 25–26) and §2.5 | read 2026-10-24 | municipal document, used as text facts only | design guidance, not proof that every installation exists | the rule |

Raw downloads stay in ignored `work/lighting-city-l0/raw/` (untrusted data, parsed only as JSON/PNG).
The committed extract `scripts/data/lighting-city-source.json` (3 275 469 B, SHA-256
`17c822fd…7558`) is an adapted ODbL database (with SCB CC0 polygons and NASA pixel values) and is
reproduced by `extract-source.mjs`, which refuses any raw file whose hash differs from
`scripts/lighting-city/sources.json`.

## Coordinates

- Horizontal: **EPSG:3006 (SWEREF 99 TM)**, metres, everywhere in the extract and outputs (0.1 m).
  OSM WGS84 lat/lon → SWEREF 99 TM with `src/lib/geo/sweref99tm.js` (GRS80 Gauss–Krüger); WGS84 is
  treated as SWEREF 99 geographic, as by the map importer (sub-metre difference, no epoch correction).
  SCB polygons were requested in EPSG:3006 (no reprojection). Satellite pixel corners are projected
  from their lat/lon grid with the same function.
- Scene frame (only to read existing fixtures and for the capacity check):
  `x = (E − 569030) / (25 × 0.9996584126)`, `z = (6494989 − N) / (25 × 0.9996584126)`; x east, z south;
  1 unit = 25 grid metres (`SCENE_REFERENCE`).
- Vertical: none (2D classification).
- Map clip: the quadrilateral of `docs/step62/coverage-audit.md` (NW 561804.869/6501570.951 …);
  statistics and stations count only what lies inside it; whole ways crossing it are still classified.

## Outputs

| File | Content |
|---|---|
| [data/city-lighting-l0.json](data/city-lighting-l0.json) (1.3 MB) | per way: status, reason, evidence, covered, inTatort, length, length inside the map, lit ranges; per station: E, N, type, way, evidence |
| [data/stats.json](data/stats.json) | totals by status/reason/group/evidence, stations, Norrtull, uncovered slots inside zones, districts |
| [data/capacity.json](data/capacity.json) | light-index statistics, histogram, overflow cells |
| [data/satellite-check.json](data/satellite-check.json) | correlation and largest disagreements |
| [data/lighting-city-l0-provenance.json](data/lighting-city-l0-provenance.json) | sources, input and output SHA-256, rule version, tool versions |
| [lighting-map.html](lighting-map.html) (2.5 MB) | the self-contained review map (no external requests) |

None of these is bundled into the app.

## Estimates and how they are labelled

| Item | Label | Basis |
|---|---|---|
| Ways lit by rule | `evidence: rule`, reason `rule-*` | municipal guideline as a rule |
| Ways lit by gap fill | `evidence: gap`, reason `gap-fill` | both neighbours on the same street are `lit=yes` |
| Lamp stations | preliminary; centreline; type and spacing from the pilot table | for counting/capacity only |
| Districts | "nearest OSM place name" | not official boundaries |
| Junction ±50 m | rule | guideline: roundabouts, crossings, signal junctions always lit; 50 m is this project's assumption |
| 12 m / 70 % "beside a street" test | rule parameter | assumption |
