# Phase L2d — data provenance, licence and placement policy

**What this data is:** simulated lighting on private land — open-air parking lots, the rail yard at
Norrköping C and the private service roads of industrial, port, retail and commercial land — as a
**category of its own** ("site lighting"), separate from street lighting. **All 3 503 fixtures are
estimates.** OSM says almost nothing about whether such sites are lit (0 of 609 parking outlines carry
`lit=*`; no mapped floodlight or lighting mast exists in the snapshot), so the decision that a site is
lit, every position, spacing, type, mounting height, colour and light output is this project's
assumption. No municipal or company asset ID, photometry or switching schedule was used or invented.

## Sources

| Source | Version | Licence | Accuracy | Used for |
|---|---|---|---|---|
| OpenStreetMap via Overpass (`amenity=parking`, `landuse=railway/industrial/port/retail/commercial`, `railway` + `service=yard/siding/spur`, `highway=service`, station nodes; masts and `light_source` counted) | OSM base **2026-10-26T12:52:45Z**, retrieved 2026-10-26T12:53:55Z, 3 677 892 B, SHA-256 `2e4765e4…4c21` (pinned in [`scripts/lighting-l2d/sources.json`](../../scripts/lighting-l2d/sources.json)) | ODbL-1.0 © OpenStreetMap contributors | mapped geometry, typically metre-level in town; parking outlines often traced from aerial imagery; site tags (lit, surface) sparse | lots, yard tracks, site land, service roads |
| Committed extract [`scripts/data/lighting-l2d-source.json`](../../scripts/data/lighting-l2d-source.json) (1 735 954 B, SHA-256 `508b80d6…25e4`) | `node scripts/lighting-l2d/extract-source.mjs` (refuses a raw file with another hash); 4 349 ways, 4 relations (rings joined), 29 nodes | ODbL-1.0 (adapted extract) | as above | generator input |
| L0 classification `docs/lighting-city-l0/data/city-lighting-l0.json` | rule `lighting-city-v1` (approved), OSM base 2026-10-24 | ODbL + SCB CC0 derived | — | which service roads are already street lighting (lit / partly lit = not this category) |
| Rendered map `src/lib/data/norrkoping-map.json`, bridges, places (platforms) | OSM base 2026-10-16 (unchanged) | ODbL-1.0 | as mapped | conflicts (buildings, carriageways, rails, trams, platforms, water, bridge decks), road widths, occlusion |
| Every earlier rendered fixture (pilot, A1–A3, L2a, L2bc) | committed runtime files, unchanged | ODbL derived | estimates (their phases) | identity, spacing, "lit by the street" |
| Fixture-type table (Step 6) + two new L2d types | Step 6 unchanged; L2d types in [`siteLighting.ts`](../../src/lib/lighting/siteLighting.ts) | project assumption | **estimate** | photometry |
| NASA Black Marble 2016 pixel values (in the L0 extract `scripts/data/lighting-city-source.json`) | 2016 annual composite | NASA, no use restriction | 15″ ≈ 241 × 463 m, 8-bit, saturated in the core | plausibility check only |

Raw downloads stay in ignored `work/lighting-city-l2d/raw/` (untrusted data, parsed only as JSON).
The extract and every output rebuild byte-identically (hashes below).

## Coordinates

- Horizontal: **EPSG:3006 (SWEREF 99 TM)**, metres, in every rejection record (`en`, 0.01 m) and in the
  zone ring. OSM WGS84 lat/lon → scene with `src/lib/geo/sweref99tm.js` (GRS80 Gauss–Krüger, WGS84
  treated as SWEREF 99 geographic, sub-metre difference), exactly as A1–L2bc.
- Scene frame: `x = (E − 569030) / (25 × 0.9996584126)`, `z = (6494989 − N) / (25 × 0.9996584126)`;
  x east, z south, 1 unit = 25 grid metres (`SCENE_REFERENCE`). Runtime positions are scene units
  × 1e4 (format `lighting-compact-v1`); distances in the rule are metres (scene units × 25, without
  the 0.99966 grid factor: ≤ 0.03 % ≈ 1 cm over 32 m).
- Vertical: fixtures stand on the rendered ground (`terrain.groundHeight`, DTM RH2000 surface as in
  L2a); mounting heights are metres above it. No bridge-deck fixtures in L2d.
