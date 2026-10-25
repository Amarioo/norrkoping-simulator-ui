# Police Signs D1 — data provenance (the police emblem on Polishuset)

Machine-readable: [police-signs-provenance.json](police-signs-provenance.json) (every value with its
source and kind), [data/police-tower-lidar.json](data/police-tower-lidar.json) (the LiDAR measurement
of the tower) and [`emblem-outline.json`](../../src/lib/landmarks/police/emblem-outline.json) (the
emblem's outline, derived from the artwork). Values in the model:
[`spec.ts`](../../src/lib/landmarks/police/spec.ts), each tagged `[HEMSO]`, `[PHOTO]`, `[LIDAR]`,
`[MODEL]` or `[EST]`.

## Which building

| Fact | Source |
|---|---|
| Stinsen 1 is **Norrköpings polisstation, Stockholmsvägen 4–6** — the police complex already in the model (OSM `relation/1356564`, POI `node/304107779`) | Hemsö property page "Stinsen 1 – Norrköpings Polisstation" (read 2026-10-25) |
| What moved on **2026-01-26** was the police *reception* (service office), to **Luntgatan 32**; weapons hand-in and found bicycles/e-scooters stay at Stockholmsvägen 4–6 | [Polisen, 2026-01-19](https://polisen.se/aktuellt/nyheter/ost/2026/januari/polisens-reception-i-norrkoping-byter-adress/) |

The roadmap line "polishuset (Stinsen 1, flytt 2026-01-26)" therefore points at the existing tower;
the Luntgatan 32 reception is a different building and is not part of D1 (see
[remaining-gaps.md](remaining-gaps.md) §2).

## Coordinates

| | |
|---|---|
| Horizontal | SWEREF 99 TM (EPSG:3006) → scene: `(E − 569 030, 6 494 989 − N) / (25 · 0.9996584126)`; x east, z south; 1 scene unit = 25 ground metres (`src/lib/data/norrkoping-map.json` `meta.reference`) |
| Vertical | RH2000 metres; scene y = RH2000 / 25 |
| Tower frame (LiDAR) | origin = centre of the tower roof's extent, SWEREF E 568 305.61, N 6 495 638.86 (scene −28.9855, −26.0032); SSE gable centre E 568 312.38, N 6 495 612.52; +u along the long axis towards the SSE gable (bearing 165.6°), +v towards WSW; metres; heights RH2000 |
| Drawn tower (`TOWER_MODEL`) | group at scene (−29.25, −26.22), rotation 0.2775 rad about +y, so local +z (out of the SSE gable) has bearing 164.1°; slab 0.51 × 1.82 × 2.65 units (12.75 × 45.5 × 66.25 m), parapet cap top 1.95 units (48.75 m) above the tower base. The base is the complex's footprint ground (as for every building attached with `onBuilding`) |
| Sign | child of the tower group at local (0, 1.95 − 10.9/25, 1.325 + 0.25/25): centred on the SSE gable, 0.25 m in front of the wall, centre 10.9 m below the parapet top. Plane spans 3.75 × 4.96 m (the painted emblem's extent) |

The drawn tower is about 10 m taller and 12 m longer than the measured one (see the table below), so
the sign keeps its real **size** and its real **distance below the parapet**, not its RH2000 height:
on the real building the emblem's centre is at ≈ 38.6 m RH2000 (≈ 26.8 m above the ground in front);
on the drawn tower it is ≈ 37.9 m above the tower base.

## Sources

| Id | Source | Date | Licence / use | Accuracy | Used for |
|---|---|---|---|---|---|
| HEMSO | [Hemsö: Stinsen 1 – Norrköpings Polisstation](https://www.hemso.se/fastigheter/stinsen-1-norrkopings-polisstation/), photograph `Stinsen-1-1240.jpg` (1024 × 768) | uploaded 2023-10 (path), read 2026-10-25 | © Hemsö; inspected and measured only, **not** copied or redistributed | ±1 px at the edges ≈ ±0.09 m; viewing angle ≈ 10° (derived) | emblem size, centring, distance below the parapet; that it is the only sign on the gable after the 2018 re-cladding; colours (gold wreath, blue shield, red/white crown) |
| PHOTO | Wikimedia Commons: [Polishuset Norrköping 2008-05-10.jpg](https://commons.wikimedia.org/wiki/File:Polishuset_Norrk%C3%B6ping_2008-05-10.jpg) (Sakletare, public domain); [Polishuset Norrköping.jpg](https://commons.wikimedia.org/wiki/File:Polishuset_Norrk%C3%B6ping.jpg) (Johan Jönsson, 2016-10-01, CC BY-SA 4.0); [Norrköping juni 2018 51.jpg](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6ping_juni_2018_51.jpg) (Johan Jönsson, 2018-06-21, CC BY-SA 4.0) | 2008, 2016, 2018 | reference only, nothing copied | proportions ±15 % (close, low viewpoints) | one emblem, centred high on the gable, on the SSE gable (2008 and 2018 from the Stockholmsvägen/Ingelstagatan side; 2016 sunlit consistent with the same gable); no "POLIS" lettering on the tower or at the entrance in any photo |
| LIDAR | Lantmäteriet point cloud, STAC `dsm-skoglig-copc` ("Laserdata NH 2020"), tile y20c012-64950_5675_25 (local, not in Git; SHA-256 in the measurement file) | 2020-02-03, scan area 20C012, nominal 1.2 pts/m² | CC BY 4.0 ©Lantmäteriet, processed | heights ±0.1–0.2 m on hard surfaces; extents from 1st/99th percentiles, walls up to ≈ 0.5 m further out | tower 54.4 × 13.4 m, parapet 49.3–49.6 m RH2000, ground in front of the gable 11.84 m, bearing 165.6°; the gable width = the photo's scale |
| ARTWORK | `public/assets/polis-emblem.svg` (Polismyndigheten; licence and credit in `DATA-LICENSE.md`, unchanged) | retrieved 2026-10-16 | used on the depicted police building only | — | the sign's picture; the outline (alpha ≥ 50 %) gives its shape |
| POLISEN | [Polisen: Polisens reception i Norrköping byter adress](https://polisen.se/aktuellt/nyheter/ost/2026/januari/polisens-reception-i-norrkoping-byter-adress/) | 2026-01-19 | text facts | — | reception moved to Luntgatan 32 on 26 January; services remaining at Stockholmsvägen 4–6 |

## Measured, derived, estimated

| Value | Kind | Source |
|---|---|---|
| One emblem sign on the tower, on the SSE gable (towards Stockholmsvägen), centred | observed | HEMSO, PHOTO |
| Tower 54.38 × 13.42 m (roof returns 1st–99th pct.), parapet ≈ 49.5 m RH2000, ground 11.84 m → ≈ 37.7 m tall | measured | LIDAR |
| Gable width used as scale 13.9 m (13.42 + ≈ 0.5 m for sparse edge returns, range 13.4–14.4) | derived | LIDAR + EST |
| Viewing angle of the HEMSO photo: cos = 0.985 (≈ 10°) from the emblem's apparent aspect (42.5 : 57 px) vs the artwork's painted aspect (0.757) | derived | HEMSO, ARTWORK |
| Emblem 3.75 m wide × 4.96 m tall (±0.3 m) | derived | HEMSO px × LIDAR scale |
| Emblem centre 10.9 m below the parapet top (±1 m) | derived | HEMSO px × LIDAR scale |
| Distance of the sign face in front of the wall: 0.25 m | **estimate** | EST |
| Sign construction (relief letters / plate / light box) | **unknown** | — |
| Lit at night | **estimate** (roadmap asks for it; no night photograph found) | EST |
| Night brightness: emissive gain 1.1 × night level (the street lighting's `env.artificial`) | **estimate** | EST, tuned on the captures |
| Older (2008/2016/2018) photo ratios: emblem ≈ 0.30–0.35 of the gable width (≈ 4.2–4.9 m), first gap to the parapet 1.4–1.6 emblem heights | measured, for comparison only (strong perspective; the emblem may have been replaced in the 2018 re-cladding) | PHOTO |

## Derived file: the emblem outline

`scripts/police-signs-d1/emblem-outline.mjs` rasterises the artwork in Edge (Playwright channel
`msedge`, version 156.0.4314.42) at its own size 512 × 668 px, traces the alpha ≥ 128 boundary,
simplifies it (Douglas–Peucker, 1.0 px) and drops contours under 40 px²: 1 outer contour
(308 points) and 9 holes (92 points). Output is deterministic for the same SVG and browser version:
two runs gave the same SHA-256
`a826f3fb8055413da81a13fdcd8fc50ae2e12a57da0b62c6a582b0e9214838d1`. The file records the SVG's
SHA-256; a unit test fails if the artwork changes without regenerating it.
