# Phase L1 — remaining gaps

## For L2 (real citywide placement)

| Gap | Why it matters | Proposed handling |
|---|---|---|
| **JS heap +24.9 MB at 25 000 lamps** (gate ≤ 10 MB/step) | Each lamp lives as a registry record, a fixture record and a shader-lamp object (≈ 1 KB together) | Compact runtime format (columnar arrays, quantised positions/occlusion, records built on demand for diagnostics only); measure again |
| **Data size**: 25 000 lamps in today's JSON format ≈ 8 MB | Bundle size and parse time | Same compact format; ship as a separate lazily loaded asset |
| **Night triangles** +50 k from halos alone | Strömparken night +103 k (gate 100 k) | Accept, or halos as points / distance-limited quads if a weaker GPU needs it |
| Test-load placement only | Centreline + offset, one side, no bridges/water/rails/seams | L2 kerb placement with the corridor generator rules; fill the 71 empty slots inside A1–A3 zones (L0) |
| Weaker hardware | Gates for constrained hardware need a real device | Measure on an integrated GPU before advertising support |

## Design limits of L1

- Detail distances: full housings ≤ 250 m, low detail ≤ 600 m, lenses ≤ 1 km (the halo carries the
  light beyond). Before L1 poles were drawn per area up to 1.25 km. The pixel comparison shows the
  difference only in pole and lens silhouettes 250 m or more away (≤ 492 of 1.4 M pixels).
- Re-gathering happens after the camera moves 12.5 m; a fixture can therefore appear up to 12.5 m
  late at the detail boundary. Cost ≈ 1–2 ms per gather in Node at 25 000 lamps.
- `MAX_PER_CELL = 32` is a shader loop guard: a set with more lamps reaching one 25 m cell is still
  rejected as a whole (no dropping policy). L0 peaked at 23.
- Earlier phases' report harnesses describe the 16-slot format; their committed outputs are history
  and were not regenerated.
