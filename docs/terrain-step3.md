# Step 3 — adaptive terrain mesh from the native 1 m DTM (2026-10-18)

Status: **implemented in the working tree, not committed. One decision is open (section 1).**

Bridge deck profiles, tram/rail height logic and water levels are unchanged.

## 1. Decision needed: geometry budget

The mesh is refined against every native Lantmäteriet 1 m DTM pixel in the map (146.5 M pixels).

- A tolerance class is assigned to each pixel. Tighter tolerances mean more triangles.
- Every ground-bound layer (land cover, roads, paths, markings, cornices) is clipped to the terrain triangles. So the scene cost grows faster than the terrain itself.

The options below were all measured on the same machine.

| | Before (10 m / 40 m grid) | **Active: bu0.4-0.75** | Low-cost alternative: A (ff0.75) |
|---|---|---|---|
| Terrain mesh triangles | 384 640 | 925 494 | 621 024 |
| Static scene triangles | 6.49 M | **9.27 M (+43 %)** | 7.31 M (+13 %) |
| Vertex buffers (CPU and GPU copies) | 857 MB | **1 224 MB (+367 MB)** | 965 MB (+108 MB) |
| Road RMSE, all native road pixels | 0.613 m | **0.168 m** | 0.207 m |
| Industrilandskapet + Campus RMSE / p95 | 0.233 / 0.45 m | **0.166 / 0.31 m** | 0.223 / 0.46 m |
| Central 3.2 km land RMSE / p95 | 0.199 / 0.37 m | 0.185 / 0.37 m | **0.241 / 0.50 m (worse)** |
| Production time to map ready | 4.07 s | 4.25 s (+4 %) | 3.87 s (−5 %) |
| Settled frame time | | faster in every street view; overview +3 % | faster in every view |

- **Recommendation: keep bu0.4-0.75.** It is the cheapest measured option that does not make the priority area or the dense centre worse.
  - Option A costs little and improves the outer city enormously.
  - But A coarsens the old uniform 10 m centre, and it is worse there than before.
- The +43 % geometry and +367 MB of vertex memory is the trade-off the task asked to see before proceeding.
- Switching is one command each way; see section 8.

## 2. Method

**Measurement.** `scripts/geo/terrain_mesh_study.py` compares a candidate surface with the native 1 m DTM at every pixel centre inside the map bounds.

- The surface is either the old mesh (an exact replica of `terrain.ts`) or a candidate RTIN.
- The DTM is a mosaic of the four SHA-256-verified GeoTIFFs, EPSG:5845.
- Categories are rasterised from the OSM map:
  - roads at their width; paths; rail corridors (15 m); tram streets;
  - building footprints; riverbanks (10 m either side of every shoreline);
  - water; steep ground (native slope > 30 %);
  - the audit's Industrilandskapet + Campus box (E 568150–569300, N 6494800–6495500);
  - the old central 10 m square; the built-up area (within 30 m of a building).

**Where geometry is needed.** The old mesh was badly allocated.

- Its central 10 m square spends triangles on flat ground.
- Its 40 m outer grid cuts embankments, cuttings, quays and slopes:
  - steep land RMSE 2.68 m, max 90.5 m;
  - rail corridors are 0.16 m too low on average, because embankments are flattened;
  - 6.8 % of road pixels are more than 1 m off.
- Uniform 10 m everywhere would need 3.08 M terrain triangles, and uniform 5 m 12.3 M. 5 m is the accuracy floor of the 5 m grid (road RMSE 0.074 m).

**Adaptive mesh.** The mesh is a right-triangulated irregular network (longest-edge bisection, as in Mapbox Martini) over the existing 5 m DTM nodes.

- Triangle sizes range from 320 m root cells down to 5 m.
- Vertex heights are the grid values themselves, so the mesh adds no new heights. RH2000 and SWEREF 99 TM are untouched.
- A triangle is split while any native pixel inside it deviates from its plane by more than the tolerance of that pixel's class:

| Class | Tolerance |
|---|---|
| Features in the built-up area (road, path and tram surfaces, rail corridors, building footprints, shorelines) | 0.4 m |
| Other land in the built-up area | 0.75 m |
| Features elsewhere | 0.75 m |
| Built-up land cover elsewhere | 1.125 m |
| Other land; open water | 2.25 m |

- **Conformity.** Each class's split error is propagated from fine to coarse, per hypotenuse-midpoint node. Both triangles sharing a hypotenuse therefore read the same bit.
- **Result.** There are no cracks or T-junctions anywhere, including between refined and coarse regions. One bit per node (1 MB base64) encodes the whole mesh.

