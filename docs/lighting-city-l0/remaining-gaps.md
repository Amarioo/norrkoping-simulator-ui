# Phase L0 — remaining gaps, uncertainties and next decisions

## 1. For the owner to decide (before or during L1/L2)

| Question | Recommendation | Why |
|---|---|---|
| **Private site lighting** (industry, port, retail parking, 313 km `dark-private-service`) — model it? | Yes, as a later, separate slice ("L2d"), with its own label | The satellite's brightest disagreements are exactly these areas (Marbystrand/Lindö port, Ingelsta, Slottshagen, Sylten). The municipal guideline does not cover private land, so it must not be presented as street lighting. |
| **71 empty slots inside A1–A3 zones** (Norrtull 2, Matchgatan 11, Skvallertorget 5, Tyska torget 3, …) | Fill them in L2 as seam work, without moving existing fixtures | They are lit by the rule (or by tag/gap fill) but have no fixture today. Tyska torget was deliberately excluded in A1; confirm it should now be lit. |
| **Overflow policy** (18 cells > 16 lamps) | Decide in L1, after kerb placement | Centreline stations on parallel ways (dual carriageways, separate cycleways) inflate counts; real kerb placement may remove most overflows. |

## 2. Known limits of the rule

- **Tätort ≠ lighting boundary.** A statistical built-up area can include unlit pieces and exclude lit
  approach roads (e.g. lit links between Norrköping and Åby are only lit if tagged).
- **Park paths.** The map's `grass` class mixes parks and road verges, so only `wood` (forest) is used
  as "dark park/forest"; paved footways through open parks are lit by the rule. The guideline allows
  park paths to stay dark; real practice varies per park.
- **`highway=path`** is dark unless paved and designated — this may under-light some shared paths.
- **Motorways:** untagged E4 pieces are dark (13.5 km); 33 km of motorway is explicitly `lit=no`.
- **Junction rule distance** (±50 m) and the "beside a street" test (≤ 12 m for ≥ 70 % of the length)
  are this project's parameters, not from the guideline.
- **Stations are preliminary:** on the way centreline, per lit range, Step 6 spacing; no kerb side,
  building/water/rail exclusions, bridge decks or seams. Pedestrian areas get stations along their
  outline. Counts for dual carriageways and parallel paths may be high.
- **Satellite:** 2016, visualised and saturated in the core (210 of 1 265 pixels at 255), so it can
  only separate town from outskirts, not streets inside the core. A calibrated product (VNP46A4, needs
  an Earthdata account the user would create) or SDGSAT-1 (10 m, registration, terms unverified) would
  be sharper.
- **Districts** are nearest-place-name approximations.

## 3. Data still missing (unchanged)

| Gap | Effect | What would close it |
|---|---|---|
| Municipal lighting-point register | all non-OSM positions are estimates | request drafted in `docs/step62/data-sources.md` (not sent) |
| Mapped OSM lamps | only 25 in the whole map | OSM mapping or the register |
| Photometry, mounting heights, switching (guideline mentions dimming 22–05) | type table and `solar-night` only | municipal technical documents |
| Current state of tags | snapshot 2026-10-24 | re-fetch = new snapshot (new hash) |

## 4. What L0 did not touch

No runtime data, renderer or app code; no earlier fixture, zone, extract or evidence file. The
existing Step 6.2 snapshot stays pinned for A1–A3; the L0 snapshot is separate.
