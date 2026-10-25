# Phase L2a — data provenance, licence, identity and placement policy

**What this data is:** simulated street lighting for every car road in the supported map that Phase
L0 classified as lit. **All 14 350 fixtures are estimates**: pole positions, spacing, side, type,
height, colour temperature and light output are this project's assumptions (the A1–A3 policy). No
municipal asset ID, photometric measurement, pole height or switching schedule was used or invented.
The one mapped OSM lamp nearest to a car road was rejected by the generator (its position conflicts
with the rendered map); the 24 lamps nearest to paths belong to Phase L2b.

## Sources

| Source | Version | Licence | Used for |
|---|---|---|---|
| L0 OSM snapshot `work/lighting-city-l0/raw/osm-city.json` (ignored scratch) | OSM base **2026-10-24T19:51:21Z**, SHA-256 `e2858621…ce0b` (pinned in `scripts/lighting-city/sources.json`; re-verified by the extractor) | ODbL-1.0 © OpenStreetMap contributors | way geometry, tags, versions, timestamps |
| Committed extract [`scripts/data/lighting-l2-source.json`](../../scripts/data/lighting-l2-source.json) (1.49 MB, SHA-256 `3fc5e23b…8894`) | the snapshot above, filtered by [`extract-source.mjs`](../../scripts/lighting-l2/extract-source.mjs): 3 356 car-road ways classified wholly lit by L0, their same-name one-way partners (3 402 ways), 1 lamp node | ODbL-1.0 (adapted database extract) | the generator's OSM input |
| L0 classification [`docs/lighting-city-l0/data/city-lighting-l0.json`](../lighting-city-l0/data/city-lighting-l0.json) (rule `lighting-city-v1`, approved 2026-10-24) | committed L0 output, hash in the provenance file | derived from ODbL + SCB CC0 | lit evidence per way: OSM tag, gap fill or municipal guideline rule |
| Rendered map `src/lib/data/norrkoping-map.json`, `city-bridges.json`, `city-places.json`, terrain | OSM base 2026-10-16 (unchanged) | ODbL-1.0; DTM CC BY 4.0 © Lantmäteriet | road widths, buildings, water, tram/rail, platforms, bridge decks, ground heights |
| Step 6 fixture-type table (`streetlights.json` `meta.types`) | unchanged | project assumption | height, CCT, candela, range, spacing |
| Earlier rollouts (pilot, A1, A2, A3) | unchanged, read-only | as above | identity and spacing of the 273 existing fixtures |

Ways that exist in the 2026-10-24 snapshot but not in the 2026-10-16 rendered map get no fixture
(their alignment cannot be checked); they are listed in the provenance file `ways`.

## Coordinates

Fixture positions are scene units (`x = (E − 569030) / (25 × 0.9996584126)`,
`z = (6494989 − N) / (25 × 0.9996584126)`, x east, z south; `SCENE_REFERENCE`), derived from OSM
WGS84 geometry with `src/lib/geo/sweref99tm.js` (WGS84 treated as SWEREF 99 geographic). The registry
stores E/N EPSG:3006 recomputed from the scene values (validated). Heights: the rendered ground
(RH2000-based DTM) or the bridge-deck profile; no vertical data is stored. Zone `L2` = the map clip
quadrilateral (EPSG:3006, `corridorL2.ts`).

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-l2.json`](../../src/lib/data/streetlights-l2.json) | **separate asset**, fetched after start (1.08 MB, 328 KB gzip) | compact format `lighting-compact-v1` (`compactSet.ts`): typed columns, base64 |
| [`data/streetlights-l2-provenance.json`](data/streetlights-l2-provenance.json) | no (4.3 MB) | per fixture: rule, evidence, station, chainage, spacing, side, shift, offset, map deviation, uncertainty; per way: version, timestamp, tags; rejected candidates with reasons; way coverage; policy; input hashes |

Both are reproduced byte for byte by `src/lib/lighting/corridorL2.test.ts` (main suite) and
`scripts/lighting-l2/write.test.ts` (`WRITE=1` rewrites them).

## Policy `lighting-l2a-v1`

The A3 policy values unchanged (kerb setback 0.8 m, deck 0.3 m, shifts ±1.5/3/4 m, deeper setbacks to
+2 m, clearances: building 0.6 m, carriageway 0.4 m, tram 2.2 m, rail 3.0 m; dual carriageways on the
outer kerb, roundabouts on the outer ring, roads ≥ 9 m staggered; spacing 30 m for trunk–tertiary, 27 m
for residential/unclassified/service/pedestrian). Seam rules: earlier estimates count as accepted for
spacing; a station slot already rendered by A1–A3 is that fixture (identity), never a second record.
Lit evidence: L0 status "lit" (tag, gap fill or rule) instead of only `lit=yes`; `lit=no` always
excludes. IDs: `estimate:lighting-l2a-v1:way/<osm way>:s<station>`.

ODbL obligations apply to the extract, the runtime file and the provenance file: attribution is shown
in the app footer and recorded in `DATA-LICENSE.md`; the adapted database is in the repository.
