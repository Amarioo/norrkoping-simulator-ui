# Landmark B2 — data provenance (Hedvigs kyrka)

Machine-readable: [hedvig-provenance.json](hedvig-provenance.json) (every value with its source and
kind) and [data/hedvig-lidar.json](data/hedvig-lidar.json) (the LiDAR measurement the values were read
from). Values in the model: [`spec.ts`](../../src/lib/landmarks/hedvig/spec.ts), each tagged `[OSM]`,
`[LIDAR]`, `[PHOTO]`, `[RAÄ]` or `[EST]`.

## Coordinates

| | |
|---|---|
| Horizontal | SWEREF 99 TM (EPSG:3006) → scene: `(E − 569 030, 6 494 989 − N) / (25 · 0.9996584126)`; x east, z south; 1 scene unit = 25 ground metres |
| Vertical | RH2000 metres; scene y = RH2000 / 25 (vertical origin 0 m) |
| Building frame | origin = measured bell-tower centre, scene (0.1073, −13.0706) = SWEREF E 569 032.68, N 6 495 315.65; +u along the nave towards the east end (mean direction of the OSM long walls, way/88741182 vertices 59 → 43 and 7 → 19; scene axis (0.976882, −0.213781), 12.3° north of grid east); +v towards the north; ground metres; heights RH2000 |
| Placement | `hedvigFrame()`: one group at the origin, rotation −atan2(uz, ux) about y, scale 1/25; local y = RH2000 m. Walls reach down to the lowest rendered ground under the OSM footprint, like every OSM building |
| Floodlights | given in the building frame (`FLOODLIGHTS`: ground position, mounting height above the rendered ground, aim point), converted by `hedvigFloodlights()` to scene units for the lighting controller |

## Sources