**One surface everywhere.** Every consumer reads the same split bits:

- `terrain.ts` `surfaceHeight` / `groundHeight`, `terrain.drape()` and `footprintGround()`;
- `src/lib/surfaceMesh.ts`, which clips by bisection and passes each piece with its plane;
- `TerrainService.kt` (backend vehicles).

Draped layers take the plane of the terrain triangle under them, so they stay coplanar with the terrain. Building bases are the exact minimum of the rendered surface over the triangulated footprint.

**Not changed:**

- Web Worker build, transfer, chunking, data sharing and the binary DTM;
- `bridge-profiles.json` values, bridge decks, the rail +0.016 top and vehicle logic;
- water levels (`waterHeight` still drapes on the ground surface, Step 6).

## 3. Terrain accuracy before → after

**Every native 1 m pixel in the map** (rendered surface minus DTM, metres; mean / RMSE / p95 / max, and the share of pixels more than 1 m off):

| Category | Pixels | Before | After (bu0.4-0.75) |
|---|---|---|---|
| Whole map | 146.5 M | −0.04 / 1.101 / 1.37 / 90.5 / 8.2 % | 0.02 / **0.297** / 0.66 / 25.4 / 1.7 % |
| Land | 129.0 M | −0.05 / 1.170 / 1.47 / 90.5 / 9.1 % | 0.02 / **0.316** / 0.69 / 25.4 / 1.9 % |
| Roads | 6.0 M | 0.01 / 0.613 / 1.19 / 29.9 / 6.8 % | 0.00 / **0.168** / 0.37 / 9.4 / 0.03 % |
| Paths | 1.2 M | 0.01 / 0.700 / 1.48 / 16.3 / 10 % | 0.00 / **0.205** / 0.45 / 4.4 / 0.06 % |
| Rail corridors (15 m) | 0.8 M | −0.05 / 0.811 / 1.78 / 7.0 / 14 % | −0.01 / **0.233** / 0.49 / 4.1 / 0.4 % |
| Tram streets | 0.2 M | 0.03 / 0.398 / 0.59 / 5.8 / 2.2 % | 0.01 / **0.122** / 0.26 / 2.4 / 0.02 % |
| Building footprints | 6.3 M | −0.06 / 0.385 / 0.78 / 15.9 / 3.0 % | −0.02 / **0.111** / 0.23 / 4.3 / 0.02 % |
| Riverbanks (±10 m) | 3.3 M | 0.22 / 0.707 / 1.54 / 15.7 / 12 % | 0.02 / **0.220** / 0.48 / 4.8 / 0.2 % |
| Steep land (> 30 %) | 5.5 M | −0.37 / 2.680 / 3.53 / 90.5 / 40 % | −0.02 / **0.585** / 1.23 / 25.4 / 9.1 % |
| Water surface vs DTM | 17.5 M | 0.04 / 0.210 / 0.24 / 9.6 | 0.01 / **0.073** / 0.11 / 4.4 |
| **Industrilandskapet + Campus**, land | 0.70 M | −0.01 / 0.233 / 0.45 / 5.6 / 0.9 % | 0.00 / **0.166** / 0.31 / 4.8 / 0.2 % |
| — roads and paths there | 0.12 M | 0.03 / 0.175 / 0.32 / 3.5 | 0.05 / **0.134** / 0.26 / 2.4 |
| — water there | 0.10 M | 0.07 / 0.397 / 0.78 / 5.3 | 0.03 / **0.234** / 0.43 / 4.4 |
| Built-up land | 32.4 M | −0.01 / 0.555 / 1.13 / 30.8 / 6.2 % | 0.00 / **0.158** / 0.34 / 6.1 / 0.06 % |
| Old 10 m square, land | 9.8 M | 0.00 / 0.199 / 0.37 / 9.2 / 0.6 % | 0.00 / 0.185 / 0.37 / 6.1 / 0.3 % |

The 25.4 m maximum is a single vertical face. A uniform 5 m mesh has the same maximum, so it is a limit of the 5 m grid, not of the adaptive mesh.

**Rendered geometry**, sampled with vertical rays through the real worker meshes at the Step 2 samples (`scripts/geo/measure-elevation.test.ts`; ordinary means more than 25 m from bridges, tunnels and lifts):

