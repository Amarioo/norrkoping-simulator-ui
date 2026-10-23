# Vrinneviskogen: trail identity and forest reconstruction plan

## What is verified and what is not

[Municipal exercise-route listing](https://norrkoping.se/se-och-gora/motion-och-idrott/motionsspar) (updated 2025-02-24) distinguishes Vrinnevi **2.4 km illuminated** from 3.75/5.35/10.15 km routes. The [current reserve page](https://norrkoping.se/se-och-gora/friluftsomraden/naturreservat/vrinneviskogens-naturreservat) describes a roughly 2.5 km accessible illuminated route and warns original reserve boundaries have changed. Treat 2.4/2.5 as a source discrepancy/rounding question; do not create two loops from those numbers.

The municipality links the public NOKA `kof_motionspr` layer, with a distinct map extent for the illuminated route. Initial viewer HTML is accessible, but a licensed ordered-vector export and its CRS declaration were not obtained. Thus **2026 exact alignment and fixture points are not verified for import**.

Historical reference reviewed visually: all three pages of the [municipal brochure distributed via Naturkartan](https://uploads.naturkartan-cdn.se/uploads/site_pdf/file/370/6a0e8321fa8e6890361bc9848661402c.pdf). It was produced in 2011 and printed/modified June 2012. The map legend separates a 2.4 km loop from other illuminated extensions, running loops and the experience path. Its north loop topology is consistent with the short black OSM candidate around Tjalvegården/Tolentorp; this is a visual/topological cross-check, **not georeferencing or proof of unchanged 2026 alignment**. No map artwork or traced municipal geometry retained.

The separately linked municipal `sparkarta_vrinnevi.pdf` is a **riding/MTB** map with explicit Matteus SI copyright; it is not the illuminated trail. Do not use its 7.4 km MTB route as a lamp path.

## OSM candidates and current extent

Fresh relation geometry, source metadata and bounds were examined. Approximate lengths below sum member polyline geodesic segments (spherical quick diagnostic, not survey length); member connections/order and modern trail identity need verification. None has a `lit` tag on the relation. Member way `lit` tags must be checked separately before accepting illumination.

| Relation | OSM colour | Approx. diagnostic length | Bounds/coverage / decision |
|---|---|---:|---|
| `5703856` | black | 2363 m | 58.5654751–58.5722231 N / 16.1882636–16.1988654 E, entirely in map. Best **candidate** for short historic lit loop, not yet authoritative 2026 alignment. |
| `5703858` | orange | 3720 m | Inside extent; longer municipal route candidate, do not assign short-loop lights. |
| `5703857` | yellow | 5292 m | Reaches 58.5544261, outside south boundary. |
| `5541021` | green/white | 10062 m | Reaches 58.5535966, outside south boundary. |
| `5739507` | blue | 1739 m | Hospital-side route candidate; not the Tjalvegården 2.4 km loop. |
| `5739508` | red | 3360 m | Separate hospital-side route candidate. |
| `6435195` | Reflexbanan | 8449 m | Reaches 58.5518287, outside map; reflective markers do not imply electric lights. |

`1671685` is Upplevelsestigen, a separate short path. Relation edit dates vary from 2016 to 2026 and are not field-inspection dates. The 2.4 km OSM candidate's relation edit is 2016-07-24 even though member ways may have changed later. Pin versions before import; historical membership and current member geometry are distinct.

## Existing vegetation diagnosis

`mapVegetation.ts` already generates geographically constrained illustrative trees in `wood` and selected park polygons. It excludes buildings, water, pitches/squares and buffers rendered roads/paths, and reserves space around mapped trees. However, its global 15,000 cap and lattice spacing of **2.8 scene units (~70 m)** outside radius 90 (~2.25 km) create a sparse outer forest. Central spacing is ~20 m. This is not a canopy/individual-tree survey, and polygon iteration order can affect which areas fill the cap first.

The southern diagnostic window in coverage evidence has 67 wood fragments and 86 OSM tree points. It is not a reserve boundary/count. Full-city 2,345 mapped tree nodes cannot explain canopy density. Mapped `landuse=forest`/`natural=wood` is land cover, not detailed crown coverage or clearings.

Current municipal descriptions support pine-dominated woodland with wet areas, clearings and eastern deciduous stands; they do not give per-tree positions/heights. Existing 2020 NH evidence is useful historic terrain/structure information, not proof of 2026 vegetation.

## Acquisition and deterministic reconstruction

1. Obtain current legally reusable reserve/woodland boundaries, ordered short-trail vector, entrances/clearings/wetlands and fixture export. Native NOKA eastings around 132k must not be read as EPSG:3006. Confirm CRS and transform once into TM with controls.
2. Query Lantmäteriet STAC for actual local **Laserdata skog** acquisition/availability and product terms (current product CC0); check Skogsstyrelsen 2026 tree-height raster coverage/terms. Save item IDs, timestamp, footprint, nodata, vertical datum and hashes. Do not download countrywide point clouds into Git. Existing local 1 m DTM can support terrain sampling; crop point-cloud processing by tiles.
3. Derive ground-relative canopy heights from suitable above-ground returns/CHM, with water/building/noise masks; avoid treating unclassified points as vegetation without spatial evidence. Record observed canopy raster resolution, date, coverage and uncertainty independently from estimated individual stems. Thin/missing canopy evidence is not a cleared area.
4. Keep observed crown/cover polygons and clearings authoritative within source limitations. Generate **estimated** stems deterministically in EPSG:3006 metre tiles, keyed by source polygon ID + fixed global cell hash + generator version; avoid a traversal-order global cap. Select density/height/species mixes from source strata; do not assign individual surveyed labels. Crown positions are statistical reconstruction where no reliable tree segmentation exists.
5. Apply exclusion geometry for every rendered trail/road width plus verified clearing buffer, buildings/courtyards, open meadows, water/wetlands, powerline corridors, infrastructure and entrances. Keep gaps independent of tile boundaries; validate no stems intrude into the route corridor. Use current canopy evidence to avoid filling historical openings or open picnic grounds.
6. Set stem bases using existing RH2000 DTM/mesh contract; retain original ground sampling provenance and observed canopy height uncertainty. Drape trail supports on actual trail terrain. Do not use DSM rooftop/canopy heights as ground elevations.

## Rendering, darkness and trail design

Proposed vegetation streaming tile: 250 m with overlap for crown/exclusion lookup, canonical instance ownership at the stem tile. Near instanced low-poly trunks/crowns, mid low-poly crown clusters, far alpha-tested impostors or aggregate canopy; prototype distances around 150/500/1500 m, **tune through measurement**, not fixed reality. Keep materials shared by species/LOD and cull per tile; retain instance/buffer data or deterministic regeneration for context restore. Avoid transparent sorting-heavy overlapping foliage and individual shadow maps.

Reserve border can extend beyond the current map; obtain a licensed boundary then quantify missing area before any full-forest promise. Northern short-loop work can be a bounded slice if its alignment is confirmed; longer loops need expanded terrain/road/canopy data where clipped.

For verified lit trail geometry, retain mapped poles first. Only if approved as an approximation, test **20–30 m spacing** along the verified centreline, with curve/junction adjustments and setbacks; 2.4 km would imply roughly **80–120 estimated fixtures**, not an inventory count. Pole shape/height/CCT/heading are unknown, so these are tunable visual-design assumptions. No estimate on `lit=no` or unknown branches; do not infer fixture side from polyline order. Keep forest outside the beam corridor substantially darker; use modest surface ranges and approximate canopy/terrain occlusion, not ambient brightening.

Activation remains `unknown` until the municipality supplies actual switching/dimming/seasonal rules. Do not borrow another municipality's 22:00/23:00 curfew. Test late evening, early morning, winter/summer and unknown/off behavior independently from sports events.

## Acceptance for a later bounded slice

Deliver current source/licence/route match; report clip gaps; keep observed canopy distinct from generated stems. Confirm deterministic instance hashes across tile-order changes, zero building/trail/water intrusion, preserved open clearings/entrances, no seams at tile edges and no increase in lit area off the verified corridor. Compare fixed SWEREF cameras against dated references by day/night; measure triangles/calls/overdraw, memory, frame p95 and restoration on both hardware tiers. No complete forest or trail fixtures were generated in Step 6.2.
