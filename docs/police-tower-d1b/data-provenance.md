# Police Tower D1b — data provenance (the police tower, Polishuset)

Machine-readable: [police-tower-provenance.json](police-tower-provenance.json) (every value with its
source and kind) and [data/police-tower-parts.json](data/police-tower-parts.json) (the LiDAR
measurement of the tower's parts). Values in the model:
[`spec.ts`](../../src/lib/landmarks/police/spec.ts) (`TOWER`, `PLANT`, `DETAIL`, `EDGE_M`,
`TOWER_MODEL`), each tagged `[LIDAR2]`, `[LIDAR]`, `[HEMSO]`, `[PHOTO]` or `[EST]`; geometry in
[`tower.ts`](../../src/lib/landmarks/police/tower.ts).

## Coordinates

| | |
|---|---|
| Horizontal | SWEREF 99 TM (EPSG:3006) → scene: `x = (E − 569 030) / (25 · 0.9996584126)`, `z = (6 494 989 − N) / (25 · 0.9996584126)`; x east, z south; 1 scene unit = 25 ground metres (`src/lib/data/norrkoping-map.json` `meta.reference`, same as `terrain.json`) |
| Vertical | RH2000 metres; scene y = RH2000 / 25 (`terrain.json` `reference.verticalOriginMetres` = 0, checked by a unit test) |
| TOWER FRAME (LiDAR, D1b) | origin = centre of the UPPER block's roof extent, SWEREF E 568 304.05, N 6 495 635.95 = scene (−29.0479, −25.8868); `a` along the UPPER block's long axis towards the SSE gable, unit vector (E, N) = (0.280441, −0.959871), bearing 163.71°; `c` = `a` turned 90° counter-clockwise seen from above (towards ENE); metres; heights RH2000 |
| Tower group in the scene (`TOWER_MODEL`) | position = the frame origin at scene height 0; rotation about +y `r = atan2(0.280441, 0.959871)` = 0.284254 rad, so local +z = `a` (out of the SSE gable) and local +x = `c`; local y = RH2000 / 25. A length of `L` metres in the frame is `L / 25` units (grid vs ground metres differ by the scale factor, 0.03 %, < 2 cm over the tower: ignored) |
| Ground under the tower | walls reach down to the lowest rendered ground under the tower's footprint (`terrain.footprintGround`, the Lantmäteriet DTM mesh): 12.18 m RH2000 in the running app. The LiDAR ground 5–25 m in front of the SSE gable is 11.74 m (median) |
| Emblem sign | child of the tower group at local (0, 49.35/25 − 7.3/25, (25.05 + 0.25 + 0.25)/25): centred on the SSE gable, 0.25 m in front of the wall, centre 42.05 m RH2000 = 30.3 m above the ground in front (size and distance below the parapet from D1's corrected `SIGN`, `main` `aaa9b3d`) |

**D1's frame label:** D1's first measurement file wrote "+v towards WSW"; its script computes
`v = (−u_N, u_E)`, which points **east-north-east** (bearing 75.6°). Found by D1b and corrected by the
D1 session on `main` (`aaa9b3d`).

## Sources

| Id | Source | Date | Licence / use | Accuracy | Used for |
|---|---|---|---|---|---|
| LIDAR2 | Lantmäteriet point cloud, STAC `dsm-skoglig-copc` ("Laserdata NH 2020"), tile y20c012-64950_5675_25 (local, not in Git; SHA-256 `529d8429…94e269` in the measurement file), processed by `scripts/police-tower-d1b/police_tower_parts.py` | 2020-02-03, scan area 20C012, nominal 1.2 pts/m² | CC BY 4.0 ©Lantmäteriet, processed | heights ±0.1–0.2 m on hard surfaces; extents are percentiles of the returns (1st/99th along, 2nd/98th across), walls up to ≈ 0.5 m further out | the three parts' extents and roof heights, parapet, rooftop plant and mast, ground in front of the gable |
| LIDAR | D1's whole-roof measurement `docs/police-signs-d1/data/police-tower-lidar.json` (same tile, unchanged) | 2020-02-03 | as above | as above | cross-check of the whole footprint (54.4 × 13.4 m, centre), the seed frame for D1b's script |
| HEMSO | Hemsö: "Stinsen 1 – Norrköpings Polisstation", photograph `Stinsen-1-1240.jpg` (1024 × 768) | image 2023-10, inspected 2026-10-25 | © Hemsö; inspected only, not copied or redistributed | qualitative | the dark gable is only the taller part; beside it a light, recessed and lower part, then the ENE façade with light fins; dark gable and light long façades after the 2018 re-cladding |
| PHOTO | Wikimedia Commons "Polishuset Norrköping.jpg" (Johan Jönsson, 2016-10-01, CC BY-SA 4.0), "Norrköping juni 2018 51.jpg" (Johan Jönsson, 2018-06-21, CC BY-SA 4.0) | 2016, 2018 | reference only, nothing copied | qualitative | the tower stands at ground level beside low wings; the recess beside the SSE gable (scaffolded in 2018); rooftop masts; vertical fins on the long façades |

## Measured, derived, estimated

| Value | Kind | Source |
|---|---|---|
| UPPER block (the dark-gable slab): 50.10 × 8.56 m between the percentiles → drawn 50.6 × 9.06 m | measured (+ EDGE_M estimate) | LIDAR2 |
| UPPER roof 49.02 m (interior returns, median); parapet top 49.35 m (edge returns: median 49.30, p90 49.35, max 49.38) | measured | LIDAR2 |
| UPPER long axis bearing 163.71° (D1's whole roof: 165.6°, mixing the parts); the across-extent per 4 m slice drifts < 0.6 m over the length (no residual skew) | measured | LIDAR2 |
| EAST strip along the ENE side: c 4.28…8.98 m (drawn to 9.23), from the NORTH block to a = 20.54 (drawn 20.79), i.e. it ends 4.5 m short of the SSE gable; roof (trough) 45.32 m, raised outer rim from c 7.5 m at 46.23 m | measured | LIDAR2 |
| No returns above 13.5 m in the corner between the EAST strip's end and the SSE gable (the recess) | measured | LIDAR2; seen in HEMSO and PHOTO 2018 |
| NORTH block at the NNW end: a −30.29…−25.05 m, c 0.49…8.59 m, roof 46.26 m; its ENE face drawn in line with the EAST strip (8.98 + EDGE_M; its own 98th percentile, from 75 returns, is 0.4 m short) | measured / derived | LIDAR2 |
| Whole drawn footprint 55.84 × 13.76 m; its centre is D1's centre within 0.3 m; D1: 54.38 × 13.42 m between the 1st/99th percentiles | derived | LIDAR2, LIDAR |
| Height: parapet 49.35 − ground in front 11.74 = 37.6 m (D1: ≈ 37.7 m) | derived | LIDAR2 |
| Rooftop plant: 9 clusters of returns ≥ 50.2 m (extents and tops 50.5–53.5 m) and a mast to 64.12 m with equipment to 51.89 m at its foot | measured | LIDAR2 |
| Walls this far outside the percentile extents: 0.25 m (`EDGE_M`) | **estimate** | sparse edge returns; the same allowance D1 used for the gable width |
| Parapet thickness 0.3 m; plant boxes at least 1 m (single returns); mast 0.4 m wide | **estimate** | — |
| Window texture: 16 bays × 11 storeys per repeat at 3.2 × 3.4 m, starting at the ground in front of the gable | **estimate** (texture from the earlier model, now repeated at a fixed size instead of stretched) | photos show vertical fins and ≈ 11–13 window rows, not countable exactly |
| Colours: dark gables `#40515a` (NNW gable not photographed: assumed as SSE), light long façades (window texture), light recessed walls `#c3c7c4`, roofs `#b3b8b6`, coping `#e2e1d7`, plant `#7c8586` | **estimate** from HEMSO/PHOTO; earlier model's palette | — |
| Emblem sign size 2.51 × 3.32 m, 7.3 m below the parapet | D1's corrected values (HEMSO × the 9.3 m dark gable), taken unchanged from `spec.ts`; D1b's first finding, [remaining-gaps.md](remaining-gaps.md) §1 | D1 (`aaa9b3d`) |
| Lit windows at night: 30 % of the texture's window grid, two patterns (ENE / WSW faces), gain 0.9 × night level | **estimate**, D1 follow-up (`windows.ts`), unchanged; mapped onto the measured façades by the façade geometry's two groups | D1 (`aaa9b3d`) |

## Changes to earlier output

- `src/lib/landmarks/police/spec.ts`: `TOWER_MODEL` is now derived from the LiDAR parts (was the
  illustrative slab's numbers). D1's `TOWER_MEASURED`, `SIGN`, `PHOTO`, `GABLE_WIDTH_M`,
  `NIGHT_GAIN` and `signPlacement` keep their `main` (`aaa9b3d`) values; `sign.ts`, `windows.ts` and
  `emblem-outline.json` are unchanged.
- `src/lib/mapLandmarks.ts`: the illustrative slab, its parapet cap and six rooftop boxes are replaced
  by the measured tower. The façades keep the D1 follow-up's lit-window materials (map + emissive
  map, single-instance InstancedMesh still named `police-tower-slab`), now with repeating textures; the solar-panel layout keeps its earlier free strip and additionally leaves
  3 m free around the measured tower (it removes panels only, never adds).
- `docs/police-signs-d1/` and `scripts/police-signs-d1/` are unchanged by D1b.
