# Airport Lighting E1 paired run

Airport Lighting E1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 3. Builds: main, calvert (reference: main). Load before each build (busy %): 19.2, 19.2, 17.2, 18.7, 17.5, 15.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 13.36 | 28.20 | 12.50 | 17.80 | 13.17 | 2010 | 435 | 10.29 | 7 | 69 | 0.08 |
| calvert | 12.95 | 24.10 | 12.30 | 17.40 | 10.33 | 2012 | 436 | 10.29 | 9 | 69 | 0.08 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.87 | 20.10 | 3.00 | 21.40 | 16.50 | 694 | 125 | 3.87 | 7 | 5 | 0.08 |
| calvert | 7.39 | 20.10 | 3.10 | 22.30 | 22.33 | 696 | 126 | 3.87 | 9 | 5 | 0.08 |

### day/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | mapDetails calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.43 | 19.90 | 2.90 | 19.60 | 12.33 | 692 | 123 | 3.82 | 5 | 5 | 0.02 |
| calvert | 6.30 | 19.80 | 2.90 | 19.40 | 13.00 | 694 | 124 | 3.82 | 7 | 5 | 0.03 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| calvert | night/overview | -0.33 [-0.41 … +2.12] | -0.90 [-4.10 … +1.70] | -0.10 [-0.20 … +1.50] | -0.30 [-0.40 … +1.60] | 3 |
| calvert | night/airport | +0.53 [-0.23 … +0.75] | +0.20 [-0.00 … +0.30] | +0.10 [0.00 … +0.10] | +1.60 [-2.30 … +2.20] | 3 |
| calvert | day/airport | +0.01 [-0.13 … +0.11] | -0.10 [-0.10 … +0.10] | -0.10 [-0.20 … 0.00] | +0.30 [-0.30 … +0.50] | 3 |
