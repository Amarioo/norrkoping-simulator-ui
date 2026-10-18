# Terrain, elevation and infrastructure accuracy audit — 2026-10-18

Status: **audit only. No geometry, data or runtime code has been changed.**
Added files: this report, screenshots in `docs/elevation-audit-2026-10-18/`, and the reproducible
audit scripts in `scripts/audit/` (cache output goes to the git-ignored `work/geodata/lantmateriet/audit/`).

Baseline before any change: `npm run check` 0 errors / 0 warnings; `npm test` 11 files, 57 tests passed.
The existing tests pass while every error below is present. None of them compares rendered heights
with the DTM or with LiDAR.

---

## 1. Method and evidence

| Reference | What it is | Independent of the rendered model? |
|---|---|---|
| Native DTM, `work/geodata/lantmateriet/dtm/m6{49,50}_5{6,7}.tif` | Lantmäteriet Markhöjdmodell Nedladdning, 1 m, EPSG:5845 (SWEREF 99 TM + RH2000), SHA-256 verified, stated vertical accuracy 0.1 m, breaklines (`brytgeometri: true`) | Yes for the processing chain (5 m grid → 10/40 m mesh → offsets). Not independent of Lantmäteriet's own classification. |
| LiDAR class 17 (bridge deck) points, `y20c012-649{25,50}_5675_25.copc.laz` | Laserdata Nedladdning, skog; GPS time decodes to **2020-02-03 09:55–10:25 UTC** | Yes. Bridges are removed from the DTM, so these points are a measured deck height that the model never used. Same flight as the DTM. |
| LiDAR class 9 (water) points | Same flight | Partly. The DTM water surface is built from class 9/breaklines. |
| SMHI/Sjöfartsverket tide gauges Juten‑Djurökvarn (35101) and Arkö (2545), RH2000, hourly, corrected archive | https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/6.json | Yes, a fully independent vertical-datum check. |
| GRS80 geodesics (pyproj `Geod`) and EPSG:3006 (pyproj) | Coordinate truth | Yes. |
| Wikipedia (sv): Bergsbron, Saltängsbron, Hamnbron, Gamlebro | Bridge identity, length, arch count, history | Secondary source, used only for structure and identity. |
| OSM snapshot already in the repo (2026-07-15 for bridges) | Positions, topology | No. This is what the model is built from. |

Every number below comes from the scripts in `scripts/audit/` (run with Python 3.12 + numpy, scipy, rasterio 1.5.2,
pyproj 3.8.0, laspy 2.7.0 + lazrs). They replicate `terrain.ts` (`sample`, `surfaceNode`, `surfaceHeight`,
`roadHeight`), `mapModel.ts`, `cityMesh.ts` `strip()` draping, and the backend `RailTraffic`/`TerrainService.kt`
formulas exactly. They do not run the browser. Screenshots come from the running app (frontend only, no backend).

Heights are RH2000 metres. "Rendered" means the height the client draws.

**Verified** = measured against a reference or proven from code. **Estimate** = inferred, flagged as such.

---

## 2. Executive summary (ranked by impact)

1. **Everything except the bare terrain is lifted by legacy constants (verified).** Roads render
   +2.45 m, paths +2.46 m, rail +2.56 m and tram track +2.72 m above the measured DTM, map-wide (RMSE 2.5–2.75 m).
   Land-cover polygons float +0.57 to +1.5 m and every building's walls start 1.6 m above the ground at their
   first vertex (2.0 m on average above the lowest footprint ground). This comes from `terrain-levels.json`
   (`road 0.071`, `ground -0.02`) plus `offset() = +0.02`, a z-ordering scheme from the old flat scene that is now
   added on top of the RH2000 DTM. `ELEVATION.md` says there are no artificial heights. That statement is wrong.
2. **Bridge decks are too high and have the wrong shape (verified against LiDAR).** All bridge samples with a LiDAR
   deck reference: mean +2.05 m, RMSE 2.82 m, max 9.4 m. Detailed river bridges are +1.1 to +2.7 m too high and are
   modelled as straight inclines between the two approaches. The measured decks are crowned (highest mid-span).
