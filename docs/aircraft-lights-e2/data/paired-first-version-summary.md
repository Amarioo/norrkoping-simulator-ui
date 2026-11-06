# Aircraft Lights E2 paired run

Aircraft Lights E2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, e2 (reference: main). Load before each build (busy %): 8.5, 10.2, 10.8, 5.6, 16.8, 7.1, 7.6, 3.1, 6.8, 9.4.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.32 | 7.50 | 6.10 | 7.20 | 0.00 | 2012 | 436 | 10.29 | 9 | 52 | 0.07 |
| e2 | 6.24 | 7.40 | 6.00 | 7.20 | 0.00 | 2015 | 439 | 10.30 | 9 | 55 | 0.07 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.33 | 6.60 | 2.50 | 6.50 | 0.00 | 696 | 126 | 3.87 | 9 | 0 | 0.07 |
| e2 | 3.43 | 7.00 | 2.50 | 6.90 | 0.00 | 697 | 127 | 3.87 | 9 | 1 | 0.07 |

### day/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.97 | 5.70 | 2.50 | 5.60 | 0.00 | 694 | 124 | 3.82 | 7 | 0 | 0.01 |
| e2 | 2.87 | 5.40 | 2.50 | 5.30 | 0.00 | 695 | 125 | 3.82 | 7 | 1 | 0.01 |

### night/plane

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.57 | 4.00 | 2.40 | 3.50 | 0.00 | 603 | 76 | 2.06 | 7 | 52 | 0.06 |
| e2 | 2.85 | 5.00 | 2.60 | 4.80 | 0.00 | 792 | 78 | 3.35 | 6 | 55 | 0.06 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| e2 | night/overview | +0.00 [-0.11 … +0.12] | +0.00 [-0.20 … +0.30] | 0.00 [-0.20 … +0.10] | -0.00 [-0.20 … +0.30] | 5 |
| e2 | night/airport | -0.05 [-0.24 … +0.39] | +0.10 [-1.50 … +2.00] | -0.10 [-0.20 … +0.70] | 0.00 [-1.50 … +1.90] | 5 |
| e2 | day/airport | -0.02 [-0.20 … +0.11] | -0.10 [-1.80 … +0.40] | 0.00 [-0.10 … +0.50] | -0.20 [-1.80 … +0.40] | 5 |
| e2 | night/plane | +0.08 [-0.41 … +0.71] | +0.80 [-1.40 … +1.90] | +0.10 [-0.40 … +0.60] | +0.40 [-1.40 … +2.10] | 5 |
