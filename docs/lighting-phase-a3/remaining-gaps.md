# Phase A3 — remaining gaps, uncertainties and decisions

## 1. Norrtull: decided — keep the untagged pieces unlit (option 1)

Decision (user, 2026-10-24): Norra Promenaden ways **286445696 + 300186798** (westbound, 21 + 29.5 m)
and **1050773512** (eastbound, 52 m) at the Norrtull tram stop stay without fixtures, because the pinned
snapshot has no `lit` tag on them. A3 adds no lamp there and changes nothing: the A3 lamps are ≥ 80 m
away (beyond their 30 m range), and the road-surface illuminance on these pieces is **identical** before
and after A3 (43 samples; median 0.1 lux, 30 samples < 1 lux — [data/ring.json](data/ring.json)
`norrtullUntaggedPieces`; tested exactly in `corridorA3.test.ts`).

### What an OSM check (option 2) would need

Option 2 was not carried out. It would turn the gap into evidence instead of inference:

1. **Evidence on the ground**, one of:
   - a survey at the stop: walk both carriageways between the `lit=yes` neighbours (westbound
     286445690 … 300186799, eastbound 4384888 … 286445689) and record whether street lights cover the
     pieces, ideally with pole positions (mapped as `highway=street_lamp` nodes, which would also give
     A2 real positions);
   - or street-level imagery whose licence allows OSM mapping (e.g. imagery the OSM community accepts
     as a source, such as Mapillary or Panoramax), dated, showing the poles along the pieces.
   An aerial photo alone usually cannot show whether a road is lit; a "probably lit because the
   neighbours are" judgement is inference, not evidence (that is option 3, not chosen).
2. **The OSM edit:** `lit=yes` (or `lit=no` if the survey shows no lighting) on the three ways, with a
   `source`/changeset comment naming the survey or imagery and its date. Done by a mapper in
   OpenStreetMap, not by this project.
3. **A new pinned snapshot:** re-run the Step 6.2 Overpass query after the edit is live; store the
   response as a **new** snapshot with its own SHA-256, retrieval time and OSM base in a new entry of the
   source manifest. The current snapshot (`dcce1dcc…4eda`, base 2026-10-23T09:05:06Z) must stay pinned
   for the existing rollouts; the extractor refuses any file whose hash differs.
4. **Regenerate A2** from the new snapshot (`extract-source.mjs a2`, then the A2 writer). The generator
   needs no code change. IDs of the 35 existing A2 fixtures stay stable if their ways are unchanged
   (IDs depend only on the way and station index); the new pieces would get
   `estimate:lighting-a2-v1:way/<id>:s<n>` brackets — ≈ 2–4 by the A2 estimate. Every other way in the
   new snapshot must be compared with the old one, because a newer snapshot can also change other tags
   or geometry; any change to earlier fixtures must be reported, not absorbed.
5. **Review:** A2 seam continuity and capacity (A2 cells hold ≤ 9 today, so 2–4 brackets are no
   capacity risk), the Norrtull profile, and the provenance/README of A2 (dataset and snapshot fields).

Effort: small for this project (one regeneration and review); the evidence step depends on a site
visit or suitable imagery.

## 2. The ring has two dim stretches (by the existing station rule)

The way-local station rule gives each ring way round(length / 30 m) brackets. Two short ring ways
get **no station of their own**: 312486752 (14.5 m) and 684962393 (10.7 m), and the untagged 4.9 m
piece 300027227 in zone D gets none either. Measured on the ring centreline (2.5 m steps,
[data/ring.json](data/ring.json)):

| Stretch | Bracket gap (straight line) | Lowest illuminance | Samples < 3 lux | Samples < 1 lux |
|---|---:|---:|---:|---:|
| North arc, end of 312490062 → 312486752 | 49.7 m (`312490062:s0` → `286445688:s0`) | **0.5 lux** | 8 (≈ 15 m) | 3 |
| West link 684962393 → start of 163928046 | 41.4 m (`286445688:s1` → `163928046:s0`) | 2.4 lux | 4 (≈ 5 m) | 0 |
| North-east, A2's `286445685:s0` → `312490062:s0` (over 300027227) | 48.8 m | ≥ 3 lux (A2 arc + 300027227 at ≥ 10 lux) | 0 | 0 |

For comparison: the rest of the A3 ring has a median of 11.4 lux; A1/A2 carriageways stay ≥ 3.5–5.3
lux. The darkest A3 stretch is therefore darker than anything on lit A1/A2 carriageways, but much
brighter than before A3 (the whole west half of the ring was < 1 lux).

Not fixed, by design: closing it would need a new rule (e.g. stations along the whole ring as one
chain instead of per way), which is a policy change for the owner, not a data fact. Real installations
at roundabouts often use evenly spaced or central lighting; the real layout is unknown.

## 3. Data still missing (unchanged since A1/A2)

| Gap | Effect in A3 | What would close it |
|---|---|---|
| Municipal lighting-point register (positions, IDs, mount type, heights, fittings, switching; EPSG:3006/RH2000; licence) | all 6 A3 fixtures are estimates: position within ≈ 15 m along the way, side and count assumed | request per `docs/step62/data-sources.md` (not sent) |
| Mapped OSM lamps | none in or near F | register or OSM mapping |
| Photometry | type table (1 600 cd, 3 000 K, 30 m range for the 8 m bracket) | fitting models / IES |
| RH2000 pole elevations | bases on the rendered ground | survey |
| Operating state | `solar-night`; no schedule, dimming or outages | municipal control documents |
| Approach streets beyond the ring (Stockholmsvägen, Norra Promenaden west, Ingelstagatan), all `lit=yes` | dark beyond the first ≈ 15–30 m, which only the ring lamps' spill reaches (first 30 m: median 1.4–9 lux after, 0 lux before) | a later phase (not in A3 by instruction) |
| Untagged pieces: ring 300027227 (4.9 m, zone D), Norra Promenaden 287527541 (7.9 m, south-west mouth) | none | reviewed OSM tags or the register |

## 4. Modelling limits seen in this phase

- **Ring side rule:** brackets stand on the outer kerb of the ring (as in A2's east arc); a real
  roundabout may also have island or central lighting. The tram turning loop in the island has no
  lighting of its own.
- **Visual group:** A3 joins the existing chunk group `chunk:-1,-1` (A1 + A2); no new group or
  material. The group's bounds grow ≈ 100 m westwards, so its pole housings (up to +552 triangles) are now
  drawn in every view that drew the group before — by design (no nearby lamp can be hidden), measured
  in [performance.md](performance.md); draw calls are unchanged in every captured view.
- **Deck occlusion:** no bridge within range of an A3 lamp (tested).
- **Measurement limits:** one desktop GPU/browser (RTX 5070 Ti, Edge/ANGLE D3D11); frame intervals,
  not GPU timers; ±1 ms per-cell p95 resolution; texture bytes are CPU arithmetic, not VRAM; no
  lower-tier hardware tested and no claim made for it.

## 5. Not done (by instruction)

Phase B (Rådhuset / Gull-Olle), the approach streets, any other area, refactoring, a new OSM download,
the Norrtull OSM check itself. No push or merge.
