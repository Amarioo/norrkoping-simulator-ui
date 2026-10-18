# Claude progress report — Norrköping geospatial reconstruction

This file is the recovery checkpoint. Newest status first. **Nothing has been committed or pushed.**

---

## Current status (2026-10-18): Step 3.5 COMPLETE — waiting for approval

Step 3.5 (terrain, road and water integration) is implemented in the working tree and verified. Work has
stopped. Railway bridge defects are assigned to Step 4 and tram/train alignment to Step 5 (section 9).

**Action for the user:** restart the Ktor backend (:8080). `bridge-profiles.json`, `terrain.json` and
`TerrainService.kt` changed; the new revision is `lm-dtm-8eccbc3691700b78-surface-1c04d2698aea`. A backend
still on the old revision shows "Ansluter till Ktor… Starta om backend" in the client.

### Summary

The six screenshots showed three independent root causes, not one:

1. **Water draped on the DTM.** Water had no level of its own: it was drawn on the terrain mesh. Over
   water the mesh interpolates between flat water nodes and bank nodes, so the river had sloped triangular
   facets that climbed banks, quays, building walls and bridge ends. Screenshots 3–6.
   Fix: every water polygon is flat at its measured reach level (LiDAR class 9). Motala ström is several
   reaches separated by falls. Dry banks inside OSM polygons are drawn as land; sloping streams keep the
   terrain.
2. **Bridge decks and approaches anchored on the pre-Step-3 mesh with the flat-scene layer lift.**
   Approach segments (one end on a deck) were drawn as straight lines over the ground, so terrain
   humps buried them. Screenshot 2, Hamnbron. 523 deck/approach pieces were below the terrain, worst 5.3 m.
   Fix: deck profiles re-derived on the rendered mesh. Approaches now follow the terrain. Client and
   backend use the same rule.
3. **The DTM has bridges removed.** Every underpass, culvert and small bridge is an open trench in the
   ground model. At-grade ways crossing above them (OSM `tunnel=yes` on the lower way, no `bridge`
   tag above) were draped into the trench: motorways fell 5–6 m, Ståthögavägen's service road 5.6 m.
   Screenshot 1.
   Fix: 83 engineered spans bridge the trenches, from tunnel/stream crossings or the DTM signature.

Generic rail bridges at Ståthögavägen had invented piers every 9 m, standing on the road below. Piers are
now limited (section 3.5); deck reconstruction is Step 4.

### 1. Root cause per screenshot, with locations

Coordinates are SWEREF 99 TM (E, N), scene = (x, z).

| # | Location | Observed | Root cause | Kind |
|---|---|---|---|---|
| 1 | Ståthögavägen under Södra stambanan, E 569 210 N 6 495 914 (scene 7.2, −37.0). Service road way 89617052 over the Ståthögavägen tunnel (ways 39445117 / 89615815) | Dark winding road crossing Ståthögavägen at the bottom of a trench; triangular depression; rows of columns under the rail bridges | (a) The DTM shows the underpass as an open trench (bridge decks removed), and the at-grade service road 20 m south of the tracks was draped into it: 5.57 m deep, rims 2.85 / 2.82 m. (b) Generic bridge piers every 0.36 units (9 m), two per position, on every parallel rail bridge way, wherever the deck was 1.5 m above the ground; in the trench they stood on Ståthögavägen | (a) construction: the DTM is correct but was used as the road surface; (b) construction: invented structure |
| 2 | Hamnbron, E 569 412 N 6 495 482, detailed bridge way 501428838 | Beige terrain wedge over the approach lanes; overlapping road surfaces at the junction | Approach segments with one profiled end were linear between the deck end (from the old 10/40 m mesh plus 6 m layer lift) and the far node, so the terrain between them rose above the road. Junction fans of linear and draped segments overlapped at different heights | Construction (profile data and rule) |
| 3 | Footbridges over water: E 571 193 N 6 494 620 (way 104245498) and Industrilandskapet, e.g. E 568 429 N 6 494 920 (way 1212234772) | Deck ends "disconnected" from the shore; deck apparently under water | The draped water rose towards the banks, above the deck ends: 75 decks within 0.5 m of the drawn water, worst 1.68 m **under** it. The decks themselves met their paths (0 junction steps) | Rendering of water (water had no level) |
| 4 | Saltängsbron, E 568 906 N 6 495 419, way 501428827 | Bridge "submerged"; water between the road and the far railing | Same draped-water cause at the abutments, plus the deck 1.1 m low (old profile). The band seen at grazing angles is the open water beside the deck; close up, the deck is intact | Water rendering + estimated profile |
| 5 | Holmen riverbank, E 568 723 N 6 495 346 | Triangular, faceted water and bank | Water draped on large mesh triangles (water tolerance 2.25 m) spanning water and bank nodes | Water rendering; the 5 m grid cannot represent quay walls (DTM limit) |
| 6 | Strömmen at Gamlebro, E 568 821 N 6 494 939. Nearest view; the exact camera could not be recovered | Buildings and land standing in faceted water | Draped water climbing walls and banks. Numerically only 1 building has more than 10 % of its footprint in measured water (way/1355629338, E 567 672 N 6 494 769, 75 %; likely a mill or hydropower structure, to be verified against imagery) | Water rendering |

Not every defect had the same cause. Rendering artefacts (draped water) and construction errors
(profiles, trenches, piers) dominate. The DTM itself was correct everywhere it was inspected. It is
hydro-flattened over water, bridges are removed by design, and it agrees with class 9 to 0.02–0.13 m.

### 2. How each system builds its geometry (diagnosis)

- **Adaptive terrain mesh:** unchanged (Step 3 RTIN, 5 m floor).
- **Roads, paths, rails** (`cityMesh.ts` `strip`): draped on the mesh triangles with the segment's end
  offsets interpolated along it. Linear only for decks.
  - Before: a segment was linear if *either* end had a profile point (approaches included).
  - Now: linear only if *both* ends have one (`terrain.linearBetween`).
  - Spans split a segment into draped and linear pieces (`networkPieces`).
- **Junction fans:** draped at nodes on the ground, flat at nodes on decks or spans.
- **Bridge decks:** `bridge-profiles.json` points, read identically by `terrain.ts` and `TerrainService.kt`.
  - Before: anchored on a replica of the pre-Step-3 10/40 m mesh, plus the flat-scene layer lift
    (+6 m per OSM layer).
  - Detailed bridges (`cityBridges.ts`) follow their lanes' profile.
- **Water** (`cityMesh.ts` `buildTerrain`):
  - Before: every OSM water polygon was draped at `terrain.waterHeight`, which is the DTM ground,
    because no water tile exists.
  - Banks were 1 m quads below the draped water.
- **Buildings:** lowest rendered ground under the footprint (unchanged).
- **Depth precision:** layer ranks (Step 2) order coplanar ground layers. No z-fighting cause was found
  among the six defects; the "overlapping surfaces" at Hamnbron were real height differences.

### 3. Corrections implemented

