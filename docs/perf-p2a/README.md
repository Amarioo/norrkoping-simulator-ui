# Performance Phase P2a — trees: shared materials and coarser cells (2026-10-27)

Branch `claude/perf-p2a` from `main` = `753475e`. **Approved (user, 2026-10-27); committed on this branch, not pushed.** Backend unchanged.
First targeted step of P2 (roadmap track P), in the order P1 proposed.

## Result

- **Picture unchanged, proven.** All 6 645 trunks and 26 580 crowns have the same position, size,
  rotation and colour as on `main` (SHA-256 over every instance matrix and colour is equal for 500 m,
  1 km and 2 km cells); the materials and geometries have the same parameters. Six fullscreen views
  (Norra and Södra Promenaden, Innerstaden, overview; day and night): **0 differing pixels** against
  `main` for every variant.
- **Change.** Trees used one trunk and one crown material *and* geometry per 500 m cell
  (405 + 405 materials, 405 + 405 geometries). Now all trees share one trunk material, one crown
  material, one cylinder and one icosahedron, and are drawn per 2 km cell (`TREE_DRAW_CELL = 80`
  scene units; 45 trunk and 45 crown instanced meshes instead of 405 + 405). A tree's look still
  comes from its index within its 500 m planting cell, as before (`src/lib/mapView.ts`).