3. **Land bridges and their approaches get a fake +6 m per OSM `layer` (verified).** Examples: Hagebygatan +8.3 m,
   tram bridges near 58.5775 N 16.2014 E +8.5 m, rail near the station +8.4 m. 127 non-bridge approach segments
   inherit the lift, which produces ramps of up to 72 % grade (Skarphagsleden, Bravikenvägen,
   Söderköpingsvägen, Kungsängsleden, Trumpetaregatan…).
4. **Trams float or sink on bridges and jump in height (verified).** Off bridges the vehicle origin is within
   5 cm of the rail top. On bridges the error is RMSE 2.56 m and max 6.1 m (line 2), with jumps of up to 3.98 m
   between 4 m samples. Cause: backend vehicles use route points whose legacy Y is +0.018 different from the track
   segments, so **0 of 2 535 route points** ever match a bridge-profile key. Vehicles therefore drape onto the
   DTM (water surface) while the rails follow the deck. Vehicles also have no pitch.
5. **Horizontal scale is 0.23–0.25 % too small (verified).** The fixed metres-per-degree constants are wrong for
   58.59° N (latitude uses 111 133 m/°, the 45° value; true value 111 388). Positions drift by up to 25 m from
   geodesic truth at the map edges. Terrain and OSM use the same mapping, so they still align with each other.
6. **Terrain mesh resolution outside the central 3.2 × 3.2 km (verified).** The 5 m grid matches the native 1 m
   DTM (RMSE 0.10 m). The rendered 10 m central mesh is also good (RMSE 0.19 m; Industrilandskapet/Campus 0.23 m).
   The 40 m outer mesh has RMSE 0.70 m, 2.38 m on steep slopes, and a max error of 32 m. This covers most of the
   E4/Söderleden/outer-district road network.
7. **The vertical datum is correct (verified, no fix needed).** The LiDAR harbour water was 0.47–0.48 m RH2000 at
   ~10:20 UTC on 2020-02-03. The Juten‑Djurökvarn gauge read 0.50 m at 10:00 and 0.49 m at 11:00 (Arkö 0.52 m).
   Rendered water is within 0.20 m RMSE of LiDAR water returns. Note: that day was a high-water day; the
   2021–2025 mean at Juten‑Djurökvarn is 0.14 m.

---

## 3. Terrain and coordinate audit (Phase 2)

### 3.1 Data integrity

* The active `src/lib/data/terrain.json` grid is bit-identical to the staged `prepare-dtm.py` output, and the revision
  hash `lm-dtm-82df59d541e794c3` matches the grid bytes. 0 NaN cells. Coverage 100 %.
* Source tiles: Lantmäteriet STAC `dtm-cog`, EPSG:5845, 1 m, `lagesosakerhethojd 0.1 m`, `lagesosakerhetplan 0.3 m`,
  laser acquisition 2020-01-25 … 2020-11-20 (the central LiDAR tiles were flown 2020-02-03), data modified 2025-12-22.
* Range −16.49 … 116.34 m. The lowest cell is at 58.5782 N 16.0845 E. **Unverified**: probably a pit or quarry;
  check against an orthophoto.

### 3.2 Coordinate transformation

`project()` in `terrain.ts`, `TerrainService.kt` and `import-norrkoping.mjs` all use a local equirectangular projection
with the origin at 58.58981 N 16.18747 E and fixed constants:

| Constant | Used | True at origin (GRS80) | Error |
|---|---|---|---|
| m per ° longitude | 58 010 | 58 157.4 | −0.253 % |
| m per ° latitude | 111 133 | 111 388.0 | −0.229 % |

* Scene vs geodesic offset from the origin over the map bbox: mean 12.3 m, **max 25.2 m**.
* East–west scale also varies with latitude (equirectangular): 0.99918 at the north edge, 0.99648 at the south edge.
* `prepare-dtm.py` samples the DTM through the same inverse (scene → WGS84 → EPSG:3006 with `always_xy`). This is
  **internally consistent**: terrain and OSM features are registered to each other. Only metric distances and areas are off.
* WGS84 vs SWEREF 99 (ETRS89) is treated as a null transform. The plate-motion difference (~0.9 m in 2026) is below
  the 5 m grid and OSM accuracy. Low impact.
* Vertical: `toSceneHeight = (m − 0)/25` with the same 25 m/unit horizontally, so there is no exaggeration
  (verified). RH2000 is retained end to end (verified, see 3.4).

### 3.3 Grid, interpolation and mesh

