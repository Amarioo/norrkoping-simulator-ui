# Aircraft Lights E2 paired run

Aircraft Lights E2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, e2 (reference: main). Load before each build (busy %): 6.5, 16.6, 4.6, 6.2, 8.2, 9.8, 9, 7.5, 6.9, 6.2.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.26 | 7.30 | 6.00 | 7.20 | 0.00 | 2012 | 436 | 10.29 | 9 | 52 | 0.07 |
| e2 | 6.29 | 7.50 | 6.00 | 7.30 | 0.00 | 2016 | 440 | 10.30 | 9 | 56 | 0.07 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.51 | 7.50 | 2.60 | 7.40 | 0.00 | 696 | 126 | 3.87 | 9 | 0 | 0.07 |
| e2 | 3.39 | 6.80 | 2.60 | 6.70 | 0.00 | 698 | 128 | 3.87 | 9 | 2 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| e2 | night/overview | +0.05 [+0.02 … +0.21] | +0.20 [-0.10 … +0.30] | +0.10 [-0.00 … +0.20] | +0.20 [-0.10 … +0.30] | 5 |
| e2 | night/airport | -0.01 [-0.38 … +0.40] | -0.50 [-1.50 … +1.70] | 0.00 [-0.10 … +0.10] | -0.50 [-1.70 … +1.60] | 5 |
