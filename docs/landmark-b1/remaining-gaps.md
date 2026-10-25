# Landmark B1 — remaining gaps

Part 1 (geometry by day) is done. What is not done, not known or only estimated:

## 1. Part 2: façade lighting (not started)

The roadmap's second step. Nothing in this change lights the town hall: at night it is lit only by
the street lamps around it, the clock faces darken like the façade (as before), Gull-Olle is dark.

**Evidence needed first.** No source found so far documents floodlighting of the façade, the tower,
the clock or Gull-Olle (the municipal page, sv.wikipedia and the three reference photographs are all
daytime). Before anything is lit:

- look for dated night photographs (Commons category *Norrköpings rådhus*, municipal and tourism
  pages, Norrköpings Tidningar on the 2022–2025/26 renovation), and note which parts are lit
  (tower shaft, belfry, clock faces from inside, Gull-Olle spotlit, façade grazing light) and the
  light colour;
- if nothing is found, the user decides whether to light it as an **estimate** (roadmap: "märkt som
  uppskattning om ingen dokumentation finns").

**Architecture (planned, as F1 / the stadium):** a small fixed uniform budget in the existing shader
patch of `src/lib/lighting/cityLights.ts` (e.g. ≤ 8 façade emitters: position, direction, cone,
colour, intensity), filled by the controller only at night, count 0 by day; no three.js
PointLight/SpotLight, no shadow maps, no new program variants (today 20). If night photos show the clock faces lit, the clock
material's emissive colour (a uniform, no new program) can follow the night level. Emitter
positions would come from `spec.ts` (tower faces, cornice, statue base at 68.65 m RH2000).

## 2. Geometry that is estimated, not measured

| Item | State | What would settle it |
|---|---|---|
| Gull-Olle's figure | Stylised standing figure with crown, height and top measured, silhouette estimated; attributes (e.g. an axe) and facing not modelled | A dated close photograph or the sculptor's documentation (J. A. Wetterlund, 1910) |
| Clock faces | 3.6 m dial at 47.5 m, all four faces | A photograph of the east and south faces; municipal or contractor drawings |
| Belfry openings, stone bands | Scaled from the 2016 photograph | Façade drawings |
| Windows, portal, floor lines | Regular rhythm (3 rows, every 3.6 m), portal centred under the tower | Façade drawings or a measured elevation |
| Dormers on the north wing | Not modelled; the LiDAR shows a bumpy lower mansard (dormers) | Count/positions from the LiDAR grid or photos |
| Roof features | Measured positions and heights, estimated shapes (brick stacks with copper caps) | Photographs from above |
| Colours | From photographs under daylight; roof and tower roof material not documented (slate assumed from the colour) | Byggnadsminne documentation (RAÄ bebyggelseregistret, id 21300000014763) |

## 3. Known geometric differences to the LiDAR (documented, not fixed)

- **OSM outline vs LiDAR eave line:** up to ≈ 1 m, e.g. the west wing's courtyard wall (OSM u −19.4,
  LiDAR eave ≈ −20.3) and the wings' south ends. The model follows OSM for walls (the map's source);
  the fit test excludes cells within 1.5 m of the outline for this reason.
- **Tower shaft:** modelled from the measured faces (u −5.3…5.25, v −5.6…5.0), while the cornice and
  roof are centred on the roof's measured centre: the 0.3 m offset is kept as measured.
- **Main roof hips:** the north wing ends are hipped with the courtyard-side/north-side profiles; the
  LiDAR shows steeper ends (corner pavilions). Cells within 1.5 m of the outline are not in the fit.
- **Date of the LiDAR:** 2020-02-03, before the renovation (2022–2025/26). The renovation is not known
  to have changed the roofline; the 2025 photograph shows the same silhouette.

## 4. Not in scope

- Interior, courtyard paving, the clock's time (fixed hands), the carillon.
- The legacy hand-made city model (`src/lib/norrkoping.ts`, not rendered) still has a box named
  "Norrköpings rådhus"; untouched.
- The landmark label "Rådhuset" still floats above the footprint's bounding-box centre (≈ 20 m from
  the tower), as before.
