# Aircraft Lights Phase E2 — data provenance

Machine-readable copy: [e2-provenance.json](e2-provenance.json). Code: `src/lib/lighting/aircraftLights.ts`
(model, every value below), `src/lib/lighting/aircraftLightsView.ts` (drawing),
`src/lib/transportModels.ts` (lenses on the model).

E2 uses **no geodata**: nothing is placed in EPSG:3006 or scene coordinates by itself. Every light
sits in the aircraft's own model frame and follows the drawn body's object transform (see
"Coordinates" below). The simulated aircraft (`NK-01`) is a **fictional shuttle**
(`RegionalFlight.kt`, backend, unchanged): no real type, operator or airframe documentation exists, so
everything airframe-specific is an estimate.

## Sources (regulations; accessed 2026-11-06)

| Source | What it gives | Used for |
|---|---|---|
| EASA CS-25 Amendment (Easy Access Rules for Large Aeroplanes), [CS 25.1385](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-large-aeroplanes-cs-25?page=44) (b), (c) | Forward position lights: red on the left, green on the right; rear position light white, as far aft as practicable | Colours and sides (**source**) |
| same page, CS 25.1387 (b)–(d) | Dihedral angle L: from dead ahead to 110° left; R: the same to the right; A: between planes 70° left and right of dead astern (140° in all; "140°" is our sum, the text gives the two 70° planes) | Horizontal sectors of the three position lights (**source**) |
| same page, CS 25.1395 | Maximum intensities beyond a sector boundary, in candela (red/green: 10 cd at 10–20° beyond = Area A, 1 cd further = Area B; white rear: 5 cd / 1 cd); no limit in the first 10° | Bounds for the overlap curve (the curve itself is an **estimate**, below) |
| same page, CS 25.1401 (b)–(d) | Anti-collision system: aviation red or aviation white; effective flash frequency 40–100 cycles per minute; coverage at least 75° above and below the horizontal in each direction | Allowed range for the flash periods; colours (**source**); the chosen periods are **estimates** |
| [SERA.3215](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-standardised-european?erules-id=ERULES-1963177438-9863) (Reg. (EU) No 923/2012 as amended by 2016/1185) | (a) at night in flight: anti-collision and navigation lights; (b)(1) at night on the movement area: navigation lights, (b)(4) engines running shown by lights; (c) in flight by day: anti-collision lights if fitted; (d) on the movement area by day: (d)(1) anti-collision, (d)(2) engines-running lights; (e) the pilot may switch off or dim flashing lights against dazzle. No rule for landing or taxi lights (GM1 only says landing lights *may* be used in addition) | The flight-phase rule (a **simulator rule** informed by SERA.3215, not an airline SOP) and the day decision |

Cross-check: 14 CFR 25.1387 (Cornell LII) gives the same dihedral angles.

## Estimates (all labelled ESTIMATE in the code)

| Value | Estimate | Why / bound |
|---|---|---|
| Socket positions (11 lights) | Read from the drawn model: wing tips x = ±11.6 m, y 2.9 m; tail cone z = −9.6 m; beacons on top / under the fuselage at z = −1.2 m; landing lights in the wing leading edge at x = ±5 m; taxi light on the nose gear | No airframe documentation; positions typical of a twin turboprop |
| Overlap beyond a position-light boundary | 100 % up to 8°, ramp to 10 % at 10°, 10 % to 18°, ramp to 0 at 20°, nothing beyond | Within CS 25.1395: no limit in the first 10°, small caps beyond; a real lamp's spill is unknown |
| Vertical spread of position lights | Not modelled (all elevations) | Real lights fade towards the vertical |
| Beacon flash | 50 cycles/min (1.2 s), 0.15 s pulse, single pulse, top and bottom beacon together | Inside 40–100 cycles/min (CS 25.1401(c)); type pattern unknown |
| Strobe flash | 55 cycles/min (60/55 s), 0.08 s pulse, single pulse, all three strobes together | Same range; whether the type uses single or double pulses is unknown |
| Flash phase | FNV-1a hash of `id + '|beacon'` / `'|strobe'` × period | Deterministic, aircraft not synchronised; no real data exists |
| Landing beam | Full within 12° of the axis (5 % below the horizontal), fading to 0 at 40° | Visual only, no photometry |
| Taxi beam | Full within 25°, fading to 0 at 60°, axis 10 % below horizontal | Visual only |
| Glow colours | Red (1, 0.06, 0.04), green (0.08, 1, 0.42), white (1, 0.96, 0.9), strobe and landing lights brighter than 1 | Perceptual, not chromaticity-matched to the aviation colour boundaries |
| Glow size | 1.3 m quad, at least 3 px (position lights, beacons); 4 m, at least 6 px (landing, taxi, strobes) | As the airport lights (0.9 m), slightly larger; the strong lights larger so they read as glare |
| Day level of flashing lights | 65 % of the night glow | Perceptual; SERA.3215(c)/(d) require anti-collision lights by day |
| Lens glow at night | Day emissive 0.4 + 3 × night level (steady lenses), + 3 × flash (beacon lens) | Perceptual, as the vehicle lenses of F1 |

## Simulator rule: lights per flight phase

Phases from `RegionalFlight.kt`. Not an airline SOP.

| Phase | Navigation | Beacon | Strobes | Landing | Taxi |
|---|:-:|:-:|:-:|:-:|:-:|
| PARKED | on | on | – | – | – |
| TAXI_OUT | on | on | – | – | on (gear down) |
| TAKEOFF | on | on | on | on | – |
| CLIMB | on | on | on | on | – |
| CRUISE | on | on | on | – | – |
| APPROACH | on | on | on | on | – |
| LANDING | on | on | on | on | – |
| TAXI_IN | on | on | – | – | on (gear down) |

Why: the model's propellers turn in every phase (also PARKED), so the engines count as running and the
beacon is on throughout (SERA.3215(b)(4), (d)(2)); strobes are off while taxiing (allowed by (e)
against dazzle, and common practice); landing and taxi lights are not regulated by SERA.3215, so their
use here is this simulator's choice.

**Day decision:** the lights are switched by phase day and night alike (anti-collision lights are a
day requirement, SERA.3215(c)/(d)). What is *drawn* depends on the light level: steady glows (position,
landing, taxi) scale with the street lighting's night level (invisible in full daylight, the lenses
still show their colour); flashing glows (beacon, strobes) are drawn by day at 65 % (estimate).

## Coordinates

- Model frame (metres, `transportModels.ts`): +z forward (nose), +y up (gear contact y = 0), **+x =
  the aircraft's left** (right-handed: left = up × forward). Verified by projection through the real
  model transform for all headings (15° steps), banks ±0.35 rad and pitches ±0.12 rad, from behind and
  from in front (`aircraftLights.test.ts`), and in the running app (evidence, e2e).
- World: the drawn body's object matrix this frame (`airplane.matrixWorld`: smoothed position,
  rotation `(-pitch, heading, bank, 'YXZ')`, scale 1/25), i.e. scene units of 25 m, origin and axes as
  the rest of the scene (documented in `docs/coordinate-migration/`). No separate conversion.
- Found and fixed: **the drawn model had the wing-tip lenses the wrong way round** (red at −x = the
  right wing tip, since before E2). Now red is on the left tip.

## Time

Flash timing runs on the **simulation clock**: the backend's `simulationTime` (published 10 times per
real second), interpolated between snapshots at the time scale (at most 0.25 real seconds ahead),
held when paused, never backwards except after a reset. Each frame shows the share of the frame's
simulation-time window in which the light was on, so no pulse is skipped at time scale 20.
