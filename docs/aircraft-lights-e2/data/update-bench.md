# Aircraft Lights E2 — CPU cost of the per-frame light update

`npx vitest bench --run --config vitest.config.ts scripts/aircraft-e2/update.bench.ts` (PowerShell,
uppercase `C:\` path), Vitest 4.1.12, Node 24, AMD Ryzen 7 9800X3D, 2026-11-06, final code (two glow
buffers). One call = one frame: sockets × object matrix, sector towards the camera, flash window,
instance matrices and colours written.

| case | mean ms | p99 ms | samples |
|---|---:|---:|---:|
| 1 aircraft (11 lights) | 0.0017 | 0.0034 | 286 642 |
| 4 aircraft (44 lights, the buffers' capacity) | 0.0055 | 0.0097 | 90 449 |

First version (one glow buffer, measured while the Playwright suite ran): 0.0013 / 0.0047 ms mean.