- **Time saved (CPU per frame, paired against `main` in the same round, median of 5 rounds
  [min … max]):**

  | view | `main` CPU median | branch (2 km) | difference | CPU p95 difference |
  |---|---:|---:|---:|---:|
  | Overview, night, traffic | 25.0 ms | 16.7 ms | **−7.7** [−8.5 … −7.3] | −8.7 [−10.3 … −7.9] |
  | Overview, day, traffic | 25.0 ms | 16.7 ms | **−7.9** [−8.5 … −7.4] | −9.0 [−10.7 … −7.4] |
  | Innerstaden, night | 10.1 ms | 7.9 ms | **−2.3** [−2.4 … −1.8] | −2.5 [−2.9 … −2.1] |
  | Norra Promenaden, night | 8.8 ms | 6.5 ms | **−2.3** [−2.8 … −1.9] | −2.7 [−3.6 … −2.1] |
  | Kungsgatan, night | 3.8 ms | 3.5 ms | **−0.3** [−0.5 … −0.2] | 0.0 [−1.5 … +3.3] |

  Overview: trees 784 → 88 draw calls, material switches (all parts) 1 211 → 429, all draw calls
  7 916 → 7 220; share of frames over 16.7 ms 100 % → 54 % (on today's slower machine, see below).
- **Cell size chosen by measurement.** Shared materials alone (500 m cells) give −5.5 ms in the
  overview; 1 km cells −7.2 ms; 2 km cells −7.7 ms, and 2 km is also best in every street view.
  Coarser cells draw more tree triangles outside the view (Kungsgatan 94 k → 278 k, Innerstaden
  395 k → 559 k, overview unchanged at ≈ 0.71 M of ≈ 10.2 M); no cost is visible in the timings
  (the GPU is not the bottleneck on this computer).

### The machine was slower today than in P1

`main` measured 25.0 ms CPU in the overview today against 15.8 ms in P1 (2026-10-26). P1's own hook
build, run today in the same rounds as today's `main` build, also gives ≈ 24.5 ms
(`data/p1-build-check-summary.md`), so the code is the same and the machine or browser is slower
(Edge was 156.0.4314.42 today; P1 did not record the version; Spotify used ≈ 1.25 cores throughout;
power plan Balanced). The cause was not found. **Paired differences are valid** (main and every
variant measured under the same conditions, rotated order); absolute numbers are not comparable with
P1. In proportion: P1 attributed 5.0 of 16.5 ms (30 %) to trees; here the saving is 7.7 of 25.0 ms
(31 %), which on a P1-day machine would be ≈ 5 ms → overview ≈ 11–12 ms CPU (estimate, scaled).

### Why rAF p95 rose in the overview

The rAF interval p95 (95th percentile of the time between frames as the browser schedules them) went
from ≈ 30 to ≈ 34 ms in the overview while CPU time fell by 8 ms. The browser's frame scheduling is
quantised: `main`'s frames were all ≈ 25–29 ms, the branch's are ≈ 15–19 ms and those just over a
tick boundary are shown as a ≈ 34 ms interval (the same effect P1 described). CPU p95 is the honest
long-frame measure here and fell by 8.7 ms. On the real 164 Hz screen frames are paced differently;
not measured there.

## Method

- **Builds** (`scripts/perf-p2a/build-variants.mjs`): hook builds (`VITE_LIGHTING_HOOK=1`, source maps)
  of `main` and of the branch with `TREE_DRAW_CELL` = 20 / 40 / 80 (500 m / 1 km / 2 km). The branch
  differs from `main` only in `src/lib/mapView.ts`, so each variant swaps that one file and restores it
  (hash checked). The final branch build is byte-identical to the measured 2 km build in every code
  file; only `three.core-*.js.map` differs, and that source map also differs between two rebuilds of
  the same code (build nondeterminism in debug info, no runtime effect).
- **Identity** (`scripts/perf-p2a/tree-identity.mjs`): per build, every tree mesh read from the
  running app (traffic off); SHA-256 over all instance matrices and colours (sorted, rounded to 1e-6);
  materials, geometries, shadow and culling flags; screenshots of six views, pixel difference against
  `main` (> 8/255 in any channel). Data: `data/tree-identity.json`.
- **Paired timing** (`scripts/perf-p2a/paired.mjs`): P1's set-up (fullscreen 2560×1440, traffic on,
  Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off),
  600 frames per view and build, 5 rounds; every round measures all four builds in a rotated order and
  each is compared with `main` of the same round. A round starts only after 3 × 10 s with background
  CPU ≤ 18 % (the user stopped their dev server for the run). Load before each build: 11–25 %
  (including this run's backend and preview servers). Data: `data/paired.json`, `data/paired-summary.md`.
- Shadow maps are off in the app (`<Canvas shadows={false}>`), so trees have no shadow pass.

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; built twice, 29 files byte-identical; no `__perfP1` in `dist/` |
| `npx prettier --check` (changed files) | clean (only the changed lines were reformatted) |
| Vitest (PowerShell, `C:\`) | 480/481 — the known `terrain.test.ts` failure (looks for the backend repo next to the worktree) |
| Playwright run 1 | 18/19 — A3 Kungstorget picture after context restoration |
| A3 alone, 5× on `main` code / 5× on branch | `main` 2/5 pass, branch 3/5 pass → flaky on both, not caused by this change |
| Playwright run 2 | 19/19 |

## Files

- `src/lib/mapView.ts` — shared tree materials and geometries, `TREE_DRAW_CELL = 80`, look index per
  500 m cell, crown colours created once.
- `scripts/perf-p2a/` — `build-variants.mjs`, `tree-identity.mjs`, `paired.mjs`, `summarize.mjs`.
- `docs/perf-p2a/data/` — `paired.json` + summary, `tree-identity.json`, `p1-build-check.json` + summary.
- `docs/perf-p2a/evidence/` — `01` `main` and `02` branch, Norra Promenaden by day (identical files),
  `03` overview at night and `04` Innerstaden by day (branch). Traffic off (hence the "Ansluter till
  Ktor" banner).
- `.gitignore` — `/work/perf-p2a/`.

No geodata, coordinates or generated data changed; no provenance update needed.

## Reproduce

```
node scripts/perf-p2a/build-variants.mjs work/perf-p2a main,c20,c40,c80
# preview servers (.claude/launch.json, local only): p1-backend 8095, p2a-main 5291, p2a-c20 5292,
# p2a-c40 5293, p2a-c80 5294 (vite preview --outDir work/perf-p2a/dist-<name>)
SHOTS=day/norraPromenaden,night/norraPromenaden,day/sodraPromenaden,day/city,day/overview,night/overview \
  node scripts/perf-p2a/tree-identity.mjs <out.json> <newShotDir> main=http://127.0.0.1:5291 c20=… c40=… c80=…
MAX_BUSY=18 node scripts/perf-p2a/paired.mjs <new.json> 5 main=http://127.0.0.1:5291 c20=… c40=… c80=…
node scripts/perf-p2a/summarize.mjs <run.json> > <summary.md>
```
