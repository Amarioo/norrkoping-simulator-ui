# Phase P1 — measurement and profiling: where does the time go? (2026-10-26)

Branch `claude/perf-p1` from `main` = `9cb9a3e`. **Approved by the user (2026-10-26); committed on the branch, not pushed.** Backend unchanged. Second step of the
performance track (roadmap, track P). **Nothing is optimised in P1**: it adds measurement hooks (development
and `VITE_LIGHTING_HOOK=1` builds only) and scripts, and delivers numbers and a ranked cost list for P2. No
geodata, no coordinates, no earlier phase's output touched (no provenance file needed).

**Target (set by the user):** at least 60 fps *without hacks* in fullscreen on the user's computer
(2560×1440, 164 Hz, RTX 5070 Ti, Ryzen 7 9800X3D), at night with traffic, also in the whole-city
overview: the frame time that 95 % of frames stay under (p95) ≤ 16.7 ms.

## Result in short

- **The whole-city overview is limited by the CPU work of drawing, nothing else.** Its main thread spends
  ≈ 16.5 ms per frame, almost all of it inside three.js's renderer issuing **≈ 7 900 draw calls** (one
  draw call = one "draw this object with this material" command to the graphics card). The app's own
  per-frame work (traffic update, lighting update, vehicle beams, Svelte, Threlte) is **< 0.4 ms**.
- **Pixels are not the problem.** The overview takes the same time from 1280×720 to 3840×2160 (9× the
  pixels): 16.2–16.8 ms. The GPU timer stays below the CPU time. Night lighting per pixel costs ≈ 0 in
  the overview.
- **p95 34 ms is a threshold effect, not stutter.** The CPU time per frame sits at 14–18 ms (median
  15.8 ms), right on the 16.7 ms budget of a 60 Hz frame; frames just over it are shown one 60 Hz tick
  later (33 ms). Spikes > 20 ms are rare (≈ 1 % of frames). So every ms removed counts: hiding any one
  of the four biggest parts (≈ 4.5–5 ms each) brings p95 from 34 ms to ≈ 14 ms.
- **The draw calls come from how the city is cut up**, not from what it shows: terrain, roads, water and
  OSM buildings are ≈ 5 400 calls with only 1–3 materials per layer, because every 500 m cell is split
  again into ≤ 3 000-triangle pieces; trees are 784 calls with **784 separate (identical-looking)
  materials**; the airfield and other map details are 975 calls; every vehicle part of the traffic is
  its own never-culled instanced mesh (316 calls in every view, half of all calls in street views).
- **The target looks reachable without hacks** (estimate): merging along these lines removes most of the
  calls; the estimated P2 gains below add up to well over the ≈ 4.5 ms needed in the overview (see
  "Is the target reachable").

## Ranked cost list

### Whole-city overview, night, traffic on (2560×1440 fullscreen, 59 fps, mean 16.9 ms, p95 34.0 ms, CPU 16.5 ms, 7 907 calls)

Measured cost = frame time saved when the part is hidden (or the job skipped), median of 3 rounds, range
in brackets. Parts overlap (shared sorting and per-frame bookkeeping), so the rows do not add up; hiding
everything saves 16.46 ms, leaving ≈ 0.5 ms of fixed cost. **Estimated gain and image risk are
estimates** for P2, not measurements.

