# Airport Lighting E1 paired run

Airport Lighting E1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, e1 (reference: main). Load before each build (busy %): 6.3, 18, 14.6, 5.8, 17.6, 11.4, 9.8, 12.6, 7.5, 4.1.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.36 | 7.10 | 6.30 | 7.00 | 0.00 | 2004 | 429 | 10.28 | 1 | 69 | 0.07 |
| e1 | 6.30 | 7.30 | 6.20 | 7.00 | 0.00 | 2010 | 435 | 10.29 | 7 | 69 | 0.08 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.45 | 8.10 | 1.90 | 8.00 | 0.00 | 688 | 119 | 3.86 | 1 | 5 | 0.07 |
| e1 | 3.43 | 7.90 | 2.50 | 7.80 | 0.00 | 694 | 125 | 3.87 | 7 | 5 | 0.08 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.66 | 7.70 | 6.40 | 7.50 | 0.00 | 1216 | 374 | 7.06 | 1 | 68 | 0.07 |
| e1 | 6.37 | 7.00 | 6.30 | 6.80 | 0.00 | 1221 | 379 | 7.07 | 6 | 68 | 0.08 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.31 | 6.60 | 5.10 | 6.10 | 0.00 | 2003 | 428 | 10.23 | 0 | 69 | 0.02 |
| e1 | 5.25 | 6.60 | 5.00 | 6.20 | 0.00 | 2008 | 433 | 10.24 | 5 | 69 | 0.03 |

### day/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.11 | 6.50 | 2.50 | 6.40 | 0.00 | 687 | 118 | 3.81 | 0 | 5 | 0.02 |
| e1 | 3.07 | 6.00 | 2.60 | 6.00 | 0.00 | 692 | 123 | 3.82 | 5 | 5 | 0.02 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| e1 | night/overview | -0.23 [-0.83 … +0.26] | -0.10 [-0.60 … +0.30] | -0.30 [-0.90 … +0.30] | -0.10 [-0.40 … +0.50] | 5 |
| e1 | night/airport | -0.03 [-0.12 … +0.47] | -0.20 [-0.70 … +2.00] | +0.10 [-0.10 … +0.60] | -0.20 [-0.70 … +1.90] | 5 |
| e1 | night/city | -0.10 [-1.19 … +0.36] | -0.20 [-1.90 … +0.40] | -0.10 [-1.10 … +0.30] | 0.00 [-1.70 … +0.50] | 5 |
| e1 | day/overview | -0.06 [-0.67 … +0.07] | -0.00 [-0.10 … +0.20] | 0.00 [-0.70 … 0.00] | -0.00 [-0.50 … +0.40] | 5 |
| e1 | day/airport | +0.04 [-0.48 … +0.09] | -0.10 [-0.80 … +0.50] | 0.00 [-0.80 … +0.20] | -0.10 [-0.90 … +0.80] | 5 |
