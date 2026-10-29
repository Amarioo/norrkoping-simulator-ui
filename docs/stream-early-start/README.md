# Stream early start — the simulator stream opens at start, not after the city (2026-10-29)

Branch `claude/elastic-khorana-d0b0c1` from `main` = `e1a2838`. Approved by the user (2026-10-29); **committed on
the branch, not pushed or merged.** Backend unchanged. Follows
up [perf-p2a](../perf-p2a/README.md) gap 7: `tests/simulation.spec.ts` line 36 (a second tab must show the
vehicle count within Playwright's default 5 s) failed on `main` about half the time. The test is unchanged.
No geodata, coordinates or earlier phase output touched.

## Cause (measured 2026-10-27, dev server, Edge 156 headless, RTX 5070 Ti via ANGLE/D3D11)

Timeline of the second tab inside the test (diagnostic copy with a 30 s wait, timeline probe + Chrome DevTools
protocol network times + CPU profile; `scripts/stream-early-start/`), times after page load, `main` median of 10:

| step | ms |
|---|---|
| map data parsed (top-level `await` in `terrain.ts`, `mapModel.ts`), scene built, App mounted | 2 980 |
| `city.connect()` in App `onMount` creates the EventSource | 2 940 |
| request actually sent (an EventSource connects in a queued task, here behind a 0.6 s first-frame shader wait) | 3 670 |
| reply handled (behind 1.1–1.6 s of worker-layer processing: three.js shader link waits, buffer uploads) | 5 090 |
| ".sim-metrics" shows 60 | 5 090 → 5 030 after `load`; 5/10 under 5 s |

- "The stream opens only after the city workers" is a side effect: the EventSource's request and reply and the
  workers' results all wait for the main thread. Nothing in the code orders them.
- The first tab, which keeps drawing the city, is what pushes the second tab over 5 s. With the first tab
  navigated to `about:blank` first, the same steps take 2.5 s (4/4). The tabs have separate renderer processes
  (2 → 3; a 1 s busy loop in the first tab does not stall the second tab's timers). What they share is the
  browser's GPU process: WebGL `getContext` in the second tab took 1.07 s with the first tab drawing and was not
  measurable with it blanked (CPU profile).
- P2a is not the cause: `src/lib/mapView.ts` from `753475e` (old trees) 5.17 s vs `main` 5.03 s, paired
  +0.25 s, sign mixed (3/10 negative).

## The fix

- `src/lib/cityStreamStart.ts` (new): `startCityStream()` opens `/api/simulator/stream` at once and keeps the
  latest `city` snapshot. It must not import the map data, so it can run before it is parsed.
- `src/main.ts`: calls `startCityStream()` right after `startCityLayers()`.
- `src/lib/city.svelte.ts`: `create()` takes the early stream once (`takeCityStream()`), replays its latest
  snapshot through the same handler (terrain revision check included), and opens new streams as before for every
  reconnect (`sseWatchdog.ts` unchanged). Offline at start: no early stream, the app opens its own when online.
- `src/lib/cityStreamStart.test.ts` (new): 4 unit tests (one hand-over, latest snapshot kept, offline, no
  EventSource).

The request now goes out ≈ 60 ms after load and the first snapshot is there at ≈ 75 ms, so the vehicle count and
"Simulatorn är ansluten" appear as soon as the app mounts. Effect on every page load, not only in the test.

## Results

| measurement | `main` | fix |
|---|---|---|
| second tab, time to "60" after load, 2026-10-27 (10 paired rounds; fix measured as a copy in `work/`) | 5.03 s, 5/10 < 5 s | **2.93 s, 10/10**, paired −2.04 s (10/10) |
| same, 2026-10-29 (8 paired rounds, the real `src/`) | 3.12 s, 8/8 | **2.42 s, 8/8**, paired −0.74 s (8/8) |
| unchanged `simulation.spec`, 2026-10-29, alternating | 10/10 | 10/10 |
| unchanged `simulation.spec`, 2026-10-27 | 1/3 | – |

On 2026-10-29 the whole machine was faster than on 2026-10-27 (`main` 3.1 s instead of 5.0 s; first main-thread
block 2.2 s instead of 2.7 s; cause not found), so the reply no longer waited behind the layer processing and the
fix saves less. Machine load during the runs: 14–44 % of 16 cores (other apps, logged per run in `data/`).

Real backend in the browser pane: connected, vehicles shown, map drawn, no console errors, one stream request;
backend stopped → "Ansluter till simulatorn…" + banner (checked after 8 s); restarted → connected again without reload
([screenshot](evidence/01-fix-connected-map-ready.png), after the fix, real backend).

## Checks (2026-10-29)

- `npm run check`: 0 errors, 0 warnings.
- `npm run build`: OK; two builds byte-identical (29 files, SHA-256); no debug code in `dist/`. The shared start-up
  chunk that was named `cityMeshClient-*.js` is now named `cityStreamStart-*.js` (same contents plus the new
  module, still modulepreloaded).
- Vitest: 515/516. The one failure is the known `terrain.test.ts` worktree path (backend repo not next to the
  worktree, ENOENT). New tests 4/4.
- Playwright, whole suite: 22/23. `bridge-traffic` failed in browser launch after 1 ms (before the test started);
  alone 1/1. `simulation.spec` passed in the suite, then 10/10 alone (table above). A3 passed this time.

## Files

- `src/lib/cityStreamStart.ts`, `src/lib/cityStreamStart.test.ts` (new), `src/main.ts`, `src/lib/city.svelte.ts`.
- `scripts/stream-early-start/`: `diag/` (diagnostic copy of `simulation.spec` with the timeline probe, own
  Playwright config), `paired.ps1` (alternating paired runs), `realspec.ps1` (unchanged spec, alternating),
  `summarize.mjs`, `prof.mjs` (CPU profile by time window), `procs.mjs` (renderer processes, shared main thread).
- `docs/stream-early-start/data/`: raw jsonl per run (timeline in ms after navigation, long tasks, CDP network
  times, machine load), `summary.txt`, the 10 × 2 spec runs.
- Local only: `.claude/launch.json` (`st-*`, ports 8095/8097/8098, 5195–5197), `work/second-tab/` (copies of
  `main` and the earlier variants, CPU profiles).

## Reproduce

```
# backend on 8095 (ALLOWED_ORIGIN http://127.0.0.1:5195) + dev server on 5195 with API_TARGET; a second pair
# (8097 / 5196) serving a copy of main. The backend accepts commands from one origin only.
powershell scripts/stream-early-start/paired.ps1 -Rounds 8 -Out work/x.jsonl -Conds @('main=http://127.0.0.1:5196','fix=http://127.0.0.1:5195')
node scripts/stream-early-start/summarize.mjs work/x.jsonl
```

Do not create `.html` files under the repo while a dev server runs: Vite reloads open pages on any HTML change,
which spoiled one run here.
