# Landmark B2 — remaining gaps

B2 covers Hedvigs kyrka only (the first church of the roadmap's list). What is not done, not known or
only estimated:

## 1. The floodlighting is an estimate

**Known:** the parish had a new façade lighting installed in 2014; its cable trench ran along the
church's east and west sides, north and south of the tower and 5 m south-west of it (RAÄ rapport
2015:7). **Not known:** whether it is still in use in 2026, the fixtures, their exact positions,
aiming, beam angles, intensity, colour and switching times. No dated night photograph was found
(searched 2026-11-06: Commons, the municipality, Svenska kyrkan, local press, lighting firms).

So the eight floodlights (two at the west front, three for the tower, three at the east end) are an
estimate consistent with that trench: warm white 3000 K, ≈ 50–200 lx on the lit walls, switched with
the street lighting. The long north and south walls are left unlit because no trench ran there.

**What would settle it:** one evening photograph of the church from the west and from the east (or a
line from Svenska kyrkan Norrköping / S:t Olofs församling about the fixtures). Then positions,
aiming and colour can be corrected in `FLOODLIGHTS` (spec.ts) without touching the shader.

## 2. Geometry that is estimated, not measured

| Item | State | What would settle it |
|---|---|---|
| Windows | One round-arched window per bay (1.9 × 5.4 m, sill 7.8 m); one on each diagonal east wall, none on the east wall; none on the west bay | A side photograph with a scale, or façade drawings (RAÄ bebyggelseregistret, id 21300000004315) |
| Bell-stage louvres, swags, clocks, diamonds | Sizes scaled from the 2012 photograph | Close photographs of each face |
| Octagonal lantern | Shape from the photograph; the chamfer (0.35 × half-width) is estimated; the LiDAR has no returns on the lantern walls | Photograph from above / drawings |
| Bell on the lantern roof, angel weathervane | Not modelled (seen in the 2012 photograph) | — |
| Concave (ogee) profiles of the cap and the lantern roof | Straight segments between the LiDAR rings | Denser LiDAR or drawings |
| Balustrade | A solid low wall 1.1 m high on the terrace edge (photograph shows a light balustrade) | Close photograph |
| Frontispiece and portal | Cream panel and arched door, sizes from the 2016 photograph | Façade drawings |
| Colours | From daylight photographs 2011–2016 (before and after the 2013–2014 renovation) | A current photograph |

## 3. Known geometric differences to the LiDAR (documented, not fixed)

- **Tower edges:** the cap rim (25.5 m), the lantern roof (30.4 m) and the needle (36.9 m) are steps;
  1 m cells across them mix levels 4–5 m apart, so a few cells differ by 3–4 m (tower p75 0.89 m,
  p90 3.9 m). The plan widths themselves agree with the returns within 0.6 m at every height band.
- **The needle:** thin; the model's needle is under the LiDAR top, but the cells around it see the
  roof (≈ 33 m) in the model and the needle (36.9 m) in the LiDAR.
- **Eave overhangs:** modelled 0.5 m (nave) and 0.3 m (sacristy); the LiDAR suggests ≈ 0.2 m at the
  east wall. The fit test excludes cells within 1.5 m of the outline.
- **Date of the LiDAR:** 2020-02-03, after the 2013–2014 renovation.

## 4. Not in scope (next stories)

- The other churches of B2: **Sankt Olai** (floodlit by park-pole floodlights per the municipality's
  2012 lighting plan; Olaiparken is being rebuilt in 2026), **Matteus** and **S:t Johannes** (no
  evidence of floodlighting found). They still have the earlier stylised towers in `mapLandmarks.ts`.
- **Rådhuset's tower lighting** (B1 part 2): a Commons night photograph of 2017-11-30
  ("Norrköping och Motala ström i mörker.jpg", CC BY 4.0) shows the tower and spire floodlit warm
  yellow. The façade emitters added here can carry it (FACADE_MAX = 16, 8 used).
- The church's interior and its windows at night (no evidence of evening services' lighting).
