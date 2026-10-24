# Phase A1 — remaining gaps, uncertainties and areas needing municipal data

## Data the corridor still needs

| Gap | Effect today | What would close it |
|---|---|---|
| **Municipal lighting-point register** (positions, IDs, mount type, heights, fittings, switching groups; EPSG:3006/RH2000; licence) | 117 of 127 A1 fixtures are estimates: positions within ≈ ½ spacing (11–15 m) along the way, side and count assumed | Request per `docs/step62/data-sources.md` (not sent). The precedence rules are implemented (`reconcileSources`): register coverage replaces estimates, crosswalks replace OSM nodes |
| **Photometry** | Type table (Step 6) for every fixture: 1 600 / 900 / 380 cd, 3 000 / 2 700 K, ranges 30/24/16 m | Fitting models / IES files from the register |
| **Orientation of mapped lamps** | 10 mapped lamps are radial lanterns (orientation unknown, not needed for that profile) | Register or site photos |
| **Operating state** | `solar-night` for all; no dimming, no switching groups, no outages | Municipal control documents |
| **RH2000 pole elevations** | Bases are derived from the rendered ground/deck; no surveyed elevation claimed | Survey data |
| **29 rendered ways without a lit tag** (1 167 m inside the corridor), incl. most of the Drottninggatan tram/pedestrian street south of Saltängsbron (only way 297690883 is tagged `lit=yes`), Fleminggatan, Godsgatan, part of Slottsgatan, Sveagatan (unclassified part), Vattengränden, Saltängsgatan and short service ways | Dark unless a neighbouring lamp reaches them; never assumed lit | Register, or a reviewed OSM `lit` survey |
| **Tram/rail platforms** (Resecentrum and Rådhuset tram stops; Norrköping C platforms) | No fixtures (shelter/canopy luminaires not modelled; platforms outside scope) | Operator data + a canopy luminaire type |
| **Tyska torget** (pedestrian square, `lit=yes`) | Lit only by the surrounding street lamps | Register (square luminaires cannot be derived from an outline) |
| **Station building / facade lighting, signs, shop windows** | Not modelled | Landmark/commercial phases (not in this task) |

## Modelling limitations found in this phase

- **Ground lamps and decks.** The shader has no deck occluder for ground lamps. A1 approximates the
  deck as a 2D occluder in the 16 occlusion sectors of ground fixtures (whole outline of a deck with
  covered space under it). Light *through* the deck is 0 lux; light from the open sides reaches
  ≤ 3.5 lux at the deck edge, as physically expected. Side effect: approach lamps no longer add their
  weak (≈ 4 lux) contribution to the deck top beyond the deck end; the deck lamps light it. The 16-sector
  model interpolates linearly between sector centres, so a lamp near an outline corner can still leak
  through a corner gap; the ray test in corridor.test.ts guards Saltängsbron. The pilot (Bergsbron) and
  its base-measured sectors are unchanged and were not re-assessed with this metric.
- **Capacity headroom is thin** in the small square south of the park (15 of 16 slots, driven by the
  real mapped lamps). Denser estimates (≥ 15 % closer spacing) overflow there. A municipal register with
  more points than OSM in that square could exceed 16 — the set would then be rejected (reported, not
  truncated), and an owner decision (smaller cells there, a reviewed priority policy, or a second
  overflow pass) would be needed.
- **Program count after a set swap** drops temporarily (20 → 19) until a halo of the new set is drawn:
  a rebuilt set replaces its halo material (Phase 0 note). Never more programs than at start.
- **Visual groups:** A1 uses fixed 800 m chunks; the pilot keeps its three named groups (unchanged by
  design). A future citywide registry should move pilot fixtures to chunks too, in a phase that may
  re-baseline the pilot visuals.
- **Dual-carriageway assumption:** one row on each outer kerb (Norra Promenaden, Drottninggatan,
  Saltängsbron). Real installations may use median or catenary lighting.
- **Tram street poles** stand 4.05 m from the street centreline (outside the 2.2 m tram envelope);
  the real Drottninggatan may use facade- or catenary-mounted lights.
- **Measurement limits:** one desktop GPU/browser (RTX 5070 Ti, Edge/ANGLE D3D11); frame intervals,
  not GPU timers; texture bytes are CPU arithmetic, not VRAM; no lower-tier hardware.

## Not done in this task (by instruction)

Landmarks (incl. Rådhuset/Gull-Olle), Vrinneviskogen, fuel stations, airport lighting, routing and
terrain changes, any area outside the corridor. No commit, push or merge.
