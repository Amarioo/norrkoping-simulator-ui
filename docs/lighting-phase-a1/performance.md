# Phase A1 — performance

**Baseline:** the approved Phase 0 state — a frozen reference app (`git archive bf5f726` + the exact
Phase 0 working-tree files, SHA-256-verified) under ignored `work/lighting-a1/phase0-app/`.
**After:** this working tree. Same method as Phase 0 (`scripts/lighting-phase0/measure.mjs`, now with an
optional `VIEWS` list): production builds served by `vite preview` (5197 Phase 0, 5198 A1), Edge 156 /
ANGLE D3D11 / RTX 5070 Ti, uncapped frame rate, 1280 × 900, DPR 1, Europe/Stockholm, 2026-10-21, API
aborted (no traffic), fresh browser per run, runs serial, before/after order alternating per round.
Views are the app's own presets (production has no camera hook): **station** (Resecentrum),
**grandHotel** (Drottninggatan at Saltängsbron), **centrum** (central city overview), **city** (inner
city), plus the pilot views. Each view: 180 rAF intervals; then post-GC JS heap.

Series 1: 3 rounds (A1 build with the first final-count candidate, 125 fixtures). Confirmation: 2
rounds on the **final** build (127 fixtures). Both retained in full
([data/performance.json](data/performance.json)); pooled = all 5 rounds. These are browser frame
intervals, **not isolated GPU time**; heap is the JS heap only; texture bytes are CPU arithmetic, **not
VRAM**. Cold boot and lower-tier hardware were not measured.

## Gates (Step 6.2 / Phase 0 targets)

| Gate | Series 1 | Confirmation | Pooled | Status |
|---|---:|---:|---:|---|
| Median map-ready Δ ≤ 100 ms | +51 | −110 | **−9.3** (4169.5 → 4160.2 ms) | pass |
| Max paired p95 Δ ≤ 1 ms | +0.3 | +2.35 (one cell) | **+0.8** | pass pooled; see note |
| Day p95 Δ ≤ 0.5 ms | +0.3 | +0.3 | **+0.6** (`city`) | see note: the `city` view draws identical calls/triangles by day |
| Post-GC heap Δ ≤ 10 MB | +0.32 | +0.32 | **+0.32 MB** | pass |
| Incremental calls ≤ 40 / triangles ≤ 100k per view | max **+12 calls / +12 740 triangles** | | | pass |
| Lighting buffers ≤ 16 MB | 95 072 B textures + 123 484 B instance/geometry buffers | | | pass |
| Programs: none added by toggles or swaps | 20 in all 57 captures, before and after | | | pass |
| No night rebuild/upload by day; no overflow | `builds` = 1 (unit test); 0 overflow cells | | | pass |

**Note on p95 excursions.** The confirmation series has one +2.35 ms p95 cell (stadium pitch, night
MATCH) and positive deltas in `city`; series 1 has the opposite sign in the same cells (e.g. `city` day
median −0.4 ms). Draw calls and triangles of the `city` view are **identical** before and after by day
(A1 is beyond the 1.25 km pole-detail distance there; +2 halo calls at night), so its +0.6 ms pooled day
p95 cannot come from A1 rendering work. As in Phase 0, with 2–3 runs per series the per-cell p95
resolution of this method is about ±1 ms; no regression is supported by the data, and no
sub-millisecond claim is made.

## Frame intervals and rendered work per view

Medians across runs of each run's median / p95 (ms); Δ = A1 − Phase 0. Calls/triangles from DEV
servers of both builds at the same presets (`view-calls.mjs`).

