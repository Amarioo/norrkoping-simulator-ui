# Phase D2 paired run

Phase D2 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 5. Builds: main, d2 (reference: main). Load before each build (busy %): 6.5, 5.7, 5.9, 6.7, 6, 5.3, 4.8, 8.4, 6.2, 6.1.

## Medians over the rounds

### night/ingelsta

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.38 | 2.70 | 2.20 | 2.50 | 0.00 | 255 | 69 | 2.25 | 5 | 0 | 0.06 |
| d2 | 2.33 | 2.80 | 2.20 | 2.50 | 0.00 | 259 | 72 | 2.26 | 6 | 0 | 0.06 |

### day/ingelsta

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.33 | 2.70 | 2.20 | 2.50 | 0.00 | 254 | 68 | 2.20 | 4 | 0 | 0.01 |
| d2 | 2.30 | 2.70 | 2.10 | 2.60 | 0.00 | 258 | 71 | 2.20 | 5 | 0 | 0.01 |

### night/stationYard

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 2.44 | 2.80 | 2.30 | 2.60 | 0.00 | 263 | 89 | 2.57 | 11 | 0 | 0.08 |
| d2 | 2.37 | 2.70 | 2.30 | 2.50 | 0.00 | 267 | 92 | 2.57 | 12 | 0 | 0.08 |

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 5.48 | 6.60 | 5.30 | 5.80 | 0.00 | 1783 | 437 | 10.66 | 9 | 0 | 0.07 |
| d2 | 5.45 | 6.50 | 5.20 | 5.90 | 0.00 | 1786 | 440 | 10.66 | 9 | 0 | 0.07 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| d2 | night/ingelsta | -0.01 [-0.11 … +0.20] | +0.00 [-0.10 … +0.40] | 0.00 [-0.10 … +0.20] | 0.00 [-0.10 … +0.20] | 5 |
| d2 | day/ingelsta | -0.01 [-0.11 … +0.51] | 0.00 [-0.20 … +0.60] | 0.00 [-0.10 … +0.50] | +0.10 [-0.10 … +0.50] | 5 |
| d2 | night/stationYard | -0.01 [-0.11 … +0.17] | 0.00 [-0.20 … +0.10] | 0.00 [-0.10 … +0.20] | 0.00 [-0.20 … +0.20] | 5 |
| d2 | night/overview | -0.05 [-0.25 … +0.15] | -0.10 [-0.30 … +0.20] | 0.00 [-0.20 … +0.20] | -0.30 [-0.40 … +0.20] | 5 |
