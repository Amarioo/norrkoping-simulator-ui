# Phase P2c paired run

Phase P2c paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 6. Builds: main, p2c (reference: main). Load before each build (busy %): 7.4, 16.6, 11.9, 6.7, 13.5, 20.3, 26.7, 11, 4.9, 30.8, 9.4, 25.8.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.56 | 7.70 | 6.40 | 7.25 | 0.00 | 2910 | 429 | 10.29 | 975 | 8 | 10 | 0.03 |
| p2c | 6.54 | 7.60 | 6.30 | 7.35 | 0.00 | 2005 | 429 | 10.29 | 70 | 8 | 10 | 0.03 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.83 | 7.30 | 5.60 | 6.70 | 0.00 | 2909 | 428 | 10.24 | 975 | 8 | 10 | 0.03 |
| p2c | 5.40 | 6.75 | 5.20 | 6.30 | 0.00 | 2004 | 428 | 10.24 | 70 | 8 | 10 | 0.03 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.62 | 6.40 | 3.30 | 6.30 | 0.00 | 1226 | 119 | 3.86 | 543 | 0 | 1 | 0.02 |
| p2c | 3.75 | 7.80 | 2.60 | 7.70 | 0.00 | 689 | 119 | 3.87 | 6 | 0 | 1 | 0.02 |

### night/f13

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.89 | 4.00 | 2.75 | 3.55 | 0.00 | 1003 | 79 | 2.26 | 371 | 0 | 1 | 0.02 |
| p2c | 2.92 | 5.25 | 2.45 | 5.05 | 0.00 | 664 | 81 | 2.27 | 6 | 0 | 1 | 0.02 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.48 | 7.30 | 6.30 | 7.10 | 0.00 | 1313 | 374 | 7.06 | 165 | 8 | 21 | 0.02 |
| p2c | 6.49 | 7.35 | 6.30 | 7.15 | 0.00 | 1217 | 374 | 7.07 | 69 | 8 | 21 | 0.03 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| p2c | night/overview | -0.15 [-1.46 … +0.42] | -0.20 [-2.30 … +1.10] | -0.05 [-1.30 … +0.30] | +0.05 [-2.00 … +0.90] | 6 |
| p2c | day/overview | -0.40 [-1.42 … +0.30] | -0.55 [-2.40 … +0.60] | -0.30 [-1.30 … +0.20] | -0.40 [-1.70 … +0.30] | 6 |
| p2c | night/airport | +0.14 [-0.39 … +0.36] | +0.60 [+0.20 … +4.80] | -0.65 [-1.30 … +0.30] | +0.60 [+0.20 … +4.80] | 6 |
| p2c | night/f13 | +0.07 [-0.43 … +0.26] | +1.25 [-0.80 … +5.70] | -0.45 [-1.20 … +0.50] | +1.45 [-0.90 … +5.70] | 6 |
| p2c | night/city | -0.04 [-0.49 … +0.65] | -0.05 [-1.20 … +0.60] | -0.10 [-0.50 … +0.60] | 0.00 [-1.00 … +0.60] | 6 |
