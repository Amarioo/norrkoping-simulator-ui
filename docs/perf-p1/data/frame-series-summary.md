# Phase P1 — frame-by-frame series

Phase P1 frame series: 1200 consecutive frames per view; rAF interval (what the viewer sees), hook CPU split (tasks before the render stage, render stage), GPU timer off, snapshot = a new traffic snapshot was seen at the start of the frame. Fullscreen 2560x1440, traffic on, hook build, Edge headless uncapped, Europe/Stockholm 2026-10-21, stadium off.

CPU = Threlte tasks + render stage of each frame (hook). Budgets: 16.7 ms = one 60 Hz interval; 12.2 ms = two intervals of the 164 Hz display (a frame that takes longer is shown after three or more). Snapshot frames = a new traffic snapshot arrived at the start of the frame. Median over rounds.

| View | frames | CPU median ms | CPU p95 ms | CPU max ms | > 12.2 ms | > 16.7 ms | > 20 ms | snapshot frames | CPU snapshot / other (mean ms) | hook interval p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| night/overview | 1,200 | 15.80 | 17.70 | 23.80 | 100 % | 19 % | 0.8 % | 194 | 16.47 / 15.93 | 18.30 |
| night/kungsgatan | 1,200 | 2.60 | 7.00 | 8.30 | 0 % | 0 % | 0.0 % | 43 | 3.23 / 3.50 | 7.20 |
| day/overview | 1,200 | 15.70 | 17.90 | 27.00 | 100 % | 19 % | 1.1 % | 193 | 16.52 / 15.92 | 18.60 |
| day/kungsgatan | 1,200 | 2.40 | 2.80 | 4.80 | 0 % | 0 % | 0.0 % | 30 | 2.60 / 2.49 | 3.20 |
