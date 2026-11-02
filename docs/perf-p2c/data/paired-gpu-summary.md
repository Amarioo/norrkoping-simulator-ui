# Phase P2c paired run

Phase P2c paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %. GPU timer on.

Rounds: 4. Builds: main, p2c (reference: main). Load before each build (busy %): 11, 32.5, 9.7, 12.8, 11.4, 9.3, 8.2, 3.9.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.65 | 8.45 | 6.40 | 7.85 | 0.00 | 2905.5 | 429 | 10.29 | 975 | 8 | 10 | 0.03 |
| p2c | 6.50 | 7.45 | 6.30 | 7.20 | 0.00 | 2005 | 429 | 10.29 | 70 | 8 | 10 | 0.03 |

### night/airport

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 3.97 | 7.40 | 3.10 | 7.20 | 0.00 | 1247.5 | 121 | 3.86 | 543 | 0 | 1 | 0.02 |
| p2c | 3.70 | 8.75 | 1.95 | 8.60 | 0.00 | 715 | 121 | 3.87 | 6 | 0 | 1 | 0.02 |

### night/f13

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | mapDetails calls | police calls | labels calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.90 | 4.90 | 2.55 | 4.60 | 0.00 | 977 | 77 | 2.26 | 371 | 0 | 1 | 0.02 |
| p2c | 2.75 | 7.00 | 1.70 | 6.85 | 0.00 | 612 | 77 | 2.27 | 6 | 0 | 1 | 0.02 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| p2c | night/overview | -0.34 [-0.42 … +0.03] | -1.20 [-2.00 … -0.60] | -0.25 [-0.30 … +0.10] | -1.00 [-1.80 … 0.00] | 4 |
| p2c | night/airport | -0.37 [-0.45 … +0.11] | +1.40 [-0.20 … +2.30] | -0.75 [-1.60 … -0.60] | +1.40 [-0.10 … +2.30] | 4 |
| p2c | night/f13 | -0.08 [-0.32 … +0.01] | +1.70 [+0.40 … +3.70] | -0.50 [-1.30 … -0.40] | +1.65 [+0.70 … +4.10] | 4 |
