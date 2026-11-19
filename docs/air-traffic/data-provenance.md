# Air traffic — data provenance

Machine-readable copy: [air-traffic-provenance.json](air-traffic-provenance.json). Code: backend
`internal/sim/airtraffic.go` (every value below is a constant at its top), this repository
`src/lib/transportModels.ts` (drawing), `src/lib/flights.ts` (names and limits).

The flights are **fictional**: no airline, timetable, procedure or traffic data of either airport is used,
and none is claimed. What comes from data is where the pavement is. Everything about how the aircraft move
on and above it is an estimate, and is labelled so below and in the code.

## Source data

| Dataset | Used for | Source and licence | Acquired | Accuracy |
|---|---|---|---|---|
| Runways (start, end, width) of ESSP and F13 | Where aircraft roll, touch down and lift off | OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0; snapshot in `src/lib/data/norrkoping-map.json` and the backend's `transport-network.json`, written by `scripts/import-norrkoping.mjs` | Overpass query of 2026-10-16T13:35:36Z | Not stated by the source. Volunteer mapping from aerial imagery, typically a few metres; no survey. Runway width is the mapped `width` tag, or 35 m where it is missing |
| Taxiways: ways 101516378 (ESSP), 104336417 and 104336403 (F13) | The ground path: the one-way loop at each threshold | same | same | same |
| Building footprints | Check that no ground path runs through or touches a building ([data/clearance.json](data/clearance.json)) | same | same | same |
| Terrain heights (`terrain.json` in the backend) | Height of an aircraft on the ground: 0.25 m above the terrain, as the single shuttle (`PlaceLegacy(x, z, 0.1, 0.09)`) | Markhöjdmodell Nedladdning © Lantmäteriet, processed, CC BY 4.0 (see `ELEVATION.md`) | See `ELEVATION.md` | See `ELEVATION.md` |

Bråvalla F13 is a closed air base; its runway and taxiways are mapped as disused. That aircraft fly there at
all is the simulator's fiction, as before this phase.

## Coordinates

Nothing is converted in this phase. The backend reads the runway and taxiway points in scene coordinates as
the importer wrote them, and the aircraft positions it sends are in the same system:

- **Scene coordinates:** local SWEREF 99 TM (EPSG:3006). `scene = (SWEREF 99 TM − origin) / (25 · 0.9996584126)`,
  X east, Z south, Y up; one unit is 25 m on the ground. The origin and the vertical reference (RH2000, minus a
  vertical origin, 25 m per unit) are those of `src/lib/terrain.ts`; see `README.md`, section *Koordinatsystem*,
  and `ELEVATION.md`.
- **Runway coordinates** (used inside `airtraffic.go` and in the figures of the report): distance along the
  runway from the take-off threshold, and distance to the side. A linear change of axes of the scene's
  X and Z; no datum or projection is involved.
- **Levels** (cruise 12 and 8, approach fix 6) are scene Y, i.e. height above the vertical origin, not above
  the ground below. The terrain at the two runways is at about 0.1 (ESSP) and 1.1 (F13) units.

## Derived data

| File | What | How to rebuild |
|---|---|---|
| [data/geometry.json](data/geometry.json) | Ground path of each runway (from the end of the landing roll, back along the centre line, round the loop to the threshold), path marks, flight tracks, times and the timetable | Backend: `AIR_GEOMETRY_OUT=<file> go test ./internal/sim -run TestWriteAirTrafficGeometry`. Deterministic: two runs give the same SHA-256 (in the JSON copy) |
| [data/clearance.json](data/clearance.json) | Nearest buildings to each ground path and the room beside a wing tip | `node scripts/air-traffic/clearance.mjs docs/air-traffic/data/clearance.json` |
| [data/fleet-runs.txt](data/fleet-runs.txt) | Six simulated hours for each fleet size and three step lengths: flights, aircraft in the air, closest pair, longest wait | Backend: `go test ./internal/sim -run "KeepsEveryFleet|TimetableKeeps" -v` |

The ground path is the mapped taxiway points joined in driving order, with each corner sharper than 20°
replaced by a curve that cuts at most 0.8 units (20 m) off it. Between 1 unit past the runway exit and 1 unit
before the threshold it is never more than 0.2 units (5 m) from the mapped line (tested).

## Estimates (ESTIMATE; none is a measured procedure of either airport)

| Value | Estimate | Why |
|---|---|---|
| Which taxiways form the loop | The mapped loop at each take-off threshold; at F13 the two ways that keep clear of the mapped buildings (way 104336414 runs through two of them) | The only mapped one-way circuit at each airport. The terminal apron at ESSP has one link to the runway, shared by both directions |
| Runway direction | Take-off and landing in the direction of the mapped runway line, always (09 at ESSP) | As the single shuttle. No wind, no runway change |
| Hold line / runway vacated | 2.0 units (50 m) from the centre line | Visual. Real holding positions lie further from a runway of this size; the distance was not looked up for this phase |
| Queue spacing | 1.6 units (40 m) nose to nose | The drawn aircraft is 23 m wide |
| Taxi speed; back along the runway | 0.4 units/s (10 m/s); 0.7 (17.5 m/s) | Plausible for a turboprop; not from an operator |
| Turn on the spot | 20°/s | Visual |
| Time in the queue before asking to leave | 45 s (10 s for an aircraft that starts there) | Stands in for a turnaround; no passengers are modelled |
| Take-off roll | 35 s, lift-off at 2.2 units/s (55 m/s) after 38.5 units (960 m) | Roll time as the single shuttle |
| Climb | 0.36 units/s (9 m/s) at 2.2 units/s forward | Typical turboprop climb rate |
| Cruise | 2.55 units/s (64 m/s); turns of 20 units (500 m) radius | The speed is chosen so that four flights fit one round of the timetable. The radius is a tight circuit turn (about 40° of bank at that speed); the drawn bank follows the single shuttle's rule and stays below 20° |
| Cruise levels | 12 units (300 m) from ESSP, 8 units (200 m) from F13 | The single shuttle flew 8. Separated because the tracks cross west of ESSP |
| Approach | From 6 units (150 m) at the fix; 0.22 units/s down (5.5 m/s) at 2.5 units/s forward (62.5 m/s), about 5° | Steeper than a 3° approach, so that the turn onto it stays over the mapped area west of F13 |
| Touchdown point; landing roll | 12 % of the runway; 20 s, 25 units (625 m) | Touchdown point as the single shuttle |
| Runway free before a touchdown | 20 s (+ 8 s slack in every prediction) | Visual separation, not a rule |
| Holding circle | 24 units (600 m) radius, right-hand, at the approach fix | Not flown in normal running |
| Timetable period | 176 s, computed from the times above | See the report |

## What is not data

No municipal, airport-operator or LFV data, no AIP procedures, no ADS-B or other traffic feed, no schedule.
Aircraft ids `NK-01` … `NK-06` are invented.
