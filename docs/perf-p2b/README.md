# Performance Phase P2b — ground, roads, water and OSM buildings: one mesh per 1 km cell (2026-11-02)

Branch `claude/perf-p2b` from `main` = `ac25d7e`. **Not committed** (waiting for the user's review).
Includes a test fix the user approved on 2026-11-02 (screenshot comparisons tolerate 1/255 noise; see
"Tests" below).
Backend unchanged. Second targeted step of P2 (roadmap track P), in the order P1 proposed.

## Result

- **Change.** The worker-built layers (land, banks, water, roads, markings, OSM walls, roofs,
  cornices) were cut into 500 m cells, and every cell again into pieces of at most 3 000 triangles
  (5 537 meshes). Now each layer is cut into 1 km cells and each cell is **one** mesh (1 143 meshes).
  One file: `src/lib/cityMesh.ts` (`CITY_CELL = 40` scene units = 1 km; a cell's batch no longer seals
  every 3 000 triangles). Same triangles, same materials, same draw order between layers.
- **Geometry unchanged, proven.** In the running app, every layer has the same triangle count
  (8 562 962 in total) and the same order-independent fingerprint over every triangle's exact float
  values (positions, normals, colours, uvs) as on `main`, for 500 m, 1 km and 2 km cells
  ([data/layer-identity.json](data/layer-identity.json)).
- **Picture: 0–5 pixels of 3.7 million differ per view** (by more than 8/255). They are single pixels
  at the edge where two surfaces of the same layer lie in exactly the same plane; which one wins now
  depends on a different draw order inside the layer
  ([evidence 04](evidence/04-differing-pixels-day-city-main-left-branch-right.png)). `main` against
  itself: 0. Not visible to the eye; this is a deviation to approve (see the decisions in the report).
- **Time saved (CPU per frame, paired against `main` in the same round, median of 5 rounds
  [min … max], fullscreen 2560×1440, night with traffic unless noted):**

  | view | `main` CPU median | branch (1 km) | difference | CPU p95 difference |
  |---|---:|---:|---:|---:|
  | Overview, night | 12.0 ms | 6.0 ms | **−5.7** [−9.5 … −5.1] | −7.0 [−14.0 … −0.7] |
  | Overview, day | 11.8 ms | 4.8 ms | **−7.1** [−11.1 … −5.9] | −8.1 [−17.8 … −7.5] |
  | Innerstaden | 6.0 ms | 5.9 ms | −0.2 [−1.6 … +0.1] | −1.3 [−2.3 … +3.7] |
  | Norra Promenaden | 4.7 ms | 4.2 ms | −0.7 [−2.1 … 0.0] | +0.4 [−1.7 … +1.4] |
  | Kungsgatan | 2.5 ms | 1.8 ms | −0.8 [−1.1 … −0.6] | +1.7 [−0.2 … +5.8] |

  Overview: draw calls 7 220 → 2 910, CPU p95 15.1 → 6.6 ms, frames over 16.7 ms 3.2 % → 0 %.
  **The roadmap's target (p95 ≤ 16.7 ms in the whole-city overview at night with traffic) is met with
  a wide margin on this machine today** (rAF p95 16.0 → 6.9 ms).
- **Street views cost a little more GPU work.** Bigger cells are culled less precisely, so street
  views draw more triangles that are off screen (Kungsgatan: P2b layers 0.45 M → 1.24 M triangles).
  The CPU gets faster there, but the GPU slower: in a separate run with the GPU timer on
  (3 rounds, [data/paired-gpu-summary.md](data/paired-gpu-summary.md)) the frame time (rAF mean, the
  GPU-bound measure in street views) changed by **+0.71 ms in Kungsgatan** (3.3 → 3.9 ms, still
  ≈ 260 frames/s), +0.21 ms in Innerstaden, −0.21 ms in Norra Promenaden, −5.96 ms in the overview.
  The higher CPU p95 in Kungsgatan above is the same effect: `renderer.render()` waits for the GPU
  in some frames when it runs uncapped at 250+ frames/s.
- **Start-up faster, less memory.** Paired over 6 rounds (1440×1040 like the Playwright suite):
  map ready −0.69 s in the first tab (4.58 → 3.83 s) and −0.87 s in a second tab (4.47 → 3.61 s),
  every round faster; JS heap at map ready −22 MB (1 396 → 1 373 MB), every round lower
  ([data/startup.json](data/startup.json)). Fewer meshes to create and upload.

### Why 1 km

| cells | meshes | overview night CPU | overview day CPU | Kungsgatan frame time (GPU run) | Innerstaden frame time (GPU run) |
|---|---:|---:|---:|---:|---:|
| `main` (500 m + 3 000-triangle pieces) | 5 537 | 12.0 ms | 11.8 ms | 3.29 ms | 5.96 ms |
| 500 m, one mesh per cell | 3 499 | −4.2 | −4.0 | +0.30 | +0.13 |
| **1 km** | **1 143** | **−5.7** | **−7.1** | **+0.71** | **+0.21** |
| 2 km | 362 | −6.1 | −7.0 | +0.88 | +0.26 |

2 km gains only ≈ 0.4 ms more in the overview but costs more in street views, and its CPU p95 in
Kungsgatan rose in every round (+3.4 … +6.7 ms). 500 m is the cautious choice for weak GPUs (half the
overview gain, a third of the street-view cost). 1 km keeps almost all of the overview gain.

## Tests: screenshot comparisons in `lighting.spec.ts`

Several tests in `tests/lighting.spec.ts` (street lighting, A1, A2, A3, L2a) take a screenshot, do
something that must not change the picture (rebuild, rejected set, recreation), and require the next
screenshot to be **byte-identical**. A3 has failed now and then since P0 (known). Measured today, the
whole file run 4 times on each, alternating (`main` from a separate worktree, same backend):

| run | `main` | branch |
|---|---|---|
| 1 | 7/7 | 6/7 (A3) |
| 2 | 6/7 (A3) | 6/7 (A2) |
| 3 | 6/7 (A3) | 7/7 |
| 4 | 6/7 (A3) | 2/7 (street lighting, A1, A2, A3, L2a) |

Every failure is the same kind of assertion (two screenshots not byte-identical). Diagnosis:

- **The renderer is deterministic on both.** Drawing the A3 view 30 times with `renderer.render()` and
  reading the drawing buffer back gives 30 identical images on `main` and on the branch
  ([data/render-determinism.json](data/render-determinism.json)).
- **The page screenshots are not.** 30 screenshots of the same unchanged view, three frames apart,
  differ by **1/255 in 1–4 pixels** at fixed places (a lit footpath edge by Kungstorget). How often:
  `main` 5, 5, 1, 0 of 29; branch 11, 19, 7, 4 of 29
  ([data/shot-stability.json](data/shot-stability.json)). The variation is in the browser's
  screenshot path, not in the app, and it happens more often with the branch. Why the branch
  changes how often was not found.

### Fix (approved by the user, 2026-11-02: "Ja, fixa testerna")

The 21 byte-identical comparisons (20 in `lighting.spec.ts`, 1 in `lighting-l2d.spec.ts`) now use
`expectSamePicture()` from `tests/samePicture.ts`: two screenshots are the same picture when they are
byte-identical, or when **no channel of any pixel differs by more than 1/255 and at most 0.1 % of the
pixels differ at all**. The observed noise is 1/255 in 1–22 pixels of ≈ 700 000–3 700 000. No other
assertion changed (the luma, program, geometry and fixture checks are as before).

`tests/same-picture.spec.ts` proves it still catches real changes, on synthetic PNGs: accepted are
byte-identical images and 1/255 in 3 and in 20 of 20 000 pixels (exactly 0.1 %); rejected are one
pixel off by 2/255, one pixel off by 40/255 (a lamp), 1/255 in 21 pixels, and a different size.

After the fix, both lighting files (9 tests), 4 runs each, alternating, same tests against `main`'s
app code (worktree) and the branch: **`main` 9/9 ×4, branch 9/9 ×4** (before: `main` 3 failures,
branch 7).

## Method

- **Builds** (`scripts/perf-p2b/build-variants.mjs`): hook builds (`VITE_LIGHTING_HOOK=1`, source maps)
  of `main` and of the branch with `CITY_CELL` = 20 / 40 / 80 (500 m / 1 km / 2 km), each with one file
  swapped and restored (hash checked). The final branch build is byte-identical to the measured 1 km
  build in every code file; only source maps differ (the changed comment, and `three.core-*.js.map`,
  which differs between rebuilds of the same code, known from P2a).
- **Identity** (`scripts/perf-p2b/layer-identity.mjs`): per build, every mesh under the nine
  `city-<layer>` groups of the running app (traffic off); per layer: meshes, materials, triangles,
  shadow/culling flags and a fingerprint over every triangle's 33 float32 values (three 32-bit
  hashes, two summed and one xor-ed, so the order of meshes and triangles does not matter). Six
  fullscreen views per build, pixel difference against `main`; `main` against a second load of
  itself for the noise floor ([data/layer-identity-main-vs-main.json](data/layer-identity-main-vs-main.json)).
  `scripts/perf-p2b/pixel-locate.mjs` finds and crops the differing pixels.
