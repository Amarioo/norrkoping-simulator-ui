# Phase P2a paired run

Phase P2a paired timing: 600 frames per view and build, builds in rotated order each round; fullscreen 2560x1440, traffic on, hook builds, Edge headless with vsync and the frame-rate limit off, Europe/Stockholm 2026-10-21, stadium off. A round waits for background CPU <= 25 %.

Rounds: 2. Builds: main, p1hook (reference: main). Load before each build (busy %): 16.6, 16.7, 12.1, 12.

## Medians over the rounds

### night/overview

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | tree calls | material switches | tree triangles |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 25.21 | 29.25 | 24.45 | 28.10 | 100.00 | 7916 | 784 | 1211 | 712152 |
| p1hook | 25.01 | 28.45 | 24.35 | 27.55 | 100.00 | 7916 | 784 | 1211 | 712152 |

### night/city

| build | rAF mean ms | rAF p95 ms | CPU median ms | CPU p95 ms | frames > 16.7 ms % | draw calls | tree calls | material switches | tree triangles |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| main | 10.44 | 12.65 | 10.00 | 12.10 | 0.42 | 3373 | 244 | 616 | 395172 |
| p1hook | 10.53 | 12.85 | 10.05 | 12.05 | 0.25 | 3399 | 244 | 618 | 395172 |

## Paired difference to main (same round): median [min … max] in ms

| build | view | rAF mean | rAF p95 | CPU median | CPU p95 | n |
|---|---|---:|---:|---:|---:|---:|
| p1hook | night/overview | -0.20 [-0.56 … +0.16] | -0.80 [-1.00 … -0.60] | -0.10 [-0.40 … +0.20] | -0.55 [-0.80 … -0.30] | 2 |
| p1hook | night/city | +0.09 [+0.04 … +0.14] | +0.20 [+0.10 … +0.30] | +0.05 [-0.10 … +0.20] | -0.05 [-0.10 … -0.00] | 2 |
