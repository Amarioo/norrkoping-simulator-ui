# Phase A2 — data provenance, licence, identity and placement policy

**What this data is:** simulated street lighting for a bounded corridor, built from *labelled
estimates* on streets and paths tagged `lit=yes` in OpenStreetMap. The corridor contains **no mapped
OSM street lamp** (the pinned snapshot has none there), so all 35 A2 fixtures are estimates. It is
**not** a survey of real pole positions. No municipal asset ID, photometric measurement, pole height or
switching schedule was used or invented.

## Sources

| Source | Snapshot / version | Licence | Used for |
|---|---|---|---|
| Step 6.2 OSM research snapshot `work/step62/osm-research.json` (ignored scratch, 9.0 MB) | OSM base **2026-10-23T09:05:06Z**, retrieved 2026-10-23T09:06:45Z, SHA-256 `dcce1dcc…4eda` (pinned in `docs/step62/evidence/source-manifest.json`; re-verified before extraction) | ODbL-1.0 © OpenStreetMap contributors | `lit` evidence, way tags and geometry |
| Committed extract [`scripts/data/lighting-a2-source.json`](../../scripts/data/lighting-a2-source.json) (26 KB; 54 ways, 0 lamp nodes) | the snapshot above, clipped to the A2 zones + 60 m by [`extract-source.mjs a2`](../../scripts/lighting-a1/extract-source.mjs) (refuses to run if the snapshot hash differs; the A1 default output is byte-identical) | ODbL-1.0 (adapted database extract) | the generator's only OSM input |
| Rendered map `src/lib/data/norrkoping-map.json` | OSM base 2026-10-16T13:35:36Z (unchanged) | ODbL-1.0 | road alignment and widths, buildings, water, tram/rail tracks |
| `city-bridges.json`, `bridge-profiles.json`, `terrain.json` | unchanged | ODbL / CC BY 4.0 © Lantmäteriet (DTM) | deck outlines/occluders (none reach A2), ground heights |
| `city-places.json` | unchanged | ODbL-1.0 | tram/rail platform outlines (exclusion; the two Norrtull tram platforms) |
| Step 6 fixture-type table (`streetlights.json` `meta.types`) | unchanged | project assumption | mounting height, CCT, candela, range, spacing |
| Earlier rollouts: `streetlights.json` (pilot), `streetlights-a1.json` | unchanged, read-only | as above | identity and spacing of existing fixtures (seam rules) |

No network request was made in Phase A2. The snapshot's query fetched only highway ways **with** a
`lit` tag and `highway=street_lamp` nodes: a rendered way absent from it has no `lit` tag and is
treated as unknown. Every way that received estimates coincides with its rendered road
(maximum vertex deviation 0.03 m, limit 1 m).