| Area | 5 m grid vs native 1 m (land) | Rendered surface vs native 1 m (land) | Rendered vs native (water) |
|---|---|---|---|
| Whole map (400 k random points) | RMSE 0.10, max 7.9 m | **RMSE 0.70, p95 1.37, max 32.2 m** | RMSE 0.21 m |
| Central 10 m mesh, \|x\|,\|z\| < 64 units | RMSE 0.09 m | RMSE 0.19, p95 0.36, max 5.8 m | RMSE 0.26 m |
| Industrilandskapet + Campus (E 568150–569300, N 6494800–6495500) | RMSE 0.12 m | RMSE 0.23, p95 0.43, max 4.9 m | RMSE 0.41 m |

Error grows with slope. Whole map, slope > 30 %: RMSE 2.38 m, mean −0.41 m (ridges cut, valleys filled).
No systematic bias on flat ground. Bilinear sampling, pixel-centre convention and seam handling across tiles are
correct (the tiles are mosaicked before interpolation). Missing-data handling (−0.02 fallback,
inverse-distance gap fill) is never triggered with the current 100 % coverage, but the −0.02 scene-unit fallback
would be −0.5 m RH2000, a meaningless value if it ever triggers.

### 3.4 Vertical datum (independent check)

| | RH2000 m |
|---|---|
| LiDAR class 9, inner harbour east of Hamnbron (n = 29 880, 10:24 UTC) | 0.48 (p10–p90 0.45–0.50) |
| LiDAR class 9, Bråviken side (n = 85 499) | 0.47 |
| Juten‑Djurökvarn gauge, 2020-02-03 10:00 / 11:00 UTC | 0.50 / 0.49 |
| Arkö gauge, 10:00 / 11:00 UTC | 0.52 / 0.53 |
| Juten‑Djurökvarn mean 2021–2025 | 0.14 |

The difference is ≈ 2–5 cm, which **verifies RH2000** for the DTM/LiDAR and, through the active grid, for the model.
Rendered water vs LiDAR class 9 inside mapped water: mean +0.01 m, RMSE 0.20 m. Upstream of the Holmen dam:
LiDAR 15.70 m, rendered 15.60 m.

### 3.5 Offsets applied after sampling (the real problem)

| Layer | Code | Above rendered ground |
|---|---|---|
| Terrain ground polygons | `ground −0.02` + `offset +0.02` | 0.00 m |
| Farmland / residential / industrial / square | `levels` in `buildTerrain` | 0.57 / 0.62 / 0.68 / 0.85 m |
| Grass / cemetery / wood / pitch / apron | | 1.03 / 1.05 / 1.07 / 1.38 / 1.50 m |
| Road kerb strip / asphalt | `max(0.071, legacyY) + 0.02` (+0.006) | 2.27 / 2.43 m |
| Building wall bottom | `relativeHeight(anchor, 0.045)` | 1.62 m at the first ring vertex |
| River bank top | `bankTop 0.024` | 1.10 m |

Measured rendered-minus-DTM along all non-bridge, non-tunnel centrelines (every ~5 m):

| Kind | n | Mean | RMSE | p95 | Max |
|---|---|---|---|---|---|
| road | 174 859 | +2.45 | 2.53 | 3.25 | 16.8 |
| path | 112 901 | +2.46 | 2.56 | 3.50 | 13.6 |
| rail | 15 955 | +2.56 | 2.70 | 3.65 | 8.9 |
| tram | 7 357 | +2.72 | 2.75 | 3.12 | 8.4 |

The central 10 m zone has p95 2.59 m for roads (pure offset). The outer 40 m zone adds the mesh error on top.

Buildings: wall bottom above the lowest footprint ground, mean 2.00 m. 100 % of buildings have > 1 m, 29.5 % > 2 m,
5.5 % > 3 m, 96 buildings > 5 m. 118 are buried > 1 m on their uphill side. Cause: the base uses the ground at
`rings[0][0]`, not the footprint minimum.

---

## 4. Roads (Phase 3)

* **Systematic lift**: see 3.5. Roads look like slabs ~1.4 m above lawns and ~1.8 m above residential land cover.
  There is no skirt, so the edges hang free. This is the main cause of roads that "appear elevated".
