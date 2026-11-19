# Air routes and aircraft types — data provenance

Machine-readable copy: [air-routes-provenance.json](air-routes-provenance.json). Code: backend
`internal/sim/airtraffic.go` (`airVias`, `airKinds`, `airObstacles`, `insideMap`), this repository
`src/lib/aircraftTypes.ts` (measures and light positions), `src/lib/jetModel.ts` (the drawn jet).

The flights are still **fictional**. What this phase takes from sources is which aircraft types have flown
from Norrköping, how large those types are, and where the mapped area ends. The routes, the liveries and
every proportion of the drawn models beyond the published measures are estimates or inventions, and are
labelled so here and in the code.

## Source data

| Dataset | Used for | Source and licence | Acquired | Accuracy |
|---|---|---|---|---|
| Outline of the mapped area (`meta.clip` of `transport-network.json` and of `src/lib/data/norrkoping-map.json`) | The limit no flight may cross | Written by `scripts/import-norrkoping.mjs` from the import's bounding box 58.555–58.650 N, 16.065–16.295 E, in scene coordinates; map data © OpenStreetMap contributors, ODbL 1.0 | Overpass query of 2026-10-16T13:35:36Z | Exact: it is the edge of the data the simulator has, not a measured feature |
| Runways and taxiways | As in the first air traffic phase ([../air-traffic/data-provenance.md](../air-traffic/data-provenance.md)) | OpenStreetMap, ODbL 1.0 | same | Not stated; typically a few metres |
| Building footprints (ways 104336425 and 104336441 at Bråvalla) | The two points the ground path bends away from; the clearance check | OpenStreetMap, ODbL 1.0 | same | same |
| Which operators and types fly from Norrköping | The choice of types | Norrköping Airport's press room (tour operators Apollo, TUI and Ving; TUI's 2026 programme) [1][2]; CAPA (TUI fly Nordic's summer 2026 charters from Norrköping) [3]; Wikipedia, *TUI fly Nordic* (fleet: Boeing 737 MAX 8) [4]; airportroutes.com (an A21N, Airbus A321neo, on Norrköping–Rhodes, activity dated October 2025) [5] | Read 2026-11-19 | Secondary sources. They show that a 737 MAX 8 operator and an A321neo have flown charters from Norrköping; they do not give a timetable, and none was used |
| Aircraft measures | Size of the drawn jets, the queue spacing and the wing room | Overall length, wing span and tail height as published for the types and repeated by the comparison pages read [6][7][8] | Read 2026-11-19 | See the table below: two figures for the 737 MAX 8 differ between the pages; wheel track and wheelbase were not confirmed |

1. https://www.mynewsdesk.com/se/norrkopingflygplats/latest_news
2. https://www.mynewsdesk.com/se/norrkopingflygplats/pressreleases/apollos-satsning-fraan-norrkoeping-aer-en-stor-succe-3393262
3. https://centreforaviation.com/news/tui-fly-nordic-to-expand-charter-schedule-in-summer-2026-1329630
4. https://en.wikipedia.org/wiki/TUI_fly_Nordic
5. https://www.airportroutes.com/routes/ESSP-LGRP
6. https://planefyi.com/compare/boeing-737-max-8-vs-airbus-a320neo/
7. https://aerocorner.com/aircraft/a20n
8. https://www.airdatanews.com/which-is-bigger-boeing-737-max-8-or-airbus-a320neo/

### The types

| Id sent by the server | Name in the interface | Why it is in the list | Length | Span | Tail height |
|---|---|---|---|---|---|
| `TP` | Turbopropplan | The unnamed turboprop of the earlier versions. No type is claimed for it (it is about the size of a 34-seat turboprop: 19 m long, 23 m wide) | 19 m (model) | 23 m (model) | – |
| `B38M` | Boeing 737 MAX 8 | TUI fly Nordic's type, and TUI flies charters from Norrköping [1][3][4] | 39.52 m [6] (another page gives 39.12 m [8]) | 35.92 m [6][8] | 12.30 m [6] (12.45 m in [8]) |
| `A21N` | Airbus A321neo | Recorded on Norrköping–Rhodes [5] | 44.51 m | 35.80 m | 11.76 m |
| `A20N` | Airbus A320neo | **Asked for by the user** as an example of a larger aircraft. No source read for this phase shows one at Norrköping | 37.57 m [6][7] | 35.80 m [6][7] | 11.76 m [8] |

Wheel track (7.59 m Airbus, 5.72 m Boeing), wheelbase (12.64 m, 16.90 m, 15.60 m) and fuselage width
(3.95 m, 3.76 m) are the figures of the manufacturers' airport-planning documents **as remembered**; the
pages read for this phase did not confirm them. They only place the wheels and set the thickness of the
drawn fuselage.

## Coordinates

Nothing is converted in this phase. Route points, the map outline and the obstacle points are scene
coordinates: local SWEREF 99 TM (EPSG:3006), `scene = (SWEREF 99 TM − origin) / (25 · 0.9996584126)` with the
origin at E 569030, N 6494989; X east, Z south, Y up; one unit is 25 m. Levels are scene Y (RH2000 minus the
vertical origin of `src/lib/terrain.ts`, which is 0), not height above the ground.

Aircraft models are drawn in metres in their own frame (+z forward, +y up, wheels at y = 0, +x the
aircraft's left) and placed at 1/25, as the turboprop.

## Derived data

| File | What | How to rebuild |
|---|---|---|
| [data/geometry.json](data/geometry.json) | Ground paths, the three routes of each direction with length and speed, fixes, holding circles, the timetable, the map outline and the type list | Backend: `AIR_GEOMETRY_OUT=<file> go test ./internal/sim -run TestWriteAirTrafficGeometry`. Deterministic: two runs give the same SHA-256 (in the JSON copy) |
| [data/clearance.json](data/clearance.json) | Nearest buildings to each ground path for the widest wing | `node scripts/air-traffic/clearance.mjs docs/air-routes/data/clearance.json docs/air-routes/data/geometry.json 17.96` |
| [data/fleet-runs.txt](data/fleet-runs.txt) | Route lengths and speeds; six simulated hours per fleet size and step length | Backend: `go test ./internal/sim -run "KeepsEveryFleet|TimetableKeeps|UsesTheMapped" -v` |
| [evidence/route-map.svg](evidence/route-map.svg), `.png` | The routes against the map outline | `node scripts/air-routes/route-map.mjs <out.svg> [out.png]` |

## Estimates and inventions

| Value | Estimate | Why |
|---|---|---|
| The routes (`airVias`) | From Norrköpings flygplats: direct; north through (−20, −150) and (−150, −25); south through (0, 110) and (−170, 40). From Bråvalla: direct; north through (−70, −150) and (0, −40); south through (−110, 20). Scene x, z | **Invented.** No published procedure of either airport is behind them. Chosen to pass over, north of and south of the city, to stay inside the map, and to keep the detour on the short leg small enough to fly in the same time |
| Speed on a route | Its length divided by the cruise time of its direction: 2.55 to 2.92 units/s (230–263 km/h) from Norrköpings flygplats, 2.55 to 3.30 (230–297 km/h) from Bråvalla | So that every flight between the airports takes the same time, and the runway rules and the timetable stay as they were |
| Margin to the edge of the map | 2 units (50 m) | Visual |
| Turn radius | 20 units (500 m), as before | – |
| Queue spacing | 2.4 units (60 m) nose to nose, was 1.6 | The longest type is 44.5 m |
| Room beside a building | 0.8 units (20 m) from the path's centre; the path bends up to 0.33 units (8 m) off the mapped centre line at Bråvalla | The widest half span is 18 m. The taxiway is 18 m wide, so there the outer main wheels run about 3 m outside the mapped pavement |
| Which type an aircraft is | Drawn with equal chance from the four when it appears; stays with the aircraft | "Randomise the aircraft" |
| Flight behaviour per type | None: all types taxi, roll, climb and fly alike | A 737 or an A321 needs more runway and flies faster than the turboprop; not modelled |
| The drawn jets | Proportions of the type family: wing leading edge 36 % of the length from the nose, 25° of sweep, 5° of dihedral, engines 5.75 m out, tip device 2.4 m tall | Not read from drawings |
| Light positions on the jets | At the drawn wing tips, tail cone, top and belly, wing roots and nose gear | From the model, as for the turboprop |
| Liveries | Petrol blue (A320neo), brick red (A321neo), mid blue (737 MAX 8) fin, engines and wing tips on a white aircraft | **Invented.** No airline's colours, name or logo is drawn |

## What is not data

No timetable, no airline schedule, no AIP procedure, no traffic feed. That TUI, Apollo and Ving sell charters
from Norrköping is used only to choose plausible types; the simulated aircraft belong to no airline, and
Bråvalla has no traffic in reality.
