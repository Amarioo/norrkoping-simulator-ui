# Phase C1 — data provenance (pilot tile and the rollout around the northern trail loop)

Every value of the measured forest is one of three kinds, kept apart in the data file
(`src/lib/data/forest-c1.json`, field `kinds`) and in the code (`src/lib/forest/forest.ts`, tags
`[LIDAR]` and `[EST]`). Machine-readable version: [forest-provenance.json](forest-provenance.json).

| Kind | What | Source | Licence | Date | Accuracy |
|---|---|---|---|---|---|
| **Source** | Laser returns (position, height, class) | Lantmäteriet *Laserdata NH 2020*, STAC collection `dsm-skoglig-copc`, scan area 20C012; 4 local tiles | CC BY 4.0, ©Lantmäteriet | scanned 2020 | ≈ 0.1 m vertical on open ground; about 2 returns per m² |
| **Source** | Outline of Vrinneviskogens naturreservat | OpenStreetMap `way/102865465` v13 (OSM tags: source Länsstyrelsen i Östergötlands län, `lst:ref` 2001776), stored in `scripts/vegetation-c1/reserve-osm.json` | ODbL-1.0 | fetched 2026-11-13 (OSM base 2026-11-13T15:32:20Z) | as mapped; 286.2 ha here, 286.8 ha in its own tag, 277 ha on the municipality's page. Not checked against Naturvårdsverket's register. Also the limit of what is measured |
| **Source** | The trail loop, used only to choose the tiles | OpenStreetMap `relation/5703856` v2 (`route=running`, `colour=black`), stored in `scripts/vegetation-c1/trail-osm.json` | ODbL-1.0 | fetched 2026-11-13 (OSM base 2026-11-13T16:49:35Z); relation last edited 2016 | 2 368 m as mapped. **Not verified** against the municipality's 2.4 km illuminated loop ([vrinneviskogen-plan.md](../step62/vrinneviskogen-plan.md)). Not drawn; no lamps |
| **Source** | Map clip, paths, roads, pitches, water, buildings | `src/lib/data/norrkoping-map.json` (OpenStreetMap) | ODbL-1.0 | OSM base 2026-10-16T13:35:36Z | as mapped; unchanged by this phase |
| **Derived** | Tree top position, height, crown radius, crown base (flag 0); canopy mask | `scripts/vegetation-c1/forest_lidar.py` → `src/lib/data/forest-c1.json` | as the LiDAR | — | position ≈ ±1 m; height ≈ ±0.5 m (tends low); crown radius ≈ ±1 m; crown base rough; mask 5 m cells |
| **Derived** | Reserve area inside and outside the map, canopy share | same script, 4 m grid | as the sources | — | ≈ ±0.1 ha |
| **Estimate** | Crown base of 634 of the 8 071 trees with too few returns (0.5 × height, flag 1); the tile-selection constants (60 m, 10 %, 2 m); trunk radius; crown shape and colour; forest-floor colour; the detection constants; 0.3 m stem clearance to paths | `forest_lidar.py`, `src/lib/forest/forest.ts` | — | — | this project's assumptions |

**Not invented and not in the data:** species, trunk diameters as measurements, trees outside the
measured tiles or outside the reserve, changes in the forest after 2020, the illuminated trail and its lamps (that is C2).

## What "a tree" means here

The script finds **visible tree tops**: local high points of the canopy surface seen from the air.
In a dense stand two crowns that have grown together count as one top, and small trees under the
canopy are not seen at all. So 8 071 (649 in the pilot tile) is a count of tops, not of stems; a forester's stem count for the
same area would be higher.

## Coordinates

- Data and the script use **EPSG:3006 (SWEREF 99 TM)** metres. The LiDAR's heights are **RH2000**;
  a tree's height, crown radius and crown base are metres **above the LiDAR ground at the tree**.
- Tiles are 250 m squares on a 250 m grid. The pilot tile has its south-west corner at E 569 250,
  N 6 492 500. The rollout has 14 tiles between E 569 000–570 000 and N 6 492 000–6 493 250: every
  tile within 60 m of the trail loop that lies at least 10 % inside the reserve and wholly inside the
  map.
- Scene: `x = (E − 569030) / (25 · k)`, `z = (6494989 − N) / (25 · k)`, k = 0.9996584126, x east,
  z south (`terrain.data.reference`, the same as the map). Scene y = RH2000 / 25.
- Stems stand on the **rendered** ground (the app's DTM terrain, `terrain.groundHeight`), and a
  tree's sizes are converted with 25 m per unit (0.03 % off the grid scale, far below the accuracy).
- The forest floor is clipped to the terrain's own triangles (`terrain.drape`), so it lies exactly on
  the rendered ground; only its depth rank (the map's woodland rank) orders it against grass and paths.

## The measurement (`scripts/vegetation-c1/forest_lidar.py`)

1. **Ground:** the mean of the ground-class returns per 1 m cell; empty cells take the nearest cell;
   smoothed over 1 m.
2. **Canopy height:** per 1 m cell, the highest return that is not ground, noise or water, minus the
   ground. Cells without one take the highest of their 8 neighbours. Cells **outside the reserve** or
   on a **building** of the map (widened by 2 m) are set to zero: nothing is measured there, so
   houses, sheds and garden trees next to the forest are left as they were.
3. **Tree tops:** local high points of the smoothed canopy height (1 m smoothing), at least 3 m
   high. Taken from the tallest down; a top is dropped when a taller accepted top lies within
   1.2 m + 0.07 × that tree's height.
4. **Crown:** the canopy is split between the tops (watershed); a tree's crown is its part that is at
   least 35 % of its height. The crown radius is the radius of a circle of the same area (0.8–8 m).
5. **Crown base:** the 10th percentile of the returns at least 1.5 m above ground inside the crown,
   kept within 20–80 % of the height. With fewer than 5 returns: 0.5 × height, flagged as an estimate.
6. **Canopy mask:** 5 m cells where at least half of the 1 m cells are 2 m high or more.

The tile is measured with a 15 m margin, so trees at its edge are found like the others; a tree
belongs to the tile when its top lies inside it.

## Reproducibility

- Deterministic: no random numbers, fixed rounding (0.1 m), sorted output, no timestamps or machine
  paths. The rollout file (v2) was rebuilt twice on 2026-11-13: both have SHA-256
  `3122edfb064a853ed3d8d1f0b029b24ab6bfe1fa8682dd7c19295a2ebea2f7fb`, the committed file's hash. The
  pilot tile's trees and canopy mask in it are identical to the pilot file (v1, `efcb9ae7…`, rebuilt
  three times). A
  unit test compares the committed file with the hash in `forest-provenance.json`.
- Tool versions: Python 3.12.14, numpy 2.3.5, scipy 1.18.1, laspy 2.7.0, pyproj 3.8.0.
- The raw LiDAR tiles stay local (`work/geodata/lantmateriet/`, not in git); their SHA-256 hashes are
  in `forest-provenance.json`.
