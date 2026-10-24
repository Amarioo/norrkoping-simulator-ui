# Phase A2 — exact geographic coverage

Canonical boundary: two adjoining zones in **SWEREF 99 TM / EPSG:3006** (E/N metres), defined in
[`corridorA2.ts`](../../src/lib/lighting/corridorA2.ts) (`A2_ZONES`) and repeated in
[`data/coverage.json`](data/coverage.json). Scene coordinates are derived with the fixed affine
reference (`E = 569030 + x·24.99146`, `N = 6494989 − z·24.99146`). Total area **0.0198 km²**
(D 0.0144, E 0.0054) — two street-following bands, not a rectangle.

![A2 corridor](evidence/corridor-map.png)

*Diagnostic map (committed data only, `scripts/lighting-a2/corridor-map.mjs`): grey carriageways;
**rose = rendered carriageway without any `lit` tag** (unknown); orange `lit=yes` ways; magenta tram
tracks; pink platforms. Purple dashed: A2 zones; green dashed: A1 zones; dotted: Kungsgatan pilot
bound. Large circles: A2 estimates (purple 8 m bracket, lilac 6 m bracket, teal 4 m lantern; tick =
arm direction). Small orange: A1 fixtures; small dark green: pilot fixtures. ✕ red: candidate skipped
by a rule (path covered by road lighting); ✕ grey: suppressed by the spacing rule.*

## How the boundary was derived

1. **A1 coverage polygons** (`A1_ZONES`): zone A's west edge is the line E = 568 572.7 between
   N 6 495 573.8 and N 6 495 691.3 (scene x = −18.30).
2. **Kungsgatan pilot footprint** (`scripts/step6/pilots.mjs`): scene box x −25 … −19.6,
   z −14.6 … 3.1; its north bound z = −14.6 is N 6 495 353.875.
3. **Connecting OSM ways** in the pinned Step 6.2 snapshot between the two: Norra Promenaden (dual
   carriageway with the tram reservation and the Norrtull stop between), the east arc of the
   Kungstorget circular junction where Kungsgatan joins, and Kungsgatan (one 9.9 m two-way carriageway
   that splits into two one-way carriageways just before Kungstorget).
4. **Evidence per way** (`lit=yes` / `lit=no` / no tag) from the snapshot; rendered ways absent from it
   have no `lit` tag (the snapshot query fetched only `lit`-tagged ways).
5. **Polygons** drawn along those carriageways (≈ 15 m north of the westbound and ≈ 12 m south of the
   eastbound Norra Promenaden centreline; ≈ 20 m west / 17.5 m east of the Kungsgatan centreline), with
   the seams placed exactly on the A1 and pilot boundaries.

## Zones

### D — Norra Promenaden west, Norrtull, Kungstorget east junction (14 409 m², 20 fixtures)

| Vertex | E | N | Feature |
|---|---:|---:|---|
| 1 | 568 572.7 | 6 495 635.0 | on A1 zone A's west edge, 15 m north of the westbound carriageway |
| 2–4 | 568 514.2 … 568 377.7 | 6 495 616.5 … 6 495 581.3 | ≈ 15 m north of the westbound carriageway |
| 5–8 | 568 356.5 … 568 341.5 | 6 495 571.3 … 6 495 502.6 | through the Kungstorget ring island (its east arc inside) |
| 9–10 | 568 367.7 / 568 408.7 | 6 495 483.1 / 6 495 494.1 | **D/E seam** across Kungsgatan where it splits |
| 11–14 | 568 412.7 … 568 496.9 | 6 495 521.3 … 6 495 559.6 | junction corner, then ≈ 12 m south of the eastbound carriageway (north of the parallel residential street) |
| 15 | 568 572.7 | 6 495 573.8 | **A1 zone A's south-west vertex** (shared) |

### E — Kungsgatan north, Slottsgatan junction (5 431 m², 15 fixtures)

| Vertex | E | N | Feature |
|---|---:|---:|---|
| 1 | 568 367.7 | 6 495 483.1 | D/E seam, west |
| 2–4 | 568 374.5 … 568 392.2 | 6 495 457.1 … 6 495 392.1 | ≈ 20 m west of the centreline (promenade path inside) |
| 5–6 | 568 405.2 / 568 443.2 | 6 495 353.876 | **on the pilot's north bound** (z = −14.6000, 0.7 mm outside it; vertex 5 = the pilot's north-west corner) |
| 7–9 | 568 430.2 … 568 412.5 | 6 495 401.1 … 6 495 466.1 | ≈ 17.5 m east of the centreline |
| 10 | 568 408.7 | 6 495 494.1 | D/E seam, east |

### Seams and ownership

- **No overlap** with A1, the pilot or each other (tested: no edge crossings; interior samples belong
  to one zone only; no earlier fixture lies inside an A2 zone and no A2 fixture outside it).
- A1 → A2: D's east edge is collinear with A1's west edge; the seam crosses both Norra Promenaden
  carriageways, the tram reservation and the paths beside them.
- A2 → pilot: E's south edge lies on the pilot's north bound across the whole Kungsgatan street space.
- Ownership is by position: every lamp belongs to exactly one rollout. Light is not owned: lamps of
  either side light receivers across the seams through the global index (tested; see
  [capacity-report.md](capacity-report.md) and [visual-validation.md](visual-validation.md)).

## What is lit, what is not (inside A2)

From [`data/coverage.json`](data/coverage.json):

| Evidence | Length inside | Result |
|---|---:|---|
| `lit=yes` secondary carriageways (Norra Promenaden, Kungsgatan, Kungstorget east arc) | **649.5 m** (590.1 m with stations; 59.4 m on short links whose station was suppressed or that are shorter than half the spacing) | 23 × 8 m brackets: outer kerb of each Norra Promenaden carriageway, outer kerb of the ring arc, staggered both sides on the 9.9 m Kungsgatan, east kerb of the northbound Kungsgatan link |
| `lit=yes` residential (Slottsgatan junction mouth) | 17.7 m | 1 × 6 m bracket |
| `lit=yes` path / cycleway | 710.5 m | 12 lanterns where the path is > 10 m from a lit road centreline (Kungsgatan promenade path 94463450; the cycleway 286457920 beside the eastbound carriageway at Norrtull); 14 path stations covered by road lighting |
| `lit=yes` platforms (Norrtull tram stop "C", bus stop "F") | 120.8 m | none (no platform luminaires modelled) |
| `lit=no` | 0 m | — (none in A2) |
| **no `lit` tag**: Norra Promenaden 286445696 + 300186798 (westbound, 50.5 m), **1050773512** (eastbound, 52 m), Kungstorget 300027227 (4.9 m), Slottsgatan 297642830 (19 m), service 93304118, 3 paths (234 m) | 376.7 m | **none (unknown)** — see [remaining-gaps.md](remaining-gaps.md) |

The planning estimate in the A1 report was ≈ 570 m of `lit=yes` carriageway; the pinned data give
649.5 m of `lit=yes` secondary carriageway inside the bounded corridor (the A1 list omitted the
Kungstorget arc and 300186799), plus the short Slottsgatan mouth. The corridor does **not** include
the rest of the Kungstorget ring, Stockholmsvägen, Ingelstagatan, Luntgatan, Bråddgatan, Tunnbindaregatan,
Slottsgatan beyond its junction mouth, or the parallel residential street "Norra promenaden".
