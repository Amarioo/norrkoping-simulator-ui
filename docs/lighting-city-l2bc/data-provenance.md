# Phase L2bc — data provenance, licence and placement policy

**What this data is:** simulated lighting for footways, cycleways, paths, steps and squares (L2b), and
for partly lit roads at junctions outside the tätort and lit motorways (L2c). **7 719 of the 7 723
fixtures are estimates**; 4 are OSM `highway=street_lamp` nodes at their mapped (not surveyed)
positions. No municipal asset ID, photometry, pole height or switching schedule was used or invented.

## Sources

| Source | Version | Licence | Used for |
|---|---|---|---|
| L0 OSM snapshot (pinned, `scripts/lighting-city/sources.json`) | OSM base 2026-10-24T19:51:21Z, SHA-256 `e2858621…ce0b` | ODbL-1.0 © OpenStreetMap contributors | geometry, tags, versions, timestamps, lamp nodes |
| Committed extract [`scripts/data/lighting-l2bc-source.json`](../../scripts/data/lighting-l2bc-source.json) (2.88 MB, SHA-256 `23b95bcb…32f5`) | `node scripts/lighting-l2/extract-source.mjs bc`: every way of a generator class (car roads, motorways, paths) that L0 classified lit or partly lit (6 587), their one-way partners (6 655 ways), all 25 lamp nodes | ODbL-1.0 (adapted extract) | generator input; L2a's car roads are context only |
| L0 classification `docs/lighting-city-l0/data/city-lighting-l0.json` | rule `lighting-city-v1` (approved) | ODbL + SCB CC0 derived | lit evidence, "lit by the street" flag, lit intervals of partly lit ways |
| L2a runtime `src/lib/data/streetlights-l2.json` | committed | ODbL derived | existing fixtures (identity and spacing) |
| Rendered map, bridges, places, terrain, Step 6 type table, pilot/A1–A3 | unchanged | ODbL; DTM CC BY 4.0 © Lantmäteriet | as in L2a |

## Coordinates

As L2a ([../lighting-city-l2/data-provenance.md](../lighting-city-l2/data-provenance.md)): scene units
from OSM WGS84 via `src/lib/geo/sweref99tm.js`, E/N EPSG:3006 in the registry, heights from the
rendered ground or bridge-deck profile. Lit intervals are L0 metres along the way; the generator
measures 25 m per scene unit without the 0.99966 grid factor (≤ 0.02 m over a 50 m interval).

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-l2bc.json`](../../src/lib/data/streetlights-l2bc.json) | separate asset (584 KB, 160 KB gzip), fetched with L2a | compact format `lighting-compact-v1` |
| [`data/streetlights-l2bc-provenance.json`](data/streetlights-l2bc-provenance.json) | no (2.5 MB) | per fixture rule/evidence/station; per way facts; rejected candidates; coverage; policy; input hashes |

Reproduced byte for byte by `src/lib/lighting/corridorL2bc.test.ts` and `scripts/lighting-l2/write-bc.test.ts`.

## Policy `lighting-l2bc-v1`

The L2a policy (A1–A3 values) plus, only for this rollout:
- **Squares:** a lit closed `area=yes` way gets park lanterns along its outline at the lantern spacing
  (22 m), 1.5 m inside the square, never outside it; squares are exempt from the "path within 10 m of
  a lit road is lit by that road" rule (street lamps light their edge, not the square).
- **Lit intervals:** a partly lit way gets stations only inside its L0 intervals (±50 m at signals,
  crossings, roundabout entries), way-local rule within each interval.
- **Motorways:** `motorway`/`motorway_link` are 8 m street-bracket roads when lit (OSM lit=yes only;
  real motorway masts are usually taller — an estimate).
- **Candidates:** every lit way L2a did not handle; paths that L0 found lit by a neighbouring street
  get none; the 10 m road-cover rule applies per station as in A1–A3.
- Seams: estimates of every earlier rollout count for spacing; A1–A3 and L2a station slots are
  identities. IDs: `estimate:lighting-l2bc-v1:way/<osm way>:s<n>`, `osm:node/<id>`.
