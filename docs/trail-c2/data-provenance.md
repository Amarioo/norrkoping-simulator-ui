# Phase C2 — data provenance (the Vrinnevi illuminated trail)

Every value is one of three kinds: **source** (taken from a dataset), **derived** (computed from
sources by a recorded rule) or **estimate / assumption** (this project's choice, labelled as such).
Machine-readable version: [data/streetlights-c2-provenance.json](data/streetlights-c2-provenance.json)
(one row per lantern, the 14 ways with OSM version and timestamp, the walk around the loop, the
policy, the schedule, and SHA-256 hashes of every input file).

| Kind | What | Source | Licence | Date | Accuracy |
|---|---|---|---|---|---|
| **Source** | Which ways form the loop | OpenStreetMap route relation `relation/5703856` v2 (`route=running`, `colour=black`), stored in `scripts/vegetation-c1/trail-osm.json` (fetched for Phase C1) | ODbL-1.0, © OpenStreetMap contributors | fetched 2026-11-13 (OSM base 2026-11-13T16:49:35Z); relation last edited 2016-07-24 | as mapped: 14 ways, 2 368.9 m, one closed ring |
| **Source** | The ways' geometry, tags (`lit=yes` on all 14), versions and timestamps | The pinned Lighting Phase L0 snapshot (Overpass, OSM base 2026-10-24T19:51:21Z, SHA-256 `e2858621…ece0b`), extracted to `scripts/data/trail-c2-source.json` by `scripts/trail-c2/extract-source.mjs` | ODbL-1.0 | snapshot 2026-10-24; ways last edited 2015–2023 | metre-level as mapped; edit dates are not survey dates |
| **Source** | The trail's length, 2.4 km | Norrköpings kommun, "Motionsspår" (norrkoping.se/se-och-gora/motion-och-idrott/motionsspar): "Vrinnevi elljusspår … 2,4 km"; the municipality's guide on Naturkartan says the same | public web page (a fact, not copied data) | page updated 2025-02-24, read 2026-11-13 | one decimal of a kilometre |
| **Source** | About 100 lamps on the loop | Norrköpings Tidningar, 2019-10-16, "Nu ska löparna kunna springa i ljus": a visitor walked the 2.4 km loop and counted 66 working and 34 broken lamps | newspaper article (one number quoted as a fact) | 2019-10-16, read 2026-11-13 | **one person's count, not a register**; it may be off by a few lamps, and lamps may have been added or removed since |
| **Source** | Drawn trail (width, position), buildings, water, roads | `src/lib/data/norrkoping-map.json` (OpenStreetMap) | ODbL-1.0 | OSM base 2026-10-16T13:35:36Z | as mapped; unchanged by this phase |
| **Source** | Earlier lamps (for the seams) | the rendered sets before C2: pilot, A1–A3, L2a, L2bc, L2d (`src/lib/data/streetlights*.json`) | as those phases | 2026-10 | unchanged by this phase (hashes below) |
| **Derived** | The walk around the loop, the dark run (10 ways, 1 439.8 m), the stations | `src/lib/lighting/trailGenerator.ts`, policy `lighting-c2-v1` | as the sources | — | exact arithmetic on the sources |
| **Estimate** | Position of each of the 58 lanterns | stations every 24.8 m, 1.2 m from the trail's centreline, right-hand side in walking direction | — | — | ± 12.5 m along the trail (half the spacing); the side is a guess |
| **Estimate** | The spacing, 25 m | 100 counted lamps minus the 43 that Phase L2bc placed on the other part of the loop = 57 for 1 439 m | — | — | follows the count's uncertainty |
| **Estimate** | Lamp type, height 4.2 m, colour 2 700 K, output 380 cd, reach 16 m | the existing Step 6 type `park-lantern-4m` (the same as L2bc's 43 lanterns on the loop). No luminaire data for the trail exists in this project | — | — | not measured. Real trail lamps are often taller poles; see the gaps file |
| **ASSUMPTION** | Switch-off hours: on from 06.00, off from 22.00 (local time) | not stated anywhere for Vrinnevi. Taken from the municipality's text for its Abborreberg illuminated trail on Naturkartan: "Lamporna är tända på morgonen kl. 6.00 till gryning och från skymning till kl. 22.00." | — | read 2026-11-13 | **may be wrong for Vrinnevi**; one constant to change (`TRAIL_SCHEDULE` in `src/lib/lighting/trailSchedule.ts`) |

**Not invented and not in the data:** lamp IDs or a municipal lamp register, real lamp positions,
luminaire models, which lamps are broken, the 1.5 km connecting trail from Navestad that Naturkartan
mentions (not part of the relation, and nothing says it is lit), seasonal changes of the schedule.

## Coordinates

- Source geometry is WGS 84 latitude/longitude (OSM). It is converted to **EPSG:3006 (SWEREF 99 TM)**
  and on to scene coordinates by `src/lib/geo/sweref99tm.js` (`geodeticToScene`), the same code every
  earlier lighting phase uses.
- Scene coordinates: origin E 569 030, N 6 494 989; `x = (E − 569030) / (25 × k)`,
  `z = −(N − 6494989) / (25 × k)`, `k = 0.9996584126`; x points east, z points south; one scene unit is
  25 m on the ground.
- Heights are not stored: each lantern stands on the drawn terrain (the laser-based ground model,
  **RH 2000**) at its position, and its light source is 3.9 m above that (type geometry).
- The runtime file stores scene x and z × 10⁴ (2.5 mm steps); the provenance file lists each post's
  E and N in EPSG:3006 to 0.01 m.

## Files and hashes

| File | Role | SHA-256 |
|---|---|---|
| `scripts/data/trail-c2-source.json` | pinned source extract (14 ways) | see `meta.inputs.source` in the provenance file |
| `src/lib/data/streetlights-c2.json` | the 58 lanterns the app loads (6.1 kB) | in `docs/trail-c2/data/hashes.json` |
| `docs/trail-c2/data/streetlights-c2-provenance.json` | per-lantern provenance | same |
| `docs/trail-c2/data/stats.json` | counts, the walk, rejected stations (none) | same |

Rebuild: `node scripts/trail-c2/extract-source.mjs` (needs the ignored raw snapshot; refuses a file
with another hash), then in PowerShell
`$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/trail-c2/vitest.config.ts write`.
No random numbers, no timestamps of the run, no machine paths. `npm test` checks on every run that the
committed files equal a fresh generation byte for byte and that the input order does not matter.