ODbL obligations apply to the extract, the generated runtime file and the provenance file:
attribution is shown in the app footer; the adapted database is in the repository.

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-a2.json`](../../src/lib/data/streetlights-a2.json) | yes (13 KB; App chunk +12.3 KB, +2.1 KB gzip) | runtime records (Step 6 shape + canonical `id` and `zone`), source/corridor metadata |
| [`src/lib/data/streetlights-a2-provenance.json`](../../src/lib/data/streetlights-a2-provenance.json) | no | per fixture: rule, source way/version/timestamp/tags, station (index, chainage, effective spacing, side, shift, offset), map deviation, uncertainty, observed vs inferred; every skipped candidate with its reason; per-way coverage; rendered ways without a `lit` tag; the full policy |
| [`data/registry.json`](data/registry.json) | no | one compact line per fixture |

Both generated files are reproduced **byte for byte** by `corridorA2.test.ts` (main suite) and by
`scripts/lighting-a2/write.test.ts` (`WRITE=1` rewrites them). Shuffling every input list, including
the earlier rollouts, changes nothing (tested).

## Identity

| Kind | Canonical ID = runtime ID | Example |
|---|---|---|
| Estimate | `estimate:lighting-a2-v1:way/<way id>:s<station>` | `estimate:lighting-a2-v1:way/297613947:s1` |
| Mapped OSM lamp | `osm:node/<node id>` | none in A2 |

- The station index counts along the way in its own direction with the A1 station rule
  (N = round(length / spacing), stations at (i + ½)·length/N). An ID depends only on that way's
  geometry and the generator version — not on input order, the extract margin, the corridor bounds or
  the earlier rollouts (tested: generating without the earlier rollouts gives identical records for
  every A2 ID).
- The generator version is part of every ID, so A2 IDs cannot collide with pilot
  (`estimate:step6-pilot-v1:…`) or A1 (`estimate:lighting-a1-v1:…`) IDs; a merged set with a duplicate
  canonical ID is rejected as a whole (tested).
- Registry records carry the four concepts separately: **source** (`osm-lighting-a2-snapshot`, way,
  snapshot 2026-10-23T09:05:06Z, ODbL-1.0), **generator/rollout** (script, version `lighting-a2-v1`,
  seed null, method `lit-way-station`, station), **visual group** (fixed geographic chunk), **evidence**
  (`placement: estimated`, `illumination: estimated`, `position.status: estimated`).
- Unknowns stay unknown: `heightRh2000M: null`, photometry `estimated` (type table), activation
  `solar-night` with `schedule: null`, no municipal ID.

## Placement policy `lighting-a2-v1`

A1's policy `lighting-a1-v1` **unchanged** (classes, spacings, sides, setbacks, clearances, path
coverage rule, suppression radii, emitter-based occlusion; values in `A2_POLICY`, stored in the
provenance file — see [A1 data-provenance](../lighting-phase-a1/data-provenance.md#placement-policy-lighting-a1-v1)),
plus two **seam rules** that are off for A1 (A1's output is byte-identical with the shared generator):

1. **Earlier estimates count as accepted** (`existingEstimatesAsAccepted`). An A2 candidate yields to
   an existing pilot or A1 *estimate* of its class group within 0.55 × the class spacing — exactly as
   it yields to an A2 estimate accepted earlier in the same run. A way that continues across a rollout
   boundary therefore keeps its spacing instead of getting a second, offset row at the seam. Existing
   *mapped* lamps keep the A1 rule (suppression radius); any fixture within 3 m blocks a candidate.
   Effect in A2: **one** candidate skipped — Kungsgatan `297613947:s0` (15.5 m from the pilot's last
   bracket `estimate:step6-pilot-v1:way/444474488:s0`, same kerb line).
2. **Station-slot identity** (`stationSlotFamilies: [lighting-a1-v1]`). A station (way, index) that A1
   already rendered is A1's fixture, never a second record. A1 and A2 use the same station rule, so a
   shared way continues A1's sequence: Norra Promenaden way 4384887 — A1 renders `s0`, A2 `s1` and
   `s2`. Because the zones do not overlap the guard did not fire on real data; it is tested with an
   injected slot. The pilot used a different station walk (Step 6), so its estimates take part through
   rule 1 only — identity is never inferred from distance.

Existing records are **inputs only**: never moved, merged, re-typed or removed (tested). Proximity
never merges records; it only decides whether a *new estimate* is created, and every such decision is
reported with the suppressing ID and distance.

Other placement results in A2: no station needed a shift along the way or a side fallback; no
candidate failed for lack of a valid position; tram clearance (2.2 m) and carriageway clearance hold
at the Norrtull tram stop; all supports are rendered ground (no bridge reaches any A2 lamp's range).

| Skipped candidates | Count |
|---|---:|
| Path station within 10 m of a lit road centreline (covered by road lighting) | 14 |
| Suppressed by an A2 estimate of the same class (junction splits) | 3 |
| Suppressed by an earlier-rollout estimate (pilot seam) | 1 |
| No valid position | 0 |

## Future municipal data

Unchanged from A1: `reconcileSources` (crosswalk entries supersede OSM/estimate records; an
authoritative register's declared coverage supersedes estimates; mapped records without a crosswalk
go to review; nothing merged by distance). A2 adds no municipal identity.
