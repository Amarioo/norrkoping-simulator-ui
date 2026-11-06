# Airport Lighting Phase E1 — data provenance

Every value of the ESSP runway lighting is one of three kinds. **SOURCE** values come from a dated
publication or the pinned map data. **ESTIMATE** values are ICAO design rules or typical sizes,
used where the sources give nothing; they are not a survey of this airport. **NOT MODELLED** marks
published systems without positions.

Machine-readable: [e1-provenance.json](e1-provenance.json). Every light, with its group, position,
height and faces: [data/layout.json](data/layout.json) (`node scripts/airport-e1/layout-summary.mjs`).

## Sources

| # | Source | What is taken | Licence / use | Date | Accuracy |
|---|---|---|---|---|---|
| 1 | LFV, eAIP Sweden, **AIRAC AIP AMDT 6/2026**, ES-AD 2 ESSP NORRKÖPING-KUNGSÄNGEN, §§ 2.12, 2.14, 2.15 ([issue index](https://aro.lfv.se/content/eaip/default_offline.html)) | RWY 09/27 2205 × 45 m, threshold coordinates; approach lights CALVERT CAT I 540 m (09) / 900 m (27) LIH; threshold green; PAPI left side 3.00°, MEHT 56 ft; no TDZ or centreline lights; edge lights 2205 m / 60 m white, caution zone yellow, LIH; end lights red; no wing bars, no stopway lights; LED on threshold, edge and end lights; TWY edge lights on B and C only, LED; LED on all runway guard lights; lit windsock 390 m SE of THR 09; anemometer 330 m ENE of THR 09 lit; no aerodrome beacon; RWY 11/29 grass, no lighting listed | Facts read from the publication; no AIP text, chart or image is committed | Effective 2026-10-29 (published 2026-09-24); read 2026-11-03; it was the currently effective issue on that date. The next issue (AMDT 7/2026) takes effect 2026-11-26 and was not checked | Published infrastructure, not live availability; NOTAMs not reconciled |
| 2 | OpenStreetMap (map snapshot `2026-10-16T13:35:36Z`, `src/lib/data/norrkoping-map.json`) | RWY 09/27 centreline ends (way 7840051), TWY B (ways 30732715, 104245427) and C (way 30732713) centrelines and widths | ODbL 1.0, as for the whole map | 2026-10-16 | The runway ends lie on the AIP threshold coordinates within **0.024 m** (09: 0.020 m) after conversion with `src/lib/geo/sweref99tm.js` (EPSG:3006); taxiway widths are OSM tags (18 m) |
| 3 | ICAO Annex 14 Vol I (Aerodrome Design and Operations), chapter 5.3 | Design rules for the estimates below (spacing limits, caution-zone length, CAT I approach pattern, PAPI geometry) | Rules referenced by number, not copied | Edition as generally applied; not version-pinned | Rules state limits/typical layouts, not this airport's actual installation |
| 5 | SKYbrary, [Approach Lighting](https://skybrary.aero/articles/approach-lighting) | Calvert layout: crossbars at 150, 300, 450, 600 and 750 m; the 300 m bar 30 m long, the others of the same length or sized so their outer ends converge 300 m beyond the threshold | Description used for the estimate, not copied | Read 2026-11-03 | General description of the system, not of ESSP |
| 6 | LFV eAIP Sweden AMDT 6/2026, GEN 2.2 and ES-AD 2 ESSB, ESSA, ESGG, ESKN, ESSL | Where flashing approach lights exist, the AIP says so (ESSB: "EFAS 900 m from THR"; GEN 2.2: EFAS = electronic flashing approach system lights); ESSP lists none, so its approach lights are steady. ESSP §2.10 lists obstacles (buildings, a spire, masts, trees) with no lighting given | Facts only | Read 2026-11-03 | As source 1 |
| 4 | Earlier research note `docs/step62/airport-lighting-plan.md` (AMDT 1/2026, read 2026-10-23) | The plan and constraints of this phase | Project document | 2026-10-23 | Superseded for the data by source 1 (same values) |

Elevations: lights stand on the rendered ground (the project's DTM, RH2000), at estimated mounting
heights. The AIP elevations (ft AMSL, with geoid undulation) are not used as a height survey.

## Values

| Item | Value | Kind |
|---|---|---|
| Runway length / width | 2205 m / 45 m (OSM: 2204.8 m) | SOURCE (1, 2) |
| Edge lights | white; yellow facing a landing pilot in the last 600 m before the far end; 36 per side between the threshold rows, evenly spaced (59.6 m ≤ 60 m), 1.5 m outside the edge, 0.35 m high | spacing ≤ 60 m and colours SOURCE (1); count, zone length (Annex 14 5.3.9.7: 600 m or one third, whichever is less), offset (≤ 3 m), height ESTIMATE |
| Threshold / end rows | 16 combined units per end across the full width (3 m apart); green towards the approach, red towards the runway; lit per runway in use | colours SOURCE (1); spacing (≤ 3 m), combined units ESTIMATE |
| Approach lights | 09: 540 m west of THR 09; 27: 900 m east of THR 27; white, steady; centreline barrettes of 5 lights (4 m) every 30 m from 30 m; Calvert crossbars at 150, 300, 450 m (09) and 150–750 m (27), 30 m long at 300 m and the others sized so their outer ends lie on lines converging 300 m beyond the threshold (22.5 / 30 / 37.5 / 45 / 52.5 m); each row on a yellow bar carried by masts; lights in the light plane 0.5 m above the threshold's ground, rising 1:66 away from THR 09 and level for THR 27, at least 0.4 m above the ground | type, lengths, steady (no EFAS listed) SOURCE (1); crossbar positions and sizing ESTIMATE (source 5); plane slope ESTIMATE (Annex 14 allows up to 1:66; for 09 chosen because the user's street-level photos at Söderleden show masts about as tall as the 8–10 m street lights; for 27 no evidence) |
| PAPI | 4 units, left of each landing direction (09: north side, 27: south side); angles 3°30′, 3°10′, 2°50′, 2°30′ (A nearest the runway); 345 m from the threshold; inner unit 15 m outside the edge, 9 m apart; seen within ±10° of the approach axis | side, 3.00° and MEHT 56 ft SOURCE (1); unit settings, distance (MEHT at the lowest on-slope angle 2°50′), offsets, azimuth spread ESTIMATE |
| Taxiway edge lights | B and C only, blue, all around; both sides 1 m outside the edge, ≤ 60 m apart and at every OSM node; none within the runway | taxiways and colour SOURCE (1, 2); spacing, offset ESTIMATE |
| Beam shape | main beam ±30°, fading to ±60°; side spill 35 % (edge), 25 % (threshold/end), 15 % (approach) on the light's own side; PAPI none | ESTIMATE (display model) |
| Display colours | approximate linear RGB (`LIGHT_RGB`); ICAO chromaticity boxes not modelled | ESTIMATE |
| Switch | 'auto' = lit with the street lights' night level (a simulator rule); 'on'; 'off'. Runway in use: 27 by default | simulator rule / ESTIMATE default (no operational data) |

## Not modelled

| System | Why |
|---|---|
| Runway guard lights (LED, all) | positions not published or acquired |
| Lit windsock (390 m SE of THR 09), lit anemometer (330 m ENE of THR 09) | published as relative descriptions only, not fixture positions |
| Apron, terminal, hangar floodlights | no fitting-level data |
| Obstacle lights | not reconciled with published obstacle data |
| RWY 11/29 (grass) | unlit per the AIP; its earlier marker boxes are kept, unlit |
| Bråvalla F13 | historic; its marker boxes are kept, unlit |