| Id | Source | Date | Licence / use | Accuracy | Used for |
|---|---|---|---|---|---|
| LIDAR | Lantmäteriet point cloud, STAC `dsm-skoglig-copc` ("Laserdata NH 2020"), tile y20c012-64950_5675_25 (local, not in Git; SHA-256 in the measurement file) | 2020-02-03, scan area 20C012, nominal 1.2 pts/m² (after the 2013–2014 renovation) | CC BY 4.0 ©Lantmäteriet, processed | heights ±0.1–0.2 m on roofs; walls and the timber tower faces ±0.3–0.5 m; thin tops (needle, vane) under-sampled | tower position, plan widths and heights (cap 25.2–27.5 m, lantern roof 30.1–34 m, top 36.9 m); nave eave 15.0 m, säteritak step 20.95/21.75 m, ridge 25.45 m; east-end hip; west bay slope 12.8 → 17.4 m and terrace; sacristy eave 10.2 / ridge 12.2 m; porch ≈ 9 m; ground |
| OSM | way/88741182 "Hedvigs kyrka", map snapshot 2026-10-16 (`src/lib/data/norrkoping-map.json`, unchanged) | 2026-10-16 | ODbL 1.0 | ±1 m | footprint (walls, pilasters as 1 m notches, three-sided east end, sacristy, porch), nave axis |
| PHOTO | Commons: [2016-06-13 MV-LISA 942 In Norrköping, Hedvigs Kyrka](https://commons.wikimedia.org/wiki/File:2016-06-13_MV-LISA_942_In_Norrk%C3%B6ping,_Hedvigs_Kyrka.jpg) (Eduard47, 2016, CC BY-SA 4.0); [WTNkpng1 Ainali Hedvigskyrka 2](https://commons.wikimedia.org/wiki/File:WTNkpng1_Ainali_Hedvigskyrka_2.JPG) (Jan Ainali, 2012-05-12, CC BY-SA 3.0); [Hedvigs kyrka från luften](https://commons.wikimedia.org/wiki/File:Hedvigs_kyrka_fr%C3%A5n_luften.jpg) (L.G.foto, 2011-04-21, CC BY-SA 4.0) | 2011, 2012, 2016 | reference only, nothing copied | proportions ±10 % | colours (red brick, light stone, cream frontispiece, copper roofs, dark panel-clad tower, gilding); two arched louvres per face with gilded swags; octagonal lantern with clocks and gilded diamonds; octagonal concave roof, ball and needle; windows; the portal |
| RAÄ | Arkeologerna / RAÄ UV Öst, Rapport 2015:7, *Hedvigs kyrka – ett ledningsschakt för fasadbelysning runt kyrkan* (R. Hedvall), [PDF](https://pub.raa.se/dokumentation/134968b9-c25b-4776-9404-cca90802d5fe/arkivbestandig), [summary](https://arkeologerna.com/publikationer/hedvigs-kyrka/) | trench dug 25–26 March 2014, report July 2014 | text facts | — | that a new façade lighting was installed in 2014; where its cables run (along the east and west sides, north and south of the tower, a short trench 5 m south-west of the tower) |
| SEARCH | Searches for night photographs and lighting documents (Commons, norrkoping.se incl. *Belysningsplan* 2012 and *Riktlinje för belysning* 2023, Svenska kyrkan, local press, lighting firms) | 2026-11-06 | — | — | negative result: **no dated night photograph and no description of fixtures, aiming or colour** was found |

## Measured, derived, estimated

| Value | Kind | Source |
|---|---|---|
| Needle top 36.9 m RH2000; ground west 4.77 m → 32.1 m above the west front | measured | LIDAR |
| Nave eave 15.0 m (edge ≈ 0.5 m beyond the walls), säteritak step 20.95 → 21.75 m at 6.25 m inset, ridge 25.45 m at v −0.14 | measured | LIDAR (nave section, median over u 6–24) |
| East end hipped with the same profile; ridge ends at u ≈ 26.5, step at u ≈ 30.6 | measured | LIDAR (eastEnd section) |
| West bay: slope from 12.8 m (u ≈ −8.9) to the 17.4 m terrace (u ≈ −4.6) | measured | LIDAR (westBayCentre section, surface grid) |
| Sacristy eave 10.2 m, ridge 12.2 m along v, hipped north; porch ≈ 9 m | measured | LIDAR (sacristy sections, surface grid) |
| Tower plan widths: cap rim 7.1 × 9.0 m, lantern roof rim 4.7 × 6.3 m (2nd–98th percentiles), model ≈ 0.1–0.2 m wider | measured + derived | LIDAR |
| Bell-stage height 17.4–25.2 m, balustrade 18.5 m | measured (terrace, cap rim) + estimate (balustrade height) | LIDAR, PHOTO |
| Octagonal lantern and roof (corners cut by 0.35 × the smaller half-width) | photo + LiDAR pattern; chamfer size **estimate** | PHOTO, LIDAR |
| Louvres (2 per face, 1.7 m wide, 19.4–23.6 m), swags, clock dials (Ø 1.6 m at 28.8 m), diamonds, ball | **estimate** | PHOTO |
| Windows (1.9 m wide, sill 7.8 m, top 13.2 m; one per bay, one on each diagonal east wall, none on the east wall) | **estimate** | PHOTO, EST |
| Frontispiece (v −2.45 … 1.95, to 12.2 m) and door (2.0 × 4.2 m) | **estimate** | PHOTO |
| Colours | **estimate** | PHOTO |
| Floodlights: 8 ground floodlights, positions, aiming, beam angles, 6 500–24 000 cd, 3000 K | **estimate**, consistent with RAÄ's trench | RAÄ, EST |

Fit of the model to the LiDAR surface (1 m cells inside the footprint, ≥ 1.5 m from the outline, 632
cells): median |Δ| **0.25 m**, p90 **0.58 m**, mean Δ −0.03 m. Tower cells (44): median |Δ| 0.34 m;
the plan width at every height band with ≥ 8 returns is 0.0–0.6 m wider than the returns' extent
(tests in [`hedvig.test.ts`](../../src/lib/landmarks/hedvig/hedvig.test.ts)).

## Reproduction

```powershell
C:\Users\amarg\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts/landmark-b2/hedvig_lidar.py work/landmark-b2/rebuild/hedvig-lidar.json
```

Inputs: the local tile above, `src/lib/data/norrkoping-map.json`. Tools: CPython 3.12.14, numpy 2.3.5,
laspy 2.7.0 (with lazrs). No seed (no randomness). The file contains no timestamps or machine paths.
Rebuilt 2026-11-07: byte-identical, SHA-256
`441a6c4f29f947735ca991493b4f51fe64c46fb0eaa9cb2991e691baf5c8051a`.

Nothing was invented: no municipal ID, drawing, photometry or lighting data was available. The
floodlights are estimates and are labelled as such everywhere ([remaining-gaps.md](remaining-gaps.md)).
