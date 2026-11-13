# Phase C1 paired run

Phase C1 paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 18 %.

Rounds: 4. Builds: main, c1 (reference: main). Load before each build (busy %): 16.8, 13.3, 11.6, 15.3, 12.3, 18.2, 8.8, 9.1.

## Medians over the rounds

### day/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 10.35 | 12.65 | 11.25 | 12.40 | 0.25 | 1394 | 372 | 7.09 | 6 | 2 | 0.01 |
| c1 | 11.42 | 12.95 | 11.55 | 12.75 | 0.33 | 1442 | 379 | 7.14 | 6 | 47 | 0.01 |

### day/pilotGround

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 10.40 | 12.70 | 11.15 | 12.30 | 0.67 | 1385 | 368 | 7.06 | 8 | 2 | 0.01 |
| c1 | 10.57 | 12.70 | 11.25 | 12.60 | 0.17 | 1410.5 | 372 | 7.10 | 8 | 24.5 | 0.02 |

### night/pilotAbove

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | material switches | triangles (M) | lights calls | aircraft calls | listed parts triangles (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 6.95 | 18.15 | 5.05 | 11.95 | 7.75 | 1395 | 373 | 7.14 | 7 | 2 | 0.06 |
| c1 | 12.68 | 32.50 | 11.05 | 22.45 | 36.33 | 1420.5 | 377 | 7.19 | 7 | 24.5 | 0.06 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| c1 | day/pilotAbove | +1.00 [-0.09 … +2.22] | +0.35 [-0.30 … +18.30] | +0.35 [-0.10 … +0.70] | +0.35 [0.00 … +5.40] | 4 |
| c1 | day/pilotGround | +0.17 [-0.67 … +1.14] | 0.00 [-0.50 … +0.40] | +0.20 [-0.30 … +0.50] | +0.25 [-0.30 … +0.70] | 4 |
| c1 | night/pilotAbove | +0.41 [-0.05 … +12.99] | +1.80 [-0.30 … +28.90] | +0.30 [-0.10 … +12.60] | +2.00 [-0.10 … +19.00] | 4 |
