# Aircraft Lights E2 paired run

Aircraft Lights E2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, e2 (reference: main). Load before each build (busy %): 11.8, 16.8, 8.9, 5.3, 7.7, 7.6, 9.5, 6.8, 5.7, 5.1.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.13 | 7.30 | 5.90 | 7.10 | 0.00 | 2012 | 436 | 10.29 | 9 | 52 | 0.07 |
| e2 | 6.34 | 7.50 | 6.10 | 7.40 | 0.00 | 2016 | 440 | 10.30 | 9 | 56 | 0.07 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.20 | 6.30 | 2.50 | 6.20 | 0.00 | 696 | 126 | 3.87 | 9 | 0 | 0.07 |
| e2 | 3.55 | 7.40 | 2.60 | 7.30 | 0.00 | 698 | 128 | 3.87 | 9 | 2 | 0.07 |

### day/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.93 | 5.30 | 2.50 | 5.20 | 0.00 | 694 | 124 | 3.82 | 7 | 0 | 0.01 |
| e2 | 2.97 | 5.70 | 2.60 | 5.50 | 0.00 | 696 | 126 | 3.82 | 7 | 2 | 0.01 |

### night/plane

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 4.23 | 5.10 | 3.20 | 4.90 | 0.00 | 819 | 182 | 4.78 | 12 | 52 | 0.07 |
| e2 | 2.22 | 2.60 | 2.10 | 2.30 | 0.00 | 504 | 77 | 1.21 | 2 | 56 | 0.06 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| e2 | night/overview | +0.31 [+0.02 … +0.58] | +0.20 [0.00 … +0.70] | +0.40 [0.00 … +0.60] | +0.30 [-0.00 … +0.70] | 5 |
| e2 | night/airport | +0.16 [-0.04 … +0.36] | +0.70 [-0.30 … +1.50] | +0.00 [0.00 … +0.30] | +0.70 [-0.20 … +1.50] | 5 |
| e2 | day/airport | +0.04 [+0.04 … +0.12] | +0.40 [-0.10 … +0.70] | +0.10 [0.00 … +0.20] | +0.40 [-0.10 … +0.70] | 5 |
| e2 | night/plane | -0.82 [-2.47 … -0.06] | -2.80 [-5.30 … -0.10] | -0.90 [-2.40 … -0.10] | -2.70 [-5.40 … -0.20] | 5 |
