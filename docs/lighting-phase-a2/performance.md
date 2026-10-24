# Phase A2 — performance

**Baseline:** committed Phase A1, `git archive 1fe6296` under ignored `work/lighting-a2/a1-app`
(byte-identical `streetlights-a1.json`). **After:** this working tree. Method unchanged from Phase 0/A1
(`scripts/lighting-phase0/measure.mjs`): production builds served by `vite preview` (5203 A1, 5204 A2),
Edge 156 / ANGLE D3D11 / RTX 5070 Ti, uncapped frame rate, 1280 × 900, DPR 1, Europe/Stockholm,
2026-10-21, API aborted (no traffic), a fresh browser per run, runs serial, before/after order
alternating per round. Views: the app's presets nearest to A2 — **kungsgatan** (centred on the
A2/pilot seam), **ingelstaBridge** (from western Norra Promenaden), **policeEmblem** (at Kungstorget) —
plus A1 views (**station**, **grandHotel**), overviews (**centrum**, **city**) and pilot views
(**stromparken**, **idrottsparkenPitch**, **parken**). Each view: 180 rAF intervals per condition; then
post-GC JS heap. These are browser frame intervals, **not isolated GPU time**; heap is the JS heap
only; texture bytes are CPU arithmetic, **not VRAM**. No lower-tier hardware was tested; no claim is
made for it.

## Result (series 1: 3 alternating rounds, idle machine)

| Gate (Step 6.2 / Phase 0 targets) | Result | Status |
|---|---:|---|
| Median map-ready Δ ≤ 100 ms | **−2.8 ms** (3 701.8 → 3 699.0 ms; per round +133.8 / -29.2 / -5.1) | pass |
| Max paired p95 Δ ≤ 1 ms (all 30 cells) | **+0.4 ms** (night MATCH, inner city) | pass |
| Day p95 Δ ≤ 0.5 ms | **+0.3 ms** max (Ingelstagatan bridge, Resecentrum, Grand Hotel, stadium pitch) | pass |
| Post-GC heap Δ ≤ 10 MB | **+0.055 MB** (118.009 → 118.064 MB) | pass |
| Incremental calls ≤ 40 / triangles ≤ 100 k per view | max **+7 / +15.7 k** | pass |
| Lighting buffers ≤ 16 MB | 105 696 B textures (+10 624 B) | pass |
| Programs: none added by toggles, swaps or A2 | 20 in all 72 captures; E2E swaps never above the start | pass |
| No night rebuild/upload by day; no overflow | `builds` = 1; 0 overflow cells | pass |

As in Phase 0 and A1, the per-cell p95 resolution of this method is about ±1 ms; the day p95 deltas of
+0.1…+0.3 ms are inside it, appear in A2-free views too (Resecentrum, stadium pitch) and are not
evidence of a regression or an improvement. No sub-millisecond claim is made.

