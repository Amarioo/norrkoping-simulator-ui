# Air routes and aircraft types (2026-11-19)

Board story `E4`. Requested by the user: alternative routes between the airports ("one can go north and
some through the city as today"), aircraft only inside the bounds of the map ("not fly outside, disappear
and come back"), and randomised aircraft, "a little bigger would be fun, like the Airbus A320 and others
that perhaps fly from Norrköping (TUI flies large aircraft)".

Builds on [the first air traffic phase](../air-traffic/README.md). Changes in **both** repositories. Nothing
is committed in either.

## What it does

- **Three routes in each direction:** *över staden* (the direct one, as before), *norr om staden* and
  *söder om staden*. One is drawn at random for every flight. Picture:
  [evidence/route-map.png](evidence/route-map.png).
- **Always inside the map.** Every route, climb, approach and holding circle is checked against the outline
  of the mapped area when the traffic is created; a route that left it would stop the server from starting.
  In six simulated hours per fleet size no aircraft came nearer the edge than 255 m.
- **Four aircraft types, drawn at random** for each aircraft when it appears: the turboprop of before, an
  Airbus A320neo, an Airbus A321neo and a Boeing 737 MAX 8. The jets are drawn to their real length, span
  and tail height (37.6–44.5 m long, 36 m wide, against the turboprop's 19 × 23 m), each in an invented
  colour scheme, with their lights at their own wing tips, tail and nose.
- **The Flyg tab** shows the type and the route: "Airbus A320neo", "Norrköpings flygplats → Bråvalla F13, norr
  om staden", and in the list "A320neo · NRK → F13 norr om staden".

Sources and estimates: [data-provenance.md](data-provenance.md). Open points:
[remaining-gaps.md](remaining-gaps.md).

## Why these types

| Type | Reason |
|---|---|
| Boeing 737 MAX 8 | The type TUI fly Nordic flies, and TUI sells charters from Norrköping in 2026 |
| Airbus A321neo | One is recorded on Norrköping–Rhodes (October 2025) |
| Airbus A320neo | The user's example. No source read shows one at Norrköping; it is there because it was asked for |
| Turboprop | The aircraft of the earlier versions, kept; no real type is claimed for it |

The sources are secondary (the airport's press room, CAPA, Wikipedia, a route database) and are listed in the
provenance file. No timetable was used: the types say what could plausibly stand on the apron, not what
flies when. No airline's name, colours or logo is drawn.

## How it works

**Routes** (backend `airVias`). A route is the end of the climb, zero to two points, and the approach fix,
joined by turns of 500 m radius and straights. From Norrköpings flygplats the northern route passes through
(−20, −150) and (−150, −25) in scene coordinates and the southern through (0, 110) and (−170, 40); from
Bråvalla north through (−70, −150) and (0, −40), south through (−110, 20). The points are invented.

| From | Route | Length | Flown at |
|---|---|---|---|
| Norrköpings flygplats | över staden | 14.6 km | 230 km/h |
| | norr om staden | 16.7 km | 263 km/h |
| | söder om staden | 15.4 km | 242 km/h |
| Bråvalla F13 | över staden | 6.3 km | 230 km/h |
| | norr om staden | 7.6 km | 278 km/h |
| | söder om staden | 8.1 km | 297 km/h |

**Same time on every route.** A longer route is flown faster, so that every flight from an airport takes the
same time whatever its route. That is why the runway rules and the departure timetable of the first phase
did not have to change: they predict when a flight touches down, and that does not depend on the route.
The flight numbers are the same as before (243 flights in six hours with six aircraft, 2.4 in the air).
The price is that the speed depends on the route and not on the aircraft.

**Apart from each other.** Flights from Norrköpings flygplats cruise at 300 m, flights from Bråvalla at
200 m, as before. Wherever a route of one direction crosses a route, the climb or the approach of the other,
they are at least 100 m apart in height (tested for all route pairs). Aircraft of the same direction leave
at least 160 s apart and only meet again at the approach fix, in that order.

**Inside the map.** The importer's outline of the mapped area (`meta.clip`, a four-cornered shape) is now
read by the backend. A point counts as inside if it is inside the outline and at least 50 m from its edge.
The first air traffic phase already kept the direct routes inside; this phase makes it a rule that is
checked for everything that flies, and tested tick by tick.

**Types** (backend `airKinds`, interface `src/lib/aircraftTypes.ts` and `src/lib/jetModel.ts`). The server
draws a type for each aircraft and sends it; the type stays with the aircraft until it leaves the fleet. A
city draws from a new seed when it is created or reset, so the fleet differs from time to time. The
interface builds one jet model from the type's measures (fuselage, swept wing, tailplane, fin, engines under
the wings, tip devices, gear) and copies it per aircraft; a jet is ten parts, the turboprop fifty-five.

**Room for larger aircraft.** The queue now keeps 60 m between noses (was 40 m; the A321neo is 44.5 m long).
At Bråvalla a 36 m wing would have hit a building 13 m from the taxiway's centre line, so the ground path
there bends up to 8 m away from two buildings; the widest wing now passes 1.8 m from the nearest
([data/clearance.json](data/clearance.json)).

## Measured

Six simulated hours per fleet size and step length ([data/fleet-runs.txt](data/fleet-runs.txt)):

| Aircraft | Flights in 6 h | In the air on average | Nearest two on the ground | Nearest two cruising | Nearest the map's edge |
|---|---|---|---|---|---|
| 1 | 49 | 0.5 | – | – | 255 m |
| 2 | 98 | 1.0 | 869 m | 878 m | 255 m |
| 3 | 132 | 1.3 | 56 m | 178 m | 255 m |
| 4 | 168 | 1.7 | 56 m | 344 m | 255 m |
| 5 | 203 | 2.0 | 53 m | 510 m | 255 m |
| 6 | 243 | 2.4 | 53 m | 510 m | 255 m |

Every one of the six routes was flown in every run, also with a single aircraft. Nobody held in the air.
The nearest pair on the ground is one aircraft on each arm of a loop next to the runway; two of the widest
wings side by side need 36 m.

Cost: one tick of six aircraft is still 1 µs in the server. A jet is 10 draw calls against the turboprop's
55 (counted in a unit test), so a fleet with jets is cheaper to draw than the same number of turboprops; no
frame time was measured for this phase.

## Checks

| Check | Result |
|---|---|
| Backend `gofmt -l`, `go vet ./...` | clean |
| Backend `go test ./... -count=1` | pass (api 1.1 s, sim 31 s), including the frozen Kotlin reference traces, unchanged |
| `npm run check` | 0 errors, 0 warnings (2006 files) |
| `npm run build` | OK |
| `npm test` (Vitest) | 649 of 650. The one failure is `police.test.ts`, which failed the same way before this work |
| `npm run test:e2e` (Playwright), all 26 files | 46 of 47. The one failure: the test process itself crashed as it started the first test of `air-traffic` (Windows exit code 0xC0000409). The file run again alone: 4 of 4 |
| `npm run board:check` | OK |
| In the running app | The four types in the queue, a jet followed on a northern and a southern route, the list with type and route, a jet's lights at night: [evidence/](evidence/) |
| Reproducibility | `data/geometry.json` written twice: the same SHA-256 (`5f506c2d…`) |
| Earlier phases | `docs/air-traffic/` is unchanged, and its clearance check still reproduces; nothing under `src/lib/data`, `public` or the backend's `testdata` and `src/main/resources` is changed |

Not run: the backend tests with `-race`; a frame time measurement; the published build; a phone; the light
theme.

During the work the development server (Vite) crashed twice with the same Windows exit code while a script
polled the server through it ten times a second. `scripts/air-routes/shots.mjs` therefore takes the
backend's address as a third argument and asks it directly.

New and changed tests: backend `airtraffic_test.go` (every route inside the map, no tighter than the turn
radius and apart from the other direction; every aircraft inside the map at every tick; all routes flown;
types from the seed; the path's distance to the two buildings) — one earlier expectation was changed on
purpose: the ground path may now lie up to 10 m from the mapped loop at Bråvalla, was 5 m, because it bends
away from the buildings. Here `src/lib/airTraffic.test.ts` (3 new: the types' measures, a jet drawn to its
length, span and height, body and lights follow the type) and `tests/air-traffic.spec.ts` (type names in the
card and the list, route names, every sampled position inside the map outline).

## Files

Backend: `internal/sim/airtraffic.go`, `airtraffic_test.go`, `network.go` (reads `meta.clip`), `models.go`
(`type` and `route` on an aircraft), `city.go` (a seed per city and reset), `README.md`.

Interface: new `src/lib/aircraftTypes.ts`, `src/lib/jetModel.ts`, `scripts/air-routes/` (`shots.mjs`,
`route-map.mjs`); changed `src/lib/transportModels.ts`, `src/lib/lighting/aircraftLights.ts`,
`src/lib/lighting/aircraftLightsView.ts`, `src/lib/FreeCamera.svelte` (a jet is followed from twice as far),
`src/lib/city.svelte.ts`, `src/App.svelte`, `src/style.css`, `scripts/air-traffic/clearance.mjs` (takes a
geometry file and a wing span), `README.md`.

## Deploy order

The backend first: an interface from before this phase ignores `type` and `route` and draws every aircraft
as the turboprop. Then this repository, whose push to `main` publishes to production. With the new
interface and the old backend nothing breaks either: all aircraft are turboprops without a route name.