| # | Part | Calls | Measured cost, ms per frame | Why it costs | Possible P2 measures | Estimated gain (estimate) | Image risk |
|---:|---|---:|---|---|---|---|---|
| 1 | Trees | 784 | **5.04** (4.67–5.17) | 392 cells × (trunks + crowns), each mesh with its own material → 784 material switches, each re-uploading all uniforms (6.4 µs per call vs ≈ 2.3 µs for one-material layers) | one shared trunk material + one crown material; one instanced mesh pair per 1 km cell (288 calls) or 2 km (90) | 3.5–4.5 ms | none for shared materials (same values); coarser culling only |
| 2 | Buildings (OSM walls, roofs, cornices + detailed models) | 1 529 | **4.72** (4.41–4.83) | 1 246 OSM pieces (3 materials) + 283 detailed models with 278 materials (211 canvas textures) | merge pieces per cell / 1 km cells; shared materials or a texture atlas for the detailed models | 2.5–3.5 ms | none for merging; low–medium for an atlas (texture filtering at edges) |
| 3 | Terrain (land, grass, banks) | 1 992 | **4.60** (3.96–4.65) | 1 719 land pieces: 593 cells × up to 11 pieces of ≤ 3 000 triangles, 1 material | merge the pieces of a cell (→ ≈ 900 calls) or use 1 km cells (≈ 280) | 2.5–3.5 ms | none (same triangles, same material); coarser culling |
| 4 | Roads, markings, rail, bridges | 1 924 | **4.46** (4.12–4.79) | same cutting (1 422 road + 484 marking pieces) + 47 bridges with 47 materials | as terrain; shared bridge materials | 2.5–3.5 ms | none / low |
| 5 | Traffic, drawing (cars, buses, trams, trains, signals) | 310 | **2.39** (2.19–2.62) | each vehicle part is its own instanced mesh, `frustumCulled = false` (drawn in every view), 31 materials, all instance matrices re-uploaded every frame | one mesh per vehicle kind with per-vertex colours (or a few material groups), culling by bounding sphere | 1.5–2.5 ms (also 1–1.5 ms in street views) | medium (glass, chrome and lamps differ in roughness/metalness/glow) |
| 6 | Map details (airfield pavements and edge lights, police wings, solar panels, …) | 975 | **2.30** (1.84–2.48) | 678 runway/taxiway rectangles and 230 edge-light boxes as single meshes | merge per material (55 looks), instance the edge lights | 1.5–2 ms | none |
| 7 | Traffic, CPU update | – | **1.55** (1.46–1.90) | `transport/transit/signals.update` (0.28 ms JS) + re-uploading every instance matrix (≈ 1.2 ms in three.js buffer updates) | upload only what moved; fewer meshes (item 5) | 0.5–1 ms | none |
| 8 | Water | 310 | **0.80** (0.39–0.84) | 324 pieces, 1 material | merged with item 3 | (in item 3) | none |
| 9 | Landmarks (Rådhuset, police tower, stadium) | 19 | 0.55 (−0.04–0.63) | 19 materials | – | – | – |
| 10 | Street-light fixtures and halos | 1 | 0.48 (−0.10–0.78) | one instanced halo call | – | – | – |
| 11 | Vehicle beams (`updateVehicles`) | – | 0.31 (0.10–0.40) | | – | – | – |
| 12 | Night lighting per pixel (lamp loop + beams off) | – | 0.29 (0.02–0.49) | GPU, not limiting here | – | – | – |
| 13 | Lighting update (`lighting.update`) | – | 0.24 (0.10–0.33) | | – | – | – |
| 14 | Aircraft | 52 | 0.20 (0.15–0.55) | | – | – | – |
| 15 | Labels | 10 | ≈ 0 (−0.47–+0.37) | | – | – | – |

**Cross-cutting (from the CPU profile, overlaps the rows above):** the lighting patch's uniform arrays
(stadium lights 48 × vec4, stadium roofs 16 × vec4, vehicle beams) are re-uploaded on **every material
switch** — three.js's array setter has no cache — so items 1, 2, 4 and 5 pay ≈ 2–6 µs extra per switch.
Moving these arrays into one uniform buffer (UBO) or a small texture, written once per frame, is a P2
measure on its own: **estimated 0.5–1.5 ms** in the overview and up to ≈ 1 ms in street views; image risk
none if the values stay the same, but it touches all 20 shader programs (compile check on ANGLE needed).
Static objects could also skip the per-frame matrix update (0.7 ms in the profile): **estimated 0.3–0.5 ms**,
no image risk.

### Street view, Kungsgatan, night, traffic on (279 fps, mean 3.58 ms, p95 6.9 ms, CPU 3.45 ms, 629 calls)

| # | Part | Calls | Measured cost, ms per frame | P2 measure | Estimated gain (estimate) |
|---:|---|---:|---|---|---|
| 1 | Traffic, drawing | 310 | **1.85** (1.57–1.92) | as overview item 5 — half of all calls here are vehicles, drawn although mostly off-screen | 1–1.5 ms |
| 2 | Traffic, CPU update | – | **1.63** (1.37–1.76) | as overview item 7 | 0.5–1 ms |
| 3 | Vehicle beams per pixel (GPU) | – | **0.86** (0.81–0.88) | measured with lamps + beams off; with traffic off the lamps alone cost +0.02 ms, so this is the beams. Not needed for the target | – |
| 4 | Terrain | 59 | 0.35 (0.35–0.45) | merging (overview item 3) | small |
| 5 | Roads, trees, water, buildings, map details, landmarks, labels, lights, lighting update | ≤ 94 each | ≤ 0.2 each (noise level) | – | – |

