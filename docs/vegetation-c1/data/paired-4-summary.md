# Phase C1 paired run

Phase C1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 12 %.

Rounds: 5. Builds: main, c1 (reference: main). Load before each build (busy %): 3.8, 6.2, 5.8, 4.5, 5.8, 6.5, 5.8, 5.9, 11.2, 6.2.

## Medians over the rounds

### day/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.65 | 4.40 | 3.50 | 4.10 | 0.00 | 1394 | 372 | 7.09 | 6 | 2 | 0.01 |
| c1 | 3.68 | 4.40 | 3.50 | 4.10 | 0.00 | 1397 | 373 | 7.13 | 6 | 2 | 0.01 |

### day/pilotGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.51 | 4.20 | 3.40 | 3.90 | 0.00 | 1385 | 368 | 7.06 | 8 | 2 | 0.01 |
| c1 | 3.52 | 4.20 | 3.40 | 3.90 | 0.00 | 1388 | 369 | 7.10 | 8 | 2 | 0.01 |

### night/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.13 | 5.80 | 5.00 | 5.60 | 0.00 | 1395 | 373 | 7.14 | 7 | 2 | 0.06 |
| c1 | 5.25 | 5.90 | 5.10 | 5.60 | 0.00 | 1398 | 374 | 7.18 | 7 | 2 | 0.06 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.88 | 4.50 | 3.80 | 4.20 | 0.00 | 1394 | 372 | 7.09 | 6 | 2 | 0.01 |
| c1 | 3.90 | 4.50 | 3.80 | 4.30 | 0.00 | 1397 | 373 | 7.13 | 6 | 2 | 0.01 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.29 | 5.80 | 5.20 | 5.60 | 0.00 | 1395 | 373 | 7.14 | 7 | 2 | 0.06 |
| c1 | 5.24 | 5.90 | 5.10 | 5.70 | 0.00 | 1398 | 374 | 7.18 | 7 | 2 | 0.06 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c1 | day/pilotAbove | +0.02 [-0.01 … +0.09] | +0.10 [-0.30 … +0.30] | 0.00 [0.00 … +0.10] | +0.10 [-0.10 … +0.20] | 5 |
| c1 | day/pilotGround | -0.01 [-0.09 … +0.10] | 0.00 [-0.20 … +0.40] | 0.00 [-0.10 … +0.10] | 0.00 [-0.10 … +0.20] | 5 |
| c1 | night/pilotAbove | +0.12 [+0.02 … +0.30] | +0.20 [-0.10 … +0.40] | +0.10 [0.00 … +0.30] | +0.20 [-0.10 … +0.30] | 5 |
| c1 | day/overview | +0.02 [-0.02 … +0.09] | 0.00 [-0.10 … +0.50] | +0.00 [-0.10 … +0.10] | +0.10 [-0.10 … +0.40] | 5 |
| c1 | night/overview | -0.00 [-0.15 … +0.07] | +0.10 [-0.10 … +0.10] | 0.00 [-0.20 … +0.10] | +0.10 [-0.20 … +0.10] | 5 |
