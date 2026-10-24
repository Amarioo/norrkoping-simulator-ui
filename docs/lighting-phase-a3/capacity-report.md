# Phase A3 — capacity

The shader reads at most **16 lamps per 25 m cell**; a set in which any cell would need more is rejected
as a whole (nothing is truncated). Machine-readable: [`data/capacity.json`](data/capacity.json)
(written by `scripts/lighting-a3/reports.test.ts`).

## Occupancy

| Set | Fixtures | Max lamps in a cell | Overflow cells | Non-empty cells | Cell entries | Pages | Lamp texture | Page payload | Directory |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A2 state (pilot + A1 + A2) | 267 | 15 | 0 | 538 | 2 106 | 69 | 34 176 B | 70 656 B | 864 B |
| A3 alone | 6 | 4 | 0 | 35 | 63 | 6 | 768 B | 6 144 B | 24 B |
| **Combined (pilot + A1 + A2 + A3)** | **273** | **15** | **0** | **561** | **2 169** | **72** | 34 944 B | 73 728 B | 864 B |

Lighting textures grow by **+3 840 B** (lamp +768 B, payload +3 072 B; CPU-side arithmetic, not
measured VRAM). The busiest cell is unchanged: A1's square (`-8,-21`, 15 lamps, all A1 incl. 8 real
mapped lamps). The other cells with ≥ 13 lamps are A1 cells as before.

## Cells an A3 lamp reaches

| | Value |
|---|---|
| Cells reached by at least one A3 lamp | 35 (23 new cells, 12 that held earlier lamps before) |
| **Maximum lamps in any of them** | **8** (cell `-27,-20` at the Kungsgatan link: 7 A2 + 1 A3) |
| Histogram (lamps per cell → cells) | 1 → 7, 2 → 9, 3 → 12, 4 → 3, 5 → 1, 7 → 2, 8 → 1 |
| Cells where only A3 lamps reach | at most 4 lamps (cell `-29,-22`, the ring's west half) |

Junction density: the nearest earlier lamp to any A3 bracket is 33.7 m away (A2 `300186799:s0`); A3
creates no cluster comparable to the Kungstorget east junction in A2 (five 8 m brackets ≈ 20 m apart).

## Headroom (not applied)

Regenerating A3 with denser estimates (class spacing × factor), everything else unchanged:

| Spacing factor | A3 fixtures | Accepted | Max in any cell | Max in cells A3 reaches |
|---:|---:|---|---:|---:|
| 1.00 (as built) | 6 | yes | 15 | 8 |
| 0.85 | 9 | yes | 15 | 7 |
| 0.75 | 11 | yes | 15 | 8 |
| 0.60 | 13 | yes | 15 | 8 |
| 0.50 | 16 | yes | 15 | 9 |

Even with spacing halved the ring stays far below the limit: capacity is not a constraint here.

## Rejection behaviour (tested)

- 17 extra lamps crowding one A3 cell → the whole set is rejected at the capacity stage with a
  conflict report listing all 17; the previous 273-fixture set keeps rendering (`rendering-previous`),
  in Vitest and in the live app (Playwright: the frame stays byte-identical).
- An A3 record re-using an A2 canonical ID → rejected at the registry stage; the 273 set stays.
- 10 alternating swaps A2 state ↔ A2 + A3 keep exactly one live set and constant GPU resources.
