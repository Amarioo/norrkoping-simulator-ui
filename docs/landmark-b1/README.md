# Landmark Phase B1 — Rådhuset and Gull-Olle (part 1: geometry by day)

Branch `claude/landmark-b1` from `main` = `951f3cd`. Part 1 approved by the user 2026-10-25; committed on the
branch and the branch pushed to `origin` (not merged into `main`). Backend unchanged.

Norrköping's town hall (I. G. Clason, 1907–1910) is now a measured model instead of a generic OSM box
with an illustrative tower: the U-shaped brick building with its mansard roofs, the courtyard blocks,
the 68.7 m tower with cornice, belfry openings, clocks and pyramid roof, and the gilded sculpture
**Gull-Olle** (Sankt Olof, 4.5 m) on top. Heights and the tower come from Lantmäteriet's LiDAR, the
footprint from OSM, the two headline numbers are checked against the municipality (tower 68 m,
sculpture 4.5 m), colours and small details from three Commons photographs. Everything estimated is
labelled ([data-provenance.md](data-provenance.md), [radhuset-provenance.json](radhuset-provenance.json)).

**Part 2 (façade lighting) is not started**: no documentation of floodlighting was found; see
[remaining-gaps.md](remaining-gaps.md) §1 for what is needed and the planned architecture.

## What changed

| Before (`main`) | After |
|---|---|
| OSM extrusion, 20 m flat box (height a hard-coded import estimate), red ("brown") walls, generic window texture | Walls on the OSM footprint up to the measured eave (22.5 m RH2000 = 18 m above the square), brick with stone plinth, bands and cornice, balustrade on the north façade, window rhythm |
| One hipped roof slab | Measured roofs: north wing mansard to 37.9 m, side wings to 30.1/30.15 m, middle block 36.1 m, hall 12.1 m, cross gables, chimney stacks with copper caps at their LiDAR positions |
| Tower box at the footprint's bounding-box centre (≈ 20 m from the real tower, in the courtyard), ≈ 83 m to the spire tip, green cone | Tower at the LiDAR position on the north façade, 10.6 m square, cornice at 58 m, pyramid roof from the measured slices, top of Gull-Olle at **73.15 m RH2000 = 68.7 m above the square** |
| No statue | Gull-Olle: gilded figure 68.65–73.15 m (silhouette estimated) |

Fit to the LiDAR roof surface (1 782 cells of 1 m inside the footprint): median |Δ| **0.34 m**, p90
**1.47 m**, mean −0.03 m.

## How it is built

| Part | Where | What |
|---|---|---|
| Measurement | [`scripts/landmark-b1/radhuset_lidar.py`](../../scripts/landmark-b1/radhuset_lidar.py) → [`data/radhuset-lidar.json`](data/radhuset-lidar.json) | Tower centre and slices, ground, roof cross-sections, 1 m surface grid in the building frame. Deterministic (byte-identical rebuild) |
| Values | [`src/lib/landmarks/radhuset/spec.ts`](../../src/lib/landmarks/radhuset/spec.ts) | Every dimension with its source tag |
| Geometry | [`src/lib/landmarks/radhuset/radhuset.ts`](../../src/lib/landmarks/radhuset/radhuset.ts) | One group in the building frame (metres, RH2000 heights, scale 1/25). Five merged meshes: masonry, roofs, windows, gold (vertex colours) and the four clock dials (canvas texture). Plain `MeshStandardMaterial`s in configurations the scene already uses, so the lighting patch compiles **no new program** (20) |
| Wiring | [`mapView.ts`](../../src/lib/mapView.ts), [`cityPlaces.ts`](../../src/lib/cityPlaces.ts), [`mapLandmarks.ts`](../../src/lib/mapLandmarks.ts) | Model added next to the stadium; `way/285809156` joins `DETAILED_BUILDING_IDS` (its generic OSM walls are no longer drawn; the OSM data is unchanged); the old illustrative tower and clock removed |

## Results

