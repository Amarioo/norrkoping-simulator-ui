# Landmark B1 part 2 paired run

Landmark B1 part 2 paired timing (harness scripts/landmark-b2/paired.mjs): 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, b12 (reference: main). Load before each build (busy %): 4.8, 8.6, 8.5, 14.4, 16, 1.5, 3.1, 4.3, 4.7, 0.9.

## Medians over the rounds

### night/centrum

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 1.77 | 2.10 | 1.70 | 2.00 | 0.00 | 351 | 236 | 2.47 | 5 | 0 | 0.06 |
| b12 | 1.80 | 2.10 | 1.70 | 2.00 | 0.00 | 351 | 236 | 2.47 | 5 | 0 | 0.06 |

### day/centrum

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 1.65 | 1.90 | 1.60 | 1.80 | 0.00 | 350 | 235 | 2.41 | 4 | 0 | 0.01 |
| b12 | 1.63 | 1.90 | 1.60 | 1.80 | 0.00 | 350 | 235 | 2.41 | 4 | 0 | 0.01 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.15 | 3.50 | 3.10 | 3.40 | 0.00 | 912 | 385 | 6.54 | 8 | 0 | 0.07 |
| b12 | 3.17 | 3.60 | 3.10 | 3.50 | 0.00 | 912 | 385 | 6.54 | 8 | 0 | 0.07 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.55 | 4.00 | 3.50 | 3.90 | 0.00 | 1649 | 437 | 9.76 | 9 | 0 | 0.07 |
| b12 | 3.57 | 4.00 | 3.50 | 3.90 | 0.00 | 1649 | 437 | 9.76 | 9 | 0 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| b12 | night/centrum | +0.03 [+0.02 … +0.05] | 0.00 [-0.10 … +0.10] | +0.00 [0.00 … +0.00] | +0.10 [0.00 … +0.10] | 5 |
| b12 | day/centrum | -0.02 [-0.04 … +0.05] | +0.00 [-0.20 … +0.10] | 0.00 [-0.10 … +0.10] | 0.00 [-0.20 … +0.10] | 5 |
| b12 | night/city | +0.02 [-0.16 … +0.21] | 0.00 [-0.10 … +0.20] | 0.00 [-0.20 … +0.20] | +0.10 [-0.10 … +0.30] | 5 |
| b12 | night/overview | +0.02 [-0.16 … +0.20] | 0.00 [-0.20 … +0.10] | 0.00 [-0.20 … +0.20] | 0.00 [-0.10 … +0.20] | 5 |