| Condition / view | Phase 0 median / p95 | A1 median / p95 | Δ pooled | Δ series 1 | Δ confirmation | calls Δ | triangles Δ |
|---|---:|---:|---:|---:|---:|---:|---:|
| day / Resecentrum (station) | 2 / 2.5 | 2 / 2.5 | 0 / 0 | 0 / 0.3 | 0.05 / 0 | 6 | 11992 |
| day / Saltängsbron / Drottninggatan (grandHotel) | 5 / 5.6 | 5 / 5.9 | 0 / 0.3 | 0.1 / 0.3 | 0 / -0.15 | 6 | 11992 |
| day / Central city overview (centrum) | 3 / 3.5 | 3 / 3.6 | 0 / 0.1 | 0 / 0.1 | 0.1 / 0.25 | 8 | 12030 |
| day / Inner city overview (city) | 8.8 / 9.6 | 9.3 / 10.2 | 0.5 / 0.6 | -0.4 / -0.3 | 0.4 / 0.3 | 0 | 0 |
| day / Kungsgatan (pilot) | 2.2 / 2.6 | 2.2 / 2.8 | 0 / 0.2 | 0 / 0.2 | 0 / 0.1 | 6 | 11992 |
| day / Strömparken (pilot) | 6.3 / 7.3 | 6.4 / 7.3 | 0.1 / 0 | 0 / 0.3 | 0.1 / -0.2 | 10 | 12486 |
| day / Stadium pitch (pilot) | 7.8 / 8.9 | 8 / 9 | 0.2 / 0.1 | -0.2 / 0.2 | -0.1 / -0.9 | 8 | 12030 |
| day / Parken (pilot) | 2 / 2.5 | 2.1 / 2.5 | 0.1 / 0 | 0 / 0 | 0.05 / 0 | 0 | 0 |
| night-off / Resecentrum (station) | 2 / 2.4 | 2.1 / 2.5 | 0.1 / 0.1 | 0 / 0.1 | 0.1 / 0.15 | 8 | 12246 |
| night-off / Saltängsbron / Drottninggatan (grandHotel) | 5 / 6 | 4.9 / 5.8 | -0.1 / -0.2 | -0.3 / -0.1 | 0 / -0.05 | 7 | 12236 |
| night-off / Central city overview (centrum) | 3 / 3.5 | 3.1 / 3.5 | 0.1 / 0 | 0 / 0 | 0.1 / -0.05 | 10 | 12284 |
| night-off / Inner city overview (city) | 9 / 10.4 | 8.8 / 10.5 | -0.2 / 0.1 | -0.4 / 0 | 0.55 / 0.55 | 2 | 254 |
| night-off / Kungsgatan (pilot) | 2.2 / 2.8 | 2.2 / 2.6 | 0 / -0.2 | 0 / -0.3 | 0.05 / 0.35 | 7 | 12236 |
| night-off / Strömparken (pilot) | 6.4 / 7.1 | 6.5 / 7.9 | 0.1 / 0.8 | -0.2 / 0.3 | 0.2 / 0.8 | 12 | 12740 |
| night-off / Stadium pitch (pilot) | 7.7 / 8.7 | 7.7 / 8.7 | 0 / 0 | -0.4 / -0.2 | 0.25 / 0.15 | 10 | 12284 |
| night-off / Parken (pilot) | 2.1 / 2.5 | 2.1 / 2.5 | 0 / 0 | 0 / 0 | 0.1 / 0.1 | 1 | 244 |
| night-match / Resecentrum (station) | 2.1 / 2.5 | 2 / 2.4 | -0.1 / -0.1 | -0.1 / -0.1 | 0.05 / 0.1 | 8 | 12246 |
| night-match / Saltängsbron / Drottninggatan (grandHotel) | 5.1 / 5.9 | 5.1 / 5.9 | 0 / 0 | 0 / -2.2 | 0.1 / 0.1 | 7 | 12236 |
| night-match / Central city overview (centrum) | 3.1 / 3.7 | 3.1 / 3.6 | 0 / -0.1 | 0 / 0.2 | -0.1 / -0.25 | 10 | 12284 |
| night-match / Inner city overview (city) | 9.1 / 10.2 | 9.3 / 10.6 | 0.2 / 0.4 | -0.2 / 0.1 | 0.8 / 1 | 2 | 254 |
| night-match / Kungsgatan (pilot) | 2.2 / 2.7 | 2.2 / 2.8 | 0 / 0.1 | 0 / 0 | 0 / 0.2 | 7 | 12236 |
| night-match / Strömparken (pilot) | 6.5 / 7.3 | 6.5 / 7.4 | 0 / 0.1 | -0.2 / -0.5 | 0.15 / 0.3 | 12 | 12740 |
| night-match / Stadium pitch (pilot) | 7.8 / 8.8 | 8.1 / 9.5 | 0.3 / 0.7 | 0.2 / 0.1 | 0.45 / 2.35 | 10 | 12284 |
| night-match / Parken (pilot) | 2.1 / 2.6 | 2.1 / 2.6 | 0 / 0 | -0.1 / 0 | 0.1 / 0.1 | 1 | 244 |

