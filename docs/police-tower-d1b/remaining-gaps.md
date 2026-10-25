# Police Tower D1b — remaining gaps

D1b draws the police tower from the LiDAR. What is not done, not known or only estimated:

## 1. The emblem's size — resolved on `main` (D1 follow-up)

D1b found that D1 had scaled its photo measurement of the emblem with the whole tower's width
(13.9 m), while the dark SSE gable is only the UPPER block (≈ 9 m; D1b draws it 9.06 m). The D1
session confirmed this from its own LiDAR cross-section and corrected it on `main` (`aaa9b3d`,
approved by the user): `GABLE_WIDTH_M` = 9.3 m (tall part 8.82 m + 0.5 m edge allowance), emblem
2.51 × 3.32 m, centre 7.3 m below the parapet. D1b takes these values from `spec.ts` unchanged, so
on the measured tower the emblem's centre is at 49.35 − 7.3 = **42.05 m RH2000** (30.3 m above the
ground in front). The emblem spans 28 % of the drawn 9.06 m gable (Hemsö photo: 27 %).

## 2. Façade detail is illustrative

The lit windows at night (D1 follow-up, `windows.ts`: 30 % lit, deterministic pattern, estimates)
use the same window grid as the texture, so they follow the measured façades: ENE-facing faces get
one pattern, WSW-facing faces the other. Where a façade is shorter than a texture repeat the pattern
is cut; where it is longer (none on this tower) it would repeat.

The long façades use the earlier model's window texture, now repeated at a fixed bay and storey
size (3.2 × 3.4 m, estimates) instead of being stretched over the face. The real façades have light
vertical fins between window bands (photos). The number of storeys (≈ 11–13 in the photos) was not
counted reliably, so no storey lines are claimed. The NNW gable has not been photographed in any
source found: it is drawn dark like the SSE gable (estimate).

## 3. Below the roofs

Airborne LiDAR sees only roofs. The walls are drawn vertical from the roof edges to the ground. That
matches the photos for the SSE gable, the recess and the long façades, but any set-backs, canopies or
entrances at street level are not modelled. The low wings around the tower remain the generic OSM
building (`relation/1356564`, 7 m, height estimated by the map import): the LiDAR shows them at
13–25 m RH2000 (≈ 1–13 m above the ground), so they are partly lower and partly higher than drawn.
Outside this phase.

## 4. Rooftop plant and mast

The plant boxes are the LiDAR clusters (≥ 50.2 m), their tops and extents as measured. At
1.2 points/m², small units show as one or two returns and are drawn as 1 m boxes (estimate). The mast
(to 64.12 m) is a 0.4 m square shaft (estimate). The photos show several thinner antennas that the
LiDAR does not resolve; they are not drawn.

## 5. Measurement uncertainty

- Heights ±0.1–0.2 m (hard roofs). The parapet 49.35 m is the edge returns' 90th percentile. D1's
  49.5 m included plant returns near the gable, so the sign hangs 0.15 m lower than a 49.5 m
  parapet would put it.
- D1's corrected gable width (9.3 m, the scale of the emblem) and D1b's drawn gable (9.06 m) come
  from different percentile choices on the same returns; the 0.24 m difference is within the edge
  allowance.
- Walls ±0.5 m: percentile extents + 0.25 m (estimate).
- The UPPER axis (163.71°) differs from D1's whole-roof axis (165.6°) by 1.9°. The across-extents
  per 4 m slice show no drift, so the UPPER axis is the right one for the slab.
- The rendered ground under the tower (DTM mesh, 12.18 m) is 0.4 m above the LiDAR ground in front
  of the gable (11.74 m, 5–25 m out). The walls stop at the rendered ground, so nothing floats.