- Zone: the supported map clip (same quadrilateral as L2a/L2bc, `docs/step62/coverage-audit.md`).

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-l2d.json`](../../src/lib/data/streetlights-l2d.json) | separate asset (265 KB, fetched with L2a/L2bc before map-ready) | `lighting-compact-v1`, generator `lighting-l2d-v1`, `category: site` |
| [`data/streetlights-l2d-provenance.json`](data/streetlights-l2d-provenance.json) | no (1.5 MB) | per fixture rule / site / station; per source element version, timestamp and tags; a decision with reason for **every** lot, yard track and service road considered (4 240); rejected candidates with EPSG:3006 position; policy; type table with `status: estimate`; input hashes |
| [`data/stats.json`](data/stats.json) | no | counts, decisions by kind, the 20 sites with most fixtures, satellite comparison |

Reproduced byte for byte by [`src/lib/lighting/siteLighting.test.ts`](../../src/lib/lighting/siteLighting.test.ts)
(main suite) and [`scripts/lighting-l2d/write.test.ts`](../../scripts/lighting-l2d/write.test.ts) (writes with `WRITE=1`).

## Policy `lighting-l2d-v1` (values in `L2D_POLICY`)

1. **Parking lots.** An `amenity=parking` outline (closed way) in the map that is open-air (not
   `parking=underground/multi-storey/rooftop/carports/garage_boxes`, not a building, not covered),
   not street-side parking (`street_side/lane/…`: lit by the street) and **≥ 500 m²**:
   - **perimeter** poles: way-local stations along the outline (N = round(perimeter / 32 m)),
     1.5 m inside it (deeper steps 0.5–2 m and shifts ±1.5–4 m along the outline on a conflict), arm
     pointing into the lot;
   - **interior grid**: a 32 m lattice aligned with the lot's longest edge and centred in its extent;
     only points ≥ 0.6 × 32 m = 19.2 m from the outline (so they do not double the perimeter row);
     shifts up to 6 m on a conflict.
   Parking aisles inside a lit lot are lit by the lot.
2. **Rail yard.** `railway=rail` tracks with `service=yard|siding` lying (≥ 50 % of their length) on
   `landuse=railway` land and drawn in the rendered map (≤ 1 m deviation): yard masts beside the track
   every ≈ 60 m (way-local), 3.5 m from the centreline (rail clearance 3.0 m + 0.5 m), further out in
   steps up to +10 m and shifted up to ±15 m along the track until clear of every track, road,
   building and platform; the mast must stand on railway land; right side first, then left. In the
   snapshot all yard tracks with masts lie in one polygon, the Norrköping C yard (way 94253955).
3. **Site roads.** `highway=service` ways that L0 left dark, of kind untagged / `parking_aisle` /
   `drive-through`, lying (≥ 50 %) on industrial, port, retail, commercial or railway land, not inside
   a lit lot, not a bridge or tunnel, drawn in the rendered map: site poles on one side every ≈ 32 m
   (way-local), 0.8 m behind the carriageway edge (A1–A3 kerb rule, same shifts and setbacks), the
   other side if the first is blocked.
4. **Stays dark** (as in L0): driveways and emergency access, untagged service roads outside site land
   (residential courtyards, private access), parking aisles outside mapped lots and site land,
   industrial spurs, disused/abandoned tracks, tram yards, lots < 500 m², parking mapped only as a
   point, and anything tagged `lit=no`.
5. **Positions** never stand in or < 0.6 m from a building, < half width + 0.4 m from a carriageway,
   < 2.2 m from a tram or < 3.0 m from a rail centreline, on a platform, in water or under a bridge
   deck (same tests and values as A1–A3).
6. **Seams.** No earlier fixture is moved, merged or re-created. A candidate within **12 m** of an
   earlier fixture (street, path, square) is "lit by the street" and dropped; any accepted fixture
   within 3 m suppresses a candidate; same-type L2d estimates keep 0.55 × spacing apart (17.6 m / 33 m);
   another L2d type within the candidate type's suppression radius suppresses it. Acceptance order:
   yard masts, lot perimeter, lot grid, site roads, then canonical ID.
7. **Occlusion** as A1–A3: 16 horizontal sectors from the emitter to the first building wall or
   elevated deck edge within range.
8. **Activation:** `solar-night` like every street fixture (on from dusk to dawn). Real sites may
   switch off or dim after hours; no schedule is known (see remaining gaps).

IDs: `estimate:lighting-l2d-v1:way/<lot | track | road way>:s<n>`; lot grid points are
`s(1000 + lattice index)`. Registry: dataset `osm-lighting-l2d-snapshot`, generator
`src/lib/lighting/siteGenerator.ts` `lighting-l2d-v1`, group = the usual geographic chunk.

## New fixture types (estimates)

| Type | Height | Arm | Colour | Intensity | Range | Distribution | Spacing | Basis |
|---|---:|---:|---:|---:|---:|---|---:|---|
| `site-pole-10m` | 10 m | 0.5 m | 4 000 K | 2 400 cd | 36 m | radial (lantern profile) | 32 m | ≈ 24 lx below the head; spacing ≈ 3 × height |
| `yard-mast-18m` | 18 m | — | 4 000 K | 7 000 cd | 55 m | radial | 60 m | ≈ 22 lx below; crown of four floodlights drawn |

Both are this project's assumptions, chosen so the modelled illuminance falls in the ranges commonly
used for outdoor parking areas and rail yards (roughly 5–20 lx); they were **not** checked against a
standard's text or any manufacturer's data. 4 000 K (neutral white LED) is an assumption for modern
private site lighting; street lights stay at 2 700–3 000 K. The provenance file carries both types
with `status: estimate`.

## Satellite check (plausibility only)

Black Marble 2016, per 15″ pixel inside the map clip (1 265 pixels): the mean number of L2d fixtures
rises with satellite brightness — 0.05 per pixel in the darkest band (< 40), 0.44, 1.45, 2.21 and
**6.87** in the brightest (≥ 200). Of the 124 bright pixels (≥ 128) that have **no** lit street in L0,
26 now contain site lighting; the rest are mostly the paper mill and port land at Marbystrand/Lindö and
open industrial yards where OSM maps no service roads or lots (remaining gaps). Only 3 of the 195 dark
pixels (< 40) received site lighting (10 fixtures). Details: [data/stats.json](data/stats.json) `satellite`.