**3.1 Water at measured levels.**
`scripts/prepare-water-reaches.py` (pass 1, 25 s) and `scripts/prepare-water-reaches.mjs` (pass 2, 2 s)
produce `src/lib/data/water-reaches.json` (306 KB). The client reads it in `waterReaches.ts`.

- **Reach extent:** flat regions of the native 1 m DTM inside the OSM water mask, on a 2 m grid. A region
  has neighbouring cells within 3 cm and at least 400 m². Lantmäteriet's DTM is hydro-flattened over
  water.
- **Reach level:** median LiDAR class 9 return when at least 25 cells exist (55 reaches); otherwise the
  flattened DTM level, flagged `dtm-hydroflattened` (16 reaches, all small).
  The DTM level and class 9 agree within 0.02–0.13 m wherever both exist.
- **Sea and tidal river:** 15 flat regions below 1 m in the sea polygon are drawn at **+0.14 m** (SMHI
  2021–2025 mean, your decision). The scan-day level (0.21–0.50 m; two flight days) is recorded per reach.
- **Cutting the polygons:**
  - Each OSM polygon is cut exactly with `polygon-clipping`. The OSM shoreline is kept; reach boundaries
    inside the river are simplified (3 m).
  - A water cell never joins a reach more than 0.3 m above its own DTM surface, so falls step at their
    crest.
  - Sloping water that fits no reach (side channels, cascades) is `draped`: it follows the terrain as
    before.
  - Dry banks inside OSM polygons (DTM more than 0.5 m above the level, at least 4 m wide and 50 m²,
    touching the outline) are drawn as land, so the shoreline there is where the DTM meets the water.
  - 87 narrow or sloping polygons without a flat DTM surface stay draped, flagged `unmeasured`.
- **Faces:**
  - Shoreline edges get a vertical bank/quay face from 1 m below the water up to the ground, or up to
    the water where the land is lower, so there are no gaps.
  - Fall edges get a fall face.
- Motala ström reaches, centres:

| Reach | Level m RH2000 | Source | Class 9 p10–p90 | Centre E, N |
|---|---|---|---|---|
| r9 | 21.99 | class 9 (313 k cells) | 21.95–22.03 | 562 419, 6 496 379 |
| r19 | 21.97 | class 9 | 21.87–22.03 | 563 930, 6 494 986 |
| r17 | 19.13 | class 9 | 18.94–19.42 (sloping) | 566 535, 6 495 148 |
| r32 | 18.66 | class 9 | 18.64–18.69 | 568 079, 6 494 781 |
| r28 | 15.69 | class 9 | 15.66–15.73 | 568 263, 6 494 885 |
| r27 | 12.12 | class 9 | 12.10–13.32 | 568 549, 6 494 928 |
| r30 | 3.94 | class 9 | 3.67–4.78 | 568 829, 6 494 864 |
| r16 (river below the falls) | 0.14 (scan day 0.50) | SMHI mean | 0.47–1.79 | 569 617, 6 495 544 |

**Uncertainty:**
- Levels are a 2020 scan-day snapshot; regulated reaches vary with discharge, and no gauge data exists
  for the river reaches.
- r17 slopes about 0.5 m within the reach (rapids) and is drawn flat at its median.
- The falls between r30 and r16 are steep cascades and are partly drawn as draped water.

**3.2 Network profile rules v4** (`scripts/prepare-bridge-profiles.py`; client `terrain.ts`, `mapModel.ts`,
`cityMesh.ts`; backend `TerrainService.kt`).

- **Deck ends:** on the highest rendered ground within 10 m outward along the bridge axis, without the
  layer lift. This anchor was chosen by testing against LiDAR class 17 on the generic decks of the central
  tiles:

| Anchor | Mean | RMSE |
|---|---|---|
| Old profile | +0.66 m | 3.18 m |
| Ground at the end node | −1.14 m | 1.63 m |
| Highest ground within 5 m | −0.44 m | 0.77 m |
| **Highest ground within 10 m (chosen)** | −0.30 m | 0.61 m |

  The DTM at an OSM bridge end often already lies on the slope into the removed-bridge gap.
- **Interior nodes:** linear between the ends. Pedestrian bridge networks are solved between their land
  connections, as before.
- **Constraints** (308 nodes raised, at most 5.6 m):
  - never below the rendered ground;
  - at least 0.5 m above measured water;
  - generic bridges only: clearance over crossed at-grade ways (road 4.5 m, service 3.0 m, rail 5.5 m,
    tram 5.0 m, path 2.5 m; normal Swedish values, **not surveyed**).
  - Detailed bridges are lifted as a whole, so all lanes keep one profile. They get no crossing
    clearance: against LiDAR class 17 that clearance lifted Saltängsbron 1.5 m too high, because the
    quay paths drawn beneath its ends pass beside it.
- **Approaches:** a segment with one profiled end follows the terrain, with the end offsets tapered along
  it. This is identical in the backend, so vehicles stay on the drawn surface.

**3.3 Engineered spans** (`bridge-profiles.json` `spans`, keyed by a segment's end nodes; 83 spans on 165
segments).

- **Where:** an at-grade road, rail, tram or path crossing an OSM tunnel or stream. Tunnel ways are
  extended 15 m, because OSM underpasses often stop short of parallel tracks.
- **Geometry:** the way's own profile is replaced by its upper hull, using the narrowest window
  (15–40 m) whose rims lie inside it.
- **Acceptance:** the dip must be at least 0.5 m deep and at most 80 m long.
- **Trench rule (roads and rails only):** a dip with the DTM signature of a removed bridge (2 m deep or
  more, 30 m wide or less, walls of 20 % or more) also qualifies.
- **Rejected:** spans containing a junction with another way (3 rejected; a shared node means the same
  level).
- **Rendering:** span sides get fascia beams, never piers.
- **Vehicles:** cars, trams and trains use the same spans (`profileHeight`). Rail routes keep their
  +0.018 offset on spans.
- **Coverage:** E4/motorway underpasses, Söderleden, Linköpingsvägen, Södra stambanan, Bravikenvägen
  (culvert, 4.6 m), the Ståthögavägen service road and others. `spanInfo` lists way, crossed ways, rims,
  length and depth for each span.

**3.4 Railway bridges (targeted only).** Generic piers are now:
- none on a bridge way of 30 m or less (a single span between abutments);
- otherwise about every 20 m instead of every 9 m;
- never on another way's corridor.

Overlapping parallel rail decks are not changed (Step 4).

**3.5 Diagnostics and dev overlay.**

- `src/lib/infraDiagnostics.ts` checks:
  - running surfaces below terrain (centre and edges);
  - junction steps;
  - steep grades, grade breaks and sags (sags under a bridge excluded);
  - deck clearance over water;
  - land below water at shorelines;
  - buildings in water;
  - missing DTM samples and duplicate bridge ownership.
- `scripts/geo/infra-diagnose.test.ts` writes a map-wide JSON report in 4.5 s.
- Dev server `?inspect=infra` shows pins coloured by defect kind, a console table and
  `globalThis.__infraIssues` with SWEREF coordinates.
  - It runs in about 3.4 s after the map is ready.
  - It is loaded by dynamic import behind `import.meta.env.DEV`; the production bundle contains none of it
    (verified).