Innerstaden (city view, 141 fps, 7.1 ms) sits in between: roads 1.51, traffic drawing 1.49, traffic update
1.32, buildings 1.26, terrain 1.24, trees 0.84 ms. Day: the same order, slightly lower (overview 16.4 ms,
Kungsgatan 2.7 ms). Without traffic the overview runs at 15.2 ms mean, p95 17.9 ms.
Full tables: [data/part-cost-summary.md](data/part-cost-summary.md).

## What the measurements show (tasks 1–4)

### 1. Draw calls and triangles per part

One frame's draw calls attributed to parts (the hook wraps `renderer.renderBufferDirect` for that one
frame and reads `renderer.info` before and after every call; the per-part sums equal the frame totals
exactly). Night, traffic on, fullscreen 2560×1440 (median of 3 captures):

| Part | Overview calls | triangles | Innerstaden calls | Kungsgatan calls | materials | material switches (overview) |
|---|---:|---:|---:|---:|---:|---:|
| Terrain (land, grass, banks) | 1 992 | 4.20 M | 788 | 59 | 2 | 2 |
| Roads, markings, rail | 1 877 | 3.73 M | 947 | 94 | 2 | 2 |
| Buildings (OSM) | 1 246 | 0.41 M | 496 | 43 | 3 | 3 |
| Map details (airfield, …) | 975 | 0.03 M | 165 | 11 | 25 | 25 |
| Trees | 784 | 0.71 M (32 970 instances) | 244 | 10 | 784 | 784 |
| Water | 310 | 0.14 M | 103 | 5 | 1 | 1 |
| Building details | 283 | 0.09 M | 222 | 52 | 278 | 278 |
| Transit (buses, trams, trains) | 191 | 0.21 M | 191 | 191 | 22 | 22 |
| Vehicles (cars, trucks) | 125 | 0.33 M | 125 | 125 | 9 | 4 |
| Aircraft | 52 | 0.00 M | 0 | 0 | 9 | 9 |
| Bridges | 47 | 0.29 M | 47 | 15 | 47 | 47 |
| Labels | 10 | 0.00 M | 21 | 2 | 10 | 10 |
| Police tower / Rådhuset / stadium | 8 / 5 / 6 | 0.02 M | 8 / 5 / 6 | 8 / 0 / 0 | 19 | 19 |
| Signals | 3 | 0.04 M | 3 | 3 | 3 | 3 |
| Street-light fixtures and halos | 1 | 0.05 M | 1 | 10 | 1 | 1 |
| Sky | 1 | 0.00 M | 1 | 1 | 1 | 1 |
| **Total** | **7 916** | **10.24 M** | **3 373** | **629** | | **1 211** |

All six P0 views, day and night, with and without traffic, with drawn/visible objects, programs and
scene nodes: [data/breakdown-summary.md](data/breakdown-summary.md). 20 shader programs in every view.

How the scene is cut ([data/merge-estimate.json](data/merge-estimate.json), whole scene, counts):

| Layer | Meshes now | 500 m cells (one mesh per cell) | 1 km cells | 2 km cells |
|---|---:|---:|---:|---:|
| land | 1 719 | 593 | 160 | 47 |
| roads | 1 422 | 540 | 150 | 46 |
| markings | 484 | 465 | 147 | 45 |
| walls / roofs / cornices | 427 / 419 / 427 | 418 / 418 / 419 | 144 each | 45 each |
| water / banks | 324 / 315 | 299 / 300 | 127 / 122 | 44 / 44 |
| **layers total** | **5 537** | **3 452** | **1 280** | **406** |
| trees (instanced meshes) | 810 (810 materials, 2 looks) | 405 cells | 288 | 90 |

These merged counts are **estimates** of what P2 could reach (whole scene, before culling; the per-view
numbers must be measured).

### 2. Cost per part in time

