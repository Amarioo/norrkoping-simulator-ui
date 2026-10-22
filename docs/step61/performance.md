# Step 6.1 performance

The paired baseline is the saved Step 6 working tree, served as a production build on port 5186; final Step 6.1 uses port 5187. Measurements are local Microsoft Edge/ANGLE D3D11 on RTX 5070 Ti, 1280×900, DPR 1, fresh browser per run, API disabled. Three alternating before/after rounds measure DOM map-ready, post-GC JS heap and 180 requestAnimationFrame intervals per view/condition. Four views and day/night OFF/night MATCH are sampled. These are browser frame intervals, not isolated GPU time. Shader compilation, OS scheduling and caches introduce noise.

Raw data: [final](measurements/frontend-performance.json), [initial shader](measurements/frontend-performance-initial.json), [backend](measurements/traffic-performance.json). The initial shader measured median map-ready 4382.4 → 4603.5 ms (+221.1 ms), motivating arithmetic simplification. The final version reuses the normalized lamp direction and removes an extra smoothstep and divisions. Different sessions are not directly comparable; use each session's paired baseline.

## Final paired results

Median map-ready is **3825.7 → 3873.6 ms (+47.9 ms, +1.25%)**. Individual before/after pairs are 4020.9/3882.2, 3825.7/3873.6 and 3806.8/3786.5 ms. Post-GC heap is **114.56046 → 114.565224 MB (+0.004764 MB)**. No browser errors were recorded. The final local result is lightweight, but the earlier +221 ms series remains documented above; repeatability across hardware is not established.

The following values are medians across three runs of each run's median / p95 interval, in milliseconds. Uncapped rendering exposes small differences; this is not the normal display-refresh FPS.

| Condition / view | Before median / p95 | After median / p95 |
|---|---:|---:|
| Day / Kungsgatan | 2.1 / 2.7 | 2.1 / 2.6 |
| Day / Strömparken | 5.2 / 6.3 | 5.0 / 6.4 |
| Day / stadium pitch | 5.8 / 6.9 | 5.8 / 7.3 |
| Day / parken | 2.0 / 2.5 | 2.0 / 2.4 |
| Night OFF / Kungsgatan | 2.2 / 2.7 | 2.1 / 2.5 |
| Night OFF / Strömparken | 5.1 / 6.1 | 5.0 / 6.1 |
| Night OFF / stadium pitch | 5.7 / 7.0 | 5.7 / 6.9 |
| Night OFF / parken | 2.0 / 2.5 | 2.0 / 2.5 |
| Night MATCH / Kungsgatan | 2.2 / 2.6 | 2.2 / 2.6 |
| Night MATCH / Strömparken | 5.1 / 6.0 | 5.2 / 6.2 |
| Night MATCH / stadium pitch | 5.7 / 6.9 | 5.8 / 7.2 |
| Night MATCH / parken | 2.0 / 2.5 | 2.0 / 2.5 |

The largest median increase is 0.1 ms; the largest p95 increase is 0.4 ms (daytime stadium). These small differences do not establish a significant frame regression in this local sample.

## Geometry and allocation

No new geometry, realtime light, shadow pass, texture size, grid cell or emitter. Night draw counts/triangles at fixed capture cameras remain:

| Camera | Before and after calls | Before and after triangles |
|---|---:|---:|
| Kungsgatan street | 1888 | 3,080,884 |
| Strömparken path | 2077 | 3,274,103 |
| Stadium pitch MATCH | 2407 | 3,752,301 |

Renderer snapshots are in the before/after capture metadata. Additional shader arithmetic does not imply a draw-call change.

## Backend runtime

The opt-in benchmark compiles the saved baseline RoadTraffic alongside the final implementation, using the same network and 202 vehicles. It excludes round 0 as warm-up and measures three rounds, each with 300 warm-up ticks and 2400 measured ticks of 0.05 simulated seconds. Median initialization is **17.47 → 19.54 ms (+2.06 ms)**, configure **1.051 → 1.097 ms**, and tick **0.1900 → 0.1555 ms**. These short timings are noisy: a previous run under browser load measured ticks 0.2225 → 0.2295 ms. Do not interpret the latest reduction as a demonstrated runtime speedup. Frontend checks overlapped part of the final benchmark startup. The structural result is that policy pruning happens once at initialization; the existing tick/path-following algorithm is unchanged.

The benchmark is an explicit development utility, with generated sources under backend `build/`; it does not add production diagnostics or affect normal tests.