### 4. Numerical validation (before = pre-Step-3.5 tree, after = this step; identical diagnostics code)

**Map-wide, `infraDiagnostics.ts`:**

| Check | Before | After |
|---|---|---|
| Deck/approach/span pieces below terrain > 5 cm | **523**, worst 5.27 m | **105**, worst 1.25 m (deck edges at quay walls; road/rail worst < 0.6 m) |
| Decks < 0.5 m above the drawn water | **75**, worst 1.68 m *below* | **0** |
| Drawn river/lake water vs measured level (24 911 samples, 10 m) | RMSE 0.20 m, max 6.87 m, 7.9 % > 0.25 m | 0 (flat at the level) |
| Sea vs scan-day level | −0.03 m | −0.28 m (by decision: 2021–2025 mean) |
| Sags > 1.5 m within ±25 m, per way, not under bridges | 134, worst 6.0 m | 73 (road/rail/tram 17, worst 3.15 m; the rest footpaths) |
| Junction steps > 5 cm | 6, worst 7.54 m | 5, worst 3.31 m (all the documented lifted-land-bridge nodes, Step 4) |
| Rail grade p99 / max (10 m windows) | 7.2 % / 43 % | 4.7 % / 35 % |
| Road grade p99 / max | 9.9 % / 65 % | 9.2 % / 52 % |
| Buildings with > 10 % of footprint in water | 3 | 1 |
| Shoreline vertices with land > 0.25 m below the water | 0 (water was the ground) | 181 (p01 −0.45 m; dam crests and harbour piers) |
| Dry banks inside OSM water polygons | n/a (draped) | 15.1 km → 8.7 km of 146.8 km shoreline (narrow strips kept as quay faces) |

**Bridge decks vs LiDAR class 17** (rendered surface, `scripts/geo/measure-elevation.test.ts`, mean / RMSE):

| Bridge | Before | After |
|---|---|---|
| Saltängsbron | −1.10 / 1.13 | −0.30 / 0.33 |
| Bergsbron | −0.09 / 1.00 | +0.23 / 0.30 |
| Hamnbron | −0.39 / 0.42 | −0.15 / 0.20 |
| Laxholmsbron | −0.68 / 0.70 | −0.18 / 0.20 |
| Gamlebro | −0.34 / 0.95 | −0.24 / 0.93 |
| Spången | −0.05 / 0.09 | +0.01 / 0.07 |
| Generic bridges, central tiles (n = 1 597) | −1.32 / 3.58, median \|e\| 2.58 m | −1.15 / 2.53, median \|e\| 0.23 m |

**Unchanged (verified):**
- Ordinary roads and paths vs the native DTM: paths RMSE 0.197 m, land cover and buildings identical.
- Cars ride 5 cm above the drawn asphalt at all 219 996 samples.
- 0 height jumps at 73 762 shared network nodes.
- Trains off bridges: Pendeln RMSE 0.30 → 0.20 m.

### 5. Screenshots (identical absolute cameras: `docs/step35/cameras.json`)

- **Folders:** `docs/step35/before/`, `after/`, and `compare/` (before | after, JPEG).
  - `s1-stathogavagen`, `s2-hamnbron-preset`, `s3-footbridges-east`, `s4-saltangsbron-*`,
    `s5-holmen-*`, `s6-gamlebro-river`: the six screenshot locations.
  - Also the falls (`falls-*`) and the Gamlebro, Laxtrappan, Bergsbron, Campus and Industry presets.
- **Changed pixels per view:** 0.4–14.7 % (`changed-pixels.json`).
- **Pinning:** cameras are pinned through the dev `__cityCamera` hook (`POSES=` in
  `capture-reference-views.mjs`).
- **Overlay:** `work/step35/inspect/` has the overlay at Industrilandskapet and Ståthögavägen.

### 6. Performance (same machine; before and after served side by side)

| | Before | After |
|---|---|---|
| Static triangles | 9 274 904 | **9 076 403 (−2.1 %)** |
| Water triangles | 369 691 | 143 965 |
| Vertex buffers | 1 224 MB | 1 198 MB |
| Geometries (draw groups) | 5 673 | 5 645 |
| Worker build: terrain / network / markings | 1 863 / 2 074 / 437 ms | 1 691 / 2 083 / 482 ms |
| Dev main-thread scene build (median of 3) | 837 ms | 866 ms (+29 ms: pier corridor grid, span lookups) |
| Production: map ready / geometry in scene (median of 3, alternating) | 5 342 / 3 165 ms | 5 026 / 3 273 ms (within run-to-run noise) |
| Production: longest upload frame | 1 036 / 1 156 / 2 030 ms | 1 492 / 1 588 / 1 498 ms (inconclusive; noise > difference) |
| JS heap | 132 MB | 135 MB |
| Settled frame time, uncapped (overview / city / campus / industry / parken / kungsgatan) | 12.9 / 5.4 / 3.5 / 1.8 / 2.3 / 1.6 ms | 13.0 / 5.6 / 3.7 / 2.0 / 2.3 / 1.7 ms |

- **Data:** `water-reaches.json` 306 KB (inlined in the main and worker bundles); `bridge-profiles.json`
  34 → 55 KB.
- **Unchanged:** Web Worker build, SWEREF 99 TM, RH2000 and the adaptive mesh.

### 7. Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **117 / 117** (14 files; 16 new in `src/lib/infrastructure.test.ts`; `elevation.test.ts` adapted: ordinary = no profiled end and no span) |
| `npm run build` | OK; the overlay is absent from `dist` |
| Backend `dev.ps1 test` | **40 / 40** (3 new in `NetworkProfileTest.kt`: Kotlin reproduces 1 644 client network heights for spans, approaches, decks, ordinary edges and rail routes) |
| `npx playwright test` | 2 / 2 against the backend on :8080 with the new revision (started for the test, stopped afterwards) |
| `infrastructure.test.ts` covers | ground-level road/terrain intersection, junction continuity, gradient discontinuities and sags, spans never across junctions, vehicles on decks/approaches/spans, water levels vs class 9, polygon tiling without gaps or overlaps, flat drawn water, bridge/water clearance, shoreline consistency, building/water conflicts, duplicate bridge ownership, the linear-deck contract, the shared client/backend fixture |

