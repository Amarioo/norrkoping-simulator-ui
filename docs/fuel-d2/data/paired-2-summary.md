# Phase D2 paired run

Phase D2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, d2 (reference: main). Load before each build (busy %): 4.4, 8, 10.6, 8.4, 8.3, 5.6, 5.6, 4.2, 6.8, 5.7.

## Medians over the rounds

### night/ingelsta

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.02 | 7.20 | 2.10 | 7.00 | 0.00 | 439 | 71 | 1.88 | 5 | 2 | 0.06 |
| d2 | 3.17 | 8.10 | 2.10 | 8.00 | 0.00 | 443 | 74 | 1.89 | 6 | 2 | 0.06 |

### day/ingelsta

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.66 | 5.50 | 2.00 | 5.40 | 0.00 | 438 | 70 | 1.83 | 4 | 2 | 0.01 |
| d2 | 2.72 | 6.20 | 2.00 | 6.10 | 0.00 | 442 | 73 | 1.83 | 5 | 2 | 0.01 |

### night/stationYard

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.54 | 8.20 | 2.10 | 8.00 | 0.00 | 447 | 91 | 2.20 | 11 | 2 | 0.08 |
| d2 | 3.45 | 7.80 | 2.20 | 7.60 | 0.00 | 451 | 94 | 2.20 | 12 | 2 | 0.08 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 7.38 | 8.10 | 7.20 | 7.90 | 0.00 | 2021 | 445 | 10.30 | 9 | 56 | 0.07 |
| d2 | 7.48 | 8.20 | 7.30 | 8.00 | 0.00 | 2024 | 448 | 10.30 | 9 | 56 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| d2 | night/ingelsta | +0.09 [-0.42 … +0.17] | +0.40 [-1.90 … +1.50] | 0.00 [-0.10 … +0.30] | +0.40 [-2.00 … +1.40] | 5 |
| d2 | day/ingelsta | +0.07 [-0.17 … +0.15] | +0.20 [-0.60 … +0.80] | 0.00 [-0.10 … +0.10] | +0.20 [-0.90 … +0.80] | 5 |
| d2 | night/stationYard | -0.25 [-0.50 … +0.03] | -1.30 [-1.90 … -0.10] | +0.10 [-0.10 … +0.20] | -1.40 [-1.90 … -0.20] | 5 |
| d2 | night/overview | +0.05 [+0.02 … +0.11] | +0.10 [-0.10 … +0.10] | +0.00 [0.00 … +0.10] | +0.10 [0.00 … +0.20] | 5 |
