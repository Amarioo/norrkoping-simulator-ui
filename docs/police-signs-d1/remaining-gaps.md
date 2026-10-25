# Police Signs D1 — remaining gaps

D1 puts the one documented police sign — the emblem on the tower's SSE gable — at its photographed
size and position, and lights it at night. What is not done, not known or only estimated:

## 1. Whether and how the emblem is lit at night (estimate)

No night photograph or description of the sign was found (Commons, Hemsö, Polisen, a web search on
2026-10-25). The glow is an **estimate** the roadmap asks for: the emblem's own colours as an
emissive map, gain 1.1 × the street lighting's night level (`env.artificial`), off by day. It casts
no light on the façade (no spill): with no evidence of a floodlight or a light box, adding a façade
light pool would be invention. If a night photo turns up:

- a light box / backlit emblem → keep the self-lit material, tune `NIGHT_GAIN` to the photo;
- a floodlit relief → lower the self-glow and add a small spill in the existing shader patch
  (`src/lib/lighting/cityLights.ts`) with a fixed uniform budget, as F1 did — no three.js lights,
  no new programs;
- not lit at all → set `NIGHT_GAIN` to 0 (the sign then darkens with the wall).

## 2. Luntgatan 32 (police reception since 2026-01-26)

Polisen's notice of 2026-01-19 moves the **reception** to Luntgatan 32; the station (Stinsen 1,
Stockholmsvägen 4–6) stays. The new reception's entrance, façade and any "POLIS" sign are not
documented in a usable source (Polisen's page shows a red brick building without saying which), and
the address is not modelled as a separate building. Not in D1. What would settle it: a dated
photograph of the Luntgatan 32 entrance showing the sign (size, height, face), and the building's
OSM footprint.

## 3. The drawn police tower does not match the real one

The tower the sign hangs on is the earlier illustrative model (`src/lib/mapLandmarks.ts`), unchanged
by D1. Compared with the LiDAR (`data/police-tower-lidar.json`):

| | Drawn | Measured | Difference |
|---|---|---|---|
| Height (parapet above the ground in front) | 48.75 m above the tower base | ≈ 37.7 m (49.5 − 11.84 m RH2000) | ≈ +11 m |
| Length × width | 66.25 × 12.75 m | 54.4 × 13.4 m (+≤ 1 m edge bias) | +12 m long, −1 m narrow |
| Centre | scene (−29.25, −26.22) | scene (−28.9855, −26.0032) | 8.6 m (drawn is NW of real) |
| Long axis | bearing 164.1° | 165.6° | 1.5° |
| Gable cladding | dark grey `#40515a` | dark (near-black) since the 2018 re-cladding | colour fine |

Because of this, the sign keeps its real size and real distance below the parapet (10.9 m), not its
real RH2000 height (≈ 38.6 m; on the drawn tower it hangs ≈ 10 m higher in absolute terms). Fixing
the tower (a measured model like B1's town hall) is a separate step; the sign would then move with
the tower group automatically (`TOWER_MODEL`).

## 4. Other signs not found

No "POLIS" lettering on the tower or at the Stockholmsvägen entrance appears in any inspected photo
(2008, 2016, 2018, Hemsö 2023): the entrance shows a white free-standing way-finding sign
("ENTRÉ"), unreadable otherwise. The NNW gable was not photographed in any source found: whether it
carries a second emblem is **unknown**, so nothing is placed there.

## 5. Measurement uncertainty

- Size ±0.3 m, height below the parapet ±1 m: one near-frontal photograph at 1024 × 768 (≈ 0.09 m
  per pixel), scaled by the LiDAR roof width (13.4–14.4 m because of sparse edge returns).
- The sign's construction and depth are unknown; it is drawn as a flat surface 0.25 m in front of
  the wall (estimate).
- The artwork is Polismyndigheten's current vector emblem; the physical sign is an older rendering of
  the same emblem (slightly different wreath and crown drawing in the photos).
- The emblem in the 2008/2016 photographs appears somewhat larger relative to the gable (≈ 4.2–4.9 m
  wide); those photos are close and steep, and the sign may have been replaced in 2018. The 2023
  photo (after the re-cladding) is used.