| Condition / view | A1 median / p95 (ms) | A2 median / p95 | Δ |
|---|---:|---:|---:|
| day / Kungsgatan (A2/pilot seam) | 1.8 / 2.2 | 1.8 / 2.3 | 0 / 0.1 |
| day / Ingelstagatan bridge (W Norra Promenaden) | 3.6 / 4.2 | 3.7 / 4.5 | 0.1 / 0.3 |
| day / Police emblem (Kungstorget) | 3.3 / 3.9 | 3.4 / 4 | 0.1 / 0.1 |
| day / Resecentrum (A1) | 1.6 / 1.9 | 1.6 / 2.2 | 0 / 0.3 |
| day / Grand Hotel (A1) | 3.4 / 3.9 | 3.5 / 4.2 | 0.1 / 0.3 |
| day / Centrum overview | 2.3 / 2.7 | 2.3 / 2.8 | 0 / 0.1 |
| day / Inner city overview | 4.8 / 5.4 | 5 / 5.6 | 0.2 / 0.2 |
| day / Strömparken (pilot) | 4.2 / 4.9 | 4.2 / 5 | 0 / 0.1 |
| day / Stadium pitch (pilot) | 4.6 / 5.3 | 4.8 / 5.6 | 0.2 / 0.3 |
| day / Parken (pilot) | 1.7 / 2 | 1.7 / 2 | 0 / 0 |
| night-off / Kungsgatan (A2/pilot seam) | 1.7 / 2 | 1.8 / 2.2 | 0.1 / 0.2 |
| night-off / Ingelstagatan bridge (W Norra Promenaden) | 3.5 / 4.1 | 3.5 / 4.2 | 0 / 0.1 |
| night-off / Police emblem (Kungstorget) | 3.2 / 3.7 | 3.3 / 3.8 | 0.1 / 0.1 |
| night-off / Resecentrum (A1) | 1.7 / 2.2 | 1.7 / 2.1 | 0 / -0.1 |
| night-off / Grand Hotel (A1) | 3.5 / 4 | 3.7 / 4.3 | 0.2 / 0.3 |
| night-off / Centrum overview | 2.3 / 2.7 | 2.3 / 2.7 | 0 / 0 |
| night-off / Inner city overview | 5 / 5.8 | 4.9 / 5.7 | -0.1 / -0.1 |
| night-off / Strömparken (pilot) | 3.8 / 4.5 | 4 / 4.8 | 0.2 / 0.3 |
| night-off / Stadium pitch (pilot) | 4.3 / 4.9 | 4.3 / 4.8 | 0 / -0.1 |
| night-off / Parken (pilot) | 1.7 / 1.9 | 1.6 / 2 | -0.1 / 0.1 |
| night-match / Kungsgatan (A2/pilot seam) | 1.8 / 2.1 | 1.8 / 2.3 | 0 / 0.2 |
| night-match / Ingelstagatan bridge (W Norra Promenaden) | 3.6 / 4.1 | 3.7 / 4.2 | 0.1 / 0.1 |
| night-match / Police emblem (Kungstorget) | 3.2 / 3.6 | 3.2 / 3.6 | 0 / 0 |
| night-match / Resecentrum (A1) | 1.6 / 2 | 1.6 / 2 | 0 / 0 |
| night-match / Grand Hotel (A1) | 3.3 / 3.8 | 3.3 / 3.8 | 0 / 0 |
| night-match / Centrum overview | 2.2 / 2.7 | 2.3 / 2.7 | 0.1 / 0 |
| night-match / Inner city overview | 4.8 / 5.5 | 4.8 / 5.9 | 0 / 0.4 |
| night-match / Strömparken (pilot) | 4.2 / 5 | 4.2 / 4.7 | 0 / -0.3 |
| night-match / Stadium pitch (pilot) | 4.6 / 5.3 | 4.6 / 5.1 | 0 / -0.2 |
| night-match / Parken (pilot) | 1.7 / 2 | 1.7 / 2 | 0 / 0 |

**Contended series (retained, not used).** After series 1 a GPU-heavy game (`bf6.exe`, 7.3 GB) was
running on the same machine. Series 2 (2 rounds) and 3 (3 rounds) measured map-ready 5.1–9.9 s in
**both** builds (series 1: 3.5–3.8 s) and frame deltas from −10.3 to +21.1 ms with changing signs
between series (e.g. Grand Hotel night-off p95 +1.25 in series 2, +21.1 in series 3; inner city day
−10.3 in series 2). Heap deltas stayed +0.036 / +0.047 MB. These series measure the competing load, not
A2; all raw data are in [data/performance.json](data/performance.json). A first series-2 attempt failed
before measuring (preview servers had stopped) and was discarded as a failed run, not as data.
**Re-running the paired series on an idle machine is recommended before acceptance.**

## Rendered work per view (DEV captures, same poses before/after)

From the capture metadata (`__cityPerformance`, 36 pairs, [visual-validation.md](visual-validation.md)):

