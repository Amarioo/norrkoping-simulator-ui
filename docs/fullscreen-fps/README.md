# Phase P0 — fullscreen map and fps counter (2026-10-26)

Branch `claude/fullscreen-fps` from `main` = `60c3297`. **Approved by the user (2026-10-26, after testing
it locally). Not committed.** Backend unchanged.
First step of the performance track (roadmap, track P). No geodata, no coordinate changes, no
earlier phase's output touched.

## What it does

- **Fullscreen.** A button at the right end of the map toolbar (icon; accessible name "Helskärm" /
  "Avsluta helskärm") puts the map panel in fullscreen with the Fullscreen API. Esc, the button and
  the `F` key leave it; `F` also enters it, but not while focus is in a form field (select, checkbox,
  input). Threlte resizes the renderer's drawing buffer and the camera aspect from the panel's size on
  entry and exit (window `resize` + `ResizeObserver`), so the picture is neither stretched nor blurred;
  `dpr` stays 1. The toolbar ("Utforska", Landmärken), free camera, follow camera, vehicle inspector,
  labels, status, key and attribution all stay usable and do not overlap (evidence 06–11). Where the API
  is missing or refused (iPhone Safari, a permissions policy), the panel fills the browser window with
  CSS instead (`data-fullscreen="window"`), with the same button and Esc.
- **Fps counter.** A box in the bottom-right corner of the map, **off by default**. Collapsed: fps,
  mean frame time and p95 (the time 95 % of frames stay under), over a sliding 2 s window, refreshed
  twice a second. Click it to expand: frame time mean · p95 · max, CPU time per frame (all Threlte
  tasks + `renderer.render()`), draw calls, triangles, shader programs, resolution in pixels (with the
  screen's pixel ratio when it differs from the renderer's), geometries and textures. Toggled with the
  "FPS" toolbar button or `P`; on/off and expanded are stored in `localStorage` (try/catch: a blocked
  storage just forgets the choice). Visible in window and fullscreen.
