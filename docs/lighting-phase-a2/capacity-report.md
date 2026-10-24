# Phase A2 — capacity and overflow report

Policy unchanged from Phase 0/A1: 25 m cells, ≤ 16 contributing lamps per cell (the shader's fixed
slot count, **not raised**), 100 m pages, canonical-ID order, **the whole set is rejected on any
overflow**, nothing is truncated, a rejected set never replaces the rendered one. No lamp range or
intensity was changed. Data: [`data/capacity.json`](data/capacity.json)
(`scripts/lighting-a2/reports.test.ts`).

Order of operations before any GPU allocation (`prepareStreetLighting`): generate A2 against the
accepted pilot + A1 set → validate the complete merged registry (267 records: schema, unique
canonical and runtime IDs, provenance, E/N ↔ scene, supports, photometry) → compute every cell's raw
occupancy → reject with a full conflict report, or build the sparse index → upload.

## Result: accepted, no overflow, A2 far from the limit

| Set | Fixtures | Max lamps / cell | Overflow cells | Non-empty cells | Cell entries | Pages | Lamp + page + directory bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| A1 state (pilot + A1, before) | 232 | 15 | 0 | 476 | 1 807 | 63 | 29 696 + 64 512 + 864 = **95 072** |
| A2 only | 35 | 9 | 0 | 75 | 299 | 10 | 4 480 + 10 240 + 48 = 14 768 |
| **Combined (rendered)** | **267** | **15** | **0** | **538** | **2 106** | **69** | 34 176 + 70 656 + 864 = **105 696** |

Combined histogram (cells with k lamps, k = 1…16): `102, 103, 85, 49, 60, 47, 35, 26, 18, 5, 2, 2, 3, 0, 1, 0`
(A1 state: `98, 96, 79, 39, 50, 37, 26, 22, 16, 5, 2, 2, 3, 0, 1, 0`). The directory keeps its size
(A2's pages lie inside the existing non-empty-chunk rectangle). Byte figures are CPU typed-array sizes
(same arithmetic as the GPU textures), **not measured VRAM**.

## Checks requested for A2

| Check | Result |
|---|---|
| 1. Full registry validation of the combined set | 0 errors (267 records) |
| 2. IDs against the 232 existing fixtures | disjoint (canonical and runtime); the 232 records deep-equal before/after |
| 3. Complete spatial occupancy | 538 non-empty cells; histogram above |
| 4. Cells reaching 16 | **none** (max 15, unchanged: A1's square with 8 real mapped lamps) |
| 5. Conflicts with ≥ 17 lights | **none** in the real set; injected 17-lamp crowd in an A2 cell rejected at `capacity` with all raw IDs (unit + E2E) |
| 6. Mapped density vs estimate overlap | every cell A2 reaches is estimate-only (A2 has no mapped lamp); the only ≥ 13 cells are the four A1 cells, unchanged (8/4/6/1 mapped) |
| 7. Every accepted contributing light represented | every lamp is listed in every cell its range reaches (brute-force CPU illuminance over all 267 lamps = indexed sum at > 1 000 receivers around both seams (tested); Phase 0 parity tests unchanged) |

## Cells A2 reaches

75 cells receive A2 lamps: **62 new** (no lamp before) and **13 seam cells** that already held pilot
or A1 lamps. Maximum occupancy of any cell an A2 lamp reaches: **9** (tested).

| Cell (scene) | Centre E / N | Lamps | Contributors |
|---|---|---:|---|
| (−26, −19) | 568 392.7 / 6 495 451.3 | 9 | 5 Kungsgatan brackets (staggered), 1 Slottsgatan 6 m bracket, 3 promenade lanterns |
| (−26, −18) | 568 392.7 / 6 495 426.4 | 9 | same street section |
| (−26, −22) | 568 392.7 / 6 495 526.3 | 8 | the Kungstorget east junction: 6 brackets of 6 different ways + 2 lanterns |
| (−26, −20), (−26, −17), (−25, −17) | | 8 | Kungsgatan |

Seam cells (lamps of an earlier rollout plus A2 lamps; all estimates, max 7):

| Cell | Centre E / N | Before → after | Pilot | A1 | A2 |
|---|---|---:|---:|---:|---:|
| (-25, -16) | 568417.7 / 6495376.4 | 1 → 7 | 1 | 0 | 6 |
| (-25, -15) | 568417.7 / 6495351.4 | 4 → 7 | 4 | 0 | 3 |
| (-19, -25) | 568567.7 / 6495601.3 | 2 → 6 | 0 | 2 | 4 |
| (-18, -26) | 568592.6 / 6495626.3 | 4 → 6 | 0 | 4 | 2 |
| (-26, -15) | 568392.7 / 6495351.4 | 2 → 5 | 2 | 0 | 3 |
| (-24, -15) | 568442.7 / 6495351.4 | 3 → 5 | 3 | 0 | 2 |
| (-19, -26) | 568567.7 / 6495626.3 | 2 → 5 | 0 | 2 | 3 |
| (-19, -24) | 568567.7 / 6495576.3 | 1 → 5 | 0 | 1 | 4 |
| (-18, -25) | 568592.6 / 6495601.3 | 3 → 5 | 0 | 3 | 2 |
| (-24, -16) | 568442.7 / 6495376.4 | 1 → 4 | 1 | 0 | 3 |
| (-18, -27) | 568592.6 / 6495651.3 | 3 → 4 | 0 | 3 | 1 |
| (-18, -24) | 568592.6 / 6495576.3 | 2 → 3 | 0 | 2 | 1 |
| (-19, -27) | 568567.7 / 6495651.3 | 1 → 2 | 0 | 1 | 1 |

**Diagnosis.** A2's peak (9) comes from Kungsgatan being 9.9 m wide and two-way, so the Step 6 rule
staggers brackets on both kerbs at 15 m along the way (each 30 m range), plus the promenade lanterns
beside it — real geometry, not estimate pile-up. The seam rules prevented the one place where
generation would have doubled a bracket line (Kungsgatan `297613947:s0` next to the pilot's last
bracket).

## Headroom (density stress, not applied)

The A2 generator re-run with all class spacings scaled down, combined with the unchanged A1 state:

| Spacing factor | A2 fixtures | Accepted | Max in cells A2 reaches | Max overall | Overflow cells |
|---:|---:|---|---:|---:|---:|
| 1.00 (policy) | 35 | yes | 9 | 15 | 0 |
| 0.85 | 42 | yes | 12 | 15 | 0 |
| 0.75 | 50 | yes | 13 | 15 | 0 |
| 0.60 | 62 | yes | 16 | 16 | 0 |

A2 has ≈ 7 slots of headroom at policy spacing; even 40 % denser estimates fit. The tight cell of the
city remains A1's square (headroom ≈ 1 lamp, see the A1 report).

## Rejection behaviour verified

| Case | Where | Result |
|---|---|---|
| 17 lamps crowding one A2 cell | `corridorA2.test.ts`, E2E | rejected at `capacity`; report lists all 17 + residents; previous textures stay bound; 267 fixtures still rendered; E2E frame byte-identical |
| A2 record re-using an A1 canonical ID | `corridorA2.test.ts` | rejected at `registry` |
| Station slot already rendered by A1 / OSM node already in an earlier rollout | `corridorA2.test.ts` (injected) | candidate not imported, reported as `identity-in-existing-set` |
| Phase 0 / A1 cases (collisions, invalid geography, deck station, `lit=no` source) | `phase0.test.ts`, `corridor.test.ts` | unchanged, pass |
