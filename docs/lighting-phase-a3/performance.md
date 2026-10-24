# Phase A3 — performance

**Baseline:** committed Phase A2, `git archive b42dd37` under ignored `work/lighting-a3/a2-app`.
**After:** this working tree. Method unchanged from Phase 0/A1/A2 (`scripts/lighting-phase0/measure.mjs`):
production builds served by `vite preview` (5208 A2, 5209 A3), Edge 156 / ANGLE D3D11 / RTX 5070 Ti,
uncapped frame rate, 1280 × 900, DPR 1, Europe/Stockholm, 2026-10-21, API aborted, a fresh browser per
run, before/after alternating per round; the same 10 views as A2 (A3 is closest to **policeEmblem**
(Kungstorget), **ingelstaBridge** and **kungsgatan**). Browser frame intervals, **not GPU time**; JS heap
only; texture bytes are CPU arithmetic, **not VRAM**. No lower-tier hardware tested; no claim made for it.

## Deterministic measurements (not affected by machine load)

| Measure | A2 state → A3 | Source |
|---|---|---|
| Draw calls per view | **unchanged in all 14 captured views × 3 states** (e.g. ring overhead 121 → 121, Kungsgatan street 1 895 → 1 895) | capture metadata |
| Triangles per view | **+12 … +552** (the six bracket housings and halos in the shared chunk group) | capture metadata |
| Shader programs | **20** in every captured state; E2E swaps never above the start | capture metadata, Playwright |
| Exposure | identical in every capture (no global brightness change) | capture metadata |
| Lighting textures | +3 840 B (lamp +768 B, page payload +3 072 B); 72 pages (+3) | `data/capacity.json` |
| Bundle | App chunk +3 518 B (+714 B gzip) | `vite build` of both trees |
| Generator in bundle | no (only the 3.6 KB data file and constants) | `dist` search |
| Pre-upload pipeline (Node, median of 25) | 1.062 → 1.126 ms (+0.06 ms); registry 0.070 → 0.072 ms; A3 generation 4.8 ms (build time only) | `scripts/lighting-a3/timing.test.ts` |
| Post-GC JS heap | +0.017 MB (118.066 → 118.083 MB, medians) | series 1 |
| Lifecycle | 10 alternating swaps A2 state ↔ A3 at constant resources; recreation and context restoration byte-identical (Vitest + Playwright) | tests |

## Frame timing: series 1 — **disturbed, not used for acceptance**

During the whole series another session on the same machine was running Vitest workers and Edge
browsers (its worktree `.claude/worktrees/lighting-scale-study-cb20df`; not touched). The load log
(10-s windows, processes using > 1 CPU-s, including the measurement browser itself) averaged
**31 CPU-s per 10 s, peak 71** (16 threads). The result shows it:

| Gate | Result | Reading |
|---|---:|---|
| Median map-ready Δ ≤ 100 ms | −341.5 ms (3 964 → 3 622.5; per round −360.6 / −341.5 / +14.4) | implausibly *faster* for +6 fixtures → noise |
| Max paired p95 Δ ≤ 1 ms | +3.3 ms (night-off, inner city) | per-round p95 Δ ranged **−6.7 … +10.7 ms** |
| Day p95 Δ ≤ 0.5 ms | +0.5 ms max, but −3.0 ms min | both directions → noise |
| Post-GC heap Δ ≤ 10 MB | +0.017 MB | pass (heap is not timing-sensitive) |

Per view (medians of run medians / p95, ms) in [`data/performance.json`](data/performance.json). The
largest differences are in views far from A3 (inner city, Strömparken, stadium) and point both ways
between conditions, which is the signature of background load, not of the six A3 lamps.

**Conclusion.** The deterministic measures show A3 adds no draw call, no program and at most +552
triangles per view, a cost far below the Phase 0 budget (≤ 40 calls / ≤ 100 k triangles per view). The frame-time
series could not confirm or rule out a sub-millisecond change. **A re-run of the paired series on an
idle machine is recommended before acceptance** (same command, README §11), as it was for A2.