| Surface | n | RMSE before → after | p95 | max |
|---|---|---|---|---|
| Road asphalt | 243 730 | 0.562 → **0.156** | 1.09 → 0.34 | 26.4 → **2.3** |
| Path | 161 676 | 0.666 → **0.197** | 1.39 → 0.43 | 15.7 → 2.6 |
| Rail ballast | 18 147 | 0.784 → **0.178** (mean −0.161 → −0.059) | 1.76 → 0.40 | 5.2 → 1.3 |
| Tram street | 4 948 | 0.135 → **0.108** | 0.28 → 0.23 | 1.66 → 0.72 |
| Building wall bottom vs footprint minimum | 12 490 | 0.543 → **0.164** | 1.08 → 0.32 | 16.3 → 3.9 |
| Wood / residential / industrial / plain ground | ~2–3 k each | 1.24 / 0.72 / 0.65 / 0.86 → 0.49 / 0.22 / 0.22 / 0.38 | | 38.2 → 2.1 (wood) |

- Buildings more than 1 m above their lowest ground: 2.4 % → **0.1 %**.
- Unchanged:
  - 0 height jumps at 73 762 shared road, path, rail and tram nodes;
  - cars ride 5 cm above the drawn asphalt (219 996 samples);
  - detailed bridge decks vs LiDAR, except Gamlebro, whose approach improved from max 5.85 to 4.78 m.

**Independent regression samples** (`src/lib/geo/terrain-mesh-control.json`):

- 14 groups, 400–1 500 random positions each.
- The positions are continuous coordinates, so the DTM values there are bilinear between pixels and were never mesh input.
- Before → after, RMSE: roads 0.592 → 0.166, rail 0.824 → 0.209, riverbanks 0.652 → 0.205, test area 0.236 → 0.162, steep land 2.99 → 0.61.

## 4. Triangles, memory, startup, GPU upload, FPS

**Geometry** (`scripts/geo/measure-geometry.test.ts`, Node, median of 3; idle machine):

| Layer | Triangles before → after | Vertex MB before → after |
|---|---|---|
| land | 2 493 153 → 4 106 359 | 329 → 542 |
| roads | 2 482 528 → 3 208 900 | 328 → 424 |
| water | 228 466 → 369 691 | 30 → 49 |
| markings | 317 537 → 393 517 | 42 → 52 |
| cornices (draped strips) | 674 464 → 901 898 | 89 → 119 |
| walls, roofs, banks | unchanged | unchanged |
| **Total** | **6 490 687 → 9 274 904 (+43 %)** | **857 → 1 224 (+43 %)** |
| Geometries (≤ 3 000 triangles each) | 4 822 → 5 673 | |

Worker build times (ms):

| Task | Before | After |
|---|---|---|
| terrain | 2 200 | 1 998 |
| network | 2 358 | 2 127 |
| buildings | 761 | 775 |
| markings | 379 | 474 |

Faster in total: flat ground now needs far fewer clip operations.

**Data**:

- `terrain.json` 31.33 → 32.36 MB (+1.03 MB of split bits); gzip 21.15 → 21.35 MB.
- Runtime decoding: 771 KB of bits per thread. The Float64 node cache of the old mesh (11.7 MB per thread) is gone.

**Browser** (`scripts/measure-startup.mjs`, Edge, 1280 × 900, three alternating runs, medians):

| | Before | After |
|---|---|---|
| Production: time to map ready | 4 074 ms | 4 254 ms (+4 %) |
| Production: geometry in the scene | 3.00 s after navigation | 3.15 s |
| Production: GPU upload spike (longest frame in the 3 s after the geometry arrives) | 1 013 ms | 1 135 ms |
| Dev: main-thread scene build | 811 ms | 866 ms |
| Dev: map ready | 1 921 ms | 1 969 ms |
| JS heap | 123–198 MB | 123–198 MB, no measurable change (GC noise is larger than any difference) |

Settled frame time, uncapped (vsync off), 120 frames per view, ms:

| View | Before | After | Drawn triangles before → after |
|---|---|---|---|
| overview | 16.5 | 17.0 | 8.17 M → 10.37 M |
| city | 7.3 | 7.0 | 5.62 M → 5.36 M |
| campus | 4.6 | 4.3 | 2.79 M → 2.92 M |
| industry | 2.9 | 2.2 | 2.40 M → 1.39 M |
| parken | 3.3 | 2.8 | 1.66 M → 0.96 M |
| kungsgatan | 2.5 | 1.9 | 1.78 M → 0.99 M |

- With vsync on, every street view stays at the display's 6.1 ms frame (164 Hz) both before and after.
- The overview is about 12 ms in both.
- Option A and the earlier option B (`f0.5-u1.5-o3`) were measured in an earlier alternating session:
  - A: city 5.5 → 4.5 ms, overview 12.0 → 11.2 ms;
  - B: city 4.8 ms, overview 12.5 ms;
  - the absolute numbers of the two sessions differ (machine state).

