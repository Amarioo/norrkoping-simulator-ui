# Phase P2b paired run

Phase P2b paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %. GPU timer on.

Rounds: 3. Builds: main, c20, c40, c80 (reference: main). Load before each build (busy %): 6.7, 5.3, 9, 6.7, 13.9, 5.9, 2.7, 4.5, 4.3, 6.2, 4.6, 4.1.

## Medians over the rounds

### night/kungsgatan

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.29 | 6.20 | 2.50 | 6.10 | 0.00 | 631 | 133 | 1.74 | 59 | 94 | 5 | 43 | 0.45 |
| c20 | 3.69 | 8.60 | 2.20 | 8.40 | 0.00 | 516 | 133 | 1.81 | 16 | 26 | 5 | 39 | 0.53 |
| c40 | 3.86 | 10.60 | 1.90 | 10.50 | 0.00 | 492 | 133 | 2.53 | 13 | 18 | 4 | 27 | 1.24 |
| c80 | 4.09 | 11.50 | 1.70 | 11.50 | 0.00 | 485 | 133 | 4.11 | 13 | 14 | 7 | 21 | 2.82 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.80 | 7.00 | 5.50 | 6.40 | 0.00 | 3179 | 374 | 5.99 | 788 | 947 | 103 | 496 | 4.39 |
| c20 | 5.93 | 6.60 | 5.80 | 6.40 | 0.00 | 2118 | 378 | 6.07 | 287 | 349 | 102 | 492 | 4.47 |
| c40 | 6.02 | 6.60 | 5.90 | 6.40 | 0.00 | 1313 | 374 | 7.06 | 115 | 129 | 46 | 178 | 5.46 |
| c80 | 6.10 | 6.70 | 6.00 | 6.50 | 0.00 | 1039 | 374 | 8.47 | 49 | 50 | 23 | 72 | 6.87 |

### night/norraPromenaden

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 4.63 | 5.70 | 4.40 | 5.10 | 0.00 | 2594 | 211 | 4.22 | 610 | 611 | 85 | 395 | 2.76 |
| c20 | 4.31 | 6.80 | 3.90 | 6.60 | 0.00 | 1935 | 211 | 4.28 | 261 | 309 | 85 | 387 | 2.82 |
| c40 | 4.70 | 7.00 | 4.00 | 6.90 | 0.00 | 1318 | 215 | 4.95 | 92 | 103 | 37 | 141 | 3.49 |
| c80 | 4.62 | 7.10 | 4.50 | 7.00 | 0.00 | 1013 | 211 | 5.55 | 29 | 30 | 13 | 48 | 4.10 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 11.96 | 14.10 | 11.30 | 13.40 | 0.50 | 7220 | 429 | 10.24 | 1992 | 1877 | 310 | 1246 | 8.47 |
| c20 | 8.55 | 10.30 | 8.20 | 9.50 | 0.00 | 5199 | 429 | 10.25 | 880 | 979 | 307 | 1238 | 8.48 |
| c40 | 5.95 | 6.70 | 5.80 | 6.40 | 0.00 | 2910 | 429 | 10.29 | 280 | 289 | 123 | 423 | 8.52 |
| c80 | 5.85 | 6.50 | 5.80 | 6.20 | 0.00 | 2154 | 429 | 10.33 | 91 | 90 | 43 | 135 | 8.56 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c20 | night/kungsgatan | +0.30 [+0.25 … +0.40] | +2.10 [+2.00 … +2.40] | -0.30 [-0.30 … -0.20] | +2.20 [+2.00 … +2.30] | 3 |
| c20 | night/city | +0.13 [-0.03 … +0.15] | -0.50 [-1.00 … -0.30] | +0.30 [+0.20 … +0.30] | -0.10 [-0.60 … +0.10] | 3 |
| c20 | night/norraPromenaden | -0.32 [-0.61 … +0.25] | +1.10 [0.00 … +1.70] | -0.70 [-0.70 … -0.30] | +1.50 [+0.40 … +2.00] | 3 |
| c20 | night/overview | -3.51 [-3.61 … -2.90] | -3.80 [-4.30 … -2.30] | -3.20 [-3.40 … -2.90] | -3.90 [-4.20 … -2.40] | 3 |
| c40 | night/kungsgatan | +0.71 [+0.40 … +0.83] | +4.90 [+3.30 … +5.10] | -0.60 [-0.70 … -0.50] | +4.80 [+3.30 … +5.20] | 3 |
| c40 | night/city | +0.21 [+0.06 … +0.37] | -0.50 [-1.00 … -0.30] | +0.40 [+0.30 … +0.60] | -0.10 [-0.60 … +0.10] | 3 |
| c40 | night/norraPromenaden | -0.21 [-0.24 … +0.46] | +1.00 [+0.70 … +2.20] | -0.50 [-0.60 … -0.10] | +1.40 [+1.20 … +2.50] | 3 |
| c40 | night/overview | -5.96 [-6.11 … -5.68] | -7.40 [-7.70 … -6.80] | -5.40 [-5.80 … -5.40] | -7.00 [-7.10 … -6.40] | 3 |
| c80 | night/kungsgatan | +0.88 [-0.04 … +0.94] | +5.70 [+2.40 … +6.00] | -0.80 [-0.90 … -0.70] | +5.70 [+2.50 … +6.20] | 3 |
| c80 | night/city | +0.26 [+0.14 … +0.47] | -0.40 [-0.80 … -0.20] | +0.40 [+0.40 … +0.70] | -0.00 [-0.50 … +0.20] | 3 |
| c80 | night/norraPromenaden | -0.29 [-0.30 … +0.26] | +1.10 [+1.00 … +2.10] | +0.20 [-0.20 … +0.40] | +1.50 [+1.50 … +2.50] | 3 |
| c80 | night/overview | -6.11 [-6.24 … -5.70] | -7.60 [-7.90 … -6.90] | -5.50 [-5.90 … -5.40] | -7.20 [-7.40 … -6.50] | 3 |
