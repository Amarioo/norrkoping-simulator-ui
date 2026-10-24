# Phase A1 — data provenance, licence and placement policy

**What this data is:** simulated street lighting for a bounded corridor, built from mapped OpenStreetMap
lamps and *labelled estimates* on streets/paths tagged `lit=yes`. It is **not** a survey of real pole
positions. No municipal asset ID, photometric measurement or switching schedule was used or invented.

## Sources

| Source | Snapshot / version | Licence | Used for |
|---|---|---|---|
| Step 6.2 OSM research snapshot `work/step62/osm-research.json` (ignored scratch, 9.0 MB) | OSM base **2026-10-23T09:05:06Z**, retrieved 2026-10-23T09:06:45Z, SHA-256 `dcce1dcc…4eda` (pinned in `docs/step62/evidence/source-manifest.json`) | ODbL-1.0 © OpenStreetMap contributors | `lit` evidence, way tags, mapped `highway=street_lamp` nodes |
| Committed extract [`scripts/data/lighting-a1-source.json`](../../scripts/data/lighting-a1-source.json) (68 KB) | the snapshot above, clipped to the corridor + 60 m by [`extract-source.mjs`](../../scripts/lighting-a1/extract-source.mjs); refuses to run if the snapshot hash differs | ODbL-1.0 (adapted database extract) | the generator's only OSM input |
| Rendered map `src/lib/data/norrkoping-map.json` | OSM base 2026-10-16T13:35:36Z (unchanged) | ODbL-1.0 | road alignment and widths, buildings, water, tram/rail tracks |
| `city-bridges.json`, `bridge-profiles.json`, `terrain.json` | unchanged | ODbL / CC BY 4.0 © Lantmäteriet (DTM) | deck outlines, deck heights, ground heights |
| `city-places.json` | unchanged | ODbL-1.0 | rail and tram platform outlines (exclusion) |
| Step 6 fixture-type table (`streetlights.json` `meta.types`) | unchanged | project assumption | mounting height, CCT, candela, range, spacing |

No network request was made in Phase A1: the snapshot is the one Phase 0/Step 6.2 already pinned.
The query that produced it fetched **only highway ways that carry a `lit` tag** and `highway=street_lamp`
nodes. Consequently an untagged way is absent from the extract (and is reported as *unknown* from the
rendered map), and `man_made=street_lamp`, `light_source` and entrance nodes were not available.

The map snapshot (2026-10-16) and the lighting snapshot (2026-10-23) are one week apart. Every way that
receives estimates must coincide with its rendered road: the generator measures the largest distance
from the snapshot's vertices to the rendered segments of the same way ID and rejects the way above
1 m (A1 maximum deviation: **0.03 m**, i.e. no geometry edits in that week inside the corridor).

ODbL obligations apply to the extract, the generated runtime file (positions are derived from OSM
geometry) and the provenance file: attribution is shown in the app footer; the adapted database is
available in the repository.

## Outputs

| File | Bundled | Content |
|---|---|---|
| [`src/lib/data/streetlights-a1.json`](../../src/lib/data/streetlights-a1.json) | yes (42 KB, +6.0 KB gzip in the App chunk) | runtime records (Step 6 shape + canonical `id` and `zone`), source/corridor metadata |
| [`src/lib/data/streetlights-a1-provenance.json`](../../src/lib/data/streetlights-a1-provenance.json) | no | per fixture: rule, source element/version/timestamp/tags, station (index, chainage, effective spacing, side, fallback, shift, offset), map deviation, uncertainty, observed vs inferred; every rejected candidate with reason; per-way coverage; rendered ways without a lit tag; the full policy |
| [`data/registry.json`](data/registry.json) | no | one compact line per fixture |

Both generated files are reproduced **byte for byte** from the pinned inputs by the main test suite
(`corridor.test.ts`) and by `scripts/lighting-a1/write.test.ts` (`WRITE=1` rewrites them).

## Identity

| Kind | Canonical ID | Runtime ID | Example |
|---|---|---|---|
| Mapped OSM lamp | `osm:node/<node id>` | same | `osm:node/11098939295` |
| Estimate | `estimate:lighting-a1-v1:way/<way id>:s<station>` | same | `estimate:lighting-a1-v1:way/4438347:s3` |

The station index counts along the way in its own direction, so an ID depends only on that way's
geometry, never on input order, the extract margin or the corridor boundary. The generator version is
part of every estimate ID: pilot estimates (`estimate:step6-pilot-v1:…`) and A1 estimates cannot collide,
and a future generator version produces new IDs instead of silently re-using old ones.

Registry fields keep the concepts apart: **source** (`osm-lighting-a1-snapshot`, element, snapshot,
licence), **estimate provenance / rollout** (`generator`: script, version `lighting-a1-v1`, seed null,
method, station), **visual group** (`group`: geographic chunk, see README), **evidence class**
(`placement`, `illumination`, field statuses). The pilot adapter and pilot records are unchanged; the
merged registry's first 105 records deep-equal the pilot registry (test).

## Placement policy `lighting-a1-v1`

Full text in [`corridorGenerator.ts`](../../src/lib/lighting/corridorGenerator.ts); values in
`A1_POLICY` (also stored in the provenance file).