## 5. Seams, T-junctions and continuity (automated)

- `src/lib/surfaceMesh.test.ts` walks all 925 494 leaves:
  - every interior edge is shared by exactly two triangles;
  - an edge used once lies on the outer border, so there are no T-junctions;
  - the height across every edge is continuous (< 0.1 mm at 1e-7 units);
  - every vertex equals its DTM grid value;
  - clipping preserves area exactly;
  - every draped piece lies on the terrain plane;
  - footprint minima are exact (brute-force check on an L-shaped footprint).
- `prepare-terrain-mesh.py` refuses to write a non-conforming mesh (the Martini closure check).
- Three independent implementations agree on 3 000 positions to < 1e-6 m:
  - the Python level geometry and the Python bisection (`rtin.py`);
  - TypeScript;
  - Kotlin (`TerrainMeshTest.kt`).

## 6. Screenshots

- `docs/terrain-step3/before/views`, `after/views` (bu0.4-0.75), `optionA/views`, `optionB/views`: 24 fixed presets, banner hidden.
- Cameras are pinned to the absolute positions recorded in the before app (`docs/terrain-step3/cameras.json`). The presets themselves place the camera relative to the ground, which changed.
- A re-capture of the before app with pinned cameras changes 0.00–0.01 % of pixels.
- `docs/terrain-step3/compare`: before | after | 4× difference. Industrilandskapet: `industry.png`; Campus: `campus.png`.
- Changed pixels per view: 0.02–6.1 %. The differences are building bases, tree trunks, road and land-cover facets following the corrected ground, and finer water facets at banks.
- Checked by eye: no cracks, spikes or missing ground.

## 7. Tests and checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **101 / 101** (13 files), including 22 new tests in `surfaceMesh.test.ts` and tightened Step 2 limits |
| `npm run build` | OK |
| Backend `dev.ps1 test` | **37 / 37** (2 new in `TerrainMeshTest.kt`) |
| `npx playwright test` against an own backend on :8091 with the new revision | 2 / 2 |

- The e2e run went through a local test-only proxy that rewrites `Origin` to 127.0.0.1:5173, because the user's dev server occupies 5173.
- The tightened Step 2 limits are:
  - roads 0.75 → 0.3 m RMSE;
  - land cover 1.0 → 0.45 m (wood 0.8 m);
  - buildings: RMSE < 0.35 m and < 1 % more than 1 m off.

## 8. Files, reproduction and rollback

**UI, modified:**

- `src/lib/surfaceMesh.ts`: rewritten as the RTIN mesh.
- `src/lib/terrain.ts`: `mesh` dataset field and validation, `surface`, `drape()`, exact `footprintGround()`; the old node grid is removed.
- `src/lib/cityMesh.ts`, `src/lib/placeBuilder.ts`: drape with the leaf planes.
- `src/lib/FreeCamera.svelte`: dev-only `__cityCamera` hook.
- `src/lib/terrain.test.ts`, `src/lib/elevation.test.ts`, `src/lib/surfaceMesh.test.ts`.
- `scripts/prepare-dtm.py`, `scripts/prepare-bridge-profiles.py`: shared revision rule; the DTM step builds the mesh. Profile values are untouched.
- `scripts/capture-reference-views.mjs`: `CAMERAS_OUT` / `CAMERAS_IN`.
- `ELEVATION.md`.
- Data: `src/lib/data/terrain.json` (`mesh` added), `src/lib/data/buildings-3d.json` (revision).
- Revision `…-surface-a26967db6d14` → **`…-surface-32977b9c2915`**.

**UI, new:**

- `scripts/prepare-terrain-mesh.py`
- `scripts/geo/rtin.py`, `terrain_mesh_study.py`, `terrain_mesh_samples.py`, `terrain_mesh_counts.py`, `terrain_mesh_budget.py`
- `scripts/geo/measure-geometry.test.ts`, `vitest.geometry.config.ts`
- `scripts/measure-startup.mjs`
- `src/lib/geo/terrain-mesh-control.json`
- `docs/terrain-step3.md`, `docs/terrain-step3/` (59 MB of screenshots)

**Backend:**

- `TerrainService.kt` (`SurfaceMeshData`, RTIN `surfaceHeight`)
- `src/main/resources/terrain.json`
- new `TerrainMeshTest.kt` and `src/test/resources/terrain-mesh-control.json`