| View group | Δ draw calls | Δ triangles |
|---|---:|---:|
| A2 street/elevated/junction poses (Kungsgatan, Kungstorget, pilot seam) | +6 … +7 | +15.4 k … +15.7 k |
| A2 Norra Promenaden poses | +2 … +3 | +8.6 k … +8.7 k |
| A1/A2 seam, central overview, A1 Drottninggatan, pilot Kungsgatan street, Strömparken | 0 | +3.4 k … +3.5 k |
| Pilot overview | 0 | +0.2 k … +0.3 k |

The A2 instances join the existing instanced meshes of the `chunk:-1,-1` group (A1 + A2) — no new
material or program; extra calls come only where the group's per-type lens/halo meshes become visible.
The +3.4 k triangles without new calls are the A2 instances added to meshes that were already drawn.
Gate (≤ 40 calls, ≤ 100 k triangles per view): pass. **Programs: 20 in all 72 captures.**

## Start-up, build and memory

| Measure | A1 state | A2 | Where |
|---|---:|---:|---|
| Registry construction | 0.062 ms | 0.068 ms | Node, warm, median of 25 (`scripts/lighting-a2/timing.test.ts`) |
| Validation + emitters + index + packing (CPU, before upload) | 0.881 ms | 1.034 ms | same |
| Same, DEV browser at start-up (`describe().streetLighting.timings`) | — | 6.2 ms build, 3.0 ms upload submission | single sample on the live map (cold) |
| A2 generation (offline, never at runtime) | — | 8.1 ms | Node, warm |
| Fixtures / visual groups | 232 / 5 | 267 / 5 | `describe()` |
| Lamp texture (RGBA32F) | 29 696 B | 34 176 B | CPU typed arrays |
| Page atlas + directory | 64 512 + 864 B | 70 656 + 864 B | 63 → 69 pages, same directory |
| Lighting textures total | 95 072 B | 105 696 B (+10 624 B) | |
| Max cell occupancy / overflow | 15 / 0 | 15 / 0 | |
| App chunk | 632 750 B (172.75 kB gzip) | 645 014 B (175.04 kB gzip) | +12.3 KB / +2.3 KB gzip: the bundled A2 file and the generalised adapter |
| Shader programs | 20 | 20 | every capture state |

Daytime: the light-grid lookup stays behind the `cityLampLevel` branch (shader unchanged, program key
`city-lights-v2`); no night-only data is built or uploaded by day (`builds` = 1).

## Lifecycle, recreation and WebGL restoration

| Check | Result |
|---|---|
| Phase 0 lifecycle E2E (now 267 fixtures): 10 rebuilds + 10 controller recreations | geometries/textures/programs flat at 4150 / 226 / 20 after every cycle (start 4156 / 226 / 20); 1 227 shared materials rebound; post-GC heap 131.21 → 131.80 MB (< 2 MB gate); Kungsgatan frame byte-identical before, after the cycles and after context loss/restore |
| A2 E2E: 6 complete swaps A1 state ↔ A1 + A2 at the Kungsgatan-north pose | per kind constant: A1 state 4747 geometries / 252 textures, combined 4753 / 252; programs 20 throughout |
| Illumination | mean frame luma at the Kungsgatan-north pose 12.54 (A1 + A2) vs 8.56 (A1 state): ×1.46, no ambient or exposure change |
| View facing away from A2 (Strömparken, south) | byte-identical with and without A2 |
| Rejected set (17 lamps in one A2 cell) | `capacity` rejection, status `rendering-previous`, frame byte-identical |
| Controller recreation, then WebGL context loss/restore | frame byte-identical to the start; 267 fixtures, status `ok`; programs after restore ≤ start (18: only this view's programs recompiled) |
| Node: 10 alternating replacements A1 state ↔ A1 + A2 | exactly one live set; constant owned-resource count per kind; all disposed at the end (`corridorA2.test.ts`) |
| A1 E2E (now with A2 in the runtime set) | passes; Drottninggatan luma 15.03 vs 6.98 pilot-only |
