# Phase F2 paired run

Phase F2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, f2 (reference: main). Load before each build (busy %): 6, 2.9, 6.8, 16, 9, 6, 4.5, 3.4, 4.1, 8.6.

## Medians over the rounds

### night/centrum

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 4.48 | 5.10 | 4.40 | 4.80 | 0.00 | 672 | 241 | 3.00 | 5 | 2 | 0.06 |
| f2 | 4.52 | 5.20 | 4.40 | 5.00 | 0.00 | 672 | 241 | 3.00 | 5 | 2 | 0.06 |

### night/stationYard

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.94 | 6.10 | 2.20 | 6.00 | 0.00 | 451 | 94 | 2.20 | 12 | 2 | 0.08 |
| f2 | 2.89 | 6.00 | 2.10 | 5.80 | 0.00 | 451 | 94 | 2.20 | 12 | 2 | 0.08 |

### day/stationYard

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.36 | 4.30 | 2.10 | 4.10 | 0.00 | 450 | 93 | 2.15 | 11 | 2 | 0.02 |
| f2 | 2.33 | 4.20 | 2.10 | 4.10 | 0.00 | 450 | 93 | 2.15 | 11 | 2 | 0.02 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.56 | 7.30 | 6.40 | 7.10 | 0.00 | 2024 | 448 | 10.30 | 9 | 56 | 0.07 |
| f2 | 6.50 | 7.30 | 6.30 | 7.00 | 0.00 | 2024 | 448 | 10.30 | 9 | 56 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| f2 | night/centrum | +0.16 [-0.28 … +0.45] | +0.10 [-0.30 … +0.50] | +0.10 [-0.30 … +0.50] | +0.10 [-0.30 … +0.50] | 5 |
| f2 | night/stationYard | -0.03 [-0.41 … +0.13] | +0.30 [-1.50 … +0.70] | -0.10 [-0.10 … +0.10] | +0.30 [-1.40 … +0.70] | 5 |
| f2 | day/stationYard | -0.01 [-0.09 … +0.15] | 0.00 [-0.10 … +0.50] | 0.00 [-0.10 … +0.10] | 0.00 [-0.10 … +0.70] | 5 |
| f2 | night/overview | -0.02 [-0.15 … +0.17] | -0.00 [-0.10 … +0.60] | 0.00 [-0.20 … +0.10] | 0.00 [-0.20 … +0.70] | 5 |
