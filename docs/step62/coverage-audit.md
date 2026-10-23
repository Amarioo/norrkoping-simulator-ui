# Geographic coverage audit

Generated numbers: [evidence/coverage.json](evidence/coverage.json), from `node scripts/step62/local-audit.mjs`. This audits actual working files, not assumptions about HEAD.

## Frame and boundaries

- Horizontal: **SWEREF 99 TM, EPSG:3006**. Vertical: **RH2000**, vertical origin 0 m.
- Origin: E569030 / N6494989; one scene unit = 25 ground metres; grid scale `0.9996584126`; convergence `−1.0134914515°`.
- `E = 569030 + x × 25 × 0.9996584126`; `N = 6494989 − z × 25 × 0.9996584126`. Heights use metres/25, without the horizontal grid factor.
- Original WGS84 query bbox: south 58.555, west 16.065, north 58.650, east 16.295. WGS84 is treated as SWEREF geographic by the existing importer; epoch/plate-motion differences are not newly corrected here.

Actual clip corners, clockwise, metres E/N (stored runtime rounding applies):

| Corner | E | N |
|---|---:|---:|
| NW | 561804.869 | 6501570.951 |
| NE | 575151.458 | 6501805.721 |
| SE | 575355.539 | 6491229.310 |
| SW | 561972.712 | 6490994.115 |

Envelope: E561804.869–575355.539 / N6490994.115–6501805.721. The quadrilateral, rather than the envelope's extra corner wedges, defines imported OSM coverage. “Citywide” below always means this supported extent, never all Norrköpings kommun.

## Dataset audit

| Layer | Actual coverage/content | Classification and limit |
|---|---|---|
| Terrain | Runtime E561802.470–575357.838 / N6490990.366–6501806.670; 2713 × 2165, 5 m height samples; 930,790 mesh triangles | **Fully represented** spatial envelope. Native 1 m DTM resampled; adaptive rendered detail differs from sample spacing. Not a 2026 surface survey. |
| Native DTM | Four local `m649_56`, `m649_57`, `m650_56`, `m650_57` GeoTIFFs; local coverage report says all four present, catalog covers bbox | **Fully represented** catalog extent; nodata/water/ground classification still require checks. Tile catalogue dates 2022-10-13/17; runtime metadata spans 2020–2025. These dates are different metadata concepts. |
| Roads | 41,344 rendered road segments; 73,332 directed motor-network edges, 38,294 nodes | **Partially represented** real city: OSM within clip, clipped regional corridors, policy-excluded links. Segment count is not street count. |
| Paths | 36,517 rendered path segments, including 15,714 `path`, 11,194 `footway`, 4,305 `cycleway`, tracks/steps | **Partially represented**: mapped geometry; lighting tags absent from runtime model and no completeness survey. |
| Rail/tram | 2717 rail + 2259 tram rendered segments; three runtime designated rail routes | **Partially represented** network/operations; regional paths stop at extent; no designated bus routes. |
| Buildings | 12,499 footprints/parts. Heights: 105 explicit, 1,166 level-derived, 11,228 estimated | **Partially represented** architecture. Parts and footprint fragments can duplicate physical sites; no one-to-one building census. Explicit OSM heights are mapped, not automatically measured. |
| Vegetation | 2,345 OSM tree points, 526 wood fragments, existing illustrative supplemental planting | **Partially represented**; mapped trees are a severe canopy undercount. Forest density/height/canopy not reconstructed. |
| Lighting | 105 pilot fixtures; 25 nodes in new city-extent OSM query | **Missing** citywide fixture infrastructure. Pilot estimates do not become surveyed assets. No municipal register imported. |
| Transport facilities | 97 `city-places` platforms, three platform roofs, two supplemental buildings (station/airport), shelters/terminals modeled approximately | **Partially represented** functional geometry; fixture/sign positions and operating states absent. |
| ESSP | Runways 09/27 and 11/29, taxiway/apron outlines and terminal approximation inside clip | **Partially represented**: airport ground plan exists; approach arrays/PAPI/actual fixtures need geometry. Both approach corridors fit the present envelope at published nominal lengths; airport obstacles can be outside it. |
| Vrinneviskogen | Northern trails/land cover exist; current southern bbox cuts longer routes | **Partially represented / requires expanded data acquisition** for entire reserve and longer loops. Extent of legally current reserve needs municipal vector boundary. |
| Outer municipality | Åby/Jursla partly clipped to north; Svärtinge, Kimstad, Krokek, Sörsjön, Östra Husby outside this city box | **Requires expanded data acquisition**. Do not count all 23 municipal exercise routes as in-scene. |

Runtime terrain revision: `lm-dtm-b976b87a19446d3d-surface-70559be0073d`. UI/backend terrain, bridge-profile and transport-network SHA-256s still match exactly; see evidence. Terrain allocation alone is 5,873,645 float32 samples / 23,494,580 bytes, excluding JSON/base64, meshes and source rasters.

Main OSM timestamp: **2026-10-16T13:35:36Z**. Pilot lighting snapshots: **2026-10-21T15:53:24Z / 15:54:26Z**. Step 6.2 research query base: **2026-10-23T09:05:06Z**. New research data do not replace these runtime snapshots.

## Priority area distinctions

Central city, Bergsbron, Saltängsbron, Hamnbron, Gamlebro, Laxholmsbron, Resecentrum, police complex, Strömparken, Vasaparken and Idrottsparken are geographically inside coverage. Their physical lighting is mostly **partial or missing** even where footprints are present. Existing detailed bridge objects number nine, listed with SWEREF anchors in evidence.

OSM Vrinnevi candidates: black relation `5703856` bounds 58.5654751–58.5722231 N, 16.1882636–16.1988654 E, entirely inside the map; yellow `5703857` reaches latitude 58.5544261 and green/white `5541021` reaches 58.5535966, both below the map. Reflexbanan extends to 58.5518287. Full route member geometries returned by Overpass can lie outside the query box; never interpret a returned relation as entirely covered.

Southern diagnostic window `scene x −45..100, z>65` contains 67 wood fragments and only 86 mapped tree points. This is an explicitly arbitrary diagnostic, **not a reserve count/boundary**. The existing renderer uses ~70 m supplemental tree lattice outside radius 90 scene units, versus ~20 m centrally, with a global 15,000 cap. That explains sparse-looking forest without proving any particular tree is absent.

NOKA exercise-trail links carry eastings around 130,000; these are **not** EPSG:3006 eastings. The native service CRS was not authoritatively resolved in this pass. Request the declared CRS and transform with PROJ; never copy those map extents directly into this registry. Do not substitute old reserve-plan coordinates in “rikets nät” for TM coordinates.
