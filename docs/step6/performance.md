# Step 6 measurements and budgets — 2026-10-21

## Method and comparable states

Baseline is UI `994b881`, copied before implementation to `work/step6/before-app/`, served by
production preview on :5181. Step 6 uses the working tree on `codex/step6-night-lighting`, preview
:5184. Source hashes and baseline-copy verification are in [source-state.json](measurements/source-state.json).
No backend is connected during performance or evidence runs. The backend runs only for E2E.

Windows, NVIDIA GeForce RTX 5070 Ti, Edge headless / ANGLE D3D11, viewport 1280 × 900, DPR 1,
AgX, no shadows, uncapped requestAnimationFrame for timing. Frames are **browser wall-clock frame
intervals**, not isolated GPU timings. No GPU timer-query measurement or driver VRAM measurement
is available. Buffers/textures below are byte estimates, not measured VRAM residency.

Each startup run launches a fresh browser/page. HTTP browser cache is therefore cold; OS file cache
and driver shader cache may be warm. These are not clean-machine cold-boot measurements. Repeated
before/after runs alternate on the same machine. Reported values are medians over three runs.
`mapReadyAt` observes the scene-ready DOM marker from navigation; `readyMs` includes Playwright's
wait and is reported separately. Neither is a guarantee that all GPU uploads have completed.

The original frame-time runs (`r-*-light-{1,2,3}.json`) use 180 settled frames per camera and
condition. They precede the memory-only fixes; shaders and rendered geometry did not change after
those runs. The original post-cleanup startup/heap runs are retained in `measurements/final/`.
Recovery measurements in `measurements/resume/` supersede those startup/heap results because
CPU vertex arrays are now retained for WebGL context restoration.

## Working budgets and findings

Recovered working limits from the earlier session: **map-ready increase ≤100 ms**, additional
post-GC JS heap **≤10 MB**, zero additional PointLights/SpotLights, zero shadow maps. Architecture
also fixes shader limits at 16 lamps/cell, 16 arena emitters, 8 roof occluders; arena regression
tests enforce ≤150,000 triangles and ≤10 meshes. No trustworthy additional numeric frame-time
budget was preserved, so this report does not invent one retrospectively.

The original final startup comparison was **3413 → 3515 ms (+102 ms)**: a **2 ms miss** of the
100 ms increase budget, not a pass. Before spread 3407–3472 ms; after spread 3502–3558 ms.
The final recovery values are recorded below. Judge small differences against the spread, while
retaining the explicit budget miss rather than rounding it away.

### Final recovery measurements

| Metric (median of 3) | Baseline | Recovery build | Change |
|---|---:|---:|---:|
| Map-ready from navigation | 3457.2 ms | 3504.7 ms | **+47.5 ms**, within +100 ms target |
| Page ready (Playwright wait) | 4430 ms | 4433 ms | +3 ms |
| Longest upload-window frame | 953.0 ms | 921.2 ms | −31.8 ms |
| Excess over 16.7 ms in upload window | 956.7 ms | 952.9 ms | −3.8 ms |
| Post-GC JS heap, daytime | 123.111 MB | 121.425 MB | **−1.686 MB**, within +10 MB target |
| Post-GC JS heap, night/event | 123.111 MB (baseline day) | 121.313 MB | −1.798 MB |
| overview frame median / p90 (120 frames/run) | 14.0 / 15.9 ms | 14.3 / 16.4 ms | +0.3 / +0.5 ms |
| parken frame median / p90 (120 frames/run) | 2.8 / 3.0 ms | 2.2 / 2.4 ms | −0.6 / −0.6 ms |

Raw map-ready pairs, before → after: **3682.0 → 3879.1**, **3457.2 → 3504.7**,
**3418.4 → 3487.1 ms**. The median of paired deltas is **+68.7 ms** (different from the
difference of medians, +47.5 ms). The first pair exceeds the target by 97.1 ms. The latest median
passes, but the range and earlier +102 ms result show that a consistent sub-100 ms increase is
**not established**. No favourable run was selected or discarded.

These new frame subsets are also reported rather than silently replacing the original full
three-condition series below. They show a small overview regression and a consistent arena
improvement. Post-GC heap is the dedicated `measure-heap.mjs` result; the uncollected heap field
inside startup reports is not used for the memory-budget comparison.

## Steady-state frame intervals

Median / p95 in milliseconds. Each cell is the median of the respective statistic across three
runs. Baseline uses its existing fixed daylight; Step 6 day uses 2026-10-21 12:39, night uses 21:30.
This is the practical feature comparison; geometry-only visuals use legacy daylight instead.

| Camera preset | Baseline day | Step 6 day | Night, arena off | Night, event |
|---|---:|---:|---:|---:|
| overview | 12.8 / 15.2 | 12.8 / 14.8 | 12.8 / 15.0 | 12.7 / 15.0 |
| city | 5.0 / 5.9 | 4.7 / 5.4 | 4.7 / 5.5 | 4.7 / 5.4 |
| parken | 2.2 / 2.6 | 1.6 / 2.0 | 1.6 / 1.9 | 1.7 / 2.0 |
| kungsgatan | 1.5 / 1.8 | 1.7 / 2.3 | 1.7 / 2.3 | 1.7 / 2.1 |
| laxtrappan (park vicinity) | 1.4 / 1.5 | 1.5 / 1.7 | 1.5 / 1.7 | 1.5 / 1.7 |
| stromparken (new local preset) | unavailable | 4.0 / 4.5 | 4.0 / 4.6 | 4.0 / 4.5 |
| idrottsparkenPitch (new preset) | unavailable | 4.2 / 4.9 | 4.3 / 4.8 | 4.3 / 4.9 |