`scripts/perf-p1/part-cost.mjs`: in one page, the unchanged scene is measured before and after (300 frames
each), and in between each variant once (rotating order per round): one part hidden, or one per-frame CPU
job skipped (traffic update, lighting update, vehicle beams), or the night lighting per pixel off (lamp
loop `cityCellSlots = 0` + vehicle beams off), or everything hidden. 3 rounds × traffic on/off × day/night ×
overview / Innerstaden / Kungsgatan, fresh browser per round and traffic setting. Spread: the baselines of
the three rounds agree within ±0.1 ms (overview 16.90–16.92 ms); baseline drift within a page ≤ 0.6 ms.
Results above and in [data/part-cost-summary.md](data/part-cost-summary.md).

### 3. CPU profile: where the JavaScript time goes

`scripts/perf-p1/cpu-profile.mjs`: DevTools CPU profiler (CDP `Profiler`, 100 µs sampling) for 6 s per view,
3 rounds × traffic on/off × day/night × overview / Kungsgatan; every sample is mapped back to its source file,
function and enclosing three.js class through the hook build's source maps, and sorted by the deepest
phase function on its stack. ms per frame (median of 3; the profiler adds ≈ 0.5 ms per frame):

| Category | Overview, night, traffic | Kungsgatan, night, traffic | Overview, no traffic |
|---|---:|---:|---:|
| three.js: program switches and uniform uploads (`setProgram`, `WebGLUniforms.upload`, `refreshUniforms*`) | **5.20** (31 %) | **1.87** (45 %) | 5.10 |
| three.js: geometry, buffers and vertex-array binding per call (`WebGLObjects.update`, `WebGLBindingStates`, instance-matrix uploads) | **5.15** (29 %) | 0.42 | 3.80 |
| three.js: issuing the draw calls (`renderBufferDirect`, `drawArrays`) | 2.20 (13 %) | 0.18 | 1.97 |
| three.js: render list and culling (`projectObject`, frustum tests) | 1.31 (8 %) | 0.76 | 2.09 |
| three.js: per object (model-view and normal matrices) | 0.90 | 0.06 | 0.91 |
| three.js: sorting the render list | 0.90 | 0.06 | 0.85 |
| three.js: matrix update (`updateMatrixWorld`, every scene node every frame) | 0.71 | 0.43 | 0.67 |
| browser outside JavaScript | 0.32 | 0.12 | 0.18 |
| traffic update (vehicles, transit, signals, aircraft) | 0.28 | 0.23 | – |
| traffic snapshot (server stream, JSON) | 0.02 | 0.01 | – |
| lighting `update` / `updateVehicles` (gather of the nearest beams) | 0.01 / 0.01 | ≤ 0.01 | ≤ 0.01 |
| Threlte tasks / Svelte reactivity / garbage collection | 0.02 / < 0.01 / 0.02 | ≤ 0.01 | ≤ 0.02 |
| **busy main thread per frame** | **17.2** | **4.2** | **15.3** |

Top single functions (overview): `renderBufferDirect` 1.36, `WebGLUniforms.upload` 1.28,
`WebGLObjects.update` 1.27, native `bindVertexArray` 1.26, `WebGLBindingStates.needsUpdate` 1.05,
`setProgram` 1.02 ms. In Kungsgatan the uniform uploads drop from 1.87 to 0.45 ms without traffic: the
traffic's 31 materials are switched every frame. Full tables:
[data/cpu-profile-summary.md](data/cpu-profile-summary.md).

### 4. GPU side

`scripts/perf-p1/gpu.mjs`, `EXT_disjoint_timer_query_webgl2` (available in Edge here; on only while
measuring), 3 rounds, traffic on ([data/gpu-summary.md](data/gpu-summary.md)):

| View (night) | 1280×720 | 1920×1080 | 2560×1440 | 3840×2160 | GPU timer at 2560×1440 | lamps + beams off (2560×1440) |
|---|---:|---:|---:|---:|---:|---|
| Overview, frame ms | 16.32 | 16.19 | 16.76 | 16.33 | 12.7 ms (< CPU 16.4) | frame −0.26, GPU −0.14 |
| Innerstaden, frame ms | 6.76 | 6.91 | 7.17 | 7.55 | 6.8 ms | frame −0.39, GPU −2.0 |
| Kungsgatan, frame ms | 2.65 | 2.96 | 3.35 | 4.21 | 3.3 ms | frame −0.78, GPU −0.84 |

- **Fill rate (the number of pixels) is not the bottleneck** in the overview: 9× the pixels, same time.
  In street views at night more pixels cost a little (Kungsgatan +1.6 ms from 0.9 to 8.3 Mpx) because of
  the per-pixel lighting, still far under budget.