- **Cost.** No DOM update per frame (the overlay reads twice a second), no GPU queries, no extra
  renders (the probe's tasks never invalidate), `renderer.info` is only read — three.js `autoReset` is
  untouched. In normal production builds the probe does nothing while the counter is off.
- **Hook for scripts.** `globalThis.__fpsStats` (`read()`, `reset()`, `collecting`, `visible`) in
  development and `VITE_LIGHTING_HOOK=1` builds, which also collect while the counter is hidden. Not
  present in normal builds (checked: 0 occurrences in `dist/`, 1 in the hook build).
- **Pauses.** A frame gap over 1 s (tab in the background, sleep) is not counted as a frame, and a
  hidden tab (`visibilitychange`) or switching the counter off starts a new interval; old frames leave
  the window by time (unit tests).

## Performance-work baseline (fullscreen, with traffic)

Production build with the hook, Fullscreen API entered with the map button, Edge headless with vsync
and the frame-rate limit off (so ms per frame shows headroom; the real display caps at its refresh
rate), DPR 1, RTX 5070 Ti (ANGLE D3D11), AMD Ryzen 7 9800X3D (16 threads, 64 GB), 202 simulated vehicles (backend default
settings), 2026-10-21, stadium off; day 12:39, night 21:30. Median of 2 rounds, 300 frames per view.
Full table: [evidence/perf/fullscreen-baseline-summary.md](evidence/perf/fullscreen-baseline-summary.md).

| Screen | View | Day fps · ms · p95 ms | Night fps · ms · p95 ms | CPU ms (night) | Draw calls | Triangles |
|---|---|---:|---:|---:|---:|---:|
| 2560×1440 | overview (whole city) | 59 · 16.9 · 34.0 | 58 · 17.1 · 34.1 | 16.4 | 7 916 | 10.2 M |
| 2560×1440 | city (Innerstaden) | 149 · 6.7 · 8.1 | 140 · 7.2 · 8.9 | 7.0 | 3 399 | 5.8 M |
| 2560×1440 | kungsgatan | 369 · 2.7 · 3.7 | 265 · 3.8 · 8.0 | 3.7 | 629 | 1.6 M |
| 2560×1440 | stromparken | 178 · 5.6 · 7.1 | 175 · 5.7 · 7.2 | 5.5 | 2 505 | 4.0 M |
| 2560×1440 | police | 421 · 2.4 · 3.0 | 314 · 3.2 · 6.8 | 3.1 | 541 | 1.4 M |
| 2560×1440 | idrottsparkenPitch | 171 · 5.8 · 7.2 | 169 · 5.9 · 7.2 | 5.8 | 2 833 | 4.5 M |
| 1920×1080 | overview | 59 · 17.1 · 34.3 | 60 · 16.7 · 34.0 | 16.1 | 7 916 | 10.2 M |
| 1920×1080 | city | 149 · 6.7 · 8.1 | 145 · 6.9 · 8.5 | 6.7 | 3 373 | 5.8 M |
| 1920×1080 | kungsgatan | 372 · 2.7 · 3.2 | 319 · 3.1 · 5.3 | 3.0 | 629 | 1.6 M |

What the baseline already says (input to P1, not a conclusion):

- **CPU-bound, not resolution-bound.** CPU time per frame is ≈ 95–97 % of the frame time in every
  view, and 2560×1440 costs the same as 1920×1080 (2.25× fewer pixels). Time follows the number of
  draw calls (≈ 2 µs per call in the large views). Lowering the resolution would not help on this machine; fewer draw calls
  would.
- **The whole-city overview is the problem view:** ≈ 7 900 draw calls, ≈ 59 fps mean but p95 34 ms
  (40–48 % of frames over 16.7 ms), i.e. it does not hold 60 fps. All street and district views run at
  140–420 fps, above the display's 164 Hz except Innerstaden (≈ 145).
- **Night costs little** except near dense lighting at street level (kungsgatan p95 3.7 → 8.0 ms).
- Uncapped headless numbers; with vsync on the monitor shows at most 164 fps. Not measured on weaker
  computers.

## Gates (paired against `main`, counter off)

`scripts/lighting-phase0/measure.mjs`, production builds (`main` via `git archive` in
`work/fullscreen-fps/before-app` with a `node_modules` junction, branch `dist/`), 3 alternating rounds,
8 views × day / night / night-match, 1280×900, API aborted. Full table:
[evidence/perf/gates-summary.md](evidence/perf/gates-summary.md).

| Gate (`docs/step62/rollout-plan.md`) | Limit | Measured |
|---|---|---|
| Frame p95 Δ | ≤ 1 ms | median per view −0.5 … +0.2 ms (single worst round +1.3 ms, Strömparken night, not repeated) |
| Day p95 Δ | ≤ 0.5 ms | −0.1 … +0.2 ms |
| Map-ready Δ | ≤ 100 ms | +35 ms (3 625 → 3 661 ms) |
| Heap Δ (post-GC) | ≤ 10 MB | +0.11 MB |
| Draw calls / triangles Δ | ≤ 40 / 100 k | 0 / 0 in all 24 view/time combinations (`view-calls.mjs`, dev builds) |
| Shader programs | 20 | 20 |

**Pictures with the counter off:** the 3D scene is the same as `main` — screenshots with the toolbar
hidden, 4 views day and night: 6 of 8 byte-identical, the other 2 differ by at most 1/255 on ≤ 0.003 %
of pixels, the same as two runs of the branch itself (timing noise). With the toolbar shown, a
screenshot of the whole map panel differs from `main` only in the toolbar box (the two new buttons).

**Counter on vs off** (same build, `scripts/fullscreen-fps/counter-cost.mjs`, 3 rounds, counter shown
expanded): median frame time +0.0 … +0.3 ms, p95 −0.2 … +0.4 ms (largest in the city view), map-ready
+1 ms, heap −0.02 MB, programs 20. Within the gates, but not free: it is a DOM layer over the canvas;
switch it off for paired measurements and use the hook instead.

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK (the usual chunk-size warning) |
| `npm test` (Vitest) | 480 / 481 — 12 new (`src/lib/perf/frameStats.test.ts`) pass; the one failure is the known `terrain.test.ts` backend path in a worktree (equal when compared with the absolute path) |
| `npm run test:e2e` (Playwright, dev server + isolated backend) | new `tests/fullscreen-fps.spec.ts` 3 / 3 in every run; whole suite see below |

Whole Playwright suite (19 tests) on the branch: run 1 17/19 (bridge-traffic, L2a), run 2 17/19 (A3,
L2a), run 3 (final code, quiet machine) 18/19 (only A3, known flaky; L2a passed). Both run 1 and the isolated retries were taken while the app was
also open in a browser pane (extra GPU load). The failing L2a check compares two pictures before and
after a WebGL context restoration. Investigation: L2a passed 3/3 alone, 2/2 with the whole lighting
file, 19/19 with a copy of the suite that saves both pictures, and after my fullscreen tests; `main`
passed the whole suite once (16/16) and L2a 2/2. Nothing in the change touches the scene, the
lighting, the context restoration or the pictures (draw calls, triangles, programs and scene pixels
are unchanged), so I classify it as flaky under load, like A2/A3 — but it was not on the known list
and failed more often on the branch than on `main` in this small sample (see risks).

## Files

- `src/lib/perf/frameStats.ts` (+ test) — sliding-window statistics (mean, p95, max, pause handling).
- `src/lib/perf/fpsMonitor.svelte.ts` — shared state, `localStorage`, `readFps()`, the `__fpsStats` hook.
- `src/lib/perf/FpsProbe.svelte` — two Threlte stages (before main, after render) that time each frame.
- `src/lib/perf/FpsCounter.svelte` — the overlay.
- `src/App.svelte` — buttons, fullscreen/fallback, `F` / `P` / Esc keys, probe and overlay mounted.
- `src/style.css` — toolbar buttons, `:fullscreen`, fallback, counter.
- `tests/fullscreen-fps.spec.ts` — 3 Playwright tests.
- `scripts/fullscreen-fps/` — `capture.mjs` (evidence, never overwrites), `counter-cost.mjs`,
  `fullscreen-baseline.mjs`, `scene-pixels.mjs`, `summarize.mjs`.
- `docs/roadmap.md` — track P (P0–P3). `.gitignore` — `/work/fullscreen-fps/`.

## Evidence

[evidence/](evidence/) (JPEG copies of PNG captures in `work/fullscreen-fps/captures`):
01 window, counter off · 02 collapsed · 03 expanded (day) · 04 expanded (night) · 06 fullscreen
2560×1440 counter off · 08 expanded (day) · 09 expanded (night) · 10 Kungsgatan night · 11 following a
car at night with the vehicle inspector · 12 phone width (390 px). Raw measurements and summaries in
[evidence/perf/](evidence/perf/). Known gaps: [remaining-gaps.md](remaining-gaps.md).

## Reproduce

```
# servers (.claude/launch.json, local only): p0-backend 8095, p0-e2e 5194 (dev),
# p0-before-preview 5271 (main), p0-preview 5272 (branch), p0-hook-preview 5273, p0-before-dev 5270.
# Run only one dev server at a time: both share node_modules/.vite through the junction.
VITE_LIGHTING_HOOK=1 npx vite build --outDir work/fullscreen-fps/dist-hook
VIEWS=kungsgatan,stromparken,idrottsparkenPitch,parken,city,police,stationYard,ingelsta node scripts/lighting-phase0/measure.mjs <out> 3 5271 5272
node scripts/fullscreen-fps/counter-cost.mjs <out> 3 5272
node scripts/fullscreen-fps/fullscreen-baseline.mjs <out> 2 http://127.0.0.1:5273
node scripts/fullscreen-fps/summarize.mjs pair|baseline <out> [labelA labelB]
node scripts/fullscreen-fps/capture.mjs <newDir> http://127.0.0.1:5194
```

No generated data files: nothing to rebuild or hash.

The measured builds were made before a Prettier pass over the new files (formatting only); type
check, build, the unit tests and the new e2e spec were re-run afterwards and pass.