**Reproduce** (Python 3.12 with numpy; see `work/geodata/python`):

```
python scripts/geo/terrain_mesh_counts.py --recompute   # pass 1: split errors per class, all native pixels
python scripts/geo/terrain_mesh_study.py --only=<profile> # pass 2: accuracy statistics
python scripts/prepare-terrain-mesh.py --activate       # writes client + backend terrain.json, revision
python scripts/geo/terrain_mesh_samples.py              # regression fixtures (UI + backend)
npx vitest run -c scripts/geo/vitest.geometry.config.ts # geometry and build time
npx vitest run -c scripts/geo/vitest.measure.config.ts  # rendered geometry vs DTM (MEASURE_OUT=…)
```

**Switch to option A:**

```
python scripts/prepare-terrain-mesh.py --activate --tolerances=featureBuiltUp=0.75,landBuiltUp=1.125
python scripts/geo/terrain_mesh_samples.py
```

That reproduces A's tolerances within the six-class scheme (652 k triangles). Then restart the backend.

**Roll back Step 3 only:**

1. Copy the files from `work/terrain-step3/before-snapshot/`:
   - UI `src/…` and `scripts/…`;
   - backend `backend-src/…` → `../norrkoping-simulator-backend/src/…`.
2. Delete the new files listed above.
3. Revert `FreeCamera.svelte` and `capture-reference-views.mjs`, `ELEVATION.md`, and the two prepare scripts by hand.

Do not use `git checkout`: these files also hold Steps 1–2 and earlier uncommitted work.

**Working folders (untracked, not for git):** `work/terrain-step3/` (564 MB) contains:

- the per-class split-error grids;
- the before snapshot;
- `before-app` and `optionB-app` copies, used for side-by-side benchmarks;
- benchmark JSON.

To run an app copy again, recreate its `node_modules` junction, and remove the junction again before deleting the folder:

```
mklink /J work\terrain-step3\before-app\node_modules node_modules
rmdir work\terrain-step3\before-app\node_modules
```

## 9. Remaining limitations

1. **5 m grid floor.** Vertical faces such as quay walls, retaining walls and quarry faces cannot be sharper than 5 m.
   - Max error 25.4 m at one face; steep-land RMSE 0.59 m against 0.34 m for uniform 5 m.
   - Going below 5 m would need native heights at 2.5 m or 1 m nodes (new data) along breaklines.
2. **Old central square.** Typical errors are about level with the old uniform 10 m mesh there:
   - per pixel, RMSE 0.199 → 0.185 m with p95 unchanged at 0.37 m;
   - the 1 000-point random fixture shows p95 0.35 → 0.39 m;
   - large errors are halved.
   Stricter built-up tolerances (`featureBuiltUp=0.35, landBuiltUp=0.6`: 1.05 M terrain triangles, central RMSE 0.174) would improve it at further cost.
3. **Small positive road bias** in the test area (+0.03 → +0.05 m). Roads often lie a few cm below the adjacent ground at kerbs, and the planes span both.
4. **Water** is still draped on the terrain surface (Step 6). The water surface is closer to the DTM (RMSE 0.21 → 0.07 m), but sloped facets at banks are now smaller and more numerous, and visible at Gamlebro.
5. **Bridges and rail vehicles (Steps 4 and 5).** Generic bridge decks without a profile (mean vs LiDAR −1.04 → −1.32 m), and rail vehicles on bridges (tram 2 RMSE 2.73 → 3.20 m, Pendeln 3.19 → 3.91 m), still follow the ground beneath. That ground is now more accurate, so the existing mismatch grows.
   - Decks with profiles are unchanged.
   - Rail tops still sit 0.25 m above the ballast (mean vs DTM +0.08 → +0.19 m, because the ballast is no longer flattened).
6. **Bridge-profile anchors.** `prepare-bridge-profiles.py` still derives approach heights from a replica of the old 10 m / 40 m mesh, so the current values reproduce. Step 4 replaces these profiles with LiDAR.
7. **Audit scripts.** `scripts/audit/common.py` replicates the old mesh and documents the pre-Step-3 state. The Step 3 measurements are in `scripts/geo/`.
8. **Memory.** The static city's vertex buffers are already large (857 MB before, 1.22 GB after) because draped layers are kept as non-indexed triangles. Indexed or merged ground layers would recover far more than this step adds; that is outside Step 3.
9. **Backend restart.** The user's Ktor backend (:8080) still serves the previous revision until restarted. The dev server on :5173 already serves the new mesh.