* **Continuity at nodes**: there are no vertical jumps at shared OSM nodes (0 nodes > 0.25 m for every kind).
  Heights are consistent per node. The defect is in the *profiles*, not in the node joins.
* **Ramps**: rendered grade minus DTM grade per segment.

| Kind | Segments ≥ 3 m | Excess > 2 % | > 5 % | > 10 % | > 20 % |
|---|---|---|---|---|---|
| road | 39 408 | 8 277 | 2 080 | 487 | 109 |
| path | 34 423 | 11 441 | 3 901 | 1 026 | 157 |
| tram | 2 156 | 121 | 20 | 8 | 0 |
| rail | 2 590 | 404 | 85 | 9 | 0 |

  The worst cases are approaches to land bridges that carry the legacy `layer × 0.24` lift: Skarphagsleden
  (58.57729, 16.15948) +71.9 % over 8.5 m; Bravikenvägen (58.64737, 16.17239) −67 %; way 4370336 (58.64464, 16.16358)
  −45 %; Kungsängsleden (58.56572, 16.21932) −36 % (+9.2 m above DTM); way 344607173 (58.62647, 16.15967) +41 %;
  Söderköpingsvägen (58.57974, 16.21162) +34 % (+8.3 m); Trumpetaregatan (58.56397, 16.21478) +20 % (+10.4 m).
  127 non-bridge segments carry the lift; 114 of them have excess grade > 5 %. Many smaller excess grades are
  40 m mesh error (cuttings and embankments flattened).
* **Underpasses/tunnels**: the DTM already contains the road surface under removed bridges, so draped tunnel roads
  are close to correct apart from the +2.3 m offset. The legacy `railHeight()` adds up to +7 m to rail near road
  underpasses (`0.28` units) and is still applied, because `roadHeight` uses `max(0.071, legacyY)`, which keeps rises
  and drops dips. Ingelsta trench dips are dropped, as `ELEVATION.md` says.

---

## 5. Bridges (Phase 4)

Bridge deck heights come from `prepare-bridge-profiles.py`: ground sampled 10 m beyond each end (on the rendered
10/40 m mesh) + `max(0.071, legacyY) + 0.02`, then linear between the two ends. Deck elevation is never taken from the
riverbed (good). It does inherit the +2.3 m offset and, for land bridges, the +6 m per layer.

### 5.1 Detailed bridges vs LiDAR class 17 (median of points within 3 m of the axis)

Profiles along the bridge axis, t = −0.5 … +0.5 (ends), metres RH2000:

| Bridge | OSM centre (WGS84) | Measured deck LiDAR (end → mid → end) | Model deck (end → end, linear) | Error | Water/DTM under |
|---|---|---|---|---|---|
| Saltängsbron (Drottninggatan, tram) | 58.59369, 16.18546 | 3.75 → 4.17 → 3.91 | 4.75 → 5.73 | +1.0 … +1.7 | 0.90 |
| Hamnbron | 58.59425, 16.19404 | ~4.08 → 4.33 → 4.10 | 5.76 → 6.12 | +1.6 … +2.0 | 0.69 |
| Bergsbron (Kungsgatan) | 58.58972, 16.17829 | 16.95 → 17.22 → 17.68 | 19.07 → 20.41 | +2.1 … +2.7 | 12.10 |
| Gamlebro | 58.58939, 16.18385 | 8.24 → 8.32 → 8.22 | 10.30 → 10.49 | +2.0 … +2.3 | 0.64 |
| Laxholmsbron | 58.58886, 16.17999 | 13.43 → 13.69 → 13.47 | 15.35 → 15.53 | +1.7 … +2.1 | 12.10 |
| Spången | 58.59181, 16.18322 | 3.69 → 3.77 → 3.77 | 5.80 → 6.15 | +2.1 … +2.4 | 1.00 |
| 3 × Gångbro vid laxtrappan | 58.5900–58.5917 | no class 17 points (small timber bridges) | 3.4 → 6.9 | not measurable; DTM 1.9–3.8 suggests +1.5 … +3 | — |

Generic (non-detailed) bridge ways with LiDAR coverage, mean error: Kungsgatan road +2.64; Universitetsbron +0.93;
Tullhusbron +1.16; Drottninggatan segments +1.1 … +1.5; Packhusgatan/Fleminggatan +2.0 … +2.2; Ingelstagatan +1.67;
Hagebygatan **+8.34**; tram bridges at 58.5775, 16.2014 **+8.3 … +8.5**; rail 89746082 at 58.5983, 16.1898 **+8.44**.

