# Phase C1 paired run

Phase C1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, c1 (reference: main). Load before each build (busy %): 16.2, 14.9, 13.9, 12.2, 12.7, 10.8, 17.3, 14.5, 15, 16.8.

## Medians over the rounds

### day/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 11.31 | 13.00 | 11.50 | 12.60 | 0.17 | 1439 | 378 | 7.09 | 6 | 47 | 0.01 |
| c1 | 10.63 | 12.80 | 11.50 | 12.60 | 0.00 | 1451 | 379 | 7.14 | 6 | 56 | 0.01 |

### day/pilotGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 10.95 | 13.00 | 11.30 | 12.60 | 0.50 | 1385 | 368 | 7.06 | 8 | 2 | 0.01 |
| c1 | 10.48 | 12.70 | 11.30 | 12.40 | 0.17 | 1442 | 375 | 7.11 | 8 | 56 | 0.02 |

### night/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 10.02 | 31.10 | 5.40 | 20.70 | 24.83 | 1440 | 379 | 7.14 | 7 | 47 | 0.07 |
| c1 | 12.09 | 33.90 | 13.20 | 18.30 | 35.50 | 1452 | 380 | 7.19 | 7 | 56 | 0.07 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 12.01 | 15.20 | 11.80 | 15.20 | 2.33 | 1394 | 372 | 7.09 | 6 | 2 | 0.01 |
| c1 | 12.16 | 13.30 | 11.80 | 13.10 | 0.67 | 1451 | 379 | 7.14 | 6 | 56 | 0.01 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.95 | 18.00 | 5.00 | 17.50 | 8.67 | 1395 | 373 | 7.14 | 7 | 2 | 0.06 |
| c1 | 8.25 | 30.50 | 5.10 | 17.70 | 16.17 | 1398 | 374 | 7.18 | 7 | 2 | 0.06 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c1 | day/pilotAbove | -0.62 [-2.77 … +1.08] | 0.00 [-0.50 … +0.20] | 0.00 [-1.00 … +0.20] | +0.10 [-0.40 … +0.20] | 5 |
| c1 | day/pilotGround | -0.60 [-1.08 … +0.97] | -0.30 [-3.40 … +0.30] | -0.10 [-0.30 … +0.20] | -0.10 [-4.00 … +0.30] | 5 |
| c1 | night/pilotAbove | -1.23 [-11.33 … +6.30] | -0.70 [-28.80 … +12.90] | -0.30 [-12.10 … +11.50] | -2.40 [-19.40 … +0.40] | 5 |
| c1 | day/overview | -0.01 [-3.47 … +0.74] | -2.30 [-2.70 … +0.40] | +0.10 [-0.90 … +0.20] | -2.50 [-2.80 … +0.30] | 5 |
| c1 | night/overview | +3.10 [-2.95 … +6.09] | +16.20 [-24.30 … +24.60] | +0.30 [-0.10 … +10.00] | +7.00 [-12.20 … +12.10] | 5 |
