# Phase D2 — data provenance

Every value of the fuel-station model is one of three kinds. They are kept apart in the code
(`src/lib/fuel/spec.ts` tags `[OSM]`, `[LIDAR]`, `[EST]`) and in the data file.

| Kind | What | Source | Licence | Date | Accuracy |
|---|---|---|---|---|---|
| **Source** | The 32 fuel features (points / ways, names, brands, operators) | OpenStreetMap via `docs/step62/evidence/fuel-stations.json` (Step 6.2 review) | ODbL-1.0 | OSM base 2026-10-23T09:05:06Z | Mapped POIs; not a certified count of active stations |
| **Source** | Canopy outlines: the 30 `building=roof` outlines of the runtime map, plus `way/99263073` (an `amenity=fuel` way tagged `building:part=roof`), plus by user decision (2026-11-10) `way/96575513` (`building=yes`, read as the canopy of Ingo Lindövägen) | OpenStreetMap, `src/lib/data/norrkoping-map.json` | ODbL-1.0 | OSM base 2026-10-16T13:35:36Z | As mapped (typically ±1–2 m) |
| **Source** | Canopy heights | Lantmäteriet *Laserdata NH 2020* (STAC collection `dsm-skoglig-copc`, scan area 20C012), 35 local tiles | CC BY 4.0 | 2020 | ≈ 0.1 m vertical; nominal 1.2 points/m² |
| **Derived** | OKQ8 Hagebygatan's outline (user decision 2026-11-10): the minimum-area rectangle of the flat roofed LiDAR patch beside the station | `canopies_lidar.py` (`LIDAR_OUTLINE`), stored as `ringSweref` | CC BY 4.0 (LiDAR) | 2020 | 1 m cells; the patch fills 85 % of the rectangle |
| **Derived** | Canopy top (RH2000), ground around it, clearance, roofed share, flatness | `scripts/fuel-d2/canopies_lidar.py` → `src/lib/data/fuel-canopies.json` | as the sources | — | Top p90 − p10: median 0.13 m, at most 0.58 m (OKQ8 Skärblackavägen) |
| **Estimate** | Fascia depth 0.9 m (at most clearance − 3.5 m), the lit sign band, pump islands, dispensers, columns, the downlights (positions, 1 200 cd, 4 000 K, 16 m range), night glow | `src/lib/fuel/spec.ts` | — | — | Not documented anywhere; this project's assumptions |

## Coordinates

- Data and the script use **EPSG:3006 (SWEREF 99 TM)** metres; heights are **RH2000** metres.
- Scene: `scene = (SWEREF − origin) / (25 · k)`, origin E 569 030 / N 6 494 989, k = 0.9996584126,
  x east, z south; scene y = RH2000 / 25 (`norrkoping-map.json` `meta.reference`).
- The model (`fuelStations.ts`) is one group at the scene origin, scaled 1/25. Its local coordinates
  are *ground metres* (scene x · 25 east, scene z · 25 south) and RH2000 metres. These metres are grid
  metres / k: 0.03 % off, far below the outlines' accuracy.
- Each canopy's frame comes from the minimum-area rectangle of its OSM outline: +u along the long side,
  +v across it (`layout.ts`).
- Canopy tops are placed at the measured RH2000 height. Islands and columns stand on the **rendered**
  ground (the app's DTM terrain). Across the 19 canopies the rendered ground agrees with the LiDAR
  ground within 0.6 m, which a unit test checks.

## The measurement (`scripts/fuel-d2/canopies_lidar.py`)

1. Every canopy outline goes to the nearest fuel feature within 60 m.
2. Inside the outline, inset by 0.5 m, the script builds a 1 m grid. The top of each cell is its
   highest non-ground return. The ground is the median of the class-2 returns in a ring 1–10 m
   outside the outline.
3. A cell is *roofed* when its top is 3.0–8.5 m above that ground. An outline is accepted when at
   least 50 % of its cells are roofed and the roofed tops are flat (p90 − p10 ≤ 0.8 m). The top
   height used is the median of the roofed cells.
4. User decision 2026-11-10: `INTERPRETED` adds an OSM `building=yes` outline as a candidate (Ingo
   Lindövägen). `LIDAR_OUTLINE` derives an outline for OKQ8 Hagebygatan: the flat roofed cells
   (3.0–8.5 m, no ground return below, outside every OSM building, ≥ 60 cells, within 25 m) become
   the minimum-area rectangle of their corners, which the cells must fill to ≥ 75 %. Both are then
   measured and accepted by steps 2–3.
5. A station with no accepted outline gets the nearest flat, roofed LiDAR patch recorded as a
   *candidate*: 3.8–7.5 m high, outside every OSM building, with no ground return below it. Nothing
   is built from a candidate.

The script is deterministic: no timestamps or machine paths, fixed rounding and sorted keys. A rebuild
gives the same bytes:

| File | SHA-256 |
|---|---|
| `src/lib/data/fuel-canopies.json` | `474a001c90ebf7ec9461bf73a512638b12623330f3eb3090c00f08a1e1a9227a` |
| `docs/fuel-d2/evidence/lidar-canopies-v2.png` | `25857cac47b64698dd81475aae0dff7f1d143e72a3f9885464c633e86153442b` |
| inputs: `scripts/fuel-d2/canopies_lidar.py` | `ef48167d04b7135831344c832fc30a738dca054592abd112412874fd53946b41` |
| inputs: `docs/step62/evidence/fuel-stations.json` | `617f32a37d39e90fc02daa3eaa974f42d00a324bd9bb0dfe44d8558000b06bf6` |
| inputs: `src/lib/data/norrkoping-map.json` | `454ecbe0d86e64b366e7c3ac3f93664077d29cfe667ee44fc8950c944a77ac90` |

The first version (19 stations, before the user's decision) had data `85ccc9e4…bc2ccb6cf` and the
sheet `docs/fuel-d2/evidence/lidar-canopies.png` (kept as history).

Tools: codex-runtimes Python 3.12.14, numpy 2.3.5, scipy 1.18.1, laspy 2.7.0, Pillow 13.0.0. No
random numbers are used, so there is no seed.

## What is *not* used

- **Operator logos and brand colours.** They are not licensed (`DATA-LICENSE.md`), so the sign band is
  neutral white.
- **Opening hours.** They are not used to switch lights. The downlights follow the street lighting's
  night level, as the site lighting (L2d) does.
- **Station names.** They appear only in the data and the docs, not in the scene.