- **Light per pixel at night:** ≈ 0 in the overview, 0.4–0.8 ms frame time in street views, almost all of
  it the vehicle beams (lamps alone: +0.02 ms with traffic off). The GPU timer drops 0.8–2 ms with lamps
  and beams off, but the CPU still decides the frame time.
- The timer measures elapsed GPU-timeline time on ANGLE/D3D11, including waits for the CPU, so it is an
  upper bound of GPU busy time (remaining gap 2).

### Frame by frame

`scripts/perf-p1/frame-series.mjs`, 1 200 consecutive frames × 3 rounds ([data/frame-series-summary.md](data/frame-series-summary.md)):

| View | CPU per frame median | p95 | max | > 12.2 ms | > 16.7 ms | > 20 ms | traffic-snapshot frames vs others |
|---|---:|---:|---:|---:|---:|---:|---|
| Overview, night | 15.8 ms | 17.7 ms | 23.8 ms | 100 % | 19 % | 0.8 % | 16.5 vs 15.9 ms |
| Overview, day | 15.7 ms | 17.9 ms | 27.0 ms | 100 % | 19 % | 1.1 % | 16.5 vs 15.9 ms |
| Kungsgatan, night | 2.6 ms | 7.0 ms | 8.3 ms | 0 % | 0 % | 0 % | – |

The p95 of 34 ms in P0's metric (intervals between `requestAnimationFrame` timestamps) comes from frames
that just miss the 16.7 ms tick, not from long frames: the fps counter (time between frame starts) shows
p95 ≈ 18–20 ms for the same view (evidence 01). Traffic snapshots (≈ 10 per second) add ≈ 0.5 ms to their
frame. **On the 164 Hz display with vsync a frame is shown after a whole number of 6.1 ms refreshes, so a
frame must take ≤ 12.2 ms to be shown within two refreshes; 100 % of overview frames take longer today.**

## Is the target reachable?

Estimate (not measured): the P2 gains for the overview's top six items add up to ≈ 12–17 ms; they overlap
(fewer material switches and calls are shared savings), so a realistic total is **≈ 8–11 ms**, leaving the
overview at ≈ 6–9 ms of CPU per frame. That is under 16.7 ms with margin and under the 12.2 ms that a 164 Hz
display needs for an even ≥ 82 fps. Every street and district view is already well inside the target. So
**60 fps without hacks looks reachable** on this computer; the first two P2 steps alone (trees, layer
merge) should already be enough for p95 ≤ 16.7 ms in the overview (estimate).

## Proposed P2 order

Each step paired-measured against the step before (`docs/step62/rollout-plan.md`), picture unchanged or
deviations approved:

1. **P2a Trees:** shared trunk/crown materials, coarser cells. Smallest change, biggest single part,
   no image change. Estimated −3.5 … −4.5 ms (overview).
2. **P2b Worker layers (terrain, roads, markings, water, banks, OSM buildings):** merge the ≤ 3 000-triangle
   pieces of each cell first (no culling change), then measure 1 km cells. Estimated −5 … −8 ms together.
3. **P2c Map details:** merge the airfield pavements per material, instance the edge lights. Estimated
   −1.5 … −2 ms.
4. **P2d Traffic:** fewer meshes per vehicle kind, culling, upload only moved instances. Estimated
   −1.5 … −2.5 ms overview, −1 … −2 ms street views.
5. **P2e Lighting uniforms in a UBO/texture** and frozen matrices for static objects, if the target is not yet
   met with margin. Estimated −1 … −2 ms.
6. Building details / bridges (texture atlas) only if still needed.

## Measurement set-up

- **Builds.** Production build with `VITE_LIGHTING_HOOK=1` and source maps (`work/perf-p1/dist-hook`); the
  hook build's frame times equal P0's baseline within 1 % (overview 59 fps, p95 34.2 ms; Kungsgatan night
  270 fps; [data/fullscreen-baseline-summary.md](data/fullscreen-baseline-summary.md)), so the probe does
  not change what is measured.
- **Browser and screen.** Edge headless (ANGLE D3D11) with `--disable-gpu-vsync --disable-frame-rate-limit`
  (ms per frame shows headroom), fullscreen via the map's own button at 2560×1440, DPR 1, Europe/Stockholm
  2026-10-21, day 12:39 / night 21:30, stadium off, 202 vehicles from the isolated backend copy (port 8095,
  default settings); traffic off = every `/api` request aborted.