All 673 bridge samples with a LiDAR reference: mean +2.05, MAE 2.26, RMSE 2.82, p95 6.89, max 9.40 m.

*Uncertain*: a few footpaths near Kungsgatan/Campus (ways 1209326371/2 at 58.58936, 16.17819, and 243821538) show
−2.5 m. The class 17 points there probably belong to the adjacent higher structure, not to the path. Not counted as a
verified error.

### 5.2 Structure and identity

* **Bergsbron**: Wikipedia (sv) gives a 145 m × 13 m concrete arch bridge faced with stone, **four arches**, built
  1901–02, carrying Norra/Södra Kungsgatan. The model has **three** arches (`count = 3` in `cityBridges.ts`) and the
  OSM polygon is 106 m long. Wikipedia's coordinate (58.5944, 16.2008) is 1.4 km from the OSM bridge. The OSM
  position is confirmed by LiDAR deck points along the axis, so the Wikipedia coordinate is wrong, not the map.
  The arch count needs a photo check before changing (confidence medium). The 145 m vs 106 m difference is probably
  approaches vs the mapped polygon (unverified).
* **Saltängsbron**: the current bridge is from 1980 and carries Drottninggatan and the tram (double track since 1913);
  Wikipedia coordinate 11 m from OSM. **Hamnbron**: fixed bridge from 1970 (replaced the 1915 bascule); 13 m from OSM.
  **Gamlebro**: concrete bridge from 1938 (formerly Järnbron). No public heights found for any of them, so LiDAR is the
  best available deck reference.
* **Arches, piers and abutments** of detailed bridges are built from the constants `water −0.197` (−4.9 m) and
  `waterbed −0.245` (−6.1 m), then shifted with the deck (`reprojectTerrain`). Arch springing therefore sits at
  deck − 6.9 m everywhere, whatever the real water level (real clearance: Saltängsbron ~3.3 m, Bergsbron ~5 m,
  Gamlebro ~7.7 m). Verified from code.
* **Generic bridges** (road/rail/tram ways not covered by a detailed model) get a pier pair every 0.36 units (9 m)
  wherever the deck is 1.5 m above ground. For land bridges with the +6 m lift this produces invented pier rows.
  Verified from code; the real support layout is unknown per bridge.
* There is no bathymetry: riverbed and pier foundations cannot be verified.

---

## 6. Trams and trains (Phase 5)

Backend vehicle origin (`RailTraffic.position → profileHeight`) minus rendered rail top (`roadHeight + 0.016` of the
nearest track segment), sampled every 4 m along each route:

| Route | Off bridges | On bridges | Max change between 4 m samples |
|---|---|---|---|
| Tram line 2 | mean +0.05, RMSE 0.06 m | mean +0.37, **RMSE 2.56, max 6.10 m** | **3.98 m** |
| Tram line 3 | mean +0.05, RMSE 0.06 m | RMSE 1.49, max 2.53 m | 1.18 m |
| Pendeln (train) | RMSE 0.31, max 4.24 m | **RMSE 3.10, max 7.43 m** | 1.88 m |

Root cause (verified): route points are stored as `[x, railHeight(p) + 0.018, z]`. `bridgeHeight` looks up
`x,z,legacyY` strings, so the +0.018 means **0 of 1 077 / 838 / 620 route points match a profile key**, although
35 / 16 / 63 of them sit on profiled bridge nodes. The vehicle then uses `ground + legacy + 0.038`, i.e. the water
surface under a river bridge, while the rail follows the deck. Additional findings:

* Vehicle sections are posed with position + yaw only (`VehicleSection`, `matrix.compose` with a Y-axis rotation).
  There is no pitch, so each of the five sections is level on gradients (verified from code; visual size estimated).
* Off-bridge rail is consistent with vehicles, but both sit +2.7 m above the DTM (see 3.5).
* Bridge-profile keys are float strings of legacy values, which is fragile. Any re-import that changes rounding
  silently disables the profiles.

---

## 7. Accuracy audit table (Phase 6)

Confidence: **H** = verified by measurement or code proof, **M** = strong evidence but one assumption,
**L** = observation or hypothesis.

