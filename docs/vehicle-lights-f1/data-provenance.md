# Vehicle Lights Phase F1 — data provenance

**What this is:** headlights, tail lights and a dipped-beam light cone for the *simulated* cars,
trucks and buses. **No new dataset was added.** Every lighting value below is an **estimate** or a
**perceptual calibration**; vehicle positions come from the simulation (not real traffic). Machine-
readable version: [vehicle-lights-provenance.json](vehicle-lights-provenance.json).

## Inputs

| Input | Source | Licence | Kind |
|---|---|---|---|
| Vehicle positions and headings | simulation backend (`norrkoping-simulator-backend`, unchanged), smoothed per frame by the vehicle models | project code | simulated |
| Lamp positions on the vehicles | the drawn models: [`transportModels.ts`](../../src/lib/transportModels.ts) (compact, estate, truck), [`publicTransport.ts`](../../src/lib/publicTransport.ts) (bus) | project code | derived from our own generic models |

Lamp position used for the beam (metres, vehicle frame, +z forward): compact front 2.07 / height 0.82,
estate 2.42 / 0.82, truck 5.38 / 0.93, bus 6.09 / 0.84. The beam starts 0.1 m in front of that, at
the middle between the two lamps (one emitter per vehicle).

## Estimates (labelled as such in the code)

| Value | Used | Basis |
|---|---|---|
| Peak intensity, both lamps | 30 000 cd | typical order of magnitude of a dipped-beam hot spot (≈ 2 × 15 000 cd); no vehicle model, no regulation table, no compliance claimed |
| Beam shape | horizontal ±40° outer / ±15° full; dark above ≈ +2°; little light just in front of the bumper | generic European dipped beam; symmetric (real beams light the kerb side further) |
| Reach | 60 m (smooth fade) | typical useful reach of dipped beams |
| Colour | linear RGB (1, 0.95, 0.86) | between halogen and LED |
| Screen brightness | existing street-light calibration (0.035 per lux), unchanged | Step 6 perceptual calibration |
| Lens glow | +3.2 (headlamps) / +2.2 (tail lamps) emissive at full night; day values unchanged | visual tuning, not photometry |

**Day/night switching:** the lights follow the same night level as the street lighting
(`env.artificial`). In reality Swedish traffic rules require dipped beams or daytime running lights
whenever a vehicle is driven; the day state here (no beam, lenses as before) follows the F1 brief and
is a simplification.

**Not invented:** vehicle makes, real photometry, fleet or registration data, switching schedules.

## Coordinates

Scene units as in the earlier phases ([../lighting-city-l2/data-provenance.md](../lighting-city-l2/data-provenance.md)):
`x = (E − 569030) / (25 × 0.9996584126)`, `z = (6494989 − N) / (25 × 0.9996584126)`, x east, z south
(EPSG:3006, `SCENE_REFERENCE`); heights relative to the rendered RH2000-based ground. A vehicle's
heading 0 points along +z (scene south) and its forward vector is (sin h, cos h), the same convention
as the vehicle models. The shader converts scene units to metres with `metresPerUnit` (25, without the
0.99966 grid factor: ≤ 0.03 % on distances, irrelevant for a 60 m beam).
