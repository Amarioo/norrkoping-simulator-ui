# Phase C2 paired run (main vs C2; measured with the Phase C1 script scripts/vegetation-c1/paired.mjs, whose note text below still says C1)

Phase C1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 3. Builds: main, c2 (reference: main). Load before each build (busy %): 6.9, 9.5, 8.4, 5.2, 5.3, 4.2.

## Medians over the rounds

### night/loopAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.94 | 6.80 | 5.80 | 6.50 | 0.00 | 1575 | 390 | 8.50 | 8 | 47 | 0.06 |
| c2 | 6.13 | 6.90 | 6.00 | 6.60 | 0.00 | 1584 | 390 | 8.50 | 8 | 56 | 0.07 |

### night/loopGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 4.73 | 5.40 | 4.60 | 5.20 | 0.00 | 1421 | 374 | 7.50 | 8 | 2 | 0.06 |
| c2 | 4.89 | 5.60 | 4.80 | 5.40 | 0.00 | 1476 | 381 | 7.50 | 9 | 56 | 0.07 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.46 | 7.10 | 6.30 | 6.80 | 0.00 | 2066 | 449 | 10.86 | 9 | 56 | 0.07 |
| c2 | 6.53 | 7.20 | 6.40 | 6.90 | 0.00 | 2066 | 449 | 10.86 | 9 | 56 | 0.07 |

### day/loopGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.80 | 4.60 | 3.70 | 4.30 | 0.00 | 1420 | 373 | 7.45 | 7 | 2 | 0.01 |
| c2 | 3.85 | 4.70 | 3.70 | 4.30 | 0.00 | 1475 | 380 | 7.45 | 8 | 56 | 0.02 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c2 | night/loopAbove | +0.07 [+0.04 … +0.29] | +0.10 [0.00 … +0.20] | +0.10 [-0.10 … +0.30] | 0.00 [-0.10 … +0.30] | 3 |
| c2 | night/loopGround | +0.12 [+0.11 … +0.17] | +0.20 [0.00 … +0.20] | +0.10 [+0.10 … +0.20] | +0.20 [+0.10 … +0.20] | 3 |
| c2 | night/overview | +0.08 [+0.02 … +0.08] | +0.00 [0.00 … +0.10] | +0.10 [0.00 … +0.10] | +0.10 [+0.00 … +0.10] | 3 |
| c2 | day/loopGround | +0.01 [+0.00 … +0.14] | +0.20 [0.00 … +0.30] | 0.00 [0.00 … +0.00] | +0.00 [-0.10 … +0.10] | 3 |
