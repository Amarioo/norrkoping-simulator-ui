# Phase A1 — capacity and overflow report

Phase 0's policy is unchanged: 25 m cells, ≤ 16 contributing lamps per cell (the shader's fixed slot
count), 100 m pages, canonical-ID order, **the whole set is rejected on any overflow**, nothing is
truncated, and a rejected set never replaces the rendered one. The shader limit was not raised.

Order of operations (all before any GPU allocation, `prepareStreetLighting`): generate → validate the
complete merged registry (pilot + A1) → compute every cell's raw occupancy → reject with a full
conflict report, or build the sparse index → upload. Data: [`data/capacity.json`](data/capacity.json),
produced by `scripts/lighting-a1/reports.test.ts`.

## Result: accepted, no overflow

| Set | Fixtures | Max lamps / cell | Overflow cells | Non-empty cells | Pages | Lamp + page + directory bytes |
|---|---:|---:|---:|---:|---:|---:|
| Pilot only (Phase 0) | 105 | 8 | 0 | 279 | 40 | 13 440 + 40 960 + 520 = **54 920** |
| A1 only | 127 | 15 | 0 | 197 | 24 | 16 256 + 24 576 + 168 = 41 000 |
| **Combined (rendered)** | **232** | **15** | **0** | **476** | **63** | 29 696 + 64 512 + 864 = **95 072** |

Occupancy histogram of the combined set (cells with k contributing lamps, k = 1…16):
`98, 96, 79, 39, 50, 37, 26, 22, 16, 5, 2, 2, 3, 0, 1, 0`.

The pilot and A1 never share a cell: 279 + 197 = 476, and every frozen pilot cell lists exactly its
pilot lamps in the combined index (test). Byte figures are CPU typed-array sizes (the same arithmetic
as the GPU textures), **not measured VRAM**.

## Near-capacity cells (≥ 13 contributors)

| Cell (scene) | Centre E / N (EPSG:3006) | Lamps | Mapped | Estimated | By type | Cause |
|---|---|---:|---:|---:|---|---|
| (−8, −21) | 568 842.6 / 6 495 501.3 | **15** | 8 | 7 | 3 × 8 m bracket, 1 × 6 m, 11 × lantern | the small square south of the park: 8 of the 10 **real mapped OSM lamps** plus the Drottninggatan brackets and park lanterns overlapping it |
| (−8, −22) | 568 842.6 / 6 495 526.3 | 13 | 4 | 9 | 5 × 8 m, 2 × 6 m, 6 × lantern | same square + Slottsgatan junction |
| (−7, −20) | 568 867.6 / 6 495 476.3 | 13 | 6 | 7 | 6 × 8 m, 7 × lantern | square + Drottninggatan north of the bridge |
| (−8, −23) | 568 842.6 / 6 495 551.3 | 13 | 1 | 12 | 6 × 8 m, 2 × 6 m, 5 × lantern | Drottninggatan/park edge (the Phase 0 synthetic overflow cell, see below) |

The IDs of every contributor are listed in `capacity.json` (`nearCapacityCells[].ids`).

**Diagnosis.** The pressure is **not** caused by dense estimate spacing alone: the worst cell is
dominated by real mapped lamps (8 lanterns within ≈ 40 m) and by overlapping contributions of 30 m-range
road brackets on both Drottninggatan carriageways. Estimates were kept at the Step 6 class spacing; the
dedicated suppression rules (estimates yield to mapped lamps of the same class within 9–14 m, to each
other within 0.55 × spacing, and paths within 10 m of a lit road are covered by the road lighting)
already removed 71 candidates in total (`coverage.json → rejectedByReason`).

## Headroom (density stress, not applied)

The generator was re-run with all class spacings scaled down (same inputs, everything else equal):

| Spacing factor | A1 fixtures | Accepted | Max / cell | Overflow cells |
|---:|---:|---|---:|---:|
| 1.00 (policy) | 127 | yes | 15 | 0 |
| 0.85 | 147 | **no** | 17 | 1 |
| 0.75 | 166 | **no** | 18 | 1 |
| 0.60 | 208 | **no** | 20 | 15 |

Each rejection lists the full raw contributor set; nothing was dropped. Headroom in the central square
is therefore about one lamp. A future register with more points there, or denser estimates, would be
rejected and need an owner decision: smaller cells for that area, a reviewed priority policy, or a
separate overflow pass (Phase 0 / Step 6.2 options). The global light limit stays 16.

## Phase 0 synthetic citywide load

Unchanged (4 overflowing cells, max 19, hypothetical centreline emitters; not an inventory). Its worst
cell (−8, −23) is inside zone B: with the A1 placement policy (outer-kerb rows on dual carriageways,
per-station sidewalk coverage, suppression) the same cell holds 13 real/estimated lamps.

## Rejection behaviour verified

| Case | Where | Result |
|---|---|---|
| 17 lamps crowding one corridor cell | `corridor.test.ts`, E2E | rejected at `capacity`; report lists all 17 + residents; previous textures stay bound; E2E frame byte-identical; a valid set afterwards clears `rendering-previous` |
| A1 record re-using a pilot canonical ID | `corridor.test.ts` | rejected at `registry` (duplicate ID); 232 fixtures still rendered |
| Outside the map, non-finite, E/N ≠ scene, deck station t > 1 | `corridor.test.ts` | rejected at `registry` |
| Record derived from the `lit=no` way 8237045 | `corridor.test.ts` | rejected (`derived from explicitly unlit way/8237045`) |
| Density variants 0.85 / 0.75 / 0.60 | reports harness | rejected with full conflict lists |
