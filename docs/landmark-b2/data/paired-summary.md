# Landmark B2 paired run

Landmark B2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, b2 (reference: main). Load before each build (busy %): 2, 2.6, 2.9, 2.6, 2.8, 1.7, 5.4, 2.7, 4.2, 2.3.

## Medians over the rounds

### night/centrum

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 1.85 | 2.70 | 1.60 | 2.60 | 0.00 | 346 | 231 | 2.46 | 5 | 0 | 0.06 |
| b2 | 1.77 | 2.10 | 1.70 | 1.90 | 0.00 | 351 | 236 | 2.47 | 5 | 0 | 0.06 |

### day/centrum

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 1.54 | 1.70 | 1.50 | 1.60 | 0.00 | 345 | 230 | 2.41 | 4 | 0 | 0.01 |
| b2 | 1.62 | 1.90 | 1.50 | 1.80 | 0.00 | 350 | 235 | 2.41 | 4 | 0 | 0.01 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.09 | 3.40 | 3.00 | 3.30 | 0.00 | 907 | 380 | 6.54 | 8 | 0 | 0.07 |
| b2 | 3.14 | 3.50 | 3.10 | 3.40 | 0.00 | 912 | 385 | 6.54 | 8 | 0 | 0.07 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.50 | 3.90 | 3.40 | 3.80 | 0.00 | 1644 | 432 | 9.75 | 9 | 0 | 0.07 |
| b2 | 3.55 | 4.00 | 3.50 | 3.90 | 0.00 | 1649 | 437 | 9.76 | 9 | 0 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| b2 | night/centrum | -0.10 [-0.13 … -0.07] | -0.60 [-0.70 … -0.60] | +0.10 [+0.10 … +0.20] | -0.70 [-0.70 … -0.60] | 5 |
| b2 | day/centrum | +0.10 [+0.07 … +0.10] | +0.10 [+0.10 … +0.20] | 0.00 [0.00 … +0.10] | +0.10 [+0.10 … +0.30] | 5 |
| b2 | night/city | +0.06 [+0.05 … +0.24] | +0.10 [+0.10 … +0.30] | +0.10 [+0.10 … +0.20] | +0.10 [+0.10 … +0.30] | 5 |
| b2 | night/overview | +0.05 [+0.04 … +0.23] | +0.10 [+0.00 … +0.40] | +0.10 [+0.00 … +0.30] | +0.10 [0.00 … +0.30] | 5 |
