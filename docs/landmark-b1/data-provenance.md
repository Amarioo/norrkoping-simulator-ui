# Landmark B1 — data provenance (Rådhuset and Gull-Olle)

Machine-readable: [radhuset-provenance.json](radhuset-provenance.json) (every value with
its source and kind) and [data/radhuset-lidar.json](data/radhuset-lidar.json) (the LiDAR measurement
the values were read from). Values in the model: [`spec.ts`](../../src/lib/landmarks/radhuset/spec.ts),
each tagged `[OSM]`, `[LIDAR]`, `[KOMMUN]`, `[WIKI]`, `[PHOTO]` or `[EST]`.

## Coordinates

| | |
|---|---|
| Horizontal | SWEREF 99 TM (EPSG:3006) → scene: `(E − 569 030, 6 494 989 − N) / (25 · 0.9996584126)`; x east, z south; 1 scene unit = 25 ground metres |
| Vertical | RH2000 metres; scene y = RH2000 / 25 (vertical origin 0 m) |
| Building frame | origin = measured tower centre, scene (−1.1325, −10.6945) = SWEREF E 569 001.70, N 6 495 256.27; +u along the north façade towards the north-east corner (OSM way/285809156 vertex 0 → 5; scene axis (0.960852, −0.277062), 16.1° north of grid east); +v out of the north façade; ground metres; heights RH2000 |
| Placement | `radhusetFrame()`: one group at the origin, rotation −atan2(uz, ux) about y, scale 1/25; local y = RH2000 m. Walls reach down to the lowest rendered ground under the OSM footprint, like every OSM building |

## Sources

| Id | Source | Date | Licence / use | Accuracy | Used for |
|---|---|---|---|---|---|
| LIDAR | Lantmäteriet point cloud, STAC `dsm-skoglig-copc` ("Laserdata NH 2020"), tile y20c012-64950_5675_25 (local, not in Git; SHA-256 in the measurement file) | 2020-02-03, scan area 20C012, nominal 1.2 pts/m² | CC BY 4.0 ©Lantmäteriet, processed | heights ±0.1–0.2 m on hard surfaces; walls ±0.3–0.5 m; thin tops under-sampled | tower position, shaft, cornice, roof, top (73.15 m); roof profiles of all wings; eave 22.5 m; balustrade 23.6 m; courtyard blocks; roof features; ground 4.47 m |
| OSM | way/285809156 "Rådhuset", map snapshot 2026-10-16 (`src/lib/data/norrkoping-map.json`, unchanged) | 2026-10-16 | ODbL 1.0 | ±1 m (≤ 1 m from the LiDAR eave line here) | footprint (walls), façade axis, entrance projection |
| KOMMUN | [norrkoping.se: Norrköpings rådhus](https://norrkoping.se/kommun-och-politik/om-norrkoping/norrkopings-radhus) | updated 2026-09-29, read 2026-10-25 | text facts | — | tower 68 m (check: LiDAR 68.7 m); 4.5 m gilded granite sculpture of Sankt Olof, "Gull-Olle" |
| WIKI | [sv.wikipedia: Norrköpings rådhus](https://sv.wikipedia.org/wiki/Norrk%C3%B6pings_r%C3%A5dhus) | read 2026-10-25 | text facts | — | Helsingborg brick; 1907–1910; statue by J. A. Wetterlund, 1910 |
| PHOTO | Commons: [norra fasaden mot Tyska Torget](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6pings_R%C3%A5dhus,_norra_fasaden_mot_Tyska_Torget.jpg) (Måns Hagberg, 2015, CC BY-SA 4.0); [tower 20th of September 2016](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6pings_r%C3%A5dhus_tower_20th_of_September_2016.jpg) (Xamreb, CC BY-SA 4.0); [hösten 2025](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6pings_r%C3%A5dhus_(h%C3%B6sten_2025).jpg) (OMXSHSB, CC0) | 2015, 2016, 2025 | reference only, nothing copied | proportions ±10 % | colours, balustrade, stone bands, belfry openings, clock size/height, copper caps |

## Measured, derived, estimated

| Value | Kind | Source |
|---|---|---|
| Tower top (Gull-Olle) 73.15 m RH2000; ground in front 4.47 m → **68.7 m** | measured | LIDAR (municipality: 68 m) |
| Gull-Olle 4.5 m → base 68.65 m | official + derived | KOMMUN, WIKI; LiDAR narrowing at 68.5–69 m agrees |
| Tower shaft 10.55 × 10.6 m; cornice 58.0–58.3 m, 11.5 m wide; roof half-widths 5.0 → 1.1 m from 58.3 to 68.65 m | measured | LIDAR |
| Wings: eave 22.5 m; north wing mansard to 30.9 m, ridge 37.9 m; side wings ridge 30.1/30.15 m | measured | LIDAR (sections) |
| Courtyard: middle block eave 30.6, ridge 36.1 (hipped south); strips 19.7; hall 10.3/12.1; cross gables 29.6/29.8 | measured | LIDAR (surface grid) |
| Balustrade on the north façade, top 23.6 m | measured + photo | LIDAR, PHOTO 2015 |
| Chimney stacks/ventilators: positions and tops | measured; shape estimated | LIDAR; PHOTO |
| Footprint, entrance projection | mapped | OSM |
| Belfry openings (3 × 1.1 × 3.8 m per side), clock (Ø 3.6 m at 47.5 m, four faces), stone bands | **estimate** | PHOTO |
| Windows (3 rows, every 3.6 m), portal centred under the tower, floor lines | **estimate** | EST |
| Gull-Olle's silhouette (robed figure with crown) | **estimate** | EST (width bounded by LiDAR) |
| Colours | **estimate** | PHOTO, WIKI |

Fit of the model to the LiDAR surface (1 m cells inside the footprint, ≥ 1.5 m from the outline, 1 782
cells): median |Δ| **0.34 m**, p90 **1.47 m**, mean Δ −0.03 m (test in
[`radhuset.test.ts`](../../src/lib/landmarks/radhuset/radhuset.test.ts)).

## Reproduction

```powershell
C:\Users\amarg\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts/landmark-b1/radhuset_lidar.py work/landmark-b1/rebuild/radhuset-lidar.json
```

Inputs: the local tile above, `src/lib/data/norrkoping-map.json`. Tools: CPython 3.12.14, numpy 2.3.5,
laspy 2.7.0 (with lazrs). No seed (no randomness). Rebuilt 2026-10-25: byte-identical, SHA-256
`a1dad4f3167e1ebbf0eef9fea1b87f4ce7f46c05a22e455a8bba313cd7ed061b`. The file contains no timestamps
or machine paths.

Nothing was invented: no municipal ID, drawing or lighting data was available or used. Lighting of
the façade is part 2 and not started ([remaining-gaps.md](remaining-gaps.md)).