- **Paired timing** (`scripts/perf-p2b/paired.mjs`, adapted from P2a): P1's set-up (fullscreen
  2560×1440, traffic on, 202 vehicles, Edge headless with vsync and the frame-rate limit off,
  Europe/Stockholm 2026-10-21, stadium off), 600 frames per view and build, 5 rounds, builds in rotated
  order, each compared with `main` of the same round. A round starts after 3 × 10 s with background
  CPU ≤ 18 %. Rounds 3 and 4 had disturbed builds (load up to 47 %); the medians and the min … max
  ranges include them. GPU run: same, 3 rounds, `GPU=1` (timer queries on; on ANGLE an upper bound of
  GPU time, see P1). Data: [data/paired.json](data/paired.json) +
  [summary](data/paired-summary.md), [data/paired-gpu.json](data/paired-gpu.json) +
  [summary](data/paired-gpu-summary.md).
- **Start-up** (`scripts/perf-p2b/startup.mjs`, P2a's script plus the JS heap at map ready), 6 rounds.
- **Screenshot diagnosis**: `scripts/perf-p2b/shot-stability.mjs` (page screenshots) and
  `scripts/perf-p2b/render-determinism.mjs` (drawing-buffer read-back).
- Machine: AMD Ryzen 7 9800X3D, RTX 5070 Ti (ANGLE D3D11), Windows 11; Node 24.15.0, Playwright
  1.64.1. Today `main` measured 12.0 ms CPU in the overview, close to P2a's estimate for a "P1-day"
  machine (11–12 ms), so the slowdown seen on 2026-10-27 is gone; absolute numbers are still only
  compared within this phase.

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK (the usual chunk-size warning); built twice, 29 files byte-identical; no `__perfP1` in `dist/` |
| Prettier | changed lines formatted; `src/lib/cityMesh.ts` was already not Prettier-clean on `main` (165 lines), left as is; new scripts formatted |
| Vitest (PowerShell, `C:\`) | 516/517 — `police.test.ts` "outline belongs to the current artwork": in this checkout `public/assets/polis-emblem.svg` has CRLF line endings on disk (git stores LF), so its hash differs; file untouched, unrelated to this change. The same test passes (12/12) in a fresh worktree of `main` (LF on disk). New/changed unit tests 2/2 |
| Playwright, full suite, run 1 | 21/23 — A1 and A3 (screenshot comparisons, see above); A1 alone 1/1 |
| Playwright, full suite, run 2 | 19/23 — street lighting, A1, A2, A3: all four at a "next screenshot byte-identical" assertion (lines 282, 416, 578, 753); every other spec passes, including `simulation.spec` (second tab within 5 s) both times |
| `lighting.spec.ts` ×4, `main` vs branch (before the fix) | see the table above |
| **After the screenshot fix:** `lighting.spec.ts` + `lighting-l2d.spec.ts` ×4, `main` vs branch | `main` 9/9 ×4, branch 9/9 ×4 |
| **After the fix:** full suite (24 tests incl. the new `same-picture.spec.ts`), twice | **24/24, 24/24** |
| Note | one earlier full run after the fix stopped half-way: the dev server (port 5194) crashed (exit code 0xC0000409) while a second dev server for `main` shared its `node_modules` (dependency cache) through a link; 16/24 then 1/24 (no server). With that second server stopped, both runs passed. Not caused by the app |
| In the running app (dev server) | city layers 147/127/160/127/150/144/144/144 meshes (1 km cells), night overview drawn completely, fps counter works |

`src/lib/cityMesh.test.ts`: the test "seals full buffers…" described the old 3 000-triangle pieces of a
cell. It now checks the same sealing on a batch without cells (still used, e.g. `step51opt.test.ts`),
and a new test checks that a cell with 20 001 triangles becomes one geometry with its triangles in the
order they were added.

## Files

- `src/lib/cityMesh.ts` — `CITY_CELL = 40`; a cell's batch is one geometry (no 3 000-triangle sealing);
  unsealed batches grow 2× past the old piece size.
- `src/lib/cityMesh.test.ts` — sealing test on a cell-less batch; new one-geometry-per-cell test.
- `tests/samePicture.ts` (new) — `expectSamePicture()`: same picture = byte-identical, or ≤ 1/255 in
  ≤ 0.1 % of the pixels. `tests/same-picture.spec.ts` (new) — proves it accepts that noise and
  rejects real changes. `tests/lighting.spec.ts`, `tests/lighting-l2d.spec.ts` — the 21 byte-identical
  comparisons use it (import + one line each).
- `scripts/perf-p2b/` — `build-variants.mjs`, `layer-identity.mjs`, `pixel-locate.mjs`, `paired.mjs`,
  `summarize.mjs`, `startup.mjs`, `shot-stability.mjs`, `render-determinism.mjs`.
- `docs/perf-p2b/data/` — paired runs and summaries, layer identity, start-up, screenshot diagnosis,
  differing-pixel clusters.
- `docs/perf-p2b/evidence/` — `01` `main` / `02` branch Norra Promenaden by day (3 pixels differ by
  more than 8/255, 6 by any amount), `03` branch night overview, `04` the largest
  differing-pixel cluster (Innerstaden by day, `main` left, branch right, 8× enlarged).
- `.gitignore` — `/work/perf-p2b/`.

No geodata, coordinates or generated data changed; no provenance update needed.

## Reproduce

```
node scripts/perf-p2b/build-variants.mjs work/perf-p2b main,c20,c40,c80
# preview servers (.claude/launch.json, local only): phase0-backend 8095, p2b-main 5295, p2b-c20 5296,
# p2b-c40 5297, p2b-c80 5298 (vite preview --outDir work/perf-p2b/dist-<name>)
node scripts/perf-p2b/layer-identity.mjs <out.json> <newShotDir> main=http://127.0.0.1:5295 c20=… c40=… c80=…
MAX_BUSY=18 node scripts/perf-p2b/paired.mjs <new.json> 5 main=http://127.0.0.1:5295 c20=… c40=… c80=…
GPU=1 VIEWS=night/kungsgatan,night/city,night/norraPromenaden,night/overview node scripts/perf-p2b/paired.mjs <new.json> 3 …
node scripts/perf-p2b/summarize.mjs <run.json> > <summary.md>
node scripts/perf-p2b/startup.mjs <new.json> 6 main=http://127.0.0.1:5295 c40=http://127.0.0.1:5297
# dev servers: phase0-e2e 5194 (this checkout), p2b-main-e2e 5199 (git worktree of main in work/perf-p2b/main-wt)
node scripts/perf-p2b/render-determinism.mjs <new.json> main=http://127.0.0.1:5199 branch=http://127.0.0.1:5194
ROUNDS=2 node scripts/perf-p2b/shot-stability.mjs <new.json> main=http://127.0.0.1:5199 branch=http://127.0.0.1:5194
```
