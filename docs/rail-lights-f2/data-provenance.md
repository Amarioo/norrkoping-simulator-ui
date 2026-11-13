# Vehicle Lights Phase F2 — data provenance

**What this is:** headlights, tail lights and a dipped-beam light cone for the *simulated* trams and
trains, reusing Phase F1 ([../vehicle-lights-f1/data-provenance.md](../vehicle-lights-f1/data-provenance.md)).
**No new dataset was added.** Every lighting value is an **estimate** or a **perceptual
calibration** taken over from F1; vehicle positions come from the simulation, not from real traffic
or timetables. Machine-readable version: [rail-lights-provenance.json](rail-lights-provenance.json).

## Inputs

| Input | Source | Licence | Date | Kind | Accuracy |
|---|---|---|---|---|---|
| Positions, headings and pitch of every tram and train section | simulation backend (`norrkoping-simulator-backend`, unchanged), smoothed per frame by [`publicTransport.ts`](../../src/lib/publicTransport.ts) | project code | runtime, nothing stored | simulated | simulated traffic |
| Lamp positions | the drawn tram and train models in `publicTransport.ts` (geometry unchanged by F2) | project code | read 2026-11-13 | derived from our own generic models | equal to the drawn lenses (unit test) |

Lamp position used for the beam (metres from the centre of the **leading section**, +z forward):
tram front 3.145 / height 0.84; train front 9.835 / height 0.84. The beam starts 0.1 m in front of
that, at the middle between the two lamps (one emitter per vehicle), and the lamp follows the
section's pitch on a gradient.

## Estimates (labelled as such in the code)

| Value | Used | Basis |
|---|---|---|
| Beam intensity, shape, reach, colour | the F1 values unchanged: 30 000 cd, ±40° wide, dark above ≈ +2°, 60 m, warm-neutral white | a generic *road-vehicle* dipped beam. No photometry of Norrköping's trams or of the X61 train was used. A real train's main beam reaches much further |
| Lens glow | +3.2 (headlamps) / +2.2 (tail lamps) emissive at full night; day values unchanged | the F1 values; visual tuning, not photometry |
| Lamp arrangement | two white lenses in front, two red behind, as the models were already drawn | the existing generic models; the real front signal (for example a third, upper headlamp) was not researched and is not drawn |
| Which vehicles cast light | the 16 nearest the camera within 600 m, all vehicle kinds together | the F1 rendering budget |

**Day/night switching:** as F1, with the street lighting. By day nothing is lit; real trams and
trains run with headlamps on by day too. This is a simplification.

**Not invented:** vehicle types or fleet numbers, real photometry, timetables, switching schedules,
the real lamp arrangement.

## Coordinates

Unchanged from F1. Scene units: `x = (E − 569030) / (25 × 0.9996584126)`,
`z = (6494989 − N) / (25 × 0.9996584126)`, x east, z south (EPSG:3006, SWEREF 99 TM); scene
y = RH2000 height / 25, on the rail top of [`trackProfile.ts`](../../src/lib/trackProfile.ts). A
heading of 0 points along +z (scene south); forward = (sin h, cos h). Pitch is nose-up positive, in
radians. The shader converts scene units to metres with 25 m per unit (without the 0.99966 grid
factor: ≤ 0.03 % on distances, irrelevant for a 60 m beam).