Where calls/triangles grow, it is the A1 pole housings/lenses (≈ 12 k triangles for 127 fixtures,
2 chunk groups × ≤ 7 instanced meshes) drawn while the camera is within 1.25 km of a chunk; halos add
1–2 calls at night. Draw-call cost is bounded by the number of visible chunks × fixture types, not by
the number of lamps.

## Start-up, build and memory

| Measure | Phase 0 | A1 | Where |
|---|---:|---:|---|
| Map-ready (median of 5 runs) | 4169.5 ms | 4160.2 ms | production, pooled |
| Registry + validation + emitters + index + packing (CPU, before upload) | 0.79 ms | 1.09 ms | Node, warm, median of 15 (`scripts/lighting-a1/timing.test.ts`) |
| Same, in the DEV browser at start-up | 2.8 ms | 5.0 ms | `describe().streetLighting.timings.buildMs` |
| Texture upload submission (`initTexture`) | 2.8 ms | 2.9 ms | DEV browser, CPU submission only |
| A1 generation (offline, never at runtime) | — | 36 ms | Node, warm |
| Fixtures / visual groups / instanced meshes / instances | 105 / 3 / 19 / 315 | 232 / 5 / 31 / 696 | `describe()` |
| Lamp texture (RGBA32F) | 13 440 B | 29 696 B | CPU typed arrays |
| Page atlas + directory | 40 960 + 520 B | 64 512 + 864 B | |
| Fixture instance buffers / fixture geometry | 21 420 / 46 800 B | 47 328 / 76 156 B | |
| Post-GC JS heap | 116.895 MB | 117.215 MB (+0.32) | production, pooled |
| App chunk | 591 607 B (164 198 gzip) | 632 080 B (170 165 gzip) | +40.5 KB / +6.0 KB gzip, essentially the bundled fixture file |
| Shader programs | 20 | 20 | every capture state |

Daytime overhead: the light-grid lookup stays behind the `cityLampLevel` branch (unchanged shader,
program key `city-lights-v2`); by day A1 only adds its pole/lens draw calls where they are within the
detail distance (+6…10 calls, ≈ 12 k triangles in the views above). No night-only data is rebuilt or
uploaded by day.

## Lifecycle, recreation and WebGL restoration (E2E, live map, final code)

| Check | Result |
|---|---|
| Phase 0 lifecycle test (now with 232 fixtures): 10 rebuilds + 10 controller recreations | geometries/textures flat at 4150 / 226 after every cycle (start 4156 / 226); programs 20; 1 227 shared materials rebound; Kungsgatan frame byte-identical before, after the cycles and after context loss/restore |
| A1 test: 6 complete swaps pilot ↔ pilot + A1 at the Drottninggatan pose | per kind constant: pilot 4208 geometries / 226 textures, combined 4215 / 226; programs 20 with A1 in view (19 while only pilot halos exist, none in view), never above the start |
| Rejected set (17 lamps in one corridor cell) | `capacity` rejection, status `rendering-previous`, frame byte-identical |
| Controller recreation, then WebGL context loss/restore with the expanded set | frame byte-identical to the start; 232 fixtures, status `ok` |
| Illumination | mean frame luma at the Drottninggatan pose 15.0 (pilot + A1) vs 7.0 (pilot only): ×2.1, no ambient change |

Heap over the 20 Phase 0 lifecycle cycles: 131.13 → 131.61 MB (< 2 MB gate).
