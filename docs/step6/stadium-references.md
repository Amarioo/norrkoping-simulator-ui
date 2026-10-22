# Idrottsparken — references, discrepancies and what changed (Step 6, 2026-10-21)

Arena frame used below: metres, origin at the centre of OSM pitch way/100955051, **+x towards the
west (main) stand, +z towards the north stand**, y above the pitch surface. This is the same anchor
and orientation as the pre-Step-6 model (`stadiumCenter`, longest pitch edge, 171.68° about y);
nothing was re-anchored. Pitch surface: 27.75 m RH2000 (LiDAR, p5–p95 27.65–27.84 m).

## 1. Sources

| Id | Source | Date | Licence / use | What it supports |
|---|---|---|---|---|
| IFK | IFK Norrköping: [Norrköpings Idrottspark](https://ifknorrkoping.se/om-ifk/norrkopings-idrottspark/) and [Idrottsparken est.1903 är på plats](https://ifknorrkoping.se/idrottsparken-est-1903-ar-pa-plats/) | arena page read 2026-10-21; facade article 2026-02-18, read 2026-10-21 | Official text facts and reference only; no assets copied | West = VM stand (1958), east stand (1987), 2009 rebuild, restored name in 2026. The dated facade article confirms new lettering facing Ektorpsgatan; this lettering remains omitted in the pilot, which uses a plain band. |
| OSM | OpenStreetMap relation [1440621](https://www.openstreetmap.org/relation/1440621) (outer ways 27210829, 1307904192, 285819773, 1307904193), building parts 285819766–285819772, ways 91908192 (Teknikhallen), 91908705 (Gamla tennishallen), node 13048742814 (Gunnar Nordahl statue), node 11098649479 (gate "Entre 3, bortastå") | Overpass snapshot 2026-10-21 | ODbL; data | Footprint, stand/roof outlines, open SE corner, roofed SW corner, west projection, halls, statue |
| LIDAR | Lantmäteriet Laserdata NH, flight 2020, tile 64925_5675 (`work/geodata/lantmateriet/`, not in Git) | 2020 | CC BY 4.0; processed by `scripts/geo/stadium_lidar.py` | Measured heights: roofs, south terrace slope, masts (positions, head heights), halls |
| WIKI | sv.wikipedia [Norrköpings Idrottspark](https://sv.wikipedia.org/wiki/Norrk%C3%B6pings_Idrottspark) | read 2026-10-21 | text facts only | All stands roofed except the south standing terrace; three of four corners enclosed; loges at the top of the west stand (VM-läktaren, 1958); name history (PlatinumCars Arena 2021–2025, Norrköpings Idrottspark from 2026) |
| P1 | Commons [Nyaparken.jpg](https://commons.wikimedia.org/wiki/File:Nyaparken.jpg), Magnus.bark | 2011-06-27 | CC BY-SA 3.0; reference only, not copied | View from the north stand: east roof on front columns, west stand glazing, open south terrace, two south masts, roof-edge floodlights |
| P2 | Commons [Nya_Parken.jpg](https://commons.wikimedia.org/wiki/File:Nya_Parken.jpg), Nicceeo | 2012-05-23 | CC BY-SA 3.0; reference only | West stand from the east: lower tier, loge/restaurant glazing, cantilever trusses, floodlight boxes under the roof edge; roofed SW corner ("Familjeläktare"); SW mast; Gamla vattentornet behind (confirms west = main stand) |
| P3 | Commons [Football_at_parken.JPG](https://commons.wikimedia.org/wiki/File:Football_at_parken.JPG), Einarspetz | 2012-05-13 | CC BY-SA 3.0; reference only | West stand tiers and glazing, blue seats |
| P4 | Commons [Peking_fanz.jpg](https://commons.wikimedia.org/wiki/File:Peking_fanz.jpg), Magnus.bark | 2010-09-17 | CC BY 3.0; reference only | North stand: grey concrete standing terrace, crush barriers, glazing under the roof |
| P5 | Commons [GAIS efter IFK Norrköping 2025-05-31.jpg](https://commons.wikimedia.org/wiki/File:GAIS_efter_IFK_Norrk%C3%B6ping_2025-05-31.jpg), Jssfrk | 2025-05-31 | CC0; reference only | Most recent view (from the south terrace): north standing terrace (grey, yellow stair nosings), blue seats in the NW corner, LED boards; 2024 turf |
| P6 | Commons [Ove Kindvalls hedersläktare.jpg](https://commons.wikimedia.org/wiki/File:Ove_Kindvalls_hedersl%C3%A4ktare.jpg), JerryKB | 2024-10-29 | CC0; reference only | Seat colours (light grey-blue seats with crest) in one section |
| NT | [Bländande ljus från Nya Parken](https://www.nt.se/nyheter/norrkoping/artikel/blandande-ljus-fran-nya-parken/l6kd0g8r), Norrköpings Tidningar | c. 2009 | text facts only | The 2008–09 rebuild raised the floodlights and their output |

No photograph or texture is redistributed; the model uses only original procedural geometry and colours.
The configurations combined are all post-2009 (the 2008–2009 rebuild); the 2007 Commons photo
(`Norrkopings_idrottspark.jpg`) and the 1950 model photo were not used because they show the old stadium.

**Unknowns (not claimed):** exact row counts, rakes and seat layout; façade materials towards
Ektorpsgatan/Matchgatan; the roof truss system; individual floodlight counts, aiming and output; the
playing-field dimensions (105 × 68 m assumed); the masts' presence in 2026 (LiDAR 2020 and photos
2011–2012 show them; no dated 2025–2026 image shows the masts, and no later floodlight project was found).

## 2. LiDAR measurements (scripts/geo/stadium_lidar.py, `work/step6/lidar/`)

| Feature | Measured (above pitch) |
|---|---|
| Roof top, front edges | west x = 40.1, east x = −42.8, north z = 68.3 (first returns > 12 m) |
| Roof top profile | ~16.6–16.9 m at the front edge, falling to ~14.8–15.0 m at the back (west, east, north, NE, NW) |
| SW corner roof | p50 15.6, p90 16.2 m |
| South terrace (ground class 2) | 0.66 m (z −64) → 2.64 → 4.61 → 6.61 → 8.58 m (z −80): ~1:2 rake built into Berget |
| Floodlight masts (lamp-head returns 52.3–58.0 m) | SW (56.0, −91.5), SE (−62.0, −90.3), NE (−60.6, 99.4), NW (55.9, 98.3); base ground SW +4.35, others +0.8–0.9 m |
| West projection | p50 7.0, p90 14.7 m |
| Teknikhallen | p50 12.2, p90 13.75 m |
| Gamla tennishallen | p50 11.0, p90 11.95 m (flat-ish, not a tall barrel) |

## 3. Discrepancy list: pre-Step-6 model vs references (highest impact first)

| # | Feature | Pre-Step-6 model | Reference | Status |
|---|---|---|---|---|
| 1 | Roof height and shape | slabs at 20.5–20.75 m, tilted inwards | 16.7 → 14.9 m skillion falling outwards [LIDAR]; OSM roof parts h 15–16 | **Fixed** (verified) |
| 2 | Roof overhang | fronts at x 35.3 / −34.8 m, z 54.5 m: 5–14 m over the turf area | fronts x 40.1 / −42.8, z 68.3 [LIDAR] | **Fixed** (verified) |
| 3 | North/NE layout | north stand 55.5–81 m, seated; NE corner open ("Kröken uncovered") | north stand 62–89.8 m [OSM], standing terrace [P4, P5]; NE corner enclosed and roofed [OSM, LIDAR, WIKI] | **Fixed** (verified) |
| 4 | Stands encroach on run-off | north and south rows from 55.5 m | OSM turf area to ±61.6/62.0 m | **Fixed** (verified) |
| 5 | Floodlight masts | NW (71, 71), NE (−59, 71), SE/SW (∓57.5, −82.5); 48.75 m | (56, −91.5), (−62, −90.3), (−60.6, 99.4), (55.9, 98.3); heads to 58 m [LIDAR] | **Fixed** (verified positions/heights; lattice details estimated) |
| 6 | South terrace | 14 rows to 12 m from 55.5 m, flat-based | 0.7 → 8.6 m over z −62…−80 on the slope [LIDAR]; unroofed [WIKI] | **Fixed** (verified profile; rows estimated) |
| 7 | Floating pitch | turf ~0.9 m above the terrain on a plinth | flat pitch at 27.75 m [LIDAR] | **Fixed**: turf draped on the DTM surface |
| 8 | West stand | single rake, dark wall at x 80 m | outline at x 65.6 (+ projection to 72.4 for z −19…28) [OSM]; lower tier + loge/restaurant glazing [P2, P3, WIKI] | **Fixed** (outline verified; tier split estimated) |
| 9 | SW corner | concrete block with a seat patch | roofed seated corner [OSM 285819768, P2] | **Fixed** |
| 10 | East stand roof support | unsupported cantilever | front columns [P1] | **Fixed** (column spacing estimated) |
| 11 | Roof-mounted floodlights | none | rows under the W, N, E roof edges [P1, P2, P3] | **Added** (count/spacing estimated) |
| 12 | Gunnar Nordahl statue | (83.75, 65) m | OSM node (74.5, −10.5) | **Moved 75 m** (verified) |
| 13 | Gamla tennishallen | barrel vault, top ~19.5 m | ~12 m [LIDAR] | **Fixed** |
| 14 | Teknikhallen | 15.6 m | 12.2–13.75 m [LIDAR] | **Fixed** |
| 15 | Self-lit signs | `MeshBasicMaterial` signs ("CURVA NORDAHL" mirrored, "IFK PERFORMANCE CENTER", "ENTRÉ 1"), flags | no evidence for text, placement or lighting | **Removed**; a plain club-blue name band on the main entrance (no text) |
| 16 | Name | "Idrottsparken (Nya Parken)" | Norrköpings Idrottspark from 2026 [WIKI] | **Updated** label description |
| 17 | Draw calls | ~1 000 separate box meshes (masts: ~120 each) | — | **Merged**: 7 meshes + 2 instanced meshes + turf |

## 4. What was built (src/lib/stadium/)

- `spec.ts`: every dimension with its source tag ([OSM], [LIDAR], [PHOTO], [WIKI], [EST]).
- `idrottsparken.ts`:
  - **Stands** (generic `rake()`): treads/risers, seat blocks between aisles (backrest + pan), aisle stairs with yellow nosings, crush barriers on the standing terraces, front walls. West: 18-row lower tier, sponsor/club-blue fascia band, two-row loge balcony, loge glazing with mullions, restaurant glazing to the roof. East: 22 rows, top walkway, rear glazing, vomitories. North: 30-row grey standing terrace, seated NW (blue) and NE (grey) corners. South: 18-row grey terrace on the measured slope. SW corner: blue/white seats under its roof.
  - **Roofs**: four skillion slabs from the LiDAR profile (dark top, light underside, white fascia), deep front fascia beams, cantilever trusses every 7.6 m, east front columns.
  - **Envelope**: walls along the OSM outline (concrete plinth, dark cladding, vertical ribs), the west projection with glazed entrance hall, canopy and name band; open SE corner with the east stand's gable.
  - **Halls**: Teknikhallen (light cladding, skillion roof, LiDAR height), Gamla tennishallen (brick, low vault with gables).
  - **Masts**: tapering square lattice (legs, 11 panels of rings and diagonals), platform, head frame tilted towards the pitch, 30 projectors each.
  - **Pitch**: turf texture with standard markings, draped on the terrain (depth-ranked above the OSM pitch land cover); LED boards, goals with nets, corner flags, players' tunnel and dugouts on the main-stand side.
  - **Terrain**: no rigid part is warped. Bodies reach the lowest ground under them (foundations hidden); treads and front walls are raised where the interpolated DTM would cut through them (`report.raisedRows`).
  - **Detail levels**: seats, boards and goals hide beyond 1.5 km; projectors beyond 3 km; silhouettes (roofs, walls, masts) are always drawn.
- Lighting hooks: 14 floodlight emitters (8 mast, 6 roof-row), 4 roof occluders, the arena transform.

Size: **55 822 triangles**, 5.7 MB of vertex buffers, 7 merged meshes + 2 instanced meshes (181 projectors) + the turf (tested: < 150 000 triangles, ≤ 10 meshes).

Terrain integration (`stadium.report.raised`): rows lifted above their design height by the rendered ground are confined to the stands built into Berget: south terrace 18 rows (≤ 1.52 m), south-west corner 16 rows (≤ 2.96 m), north-west corner 3 rows (≤ 0.69 m). Everywhere else the design rake clears the terrain; all bodies reach ≥ 0.6 m below the lowest ground under them.