| # | Location | Observed issue | Real-world reference | Root cause | Conf. | Proposed fix |
|---|---|---|---|---|---|---|
| 1 | Whole map | Roads +2.45, paths +2.46, rail +2.56, tram +2.72 m above ground | Native 1 m DTM (roads are ground in the DTM) | `terrain-levels.json` road 0.071 + `offset()` 0.02 from the pre-DTM flat scene | H | Roads at DTM + ≤ 5 cm; resolve z-fighting with polygonOffset/renderOrder, not metres |
| 2 | Whole map | Land cover +0.57…1.5 m; bank tops +1.1 m | DTM | `levels` table in `buildTerrain` + 0.02 | H | Drape at DTM + mm-level offsets; layer order via render state |
| 3 | 12 499 buildings | Walls start 1.6 m above anchor ground; 29.5 % have a > 2 m gap | DTM under footprint | Base = ground at `rings[0][0]` + 0.065 | H | Base = min footprint ground (walls extend down), roof from height above max/mean ground |
| 4 | Saltängsbron 58.59369, 16.18546 | Deck +1.0…+1.7 m; straight incline instead of crown | LiDAR class 17 (2020-02-03) | +2.3 m offset + linear profile between approaches | H | Deck profile from LiDAR class 17 (smoothed vertical curve), absolute RH2000 |
| 5 | Hamnbron 58.59425, 16.19404 | Deck +1.6…+2.0 m | LiDAR 17 | as #4 | H | as #4 |
| 6 | Bergsbron 58.58972, 16.17829 | Deck +2.1…+2.7 m; 3 arches modelled | LiDAR 17; sv.wikipedia Bergsbron (4 arches, 145 m) | as #4; arch count hard-coded 3 | H (height) / M (arches) | as #4; 4 arches after photo verification |
| 7 | Gamlebro, Laxholmsbron, Spången | Deck +1.7…+2.4 m | LiDAR 17 | as #4 | H | as #4 |
| 8 | Detailed bridges | Arches/piers from fixed −4.9 m water / −6.1 m bed | DTM water level (verified vs LiDAR/SMHI) | `terrain-levels.json` constants in `cityBridges.ts` | H | Springing from local measured water level; foundations flagged as estimated (no bathymetry) |
| 9 | Hagebygatan 58.57625, 16.19916; tram bridges 58.57746, 16.20141; rail 58.59829, 16.18983 | Decks +8.3…+8.5 m | LiDAR 17 | `elevation = layer × 0.24` in importer; rail `railHeight` +0.28 near underpasses | H | Remove layer/ramp lifts; land-bridge decks from LiDAR 17 or DTM approaches |
| 10 | 127 approach segments, e.g. Skarphagsleden 58.57729, 16.15948; Söderköpingsvägen 58.57974, 16.21162 | Ramps up to 72 % grade | DTM grade (≈ 0–6 %) | Same lift applied to the adjacent node via `networkNode` max | H | Fixed by #9; add per-class max-grade check |
| 11 | Tram line 2/3, Pendeln on bridges | Vehicle vs rail RMSE 2.6/1.5/3.1 m, max 7.4 m; 4 m jumps | Rendered rails (internal consistency) | Route-point legacy Y +0.018 → bridge-profile key never matches | H | Shared per-node absolute heights for rails and vehicles (keyed by OSM node id) |
| 12 | All rail vehicles | No pitch; sections level on slopes | Code | `VehicleSection(pos, heading)` | H | Add pitch from bogie-pivot heights; send it in SSE |
| 13 | Whole map | Horizontal scale −0.23/−0.25 %; up to 25 m position drift at edges | GRS80 geodesics, EPSG:3006 | Hard-coded 58 010 / 111 133 m/° | H | Local transverse Mercator (or SWEREF 99 TM) in importer, client and backend |
| 14 | Outer 40 m mesh zone | Terrain RMSE 0.70 m (2.4 m on slopes, max 32 m); roads follow it | Native DTM | Coarse decimation without breaklines | H | Denser urban mesh and/or road-corridor conforming terrain; road profiles from 1 m DTM |
| 15 | Harbour/Bråviken | Sea level +0.48 m (storm-high scan day) | SMHI mean 2021–25 = +0.14 m | DTM snapshot of 2020-02-03 | H (fact) / decision | Optional: use mean sea level for open sea/harbour; keep measured river reaches |
| 16 | River reaches (e.g. Gamlebro screenshot) | Water drawn as sloped facets | LiDAR class 9 reaches are flat between weirs | Water draped on the 10/40 m triangulated DTM | M | Water as flat reach polygons at measured class 9 levels, steps at weirs/falls |
| 17 | River near Gamlebro | Unexplained white quad on the water | Screenshot | Unknown | L | Investigate |
| 18 | 58.5782, 16.0845 | DTM −16.5 m (lowest cell) | None yet | Probably quarry or pit | L | Check orthophoto |
| 19 | Bridges with OSM-only geometry (3 laxtrappan footbridges, Varvsbron, Jungfrugatan, Dragsbron, others outside central tiles) | Heights unverified | No class 17 points in extracted tiles | Coverage | M | Extract class 17 from all 35 LiDAR tiles; else flag as estimate |
| 20 | Whole map | Data epoch 2020; 2026 changes (Inre hamnen remediation, future Ostlänken) not in DTM | Trafikverket: central Norrköping construction earliest 2027; Inre hamnen site works | Data age | M | Note per area; replace with newer scan when published |
| 21 | Docs/tests | `ELEVATION.md` says there are no artificial heights; 57 tests pass despite #1–#11 | This audit | No absolute-height tests | H | Correct docs; add the regression tests in §9 |