1. **Mapped lamps.** Every `highway=street_lamp` node inside the corridor becomes a mapped fixture at
   its mapped (not surveyed) position; type from the nearest way's class (as Step 6). A mapped position
   is never moved; an impossible one (inside a building, a carriageway or water, under a deck) would be
   rejected with the reason. A1: 10 nodes, all accepted, all beside footways (park lanterns, orientation
   unknown).
2. **Evidence.** Estimates only along `lit=yes`. `lit=no` is excluded (Magasinsgatan, way 8237045).
   An untagged way is unknown and gets nothing. Platforms (`highway=platform`, 4 tram + 4 rail inside
   or touching the corridor) get nothing: shelter/canopy luminaires are not a modelled fixture type and
   no platform lighting is claimed. The pedestrian area *Tyska torget* (`area=yes`) gets nothing: lamp
   positions cannot be derived from an outline.
3. **Classes and types** (Step 6 table, unchanged): trunk/primary/secondary/tertiary (+ links) →
   `street-bracket-8m` (30 m spacing, 1 600 cd, 30 m range); residential/living street/unclassified/
   service/pedestrian → `street-bracket-6m` (27 m, 900 cd, 24 m); footway/path/cycleway/steps →
   `park-lantern-4m` (22 m, 380 cd, 16 m).
4. **Stations are way-local.** N = round(length / spacing) stations at (i + ½)·length/N. The spacing
   therefore follows each way between its own ends (A1: 14.3–35.0 m effective), never a city grid and
   never random jitter. Ways shorter than half the spacing get none (their junction neighbours cover
   them).
5. **Side.** A carriageway of a dual road (one-way with a same-name one-way partner running in the
   opposite direction, |angle| within 45°, within 40 m — not the way's own continuation) gets one row on its outer kerb — Norra Promenaden, Drottninggatan and both Saltängsbron decks.
   Roundabouts (Stationsrondellen, Aurorarondellen) get the outer kerb of the ring. Other roads use the
   tagged sidewalk side, default right of travel. Paths get lanterns beside the path. If every shift on
   that side conflicts, the other side is tried and the fallback is recorded.
6. **Offsets and clearances.** 0.8 m behind the carriageway edge (0.3 m on a deck; 1.2 m beside a
   path). A station may shift ≤ 4 m along the way, and on the ground the setback may grow in 0.5 m steps
   up to +2 m, before the side changes. A position is rejected inside a building or < 0.6 m from a wall;
   inside any carriageway + 0.4 m (on a deck, its own deck way excepted, so intersections never get a
   pole in the roadway); < 2.2 m from a tram track centreline (tram half-width ≈ 1.2 m + 1 m); < 3.0 m from
   a railway; on a rail or tram platform; in water; under a bridge deck (ground support); off its deck
   (deck support). On the Drottninggatan tram street (south of Saltängsbron, two tracks ±1.6 m from the
   street centreline) the setback grows to 4.05 m so the poles stand outside the tram envelope.
7. **Sidewalk paths.** A path station within 10 m of a lit road centreline is lit by that road (the
   Step 6 rule, applied per station instead of per way mean): sidewalk-like stretches get no lanterns,
   park stretches do. 50 path stations were skipped this way (listed with their distances).
8. **Duplicates are identities.** A mapped node already in the pilot is not re-imported (none in A1).
   Proximity never merges records; it only **suppresses estimates**: an estimate yields to a mapped or
   pilot fixture of the same class group within the type's suppression radius (7 estimates near the 10
   mapped lamps), to an accepted estimate of its class group within 0.55 × spacing (14, mostly where ways
   split), and to any accepted fixture within 3 m. Acceptance runs in canonical priority order (class
   rank, then canonical ID), so input order cannot change the outcome (tested with shuffled inputs).
9. **Supports and heights.** Ground fixtures stand on the rendered ground, deck fixtures on the bridge
   deck profile + road surface (both derived at runtime, as in the pilot). Mounting height above the
   support from the type table. No RH2000 pole elevation is claimed.
10. **Occlusion.** 16 horizontal sectors per fixture, measured from the **emitter** (the lens on a
    bracket arm, where the shader evaluates them; Step 6 measured from the pole base): distance to the
    first building wall and, for ground fixtures, to the outline of any bridge deck that has covered space
    under it (deck ≥ 2 m above the rendered ground/water somewhere inside; all 28 Saltängsbron edges).
    Ground lamps therefore do not light the water/quay under the deck *through* the deck: 1.96 → **0 lux**
    ([data/underdeck.json](data/underdeck.json)). Light entering under the deck edge from the open sides
    (≤ 3.5 lux at the outline) is physically expected and kept.
11. **Activation.** `solar-night` (pilot assumption); no schedule.

## Future municipal data (precedence, implemented and tested, not used)

[`reconcileSources`](../../src/lib/lighting/corridorRegistry.ts) decides overlaps by identity:
same canonical ID twice → error; an explicit crosswalk entry `{from, to, basis}` supersedes `from` by a
higher-precedence record (authoritative > mapped > estimated); inside an authoritative register's
declared coverage, estimates are superseded and mapped records without a crosswalk are listed for
review. Nothing is merged by distance and nothing is dropped silently. The registry's canonical-ID
syntax does not accept a municipal ID today: it will be added together with a real, licensed register.
