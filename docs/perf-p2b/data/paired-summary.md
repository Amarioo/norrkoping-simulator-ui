# Phase P2b paired run

Phase P2b paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, c20, c40, c80 (reference: main). Load before each build (busy %): 13.1, 8.1, 4, 3.9, 5.2, 5.5, 4.6, 5, 4.1, 3, 47.1, 6.4, 3.5, 6.4, 17.5, 16, 13.7, 12.5, 4.4, 4.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 12.79 | 16.00 | 12.00 | 15.10 | 3.17 | 7220 | 429 | 10.24 | 1992 | 1877 | 310 | 1246 | 8.47 |
| c20 | 8.56 | 10.20 | 8.10 | 9.40 | 0.00 | 5199 | 429 | 10.25 | 880 | 979 | 307 | 1238 | 8.48 |
| c40 | 6.14 | 6.90 | 6.00 | 6.60 | 0.00 | 2910 | 429 | 10.29 | 280 | 289 | 123 | 423 | 8.52 |
| c80 | 6.06 | 6.60 | 5.90 | 6.40 | 0.00 | 2145 | 429 | 10.33 | 91 | 90 | 43 | 135 | 8.56 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.51 | 9.10 | 6.00 | 8.70 | 0.00 | 3179 | 374 | 5.99 | 788 | 947 | 103 | 496 | 4.39 |
| c20 | 5.84 | 6.40 | 5.70 | 6.30 | 0.00 | 2075 | 374 | 6.07 | 287 | 349 | 102 | 492 | 4.47 |
| c40 | 6.06 | 6.70 | 5.90 | 6.50 | 0.00 | 1313 | 374 | 7.06 | 115 | 129 | 46 | 178 | 5.46 |
| c80 | 6.18 | 6.70 | 6.10 | 6.50 | 0.00 | 1039 | 374 | 8.47 | 49 | 50 | 23 | 72 | 6.87 |

### night/kungsgatan

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.51 | 6.80 | 2.50 | 6.70 | 0.00 | 631 | 133 | 1.74 | 59 | 94 | 5 | 43 | 0.45 |
| c20 | 3.81 | 8.30 | 2.20 | 8.20 | 0.00 | 516 | 133 | 1.81 | 16 | 26 | 5 | 39 | 0.53 |
| c40 | 3.59 | 9.10 | 1.80 | 8.90 | 0.00 | 492 | 133 | 2.53 | 13 | 18 | 4 | 27 | 1.24 |
| c80 | 4.47 | 12.60 | 1.70 | 12.50 | 0.00 | 485 | 133 | 4.11 | 13 | 14 | 7 | 21 | 2.82 |

### night/norraPromenaden

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.00 | 6.60 | 4.70 | 6.00 | 0.00 | 2646 | 215 | 4.22 | 610 | 611 | 85 | 395 | 2.76 |
| c20 | 4.54 | 6.60 | 4.00 | 6.40 | 0.00 | 1935 | 211 | 4.28 | 261 | 309 | 85 | 387 | 2.82 |
| c40 | 4.56 | 7.00 | 4.20 | 6.40 | 0.00 | 1309 | 215 | 4.95 | 92 | 103 | 37 | 141 | 3.49 |
| c80 | 5.03 | 8.10 | 4.80 | 8.00 | 0.00 | 1013 | 211 | 5.55 | 29 | 30 | 13 | 48 | 4.10 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | terrain calls | roads calls | water calls | buildings calls | P2b layers triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 12.36 | 14.90 | 11.80 | 14.00 | 1.83 | 7219 | 428 | 10.19 | 1992 | 1877 | 310 | 1246 | 8.47 |
| c20 | 8.31 | 10.00 | 7.90 | 9.80 | 0.00 | 5198 | 428 | 10.20 | 880 | 979 | 307 | 1238 | 8.48 |
| c40 | 4.97 | 6.10 | 4.80 | 5.40 | 0.00 | 2909 | 428 | 10.24 | 280 | 289 | 123 | 423 | 8.52 |
| c80 | 4.95 | 5.50 | 4.80 | 5.30 | 0.00 | 2153 | 428 | 10.28 | 91 | 90 | 43 | 135 | 8.56 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c20 | night/overview | -4.65 [-7.60 … -3.46] | -6.20 [-23.40 … -4.20] | -4.20 [-7.60 … -3.40] | -6.00 [-11.20 … -3.90] | 5 |
| c20 | night/city | -0.51 [-1.60 … -0.16] | -1.10 [-3.00 … -0.60] | -0.20 [-1.70 … 0.00] | -0.90 [-2.80 … -0.60] | 5 |
| c20 | night/kungsgatan | -0.13 [-0.27 … +1.06] | +1.40 [-1.70 … +5.60] | -0.40 [-1.30 … +0.50] | +1.90 [-1.70 … +5.70] | 5 |
| c20 | night/norraPromenaden | -0.48 [-1.46 … -0.37] | +0.00 [-1.60 … +0.70] | -0.80 [-1.10 … -0.30] | +0.40 [-2.10 … +1.20] | 5 |
| c20 | day/overview | -4.05 [-6.42 … -2.55] | -4.80 [-18.20 … -2.50] | -4.00 [-6.00 … -2.30] | -4.60 [-11.10 … -2.30] | 5 |
| c40 | night/overview | -6.06 [-10.03 … -4.27] | -7.60 [-26.80 … -2.00] | -5.70 [-9.50 … -5.10] | -7.00 [-14.00 … -0.70] | 5 |
| c40 | night/city | -0.44 [-1.15 … -0.04] | -1.40 [-2.70 … +3.60] | -0.20 [-1.60 … +0.10] | -1.30 [-2.30 … +3.70] | 5 |
| c40 | night/kungsgatan | -0.14 [-0.65 … +0.87] | +1.70 [-0.50 … +5.70] | -0.80 [-1.10 … -0.60] | +1.70 [-0.20 … +5.80] | 5 |
| c40 | night/norraPromenaden | -0.71 [-2.15 … -0.08] | -0.20 [-1.60 … +0.90] | -0.70 [-2.10 … 0.00] | +0.40 [-1.70 … +1.40] | 5 |
| c40 | day/overview | -7.20 [-11.82 … -6.27] | -8.30 [-24.90 … -7.60] | -7.10 [-11.10 … -5.90] | -8.10 [-17.80 … -7.50] | 5 |
| c80 | night/overview | -6.73 [-11.47 … -5.98] | -9.00 [-27.60 … -7.40] | -6.10 [-10.90 … -5.60] | -8.40 [-14.90 … -6.90] | 5 |
| c80 | night/city | -0.22 [-2.08 … +0.22] | -2.00 [-3.60 … -0.70] | +0.10 [-1.80 … +0.40] | -1.80 [-2.90 … -0.20] | 5 |
| c80 | night/kungsgatan | +0.48 [+0.07 … +1.03] | +5.50 [+3.30 … +6.70] | -0.90 [-2.00 … -0.60] | +5.80 [+3.40 … +6.70] | 5 |
| c80 | night/norraPromenaden | -0.28 [-1.61 … +0.19] | +1.10 [-0.20 … +1.90] | -0.10 [-0.70 … +1.10] | +1.70 [+0.10 … +2.60] | 5 |
| c80 | day/overview | -7.40 [-14.00 … -4.72] | -9.50 [-28.50 … -3.40] | -7.00 [-13.00 … -4.90] | -9.10 [-21.10 … -3.20] | 5 |