---

## 8. Data sources required

| Need | Source | Status |
|---|---|---|
| Ground surface | Lantmäteriet Markhöjdmodell 1 m (CC BY 4.0) | **Have**, verified |
| Bridge deck heights | Lantmäteriet Laserdata (class 17) | **Have**, 35 tiles locally; only 2 central tiles extracted so far |
| Water levels per reach | LiDAR class 9 (2020); SMHI/Sjöfartsverket gauges for the sea | **Have** (sea gauge open data) |
| Typical 2026 sea level | SMHI open data (Juten‑Djurökvarn) | **Have** |
| Bridge structure (spans, arches, piers, clearance) | Norrköpings kommun bridge register / drawings; Trafikverket BaTMan for state bridges; NVDB "fri höjd" via Lastkajen | **Need** (some require account or request) |
| Visual verification (arch count, piers, railings) | Lantmäteriet orthophoto (check licence), municipal photos, Wikimedia Commons | Need per bridge |
| Riverbed / pier foundations | Bathymetry (municipality / Sjöfartsverket) | **Not available**; will stay estimated |
| Post-2020 changes | Newer Lantmäteriet scan if published; municipal plan documents | Need |
| Building bases/roofs | Lantmäteriet or municipal 3D buildings, or LiDAR roofs | Optional (outside this scope) |

---

## 9. Proposed implementation plan (awaiting approval)

Ordered by your priority list. Each step keeps the Web Worker architecture, chunked batches and the shared grid
cache, and bumps the terrain revision so stale clients and servers are rejected. Each step lands only after
`npm run check`, `npm test`, `npm run build` and the audit scripts show the expected change.