The new local presets have no identical baseline timing. The fixed evidence cameras do have
baseline captures. Do not compare `laxtrappan` directly to `stromparken` as if they were one view.
Kungsgatan regresses by 0.2 ms median (13% from a low baseline); overview is unchanged and the
arena improves by 0.5–0.6 ms because merging removes hundreds of draw calls.

Transition samples at `parken`: steady p95 **2.0 ms**, floodlight toggles **2.1 ms**, continuous
time scrubbing **2.6 ms**, time-lapse **2.2 ms**. Worst observed maxima across the three runs:
scrubbing **7.5 ms**, time-lapse **37.3 ms**. The latter is a real transient, not hidden by the
steady-state median; this measurement alone cannot attribute it to GC, UI or GPU work. E2E verifies
that time changes and floodlight toggles add no new shader programs after warmup.

## Geometry, draw calls and light resources

The existing worker-built static geometry is **unchanged**: 5,537 geometries, 8,563,150 triangles,
1,130,335,800 vertex-buffer bytes (1,130.3 MB decimal). Both sides were regenerated with
`scripts/geo/measure-geometry.test.ts`; per-layer results are in `measurements/worker-geometry-*.json`.
Their builder timings were taken while other verification ran, so are not used for performance
claims. These counts cover worker layers, not the separate landmark/vegetation/vehicle meshes.

Separate [resource measurement](measurements/resources.json):

| Task-owned resource | Size / budget |
|---|---|
| Arena including turf/projector instances | 10 meshes, 55,822 instance-expanded triangles; 5,777,716 buffer bytes |
| Sky + all street/park fixture visuals | 20 meshes, 11,544 instance-expanded triangles; 91,932 buffer bytes |
| Lamp texture | 13,440 bytes |
| Spatial grid texture | 115,200 bytes; 36 × 50 cells; max 8 lamps/cell, zero overflow |
| Turf RGBA8 texture | ~4.98 MB including estimated mipmaps; excludes browser canvas/driver overhead |
| Real-time lights | 1 directional, 1 hemisphere, 1 ambient; 0 point, 0 spot |
| Floodlights | 14 shader emitters (≤16), 4 roof occluders (≤8); 181 visible projector instances |
| Shadows / bloom | 0 maps, 0 bloom render targets |

Draw calls below are dev renderer instrumentation from the same presets (program instrumentation
is absent from production). They are scene draw calls, not unique static geometries:

| View | Before calls | Day calls | Night event calls | Before triangles | Day triangles |
|---|---:|---:|---:|---:|---:|
| overview | 8,253 | 7,557 | 7,560 | 9,633,611 | 9,646,757 |
| city | 3,479 | 2,783 | 2,786 | 4,918,821 | 4,931,967 |
| parken | 939 | 255 | 257 | 853,326 | 906,272 |
| kungsgatan | 281 | 288 | 289 | 910,385 | 915,455 |
| laxtrappan | 165 | 172 | 174 | 723,953 | 730,721 |

The arena reconstruction lowers draw calls while adding meaningful architectural detail.
Night-only halos add at most three visible calls in these views. Daytime branches skip artificial
surface-light loops and hide halos; the fixed program layout remains compiled.

## Optimisations and remaining trade-offs

The first shader implementation cost about **+1.4 s map-ready** and a longest startup frame of
**1.38 s**. Compiler profiling led to uniform loop bounds, a lean diffuse/specular accumulation and
parallel compilation, reducing that regression to roughly a tenth of a second. Details and profile
samples are in [architecture](lighting-architecture.md).

Heap snapshots then exposed temporary `number[]` geometry builders retained through closures.
Clearing them after typed-array creation removed about **16 MB of JS allocations**. The later
upload-time typed-array deletion was reverted during recovery because it broke WebGL restoration.
The post-GC metric does not include all ArrayBuffer backing stores or driver memory; never interpret
the heap number as total application RAM. The retained arena buffers are separately counted above.

The dense grid is deliberately limited to these three pilots. Its per-pixel capacity is bounded,
but its geographic memory footprint is not suitable for an unreviewed full-city expansion.

Reproduction commands (environment syntax shown for a POSIX/Git Bash shell):

```sh
UNCAPPED=1 VIEWS=overview,parken E2E_BASE_URL=http://127.0.0.1:5181/ node scripts/measure-startup.mjs before.json
UNCAPPED=1 VIEWS=overview,parken E2E_BASE_URL='http://127.0.0.1:5184/?date=2026-10-21&time=12:39' node scripts/measure-startup.mjs after.json
BASE=http://127.0.0.1:5181/ CONDITIONS=day node scripts/step6/measure-lighting.mjs before-frames.json
BASE=http://127.0.0.1:5184/ node scripts/step6/measure-lighting.mjs after-frames.json
node scripts/step6/measure-heap.mjs heap.json 'before=http://127.0.0.1:5181/' 'after-day=http://127.0.0.1:5184/?date=2026-10-21&time=12:39' 'after-night-event=http://127.0.0.1:5184/?date=2026-10-21&time=21:30&stadium=event'
```

Run browsers serially. Repeat alternating before/after runs three times; aggregate with
`summarize-perf.mjs` and `summarize-lighting.mjs`. Raw reports are retained alongside their summaries.
