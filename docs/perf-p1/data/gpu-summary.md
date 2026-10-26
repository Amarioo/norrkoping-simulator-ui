# Phase P1 — GPU time, resolution scaling, per-pixel lighting

Phase P1 GPU: EXT_disjoint_timer_query_webgl2 around renderer.render() (elapsed GPU-timeline time, an upper bound of busy time on ANGLE/D3D11), pixel-ratio scaling of the drawing buffer, per-pixel night lighting off; 300 frames per measurement, fullscreen 2560x1440 window, hook build, Edge headless uncapped, traffic on, Europe/Stockholm 2026-10-21, stadium off.

Host: AMD Ryzen 7 9800X3D 8-Core Processor. GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11). Timer available: true, true, true. Machine load before each round: 14 %, 17.2 %, 20.5 %.

## night/overview (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 61 | 16.32 | 33.4 | 15.96 | 12.36 | 13.32 |
| 0.75 | 1920x1080 | 62 | 16.19 | 33.2 | 15.84 | 12.30 | 13.64 |
| 1 | 2560x1440 | 60 | 16.76 | 33.8 | 16.44 | 12.68 | 14.53 |
| 1.5 | 3840x2160 | 61 | 16.33 | 33.5 | 15.98 | 12.51 | 13.70 |
| 1, lamps and beams off | 2560x1440 | 60 | 16.55 (Δ −0.26) | 34.0 | 16.21 | 12.68 (Δ −0.14, −0.20 … +0.07) | 13.83 |
| 1.5, lamps and beams off | 3840x2160 | 61 | 16.46 (Δ +0.17) | 33.2 | 16.09 | 12.54 (Δ −0.03, −0.06 … +0.03) | 13.73 |

## night/city (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 148 | 6.76 | 8.1 | 6.57 | 5.53 | 5.95 |
| 0.75 | 1920x1080 | 145 | 6.91 | 8.3 | 6.72 | 6.44 | 6.87 |
| 1 | 2560x1440 | 139 | 7.17 | 8.8 | 6.96 | 6.83 | 7.36 |
| 1.5 | 3840x2160 | 133 | 7.55 | 8.7 | 7.33 | 7.44 | 7.85 |
| 1, lamps and beams off | 2560x1440 | 147 | 6.79 (Δ −0.39) | 8.3 | 6.60 | 4.94 (Δ −1.99, −2.11 … −1.89) | 5.72 |
| 1.5, lamps and beams off | 3840x2160 | 150 | 6.65 (Δ −0.98) | 7.9 | 6.47 | 5.32 (Δ −2.17, −2.21 … −2.08) | 5.72 |

## night/kungsgatan (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 378 | 2.65 | 3.6 | 2.51 | 2.60 | 2.94 |
| 0.75 | 1920x1080 | 338 | 2.96 | 4.7 | 2.84 | 2.95 | 3.35 |
| 1 | 2560x1440 | 298 | 3.35 | 6.0 | 3.22 | 3.31 | 3.61 |
| 1.5 | 3840x2160 | 237 | 4.21 | 9.5 | 4.06 | 4.17 | 4.53 |
| 1, lamps and beams off | 2560x1440 | 389 | 2.57 (Δ −0.78) | 3.0 | 2.46 | 2.49 (Δ −0.84, −1.22 … −0.68) | 2.81 |
| 1.5, lamps and beams off | 3840x2160 | 351 | 2.85 (Δ −1.36) | 4.6 | 2.73 | 2.80 (Δ −1.38, −2.47 … −1.33) | 3.14 |

## day/overview (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 59 | 16.81 | 34.2 | 16.45 | 12.69 | 13.95 |
| 0.75 | 1920x1080 | 61 | 16.33 | 33.7 | 16.01 | 12.18 | 13.70 |
| 1 | 2560x1440 | 60 | 16.56 | 33.4 | 16.21 | 12.47 | 13.62 |
| 1.5 | 3840x2160 | 60 | 16.79 | 33.9 | 16.40 | 12.50 | 14.67 |

## day/city (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 143 | 7.01 | 8.5 | 6.81 | 4.93 | 5.69 |
| 0.75 | 1920x1080 | 143 | 6.99 | 9.0 | 6.78 | 5.07 | 6.23 |
| 1 | 2560x1440 | 148 | 6.76 | 8.1 | 6.57 | 4.91 | 5.51 |
| 1.5 | 3840x2160 | 148 | 6.78 | 8.2 | 6.59 | 5.35 | 5.79 |

## day/kungsgatan (traffic on), median of 3 rounds

| Pixel ratio | Pixels | fps | Frame ms | p95 ms | CPU ms | GPU ms (timer, mean) | GPU p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.5 | 1280x720 | 396 | 2.52 | 3.0 | 2.41 | 2.37 | 2.71 |
| 0.75 | 1920x1080 | 398 | 2.51 | 3.1 | 2.40 | 2.42 | 2.79 |
| 1 | 2560x1440 | 390 | 2.56 | 3.1 | 2.46 | 2.47 | 2.75 |
| 1.5 | 3840x2160 | 349 | 2.86 | 4.7 | 2.74 | 2.80 | 3.12 |
