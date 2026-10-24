# Phase A3 — data provenance, licence, identity and placement policy

**What this data is:** simulated street lighting for the rest of the Kungstorget ring, built from
*labelled estimates* on ring ways tagged `lit=yes` in OpenStreetMap. There is **no mapped OSM street
lamp** in or near the zone (0 nodes in the pinned snapshot), so all 6 A3 fixtures are estimates. It is
**not** a survey of real pole positions. No municipal asset ID, photometric measurement, pole height or
switching schedule was used or invented.

## Sources

| Source | Snapshot / version | Licence | Used for |
|---|---|---|---|
| Step 6.2 OSM research snapshot `work/step62/osm-research.json` (ignored scratch) | OSM base **2026-10-23T09:05:06Z**, retrieved 2026-10-23T09:06:45Z, SHA-256 `dcce1dcc…4eda` (pinned in `docs/step62/evidence/source-manifest.json`; re-verified by the extractor before writing) | ODbL-1.0 © OpenStreetMap contributors | `lit` evidence, way tags and geometry |
| Committed extract [`scripts/data/lighting-a3-source.json`](../../scripts/data/lighting-a3-source.json) (24 KB; 43 ways, 0 lamp nodes; SHA-256 `83fd5115…5bbd`) | the snapshot above, clipped to zone F + 60 m by [`extract-source.mjs a3`](../../scripts/lighting-a1/extract-source.mjs) (refuses to run if the snapshot hash differs; the A1 and A2 extracts regenerate byte-identically) | ODbL-1.0 (adapted database extract) | the generator's only OSM input |
| Rendered map `src/lib/data/norrkoping-map.json` | OSM base 2026-10-16T13:35:36Z (unchanged) | ODbL-1.0 | road alignment and widths, buildings, water, tram/rail tracks |
| `city-bridges.json`, `bridge-profiles.json`, `terrain.json` | unchanged | ODbL / CC BY 4.0 © Lantmäteriet (DTM) | deck occluders (none reach A3), ground heights |
| `city-places.json` | unchanged | ODbL-1.0 | platform outlines (exclusion) |
| Step 6 fixture-type table (`streetlights.json` `meta.types`) | unchanged | project assumption | mounting height, CCT, candela, range, spacing |
| Earlier rollouts: `streetlights.json` (pilot), `streetlights-a1.json`, `streetlights-a2.json` | unchanged, read-only (SHA-256 asserted in `corridorA3.test.ts`) | as above | identity and spacing of the 267 existing fixtures |

No network request was made in Phase A3; no new snapshot was downloaded. Every way that received
estimates coincides with its rendered road (maximum vertex deviation 0.021 m, limit 1 m).

Acquisition dates of the ring ways' current OSM versions (from the snapshot): 286445686 v12
2024-09-07, 308315550 v9 2024-10-30, 286445688 v13 and 312490062 v12 2026-06-21, 163928046 v16
2026-10-17. Accuracy: OSM geometry as mapped (not surveyed); the rendered road matches it to ≤ 0.021 m.

ODbL obligations apply to the extract, the generated runtime file and the provenance file:
attribution is shown in the app footer; the adapted database is in the repository.

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-a3.json`](../../src/lib/data/streetlights-a3.json) | yes (3.6 KB; App chunk +3.5 KB, +0.7 KB gzip) | runtime records (Step 6 shape + canonical `id` and `zone`), source/corridor metadata |
| [`src/lib/data/streetlights-a3-provenance.json`](../../src/lib/data/streetlights-a3-provenance.json) | no | per fixture: rule, source way/version/timestamp/tags, station (index, chainage, effective spacing, side, shift, offset), map deviation, uncertainty, observed vs inferred; per-way coverage; rendered ways without a `lit` tag; the full policy. No candidate was skipped. |
| [`data/registry.json`](data/registry.json) | no | one compact line per fixture |

Both generated files are reproduced **byte for byte** by `corridorA3.test.ts` (main suite) and by
`scripts/lighting-a3/write.test.ts` (`WRITE=1` rewrites them). Shuffling every input list, including
the earlier rollouts, changes nothing (tested). SHA-256: runtime `9c2341bb…5d9e`, provenance
`97469395…944a`.

## Identity

| Kind | Canonical ID = runtime ID | Example |
|---|---|---|
| Estimate | `estimate:lighting-a3-v1:way/<way id>:s<station>` | `estimate:lighting-a3-v1:way/286445688:s1` |
| Mapped OSM lamp | `osm:node/<node id>` | none in A3 |

- Station index along the way in its own direction with the A1 station rule (N = round(length /
  spacing), stations at (i + ½)·length/N). An ID depends only on that way's geometry and the generator
  version, not on input order or the earlier rollouts (tested: generating without them gives identical
  records for every A3 ID).
- The version in the ID keeps A3 IDs disjoint from the pilot, A1 and A2; a merged set with a duplicate
  canonical ID is rejected as a whole (tested with an A3 record re-using an A2 ID).
- Registry records keep source (`osm-lighting-a3-snapshot`), generator/rollout (`lighting-a3-v1`, seed
  null, method `lit-way-station`), visual group (chunk `chunk:-1,-1`, shared with A1/A2) and evidence
  (`placement/illumination/position: estimated`) separate.
- Unknowns stay unknown: `heightRh2000M: null`, photometry `estimated` (type table), activation
  `solar-night` with `schedule: null`, no municipal ID.

## Placement policy `lighting-a3-v1`

**A2's policy unchanged** (A1's rules and values + the two A2 seam rules; values stored in the
provenance file). The only difference: the station-slot identity rule now also covers A2 records
(`stationSlotFamilies: [lighting-a1-v1, lighting-a2-v1]`), because A2 uses the same station rule. No
A3 station hit an A2 or A1 slot (the zones do not overlap); the guard is tested with an injected A2
slot. **No new placement rule was added** — in particular no rule that would put lamps on the short
ring ways (see [remaining-gaps.md](remaining-gaps.md)).

Effect on the ring (all 6 fixtures, `lit-way-roundabout-outer`, outer kerb, no side fallback, no
shift):

| Fixture | E | N | Station | Offset from centreline |
|---|---:|---:|---|---:|
| `way/163928046:s0` | 568 279.77 | 6 495 517.09 | 1/1, 35.6 m way | 4.10 m |
| `way/286445686:s0` | 568 333.79 | 6 495 499.65 | 1/1, 40.1 m way | 5.75 m |
| `way/286445688:s0` | 568 298.36 | 6 495 577.93 | 1/2, 22.9 m spacing | 3.55 m |
| `way/286445688:s1` | 568 283.48 | 6 495 558.30 | 2/2, 22.9 m spacing | 3.55 m |
| `way/308315550:s0` | 568 301.48 | 6 495 496.99 | 1/1, 19.8 m way | 4.10 m |
| `way/312490062:s0` | 568 347.13 | 6 495 587.53 | 1/1, 44.3 m way | 4.10 m |

Positions are estimates: uncertainty ≈ ½ the class spacing (15 m) along the way; side and count are
assumed. Each bracket's arm points back to its carriageway (grid azimuth in `data/registry.json`).

## Reproduction

```powershell
node scripts/lighting-a1/extract-source.mjs a3      # needs the ignored Step 6.2 snapshot; verifies its SHA-256
$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts write; $env:WRITE=$null
.\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts reports   # docs/lighting-phase-a3/data
```

Tool versions: Node v24.15.0, Vitest 4.1.12, the repository's `package-lock.json`; no seed (no random
numbers). Rebuilds were verified byte-identical by SHA-256 (extracts, generated files, report data).