**Step 1 — Coordinate system (#13).** Replace the equirectangular constants with a local transverse Mercator centred
on the current origin (k = 1, GRS80; < 0.001 % distortion over the map, true north kept). Use one implementation in
the importer (proj4 or pyproj-generated fixtures), `terrain.ts` and `TerrainService.kt`. Migrate every stored scene
coordinate (map, transport network, bridges, places, training pitch, Ingelsta config, hard-coded camera views and
landmark positions) through `old scene → WGS84 → new scene`. Regenerate the DTM grid in the new frame.
*Decision for you:* local TM (recommended) vs plain SWEREF 99 TM grid coordinates (grid north ≈ 1° off true north,
native 1 m DTM alignment).

**Step 2 — Remove legacy height offsets (#1, #2, #3).** In DTM mode, roads/paths/track sit at the ground surface +
a few cm. Land cover is drawn at ground with depth-bias/render-order layering. Buildings start at their minimum
footprint ground. `terrain-levels.json` is kept only for the non-DTM fallback. Remove the `max(0.071, legacyY)`
behaviour.

**Step 3 — Terrain mesh and road profiles (#14).** Measure the cost first, then pick one of:
(a) extend the 10 m mesh to the whole built-up area, or
(b) keep 40 m rural terrain but compute road/track centreline profiles offline from the native 1 m DTM (median across
the carriageway, grade-limited smoothing per road class) and conform the terrain to them along the corridors.
Target: rendered road vs DTM RMSE ≤ 0.3 m map-wide.

**Step 4 — Bridges (#4–#10, #19).** Extract class 17 for all LiDAR tiles. For each mapped bridge, fit an absolute
RH2000 deck profile (smoothed vertical curve through class 17 medians, joined to the approach DTM at the abutments)
and store it keyed by **OSM node id** with a `measured | estimated` flag. Remove the `layer × 6 m` and `railHeight`
lifts. Detailed structures spring from the measured local water level. Generic bridges get abutments only unless
supports are documented. Bergsbron to four arches after photo verification.

**Step 5 — Trams and trains (#11, #12).** Rails and vehicles read the same per-node absolute heights (backend and
client). Add pitch per section from front/rear bogie heights and transmit it. Target: vehicle-to-rail ≤ 0.05 m
everywhere, including bridges.

**Step 6 — Water and smaller details (#15–#18).** Flat river reaches at measured levels with steps at weirs, a
sea-level choice, and the white quad and −16 m point investigated.

**Regression tests to add (Phase 8):** projection vs pyproj fixtures (≤ 0.05 m); terrain samples vs native-DTM
fixtures at control points; road/path/track surface vs DTM tolerance in the test area; deck profiles vs LiDAR
class 17 fixtures (≤ 0.3 m) for the six detailed bridges; no node discontinuities; per-class max grade; tram/train
vehicle-to-rail ≤ 0.05 m along whole routes; building base ≤ min footprint ground.

**Generated data to invalidate and regenerate together:** `src/lib/data/{terrain,norrkoping-map,transport-network,
bridge-profiles,city-bridges,city-places,buildings-3d}.json` and the backend copies in
`norrkoping-simulator-backend/src/main/resources/`. The revision bump makes the client reject an old Ktor server.

---

## 10. Limitations and what is *not* verified

* The DTM and LiDAR come from the same 2020 flight. Ground agreement between them is not independent; the
  tide-gauge check is the only fully independent vertical check.
* Class 17 medians include railings and any vehicles on the deck. Medians within 2.5–3 m of the axis should be within
  ~0.1–0.3 m of the deck surface (estimate).
* No public as-built deck elevations were found for any Norrköping bridge.
* The arch count and lengths come from Wikipedia and are not yet confirmed with photos or drawings.
* Rail vehicle model origin is assumed to be at rail-top level (wheel contact). If it is not, a constant offset
  would add to the numbers in §6.
* Screenshots are without the backend (no vehicles).

## 11. Reproduce

```
python scripts/audit/a1_projection.py      # coordinate scale
python scripts/audit/a2_terrain.py         # grid/mesh vs native DTM
python scripts/audit/a3_extract_lidar.py   # class 2/9/17 extraction (cached in work/…/audit)
python scripts/audit/a4_network.py         # roads, bridges, nodes, water
python scripts/audit/a5_positions.py       # detailed bridge positions and deck profiles
python scripts/audit/a6_ramps_trams.py     # ramps and vehicle-to-rail
python scripts/audit/a7_buildings.py       # building bases
```

Sources: [Lantmäteriet DTM STAC](https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog) ·
[Kvalitetsbeskrivning markhöjdmodell](https://www.lantmateriet.se/globalassets/geodata/geodataprodukter/hojddata/kvalitetsbeskrivning_mhm.pdf) ·
[SMHI ocobs parameter 6](https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/6.json) ·
[Bergsbron (sv.wikipedia)](https://sv.wikipedia.org/wiki/Bergsbron) ·
[Saltängsbron](https://sv.wikipedia.org/wiki/Salt%C3%A4ngsbron) ·
[Hamnbron](https://sv.wikipedia.org/wiki/Hamnbron,_Norrk%C3%B6ping) ·
[Gamlebro](https://sv.wikipedia.org/wiki/Gamlebro) ·
[Trafikverket: Ostlänken i Norrköpings kommun](https://www.trafikverket.se/vara-projekt/projekt-som-stracker-sig-over-flera-lan/ostlanken-en-ny-dubbelsparig-jarnvag/ostlanken-i-norrkopings-kommun/)
