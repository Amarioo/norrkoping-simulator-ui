# Phase A2 — remaining gaps, uncertainties and decisions needed

## 1. Decision needed: the untagged Norra Promenaden pieces at Norrtull

Three short pieces of the Norra Promenaden carriageways at the Norrtull tram stop are rendered roads
with **no `lit` tag** in the pinned snapshot, while the carriageway on both sides of each piece is
`lit=yes`:

| Way | Carriageway | Length | Between (`lit=yes`) |
|---|---|---:|---|
| 286445696 + 300186798 | westbound (north) | 21 + 29.5 m | 286445690 … 300186799 |
| 1050773512 | eastbound (south) | 52 m | 4384888 … 286445689 |

Under the approved policy an untagged way is *unknown* and gets no fixture, so A2 leaves them unlit.
They stay **dark (≈ 0 lux over ≈ 35–40 m of each carriageway centreline**, median 0.1 lux over all
samples on these pieces; [data/seams.json](data/seams.json) `norrtullUntaggedPieces`), lit only at
their ends by the neighbouring brackets and, beside the eastbound piece, by the evidence-backed
lanterns of the `lit=yes` cycleway 286457920. This is an **evidence gap, not a rollout seam** — every
rollout boundary is continuous ([visual-validation.md](visual-validation.md)).

It is very likely that these pieces are lit in reality (they are splits of a lit carriageway made for
the tram stop), but no source in the pinned data says so. Options for review — **none applied**:

1. **Keep as is** (implemented): faithful to the evidence; visibly dark at the tram stop at night.
2. **OSM `lit` check**: a survey or an imagery check, then a `lit=yes` edit in OpenStreetMap, a new
   pinned snapshot and a regeneration (the generator handles it with no code change; IDs of the
   existing A2 fixtures stay stable).
3. **Approve a bounded continuity rule** (e.g. `lighting-a2-v2`): an untagged piece ≤ 60 m of a named
   carriageway, between `lit=yes` pieces of the same name, class and direction, gets estimates labelled
   `illumination: inferred-continuity`. Would add ≈ 2–4 brackets here; needs an owner decision because
   it is inference, not evidence.
4. **Municipal register** (preferred long-term): it would replace all estimates in its coverage
   (`reconcileSources`).

## 2. Data still missing (unchanged since A1)

| Gap | Effect in A2 | What would close it |
|---|---|---|
| Municipal lighting-point register (positions, IDs, mount type, heights, fittings, switching; EPSG:3006/RH2000; licence) | all 35 A2 fixtures are estimates: positions within ≈ ½ spacing along the way, side and count assumed | request per `docs/step62/data-sources.md` (not sent) |
| Mapped OSM lamps | none exist in A2 (0 nodes in the snapshot) | register or OSM mapping |
| Photometry | type table for every fixture (1 600 / 900 / 380 cd, 3 000 / 2 700 K, 30/24/16 m) | fitting models / IES |
| RH2000 pole elevations | bases on the rendered ground; no surveyed elevation | survey |
| Operating state | `solar-night`; no schedule, dimming or outages | municipal control documents |
| Untagged side streets and paths inside A2 (Slottsgatan west mouth 297642830, Kungstorget 300027227, service 93304118, the paths 1212136552/1212234783/1212234784 beside Kungsgatan) | none | register or reviewed OSM tags |
| Norrtull tram platform and bus platform "F" (`lit=yes` platforms) | no platform luminaires; lit by the street lamps only | operator data + a canopy luminaire type |

## 3. Modelling limits seen in this phase

- **Junction density**: at the Kungstorget east junction five 8 m brackets of different ways stand
  ≈ 20 m apart (the A1 spacing rule allows ≥ 16.5 m between same-class estimates of different ways).
  Ground illuminance there stays within the A1 range (zone D max 28.8 lux vs A1 zone A 30.6, zone B
  33.7; [data/seams.json](data/seams.json) `areas`), so it is not over-bright by the model's measure,
  but real junction lighting may differ.
- **Dual carriageways** get one row on each outer kerb, Kungsgatan (9.9 m, two-way) a staggered row on
  both kerbs; real installations may use median or catenary lighting.
- **Pilot seam spacing** follows two different station rules (Step 6 walk in the pilot, way-local
  stations in A1/A2). The seam rule keeps same-class estimates ≥ 16.5 m apart; the resulting bracket
  gap at the seam is 26.5 m (class spacing 30 m). Re-generating the pilot with the A1 rule would make
  the sequence uniform but would change the frozen pilot — not done.
- **Visual groups**: A2 fixtures join the existing chunk group `chunk:-1,-1` with A1. The group's
  bounds grow westwards, so A1 pole housings are now also drawn when the camera is near A2 (and vice
  versa) — by design (nothing nearby can be hidden), measured in [performance.md](performance.md).
- **Deck occlusion**: no bridge is within range of an A2 lamp, so the A1 deck-occluder approximation is
  not exercised by A2 (tested).
- **Measurement limits**: one desktop GPU/browser (RTX 5070 Ti, Edge/ANGLE D3D11); frame intervals,
  not GPU timers; ±1 ms per-cell p95 resolution; texture bytes are CPU arithmetic, not VRAM; no
  lower-tier hardware tested and no claim made for it.

## 4. Not done (by instruction)

Whole-city rollout, Rådhuset/Gull-Olle, church floodlighting, police signage, fuel stations,
Vrinneviskogen, trail lighting, airport and aircraft lighting, vehicle headlights, routing or terrain
changes, the rest of Kungstorget and the side streets beyond the corridor. No commit, push or merge.