- **Fixed views.** P0's: overview, city (Innerstaden), kungsgatan, stromparken, police, idrottsparkenPitch
  (counts in all six; timings in overview, city, kungsgatan).
- **Machine load.** Timing ran only on a quiet machine (`run-all.mjs` waits until background CPU ≤ 18 %
  for 40 s; whole-machine load before each round 14–20 %, which includes this run's own backend and
  preview server). A game and another session's tests ran earlier; those disturbed runs were discarded.
  The user stopped the game, their own dev server (port 5173) and the other session's dev server while
  the suite waited.

## What was added (code)

- `src/lib/perf/perfProbe.ts` — `globalThis.__perfP1`: parts of the scene, one-frame draw-call capture,
  hide/show parts, per-frame log (tasks, render, GPU, snapshot frames), GPU timer, pixel-ratio scaling.
  Nothing runs until a script asks; the GPU timer and the capture wrapper are installed only while measuring.
- `src/lib/perf/perfFlags.ts` — switches to skip the traffic update, lighting update or vehicle beams.
- `src/lib/Scene.svelte` — installs the probe and reads the switches, both only behind `hookEnabled`
  (development and hook builds), like the existing `__cityLighting` hook.
- **Normal production builds are unchanged:** `npm run build` on this branch gives a `dist/` that is
  **byte-identical to `main`'s** (all 29 files, SHA-256 compared); `__perfP1`, `__fpsStats` and the probe's
  stage names occur 0 times in `dist/` and once in the hook build.
- `scripts/perf-p1/` — `lib.mjs`, `load.mjs`, `wait-quiet.mjs`, `run-all.mjs`, `breakdown.mjs`,
  `merge-estimate.mjs`, `part-cost.mjs`, `cpu-profile.mjs` + `cpu-analyse.mjs` + `cpu-reanalyse.mjs`,
  `gpu.mjs`, `frame-series.mjs`, `capture.mjs`, `summarize.mjs`.
- `.gitignore` — `/work/perf-p1/`.

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK (the usual chunk-size warning); `dist/` byte-identical to `main` |
| `npm test` (Vitest, quiet machine) | 480 / 481 — the one failure is the known `terrain.test.ts` backend path in a worktree. (An earlier run during the game: 15 failures, 11 of them 5 s timeouts; not counted.) |
| `npm run test:e2e` (Playwright, dev server 5194 + backend 8095) | run 1: 18 / 19 (A3 picture after context restoration, a known flaky picture check; A3 then passed 3 / 3 alone); run 2: **19 / 19** |

## Evidence

[evidence/](evidence/) (JPEG copies of 2560×1440 PNG captures in `work/perf-p1/captures`, fps counter
expanded, uncapped headless so the counter shows headroom): 01 overview at night (57 fps, 7 916 calls) ·
02 Innerstaden at night · 03 Kungsgatan at night · 04 overview with terrain, roads, water and OSM buildings
hidden (141 fps, 2 491 calls). Raw data and summaries in [data/](data/). Known gaps:
[remaining-gaps.md](remaining-gaps.md).

## Reproduce

```
# servers (.claude/launch.json, local only): p1-backend 8095, p1-hook-preview 5280, p1-e2e 5194
VITE_LIGHTING_HOOK=1 npx vite build --sourcemap --outDir work/perf-p1/dist-hook
node scripts/perf-p1/breakdown.mjs docs/perf-p1/data/breakdown.json
node scripts/perf-p1/merge-estimate.mjs docs/perf-p1/data/merge-estimate.json
MAX_BUSY=18 node scripts/perf-p1/run-all.mjs work/perf-p1/runs/<new>     # baseline, parts, cpu, gpu, frames
node scripts/perf-p1/cpu-reanalyse.mjs <run>/cpu-profile.json <run>/cpuprofiles <out.json>
node scripts/perf-p1/summarize.mjs breakdown|parts|cpu|gpu|frames <data.json> > <summary.md>
node scripts/perf-p1/capture.mjs <newDir>
```

Timings are not byte-reproducible (they are measurements); the scripts, views, times and rounds are fixed,
and the raw data of the run reported here is in `data/`. No generated geodata: nothing to rebuild or hash.
