# Phase A1 — exact geographic coverage

Canonical boundary: three adjoining zones in **SWEREF 99 TM / EPSG:3006** (E/N metres), defined in
[`corridorA1.ts`](../../src/lib/lighting/corridorA1.ts) (`A1_ZONES`) and repeated in
[`data/coverage.json`](data/coverage.json). Scene coordinates are derived with the fixed affine
reference. Total area 0.083 km² (A 0.043, B 0.021, C 0.018 km²) — a corridor, not a rectangle: it follows the streets and excludes the blocks, the station building, the tracks and
platforms, and the park interior west of Drottninggatan.

![A1 corridor](evidence/corridor-map.png)

*Diagnostic map (generated from the pinned data): grey carriageways, orange `lit=yes` ways, blue dashed
`lit=no`, magenta tram tracks; green dashed: zone boundaries; filled circles: A1 estimates (orange 8 m
bracket, yellow 6 m bracket, green 4 m lantern; tick = arm direction); blue squares: mapped OSM lamps;
purple rings: deck support; ✕ red: candidate rejected or skipped (reason in the provenance file),
✕ grey: suppressed by a nearby fixture.*

## Zones

### A — Resecentrum and Norra Promenaden

| Vertex | E | N | Feature |
|---|---:|---:|---|
| 1 | 568 572.7 | 6 495 691.3 | west of Aurorarondellen, north of the bus/taxi loop |
| 2 | 568 730.1 | 6 495 713.8 | bus/taxi loop, north-east corner |
| 3 | 568 750.1 | 6 495 691.3 | station building, south-west corner |
| 4 | 568 840.1 | 6 495 716.3 | station building, south-east corner |
| 5–7 | 568 907.5 … 569 030.0 | 6 495 728.7 … 6 495 763.7 | 14 m north of Norra Promenaden's north carriageway (platform access footways excluded) |
| 8 | 569 085.0 | 6 495 780.0 | east of the Sveagatan junction |
| 9 | 569 085.0 | 6 495 713.8 | south of the east end |
| 10–12 | 568 905.0 … 568 730.1 | 6 495 653.8 … 6 495 613.8 | south kerb of Norra Promenaden (A/B seam at Drottninggatan) |
| 13 | 568 572.7 | 6 495 573.8 | south-west corner |

Covers Norra Promenaden from Aurorarondellen to east of Sveagatan (both carriageways and the central
promenade), Stationsrondellen, the station forecourt and the bus/taxi loop, the Resecentrum tram stop
(no platform fixtures), and the junctions with Sveagatan/Magasinsgatan.

### B — Drottninggatan (Norra Promenaden – Saltängsbron)

Vertices (E, N): 568 790.1/6 495 628.8 · 568 905.0/6 495 653.8 · 568 920.0/6 495 538.8 ·
568 947.5/6 495 474.1 · 568 857.6/6 495 439.6 · 568 815.1/6 495 429.6 · 568 815.1/6 495 536.3 ·
568 815.1/6 495 621.3. Both Drottninggatan carriageways, the Slottsgatan/Hotellgatan junctions, the
park footways beside the street and the small square south of the park with the **10 mapped OSM lamps**.
The B/C seam lies on the extension of Saltängsbron's north deck edge.

### C — Saltängsbron and its south connection

Vertices (E, N): 568 857.6/6 495 439.6 · 568 947.5/6 495 474.1 · 568 965.0/6 495 388.9 ·
568 990.0/6 495 301.4 · 568 992.5/6 495 263.9 · 568 900.0/6 495 263.9 · 568 885.0/6 495 328.9 ·
568 872.6/6 495 368.9 · 568 880.1/6 495 393.9. Saltängsbron (Drottninggatan over Motala ström, both
carriageways and deck footways), the Hamngatan junctions, and the Drottninggatan tram street to Gamla
Rådstugugatan with the Rådhuset tram stop (no platform fixtures).

## Distance to the existing pilots

No overlap. Shortest distances from the zone outlines to the pilot bounds: Strömparken 45 m (south-west
of zone C), Kungsgatan 222 m (south of zone A), Idrottsparken 915 m. No A1 lamp shares a
light-grid cell with a pilot lamp (all 279 frozen pilot cells list exactly their pilot lamps in the
combined set — test).

## What is lit, what is not

See [`data/coverage.json`](data/coverage.json) for every way. Summary inside the corridor:

| Evidence | Length inside | Result |
|---|---:|---|
| `lit=yes` secondary (Norra Promenaden, Drottninggatan, roundabouts, Saltängsbron) | 1 849 m | 8 m brackets on the outer kerbs / ring / deck edges |
| `lit=yes` residential + service (Sveagatan, Slottsgatan, Hamngatan, bus/taxi loop, Drottninggatan tram street) | 769 m | 6 m brackets |
| `lit=yes` footway/path/cycleway | 2 158 m | lanterns where > 10 m from a lit road; otherwise covered by the road lighting |
| `lit=yes` platforms (4 tram, 4 rail touching zone A) | 282 m | none (not modelled; no platform lighting claimed) |
| `lit=yes` pedestrian area (Tyska torget) | 73 m outline | none (positions not derivable) |
| `lit=no` (Magasinsgatan) | 100 m | none (explicitly unlit) |
| no `lit` tag (29 rendered ways) | 1 167 m | none (unknown) |

Counts per zone and type are in the [README](README.md#2-fixtures).