Note: on this machine vitest only runs from a path starting `C:\` (PowerShell). From the lowercase `c:\`
working directory every file fails with "Cannot read properties of undefined (reading 'config')": the
module is loaded twice because of the drive-letter case.

### 8. Files

**UI, modified:**
- `src/lib/terrain.ts`: `spans`, `linearBetween`, `profileHeight` rules v4.
- `src/lib/mapModel.ts`: linear flag, spans.
- `src/lib/cityMesh.ts`: flat water, banks, falls, dry banks, `networkPieces`, span-aware strips, fans
  and markings.
- `src/lib/cityBridges.ts`: span fascias, pier policy.
- `src/lib/Scene.svelte`: dev overlay hook.
- `src/lib/elevation.test.ts`.
- `scripts/prepare-bridge-profiles.py`: rewritten, rules v4.
- `scripts/geo/rtin.py`: `SURFACE_RULES` v4.
- `scripts/capture-reference-views.mjs`: `POSES=`.
- `ELEVATION.md`.
- Data: `bridge-profiles.json`, `terrain.json` (revision only), `buildings-3d.json` (revision).

**UI, new:**
- `src/lib/waterReaches.ts`, `src/lib/infraDiagnostics.ts`, `src/lib/inspectInfra.ts`,
  `src/lib/infrastructure.test.ts`
- `src/lib/data/water-reaches.json`, `src/lib/geo/network-profile-control.json`
- `scripts/prepare-water-reaches.py`, `scripts/prepare-water-reaches.mjs`
- `scripts/geo/infra-diagnose.test.ts`, `infra-profile-control.test.ts`, `vitest.infra.config.ts`,
  `water_levels_study.py`
- `docs/step35/`

**Backend:**
- `TerrainService.kt` (spans, `linearBetween`, `profileHeight`, lenient profile JSON)
- `resources/bridge-profiles.json`, `resources/terrain.json`
- new `NetworkProfileTest.kt` and `test/resources/network-profile-control.json`

**Reproduce** (geodata Python, see ELEVATION.md):

```
python scripts/prepare-water-reaches.py && node scripts/prepare-water-reaches.mjs
python scripts/prepare-bridge-profiles.py              # client + backend profiles, revision
npx vitest run -c scripts/geo/vitest.infra.config.ts   # diagnostics report + shared fixture
```

**Roll back Step 3.5 only:**
1. Copy back `work/step35/before-snapshot/` (`src/…`, `scripts/…`, `backend-src/…`).
2. Delete the new files listed above.
3. Remove the `ELEVATION.md` section.

`work/step35/before-app/` is a runnable copy of the pre-Step-3.5 app. Remove its `node_modules` junction
with `rmdir` before deleting the folder.

### 9. Remaining issues and assignment

**Step 4 — bridges from LiDAR class 17:**
- Generic decks are still estimates: central tiles median |e| 0.23 m but p95 5.8 m. Examples: rail way
  89746083, whose structure extends beyond the OSM ends; the Spiralen car park ramps, E 569 240 N 6 494 839,
  with grades up to 52 %.
- Gamlebro RMSE 0.93 m.
- Overlapping parallel rail decks at Ståthögavägen.
- The five two-level junction nodes (lifted land bridges meeting ways below).
- Crossing clearances are estimates.
- 105 deck pieces whose edges touch the 5 m terrain slope at quay walls, worst 1.25 m (footbridges in
  Industrilandskapet).

**Step 5 — tram/train alignment:**
- Transit route points on bridges carry the legacy 6 m layer lift and miss the deck profile keys.
- Pendeln and tram vehicles on bridges ride 2.3 m above the drawn rails on average (RMSE 3.8 m; was mean
  0.9 / RMSE 3.9 m).
- Rails remain 0.25 m above the ballast.
- Rail sag of 1.6 m on Södra stambanan near Ståthögavägen (way 177890714).

**Step 6 — water:**
- Regulated levels vary with discharge; scan-day snapshot only.
- r17 is a sloping reach drawn flat.
- 87 unmeasured and 117 draped stream parts still follow the 5 m terrain.
- 181 shoreline vertices where land is lower than the adjacent water: dam crests at r27/r30 (vertical
  faces, physically plausible) and harbour piers (−0.5 to −0.7 m).
- Dry-bank strips narrower than about 4 m are kept as quay faces.
- way/1355629338 stands in the water; verify against an orthophoto.
- No quay-wall breaklines in the terrain: quays remain a 5 m slope behind the vertical face.

**Other:**
- Remaining road sags:
  - Linköpingsvägen 3.15 m, E 566 441 N 6 494 195. The DTM shows a narrow cutting with a path tunnel
    beside the road. The 15 m tunnel extension did not yield an accepted span; the cause is not yet
    confirmed.
  - Folkborgsvägen 2.91 m. A span was rejected because a junction lies inside it.
- The underpass trench itself is still visible beside spanned ways (correct: it is the open cutting).

---

## Status (2026-10-18): Step 3 COMPLETE — waiting for approval

Step 3 (adaptive terrain mesh) is implemented and verified; full report in **`docs/terrain-step3.md`**.
Work has **stopped**. Bridge reconstruction (Step 4) needs explicit approval.

**Open decision:** geometry budget. The active mesh (`bu0.4-0.75`) costs +43 % static triangles and
+367 MB vertex memory. It is the cheapest measured option that does not worsen Industrilandskapet/Campus
or the old 10 m centre. Option A (+13 %) is one command away (report, section 8).

**Result (rendered geometry vs native 1 m DTM):**
- ordinary roads RMSE 0.56 → 0.16 m (max 26.4 → 2.3 m);
- paths 0.67 → 0.20 m; rail ballast 0.78 → 0.18 m;
- buildings vs footprint minimum 0.54 → 0.16 m;
- all native land pixels 1.17 → 0.32 m; Industrilandskapet + Campus 0.233 → 0.166 m.

**Design:**
- RTIN over the existing 5 m DTM nodes (320 m → 5 m), refined against every native pixel with per-class tolerances.
- Conforming: no cracks or T-junctions.
- One split bit per node in `terrain.json` `mesh`, read identically by `surfaceMesh.ts` / `terrain.ts` and `TerrainService.kt`.
- Draped layers take the leaf planes.
- Web Worker architecture unchanged; worker builds are slightly faster.

**Tests:** `npm run check` clean; `npm test` 101/101; build OK; backend 37/37; e2e 2/2 (own backend on :8091).

**Action for the user:** restart the Ktor backend (:8080). Its resources now hold revision `…-surface-32977b9c2915`.

---

## Current status (2026-10-18): Step 2 COMPLETE — waiting for approval

Step 1 (coordinate system) and Step 2 (legacy elevation offsets removed) are implemented and verified.
Work has **stopped**. Bridge reconstruction (Step 4) and full tram/rail elevation correction (Step 5) need
explicit approval, as do Step 3 (terrain mesh / road profiles) and Step 6 (water).

**Action for the user:** restart your Ktor backend (the one running from IntelliJ on :8080). It still serves
the previous terrain revision, so the client shows "Ansluter till Ktor… Starta om backend" until restarted.

### User decisions in force (2026-10-18)
- Canonical CRS SWEREF 99 TM (EPSG:3006); Three.js scene = local frame relative to a fixed SWEREF 99 TM origin.
- No metres-per-degree constants. True north handled separately from the grid.
- Water (later step): coast/harbour default +0.14 m RH2000 (2021–2025 mean, Juten-Djurökvarn, verified from
  SMHI open data); scan-day +0.48 m kept as a historical option; Motala ström never one global level; no
  guessed river levels.
- Do not commit or push without permission. Preserve all uncommitted work.
- Step 2 (approved 2026-10-18): remove legacy offsets from ordinary roads, paths, land cover, buildings and
  ground-level rail; do not force bridge decks / elevated roads onto terrain; preserve bridge geometry and
  measured references for Step 4; no new floating/underground vehicles; no destructive git commands.

---

## Step 2 final report — legacy elevation offsets (2026-10-18)

### 1. Legacy offsets removed and their original purpose

The pre-DTM scene was flat. It separated its layers by height above a ground plane at −0.02 units
(1 unit = 25 m). On the measured DTM those layer gaps became metres of artificial lift.

| Legacy offset | Original purpose | Lift on the DTM | Now |
|---|---|---|---|
| Road level 0.071 + asphalt 0.006 (`terrain-levels.json`, `roadHeight` `max(0.071, y)` + 0.02) | Draw streets above lawns in the flat scene | +2.27 m kerb, +2.43 m asphalt | Asphalt, kerb, paths, ballast and markings on the rendered DTM; `roadHeight` removes 0.097 units from every network height |
| Path 0.007, markings 0.009, ballast −0.008 above the road level | Layering of thin strips | +2.45 / +2.5 / +2.1 m | On the DTM, ordered by depth rank |
| Land-cover levels 0.003–0.04 (`buildTerrain`) | Stack farmland < residential < … < apron | +0.57 to +1.5 m | On the DTM, ordered by depth rank |
| Bank top 0.024 | Visible quay edge above the water plane | +1.1 m | Measured ground at the shoreline |
| Building base `relativeHeight(first vertex, 0.045)` | Building floor above the flat land cover | +1.62 m at the first ring vertex (29.5 % of buildings > 2 m above their lowest ground) | Lowest rendered ground under the footprint (exact for the mesh); OSM / Simple 3D Buildings heights are from the lowest ground contact |
| Tree base 0.025 | Trunks standing on the flat grass | +1.1 m | Trunks start on the ground |
| Hand-made models (platforms 0.077/0.083, station 0.06, terminal 0.065, stadium 0.06, runways 0.08–0.09, pitches 0.075, Grand Hotel 0.075, Holmen 0.025, landmark towers 0) | Built on top of the flat street or lawn | +0.5 to +2.5 m | `placeLegacy`: each model keeps its design height above the surface it was modelled on, now the DTM (or its building's footprint minimum) |

**Deliberately kept (with reasons):**
- *Elevated lifts above the road level:* land-bridge `layer × 0.24` lifts, and rail rises at underpasses. These are elevated infrastructure, reserved for Step 4.
- *Shape of the estimated bridge deck profiles:* `bridge-profiles.json` is unchanged. The profiles were anchored at "approach ground + legacy road level", so the same 0.097 network drop applies to them, and every bridge still meets its approach road with no step.
  - Keeping decks at their old height instead would have added 15 % median extra grade to 443 approach segments, 39 % of them over 20 % (59 of those segments are tram or rail).
- *Rail top +0.016 above the network reference:* rails stay 0.25 m above the street, as before relative to the asphalt. Vehicles ride 0.002 above the rail top (route data and backend logic unchanged; Step 5).
- *Water surfaces:* unchanged (Step 6).
- *Camera presets:* unchanged, so before and after screenshots use identical camera positions.

**Ordering without metres.**
- Coplanar ground layers carry a depth rank: per vertex in `uv.x` for the worker-built city layers (one shader variant, `groundLayers.ts`), and through GL polygon offset for hand-made pavements and pitches (no extra shader programs).
- The camera near plane now scales with the camera's height above the terrain (2 %, minimum 0.015, maximum 10). The overview depth step drops from about 16 m to a few cm.
- Ground-level pavements and playing surfaces (runway, taxiways, pitches, ice rink) are built on the terrain grid itself (`groundRectangle`). Junction fans and markings are draped exactly.

### 2. Files changed

**UI, modified**
- `src/lib/terrain.ts`: `LEGACY_LEVELS`, `ROAD_SURFACE`, `placeLegacy`, `footprintGround`, `measured`; DTM `roadHeight` drop.
- `src/lib/cityMesh.ts`:
  - ranks, `surfaceAt`, exact junction and marking draping, `buildingBase`;
  - markings moved to the buildings worker task to keep the startup critical path;
  - `LAYER_BUILDERS`.
- `src/lib/mapView.ts`: layered materials, trees.
- `src/lib/FreeCamera.svelte`: dynamic near plane; floor kept 2.6 m above the street.
- `src/lib/placeBuilder.ts`: `standsOn` / `base`, `drape`, `groundRectangle`, ranked surfaces.
- `src/lib/cityPlaces.ts`: station and terminal on their footprints; pitches, rink and platforms draped.
- `src/lib/riverfrontDetails.ts`: Grand Hotel and Holmen on their footprints.
- `src/lib/mapLandmarks.ts`: per-object supports; airport pavements on the terrain grid.
- `src/lib/cityBridges.ts`: deck fallback uses `roadHeight`.
- `src/lib/cityStructures.test.ts`: Ingelsta rail assertion now checks the measured cut floor.
- `ELEVATION.md`: new "Höjdlager på DTM" section.
- `scripts/prepare-dtm.py`, `scripts/prepare-bridge-profiles.py`: `SURFACE_RULES = 'surface-grid-10-40-v2-dtm-layers'` (revision salt), plus docstring.
- `scripts/capture-reference-views.mjs`: `HIDE_BANNER` option.

**UI, new**
- `src/lib/groundLayers.ts`
- `src/lib/elevation.test.ts` (7 tests)
- `src/lib/geo/elevation-control.json`: 3 300 network, 2 000 land-cover and 600 building native-DTM fixtures.
- `scripts/geo/elevation_samples.py`, `scripts/geo/deck_points.py`, `scripts/geo/measure-elevation.test.ts`, `scripts/geo/vitest.measure.config.ts`
- `docs/elevation-step2/`: screenshots and performance JSON, 34 MB.

**Data**
- Terrain revision `lm-dtm-8eccbc3691700b78-surface-b8b8bb215874` → `…-surface-a26967db6d14`, updated in `src/lib/data/terrain.json`, `src/lib/data/buildings-3d.json` and the backend `terrain.json`.
- No geometry or height values in any data file changed. `bridge-profiles.json` is untouched.

**Backend**
- `TerrainService.kt`: `LEGACY_*` constants, `placeLegacy`, DTM `roadHeight` drop.
- `RegionalFlight.kt`: aircraft ground positions relative to the runway pavement.
- New `ElevationLayersTest.kt` (4 tests).

### 3. Measured elevation errors, before → after (metres)

Rendered geometry, sampled with vertical rays through the real worker meshes, against the native Lantmäteriet 1 m DTM (bilinear). "Ordinary" means more than 25 m from any bridge, tunnel or lifted segment.

| Surface | n | Mean | RMSE | p95 abs |
|---|---|---|---|---|
| Road (asphalt) | 243 798 | +2.458 → **+0.008** | 2.522 → **0.562** | 3.21 → 1.09 |
| Path | 161 901 | +2.466 → **+0.017** | 2.554 → **0.666** | 3.45 → 1.39 |
| Rail ballast | 18 170 | +1.922 → **−0.161** | 2.071 → **0.784** | 2.85 → 1.76 |
| Rail top | 18 558 | +2.492 → +0.077 | 2.608 → 0.767 | 3.42 → 1.70 |
| Tram street surface | 4 950 | +2.434 → **+0.014** | 2.438 → **0.135** | 2.63 → 0.28 |
| Tram rail top | 10 515 | +2.680 → +0.255 | 2.694 → 0.380 | 3.01 → 0.61 |
| Farmland / residential / industrial | ~2–4 k each | +0.62 / +0.54 / +0.69 → +0.04 / −0.10 / +0.02 | 0.66 / 0.89 / 0.95 → 0.24 / 0.72 / 0.65 | |
| Grass / wood / pitch / apron / square | ~1–4 k each | +1.01 / +0.92 / +1.47 / +1.48 / +0.86 → −0.02 / −0.15 / +0.09 / −0.02 / +0.01 | 1.16 / 1.54 / 1.53 / 1.49 / 0.88 → 0.57 / 1.24 / 0.44 / 0.11 / 0.16 | |
| Building wall bottom vs lowest DTM in footprint | 12 490 | +1.966 → **−0.047** | 2.129 → **0.543** | 3.26 → 1.08 |

- **Buildings more than 1 m / 2 m above their lowest ground:** 96.7 % / 32.3 % → **2.4 % / 0.1 %**.
- **What the remaining RMSE is:** after the change, the rendered surface on ordinary roads differs from the native DTM by RMSE 0.563 m (roads) and 0.668 m (paths). These equal the road and path rows above, so all remaining error is the 10 m / 40 m terrain mesh (Step 3). The bias is gone.
- **Continuity:** 0 height jumps at shared nodes (36 420 road, 32 589 path, 2 570 rail and 2 183 tram nodes). Six OSM nodes join a lifted land bridge to a path or road below; these are two-level crossings, unchanged.
- **Vehicles, unchanged:**
  - cars +0.050 m above the drawn asphalt (219 996 samples);
  - off bridges, tram line 2 +0.05 m, tram line 3 +0.06 m, Pendeln +0.02 m mean above the rail top.
  - On bridges the existing mismatch is unchanged (Step 5).

**Bridge decks vs LiDAR class 17** (highest drawn network surface; the profiles are still estimated linear decks):

| Bridge | n | Mean | RMSE | Max abs |
|---|---|---|---|---|
| Hamnbron | 521 | +2.00 → −0.39 | 2.01 → **0.43** | 2.45 → 2.11 |
| Saltängsbron | 434 | +1.30 → −1.10 | 1.33 → **1.13** | 2.15 → 1.40 |
| Bergsbron | 302 | +2.33 → −0.09 | 2.53 → **1.00** | 2.99 → **4.97** |
| Gamlebro | 62 | +2.02 → −0.38 | 2.27 → **1.12** | 3.40 → **5.85** |
| Laxholmsbron | 42 | +1.71 → −0.68 | 1.72 → **0.70** | 2.20 → 0.87 |
| Spången | 18 | +2.40 → −0.05 | 2.40 → **0.09** | 2.55 → 0.14 |
| Other (generic bridges) | 1 597 | +1.33 → −1.04 | 3.44 → 3.35 | 9.01 → 7.42 |

RMSE improved on every measured bridge. The maximum error grew at Bergsbron's west end and at one end of Gamlebro. There the straight-line estimated approach profile was already 2.5 m below the real deck and is now 4.9–5.9 m below it; Step 4 replaces these profiles with LiDAR.

### 4. Remaining known errors

1. **Terrain mesh (Step 3).**
   - Rendered vs native DTM: RMSE 0.56 m on roads and 0.67 m on paths. Rail corridors are 0.16 m too low on average, because embankments are flattened.
   - Worst single point: 26 m (a steep face in the 40 m zone). It was 23.9 m before, because the old +2.4 m lift partly hid it.
2. **Bridge decks are still estimated linear profiles (Step 4).**
   - Saltängsbron is −1.1 m (the crown is missing). Bergsbron's west end and Gamlebro are up to −5 to −6 m.
   - Bergsbron's fixed arch model now springs 1.7 m under the water: the model is 7 m deep, while the real deck is about 5 m above the water.
   - Land-bridge layer lifts (+6 m) and their steep approach ramps remain.
3. **Laxtrappan footbridges.**
   - Their shifted decks (2.0–3.5 m) sit 0.8–2.4 m above the LiDAR class 9 water (0.7–1.2 m) but below the drawn "water". That surface is the 10 m terrain mesh smoothed across a narrow channel (Step 3/6).
4. **Rails and trams (Step 5).**
   - Rails sit 0.25 m above the street or ballast, where reality is about 0 m for grooved tram rails and about 0.17 m on ballast. Vehicles are 5 cm above the rails.
   - On bridges, vehicles still ignore the deck profile: tram line 2 RMSE 2.7 m, Pendeln 3.2 m.
5. **Flat hand-made models.** Platforms, the stadium and buildings are rigid. On slopes their sides may meet the terrain a few dm differently. Platforms and pitches are draped.
6. **Tunnels.** OSM tunnel and underpass roads now lie on the DTM like ordinary roads. The +1.97 m mean of the road-tunnel samples comes from the vertical rays hitting the rail deck above the underpass, not from the road itself. Long tunnels under hills would be drawn on the surface; none were examined in Step 2.
7. **Overview depth bias.** Depth ranks scale with distance. At the overview, a 15-rank stack corresponds to under 1 m.
8. **Water.** Unchanged (Step 6). River water is draped on the mesh as sloped facets, as before.

### 5. Screenshots

- `docs/elevation-step2/before/views` and `after/views`: 24 fixed presets, identical cameras, no backend, banner hidden.
- `docs/elevation-step2/compare`: before | after | 4× difference.
- Industrilandskapet: `industry.png`. Campus: `campus.png`.
- `docs/elevation-step2/after/traffic`: following a car, bus, tram and train on the new backend.
- Captures were checked by eye. Two problems the screenshots revealed were fixed before this report: the airport runway and taxiways cut by the terrain, and pitches showing land-cover patches.

### 6. Test results

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | 82 / 82, 13 files (7 new in `elevation.test.ts`; 1 existing assertion updated) |
| `npm run build` | OK |
| Backend `dev.ps1 test` | 35 / 35 (4 new) |
| `npx playwright test` (own backend instance on :8091 with the new revision) | 2 / 2 |

### 7. Performance impact

Same machine, alternating before and after runs. The before code was served from a snapshot.

| Metric | Before | After |
|---|---|---|
| Dev map ready (median of 5) | 1 829 ms | 1 925 ms (+5 %) |
| Production ready (median of 5) | 3 929 ms | 4 149 ms (+5.6 %) |
| Main-thread scene build | 739 ms | 819 ms |
| Triangles (city view) | 4.86 M | 5.09 M (+4.6 %) |
| Draw calls | 3 390 | 3 473 |
| JS heap (production) | 115.3 MB | 116.0 MB |
| Settled frame time (120 frames) | | unchanged in all six views: city about 6.1 ms, overview about 11 ms |
| Worker build, network task | 1.80 s | 2.25 s |

- **Why the network task is slower:** exact draping of junction fans and markings.
- **Recovered:** markings moved to the buildings worker, so terrain (about 2.1 s) and network are now level. Pavement ordering uses polygon offset, so no extra shader programs compile; shader compile time is 1 271 → 1 296 ms.
- **Not taken:** a 1 cm fan tolerance would save 140 k triangles but let land cover show through junctions at close range.
- **Preserved:** Web Worker build, transfer, chunking, binary DTM and data sharing are unchanged.

### 8. Validation and rollback

- **Validate:**
  - `npm run check`, `npm test`, `npm run build`
  - backend `.\dev.ps1 test`
  - full measurement: `python scripts/geo/elevation_samples.py`, then `npx vitest run -c scripts/geo/vitest.measure.config.ts` → `work/elevation-step2/measure.json`
- **Roll back Step 2 only:**
  1. Copy the pre-Step-2 versions of exactly the modified files from `work/elevation-step2/before-snapshot/` (UI `src/…`; backend `backend-src/…` → `../norrkoping-simulator-backend/src/…`).
  2. Delete the new files listed in section 2.
  3. Revert `SURFACE_RULES` to `'surface-grid-10-40-v1'` in the two prepare scripts.
  4. Remove the `HIDE_BANNER` line from the capture script.

  Do not use `git checkout`: these files also hold Step 1 and the user's earlier uncommitted work.
- **Untracked folders:** `work/` is not ignored by git (only `work/geodata/` is): `work/elevation-step2` (snapshot 60 MB, samples 32 MB) and `work/coordinate-migration-backup`. Do not `git add` them.

---

## Step 1 final report

### 1. Coordinate errors corrected
| Error (verified in the audit and re-verified) | Before | After |
|---|---|---|
| Hard-coded 58 010 m/° longitude, 111 133 m/° latitude (the latter is the 45° value) | scale −0.253 % E–W, −0.229 % N–S | removed; Gauss–Krüger SWEREF 99 TM |
| Distance scale vs GRS80 geodesics (Lantmäteriet tile-corner pairs) | 0.99616 … 1.00134 | 0.999986 … 1.000020 |
| Landmark distances vs geodesics (36 pairs, test) | worst > 2·10⁻³ | all < 3·10⁻⁵ |
| Position drift from geodesic truth at map edges | up to 25.2 m (mean 12.3 m) | scene ≡ SWEREF 99 TM by definition (series error < 1 mm) |
| E–W scale varying with latitude (equirectangular) | 0.99648 S edge … 0.99918 N edge | conformal; ±1.1·10⁻⁵ over the map |
| DTM sampled through a WGS84 round trip | scene → WGS84 → TM | scene → TM directly (similarity transform) |

Source metadata re-checked: DTM GeoTIFFs and LAZ are EPSG:5845 = SWEREF 99 TM (GRS 80, CM 15°, k0 0.9996,
FE 500 000) + RH2000, 1 m pixels on integer metre grid. Independent reference points:
Lantmäteriet SWEPOS report point G5TA (implementation error 0.54 mm = print rounding), 53 Lantmäteriet STAC tile
corners (3.8 µm), PROJ (4.6 µm). Full report: `docs/coordinate-migration/verify-projection.json`.

**Scene contract (terrain dataset version 2):**
```
x = (E − 569030)  / (25 · 0.9996584126)   east
z = (6494989 − N) / (25 · 0.9996584126)   south      (E, N in SWEREF 99 TM)
```
0.9996584126 = SWEREF 99 TM point scale factor at the origin (verified vs PROJ to 3·10⁻¹¹), so 1 unit = 25
ground metres. Height reduction to the ellipsoid (~8 ppm) is neglected. Grid north = −z; true north is 1.0135°
west of grid north (`gridConvergenceDegrees = −1.0134914515`, `terrain.trueNorth`). Origin = legacy origin
rounded to the metre (58.589809 N, 16.187465 E), so the 10 m fine-mesh zone stays centred on the same place.
RH2000 heights unchanged (vertical scale still metres / 25).

### 2. Files and datasets modified
UI repository (`norrkoping-simulator-ui`):
- New: `src/lib/geo/sweref99tm.js` (projection + scene contract), `src/lib/geo/reference-points.json`
  (independent fixtures), `src/lib/coordinateSystem.test.ts` (18 tests), `scripts/geo/` (`sweref99tm.py`,
  `verify_projection.py`, `legacy-frame.mjs`, `migrate-to-sweref.mjs`, `compare_views.py`),
  `scripts/capture-reference-views.mjs`, `docs/coordinate-migration/` (before/after screenshots, composites,
  benchmarks, audits), this file.
- Code: `src/lib/terrain.ts` (GeoReference v2, project/unproject/fromSweref/toSweref/trueNorth),
  `src/lib/mapModel.ts` (camera presets migrated; overview cameras oriented to true north),
  `src/lib/mapLandmarks.ts` (police tower/solar panels), `src/lib/cityMesh.ts` (airport + bank-colour boxes),
  `src/lib/ingelstaTerrain.js` (trench axis), `src/lib/city.ts` (legacy hubs).
- Tests updated: `src/lib/mapModel.test.ts`, `src/lib/bridgeOwnership.test.ts` (legacy coordinates).
- Tools: `scripts/import-norrkoping.mjs`, `scripts/import-city-bridges.mjs`, `scripts/import-city-places.mjs`,
  `scripts/prepare-dtm.py` (+ `--keep-bridge-profiles`), `scripts/prepare-lidar-terrain.py`,
  `scripts/audit/common.py`, `scripts/audit/a5_positions.py`.
- Data (`src/lib/data/`): `norrkoping-map.json`, `transport-network.json`, `bridge-profiles.json` (keys only),
  `city-bridges.json`, `city-places.json` (regenerated from OSM source), `terrain.json` (regenerated from native
  DTM), `buildings-3d.json` (revision), `training-pitch.json`, `ingelsta-bridge.json`.
- Docs: `README.md` (Koordinatsystem), `ELEVATION.md`, `DATA-LICENSE.md`.
- Generated staging: `work/geodata/lantmateriet/dtm/prepared/*` (git-ignored).

Backend repository (`norrkoping-simulator-backend`):
- New: `Sweref99Tm.kt`, `Sweref99TmTest.kt` (3 tests).
- Modified: `TerrainService.kt` (GeoReference v2, SWEREF projection), `CityMap.kt` (places/hubs migrated),
  `TerrainServiceTest.kt`, `CityMapTest.kt`, resources `terrain.json`, `transport-network.json`,
  `bridge-profiles.json`.

Pre-existing uncommitted work in both repositories was preserved (only `terrain.ts` and `mapModel.ts`, which
already had uncommitted edits, were edited further).

### 3. Numerical accuracy before / after
| Check | Before | After |
|---|---|---|
| Projection vs Lantmäteriet G5TA / STAC corners | (equirectangular, not comparable) | 0.54 mm / 3.8 µm |
| Distance scale vs geodesic | 0.9962 – 1.0013 | 0.999986 – 1.000020 |
| Migrated OSM tram nodes vs direct projection of 1 904 OSM nodes | — | mean 1.3 cm, max 3.2 cm (double 0.001-unit rounding; original import alone max 1.8 cm) |
| OSM building vertices vs direct projection | — | < 5 cm (test) |
| Terrain grid vs native 1 m DTM at 400 SWEREF control points | — | RMSE < 0.15 m, bias < 0.03 m; a 10 m shift triples RMSE (registration test) |
| 5 m grid vs native DTM (land, whole map) | RMSE 0.10 m | RMSE 0.09 m |
| Rendered terrain vs native (whole / fine / test area) | 0.70 / 0.19 / 0.23 m | 0.70 / 0.19 / 0.23 m |
| Rendered water vs LiDAR class 9 | RMSE 0.20 m | RMSE 0.22 m |
| Camera preset targets vs their legacy geographic targets | — | < 0.3 m (stored to 0.01 unit) |
| Ingelsta trench ring vs migrated ground hole | — | < 0.1 m |
| Topology: route points on track nodes (tram-2/tram-3/pendeln) | 1075/838/620 | 1075/838/620 |
| Topology: detailed bridges' owned segments | 15,30,9,4,1,2,1,1,1 | identical |
| Bridge-profile keys on road endpoints | 810/810 | 810/810 (values unchanged) |
| Signals with changed orientation | — | 0 of 116 |

Elevation logic is untouched (not in scope); metrics confirm it: roads +2.45 → +2.44 m above DTM, bridge decks
vs LiDAR +2.05 → +2.05 m, trams on bridges RMSE 2.56 → 2.62 m.

### 4. Remaining deviations (known, documented)
- Terrain grid covers the axis-aligned box of the now slightly rotated map: 2713 × 2165 cells (+4.1 %);
  terrain asset 30.09 → 31.33 MB.
- The 10 m / 40 m mesh grid is now aligned to SWEREF axes, so mesh nodes fall on different ground points:
  per-point rendered heights change within the existing mesh error (e.g. outer-zone road max error 16.8 → 23.1 m;
  rail segments with > 10 % excess grade 9 → 18; RMSE values unchanged). The fine zone square is rotated 1.01°
  relative to its old geographic footprint (same centre and size).
- Scene axes follow the grid, not true north (by design); convergence 1.0135° at the origin, varying ±0.1° across
  the map. Overview cameras use true north; other hand-placed details keep their migrated absolute orientation.
- Procedural supplemental park trees use a scene-axis grid, so their illustrative positions shifted slightly.
- Legacy procedural drone city (`city.ts`, `norrkoping.ts`, `cityView.ts`, `world.svelte.ts`) is not
  geo-referenced and was not migrated, except the two hub positions shared with the backend.
- WGS84 (OSM) is treated as SWEREF 99 (ETRS89); the ~0.9 m 2026 plate-motion difference is not modelled.
- `docs/coordinate-migration/` is 28 MB of PNG/JSON evidence; drop it before committing if unwanted.
- All audit findings for heights (offsets, bridges, trams, water) remain open by design.

### 5. Test and build results
- `npm run check`: 0 errors, 0 warnings (1 099 files).
- `npm test`: 12 files, **75 / 75** passed (57 existing + 18 new).
- Backend `dev.ps1 test`: **31 / 31** passed (28 existing + 3 new).
- `npm run build`: success.
- `npm run test:e2e` (with Ktor running): **2 / 2** passed; server and client share revision
  `lm-dtm-8eccbc3691700b78-surface-b8b8bb215874`.
- Screenshots, 18 fixed presets (`docs/coordinate-migration/compare/`): 2.1–9.4 % of pixels changed
  (mostly sub-pixel edge shifts); same content at the same geographic place.

### 6. Performance impact
| Metric | Before | After |
|---|---|---|
| Dev: page ready | 3.38–3.85 s | 3.48–4.00 s |
| Dev: map ready (warm) | 1.79–1.80 s | 1.82–1.83 s (+2 %) |
| Dev: worker geometry build (warm) | 714–720 ms | 728–746 ms (+2–4 %) |
| Dev: triangles city / Parken view | 4 891 394 / 1 109 191 | 4 843 742 / 1 096 956 |
| Dev: mean frame | 6.67 ms | 6.07–6.68 ms |
| Prod (vite preview): page ready | 3.75–3.81 s | 3.91–4.04 s (+4–6 %) |
| Prod JS heap | 106–109 MB | 110–117 MB |
Cost comes from the 4 % larger terrain grid. Web Worker architecture and optimisations unchanged.

### 7. Validation and rollback
Validate:
```
npm run check && npm test && npm run build
python scripts/geo/verify_projection.py        # needs numpy, rasterio, pyproj, laspy, scipy
node scripts/geo/migrate-to-sweref.mjs         # must refuse: data already migrated
cd ../norrkoping-simulator-backend; .\dev.ps1 test
# visual: E2E_BASE_URL=http://127.0.0.1:5173/ node scripts/capture-reference-views.mjs out
#         python scripts/geo/compare_views.py docs/coordinate-migration/before/views out out-compare
```
Rollback (data and code; nothing committed):
- Data UI: `git checkout -- src/lib/data/` (these files were clean in git before Step 1) or copy from
  `work/coordinate-migration-backup/ui-data/`; delete `src/lib/geo/`.
- Data backend: `git -C ../norrkoping-simulator-backend checkout -- src/main/resources/`
  (or `work/coordinate-migration-backup/backend-resources/`).
- Code: revert the files in section 2. Careful: `terrain.ts` and `mapModel.ts` also contain the user's earlier
  uncommitted work, so revert only the Step 1 hunks there (see `git diff`).
- DTM staging: `work/coordinate-migration-backup/dtm-prepared-{manifest.json,ground.f32}`.

### Exact next steps (need approval)
1. ~~Step 2 — remove legacy height offsets~~ — done, see the Step 2 report above.
2. Step 3 — terrain mesh / road profiles from the 1 m DTM (the remaining 0.56–0.78 m RMSE on roads/paths/rail).
3. Step 4 — bridge decks from LiDAR class 17, no invented piers, measured water levels at structures.
4. Step 5 — shared rail/vehicle heights keyed by OSM node id; vehicle pitch.
5. Step 6 — water: coast/harbour +0.14 m default, river reaches from measured class 9 levels.

---

## History
- 2026-10-18: Audit delivered (`docs/elevation-audit-2026-10-18.md`, `scripts/audit/`).
- 2026-10-18: Step 1 approved and completed (this report).
- 2026-10-18: Step 2 approved and completed (legacy elevation offsets removed; report above).
- 2026-10-18: Step 3 approved and completed (adaptive terrain mesh; docs/terrain-step3.md). Geometry budget
  awaiting the user's decision.
