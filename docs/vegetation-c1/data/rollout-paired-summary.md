# Phase C1 paired run

Phase C1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 30 %.

Rounds: 3. Builds: main, c1b (reference: main). Load before each build (busy %): 26.5, 21.5, 20, 19.3, 27.2, 16.5.

## Medians over the rounds

### day/loopAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.87 | 4.70 | 3.70 | 4.30 | 0.00 | 1486 | 381 | 7.88 | 6 | 2 | 0.01 |
| c1b | 4.11 | 4.90 | 4.00 | 4.60 | 0.00 | 1582 | 388 | 8.45 | 6 | 56 | 0.01 |

### day/loopGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.49 | 4.60 | 3.30 | 4.00 | 0.00 | 1393 | 372 | 7.06 | 7 | 2 | 0.01 |
| c1b | 3.66 | 4.50 | 3.50 | 4.10 | 0.00 | 1420 | 373 | 7.45 | 7 | 2 | 0.01 |

### night/loopAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.63 | 6.20 | 5.50 | 6.00 | 0.00 | 1488 | 383 | 7.94 | 8 | 2 | 0.06 |
| c1b | 5.96 | 6.70 | 5.80 | 6.40 | 0.00 | 1576 | 389 | 8.50 | 8 | 48 | 0.06 |

### night/loopGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 4.46 | 5.00 | 4.40 | 4.90 | 0.00 | 1394 | 373 | 7.11 | 8 | 2 | 0.06 |
| c1b | 4.71 | 5.30 | 4.60 | 5.20 | 0.00 | 1421 | 374 | 7.50 | 8 | 2 | 0.06 |

### day/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.09 | 5.90 | 5.00 | 5.50 | 0.00 | 2022 | 446 | 10.25 | 7 | 56 | 0.02 |
| c1b | 5.33 | 6.10 | 5.20 | 5.80 | 0.00 | 2064 | 447 | 10.81 | 7 | 56 | 0.02 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.51 | 7.20 | 6.30 | 6.90 | 0.00 | 2024 | 448 | 10.30 | 9 | 56 | 0.07 |
| c1b | 6.61 | 7.20 | 6.50 | 7.00 | 0.00 | 2066 | 449 | 10.86 | 9 | 56 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c1b | day/loopAbove | +0.25 [+0.01 … +0.29] | +0.40 [+0.20 … +0.60] | +0.30 [0.00 … +0.30] | +0.40 [+0.20 … +0.80] | 3 |
| c1b | day/loopGround | +0.17 [+0.13 … +0.46] | -0.10 [-0.10 … +0.20] | +0.20 [+0.20 … +0.70] | +0.10 [-0.40 … +0.10] | 3 |
| c1b | night/loopAbove | +0.27 [+0.23 … +5.47] | +0.30 [+0.30 … +22.90] | +0.20 [+0.20 … +3.20] | +0.30 [+0.30 … +14.80] | 3 |
| c1b | night/loopGround | +0.26 [+0.17 … +16.11] | +0.30 [+0.20 … +33.30] | +0.20 [+0.20 … +13.30] | +0.30 [+0.20 … +31.30] | 3 |
| c1b | day/overview | +0.76 [+0.24 … +27.94] | +0.60 [+0.20 … +53.40] | +0.80 [+0.20 … +23.00] | +0.80 [+0.30 … +55.40] | 3 |
| c1b | night/overview | +0.32 [+0.08 … +8.25] | +0.30 [-0.10 … +24.20] | +0.30 [+0.10 … +5.60] | +0.30 [0.00 … +19.20] | 3 |