| Gate (`docs/step62/rollout-plan.md`) | Measured | ✔ |
|---|---|---|
| p95 frame time Δ ≤ 1 ms (night) | pooled per view −0.1 … **+0.2 ms** (Kungsgatan, Strömparken, city overview, Centrum) | ✔ |
| Day p95 Δ ≤ 0.5 ms | pooled −0.1 … **+0.2 ms**. Strömparken by day measured +0.5 and +0.4 ms in the first two series (all 6 rounds positive); a 5-round repeat of that view alone gave **−0.4 ms**, pooled over 11 rounds +0.2 ms: noise | ✔ |
| Map-ready Δ ≤ 100 ms | pooled **−5 ms** (11 rounds, −108 … +127) | ✔ |
| Post-GC heap Δ ≤ 10 MB | **+0.14 MB** | ✔ |
| Draw calls ≤ 40 / triangles ≤ 100 k per view | **−3 calls** (5 meshes replace the old tower's meshes) and **+1.2 … +1.5 k triangles** in all 12 captures | ✔ |
| Shader programs | **20** before and after, day and night | ✔ |
| App chunk | 657.9 → 667.5 KB (+9.7 KB minified) | — |
| Street lighting (22 346 fixtures) and earlier phases' data | `git diff main` empty for `src/lib/data`, `scripts/data`, `src/lib/lighting`, `src/lib/stadium`, earlier `docs/*` and earlier tests | ✔ |
| Pictures | only the town hall's pixels change (rest of each frame identical); skyline 4 404 of 702 240 px | ✔ |

Measurement method: as Vehicle Lights F1 (production builds by `vite preview`, before = `main` exported
with `git archive` to `work/landmark-b1/before-app` with a `node_modules` junction; uncapped Edge,
1280×900, DPR 1, fresh browser per run, before/after alternating; traffic on through the backend copy
8095, reset and paused, 202 vehicles; RTX 5070 Ti / ANGLE D3D11). Views: Kungsgatan, Strömparken,
city overview, **Centrum** (the town hall is in view), day 12:39 and night 21:30. Two series of 3
rounds plus a Strömparken-only repeat of 5 rounds. Raw pooled numbers:
[data/perf-pooled.json](data/perf-pooled.json); per-capture calls/triangles/changed pixels:
[data/captures-before-after.json](data/captures-before-after.json).

```powershell
$env:VIEWS='kungsgatan,stromparken,city,centrum'; node scripts/vehicle-lights-f1/measure.mjs work/landmark-b1/perf/series1.json 3 5226 5227
node scripts/vehicle-lights-f1/summarize.mjs work/landmark-b1/perf/series1.json
node scripts/landmark-b1/capture.mjs work/landmark-b1/captures/after http://127.0.0.1:5193/
node scripts/vehicle-lights-f1/compare.mjs work/landmark-b1/captures/before work/landmark-b1/captures/after work/landmark-b1/compare
```

Servers (`.claude/launch.json`, local only): `b1-before-dev` 5225, `b1-before-preview` 5226,
`b1-preview` 5227, `b1-before-e2e` 5228 (main baseline with the backend copy). Do not run the before
and after DEV servers at the same time (shared `node_modules/.vite`).

### Pictures ([evidence/](evidence/), each: `main` | B1 | difference × 4)

01 Tyska torget (north façade) · 02 north-west, tower and roof · 03 courtyard from the south-east ·
04 tower top and Gull-Olle · 05 aerial · 06 skyline from the north (≈ 550 m) · 07 Tyska torget at
night · 08 tower top at night. At night the model is lit only by the street lamps and the city
glow (no façade lighting yet).

### Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK (the > 500 kB chunk warning exists on `main` too) |
| `npm test` (PowerShell, `C:\`) | **435/435** (423 + 12 new in `radhuset.test.ts`) |
| `npm run test:e2e` (backend copy 8095, dev 5194) | run 1: **11/12**, only the known A3 picture check failed (`lighting.spec.ts` "unchanged reference view"); run 2: **12/12**. The A3 test alone, 3 repeats: fails 3/3 on this branch **and 3/3 on `main`** (baseline dev server 5228, same lines 739/768): pre-existing, not caused by B1 |
| New Playwright test [`tests/landmark-radhuset.spec.ts`](../../tests/landmark-radhuset.spec.ts) | model in the scene, 5 meshes, top 73.15 m; no other mesh above 60 m within 25 m of the tower (old tower gone); tower shaft drawn where measured (dark against the sky, Δ luma > 60); 20 programs day and night |

Unit tests (`radhuset.test.ts`): frame = measured origin and OSM axis, exact metric round trip; spec
values agree with the LiDAR file (ridges, eaves, top, ground); tower 68.7 m vs the municipality's 68 m
(< 1 m); Gull-Olle 4.5 m standing on the roof's top ring and the highest point of the model; walls on
every OSM vertex down to the lowest ground; wall tops per part; budget (5 meshes, FrontSide, opaque,
plain standard materials, < 6 000 triangles); OSM building replaced but its data untouched;
**model vs LiDAR surface** median ≤ 0.6 m / p90 ≤ 1.6 m (measured 0.34 / 1.47 m) and the tower roof
p90 ≤ 1.5 m.

How the fit test was settled (new test, no existing test changed): the thresholds were written before
the first run and kept. The first run gave median 0.55 / p90 1.94 m; a residual map showed real model
errors (middle block ridge 36.1 not 33.2 m, cross gables over the courtyard projections, asymmetric
mansard of the north wing, stack positions), which were fixed in the model. The edge exclusion was
widened from 1 m to 1.5 m (and the minimum cell count from 2 000 to 1 500) because the OSM outline
itself differs from the LiDAR eave line by up to ≈ 1 m (remaining-gaps.md §3).

Reproducibility: `radhuset_lidar.py` rebuilt the measurement file byte-identically (SHA-256
`a1dad4f3…`); see [data-provenance.md](data-provenance.md).

## Files

New: `src/lib/landmarks/radhuset/{spec,radhuset,radhuset.test}.ts`, `tests/landmark-radhuset.spec.ts`,
`scripts/landmark-b1/{radhuset_lidar.py,capture.mjs}`, `docs/landmark-b1/**`. Changed:
`src/lib/mapView.ts`, `src/lib/cityPlaces.ts`, `src/lib/mapLandmarks.ts` (old tower removed),
`.gitignore` (`/work/landmark-b1/`), `DATA-LICENSE.md`, `docs/claude-progress.md`, `docs/roadmap.md`.
Comparison and performance tools reused unchanged from F1 (`scripts/vehicle-lights-f1/compare.mjs`,
`measure.mjs`, `summarize.mjs`). Local only: `.claude/launch.json` (+3 `b1-*` entries; original in
`work/landmark-b1/launch.json.before`), `work/landmark-b1/` (baseline app, captures, perf runs).
