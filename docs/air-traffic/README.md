# Air traffic — up to six aircraft that take turns on the runways (2026-11-18)

Board story `E3`. Requested by the user: "how do we add so that we can simulate up to 4 planes at the same
time? if 2 are in the air between the airports maybe the rest are in a queue to take off and taxi", then
"say up to 10?", and after the answer "six at most, three as the start value": "yes".

Changes in **both** repositories. Approved by the user on 2026-11-19, committed and pushed in both (backend
`af513e6`). The backend's rollout to the cluster is a separate step by hand.

## What it does

- One to six aircraft, `NK-01` … `NK-06`, shuttle between Norrköpings flygplats (Kungsängen) and Bråvalla
  F13. A new city starts with three. The number is a slider, *Flygplan*, under the existing switch
  *Flygtrafik mellan flygplatserna* in the *Trafik* tab.
- Each airport has one runway. Only one aircraft uses it at a time, and it is free 20 s before every
  touchdown. The others wait on the mapped taxiway loop beside the threshold: a landed aircraft turns on
  the runway, taxis back, goes round the loop and joins the queue; the first in the queue lines up and
  takes off.
- The *Flyg* tab lists every aircraft with what it is doing and where it is going. Choosing one shows it in
  the card above, and *Följ flygplanet* follows that one. Two new phases have names: *Köar till startbanan*
  (ready, waiting for the runway) and *Väntar i luften* (circling until the runway is free; a safety valve
  that does not occur in normal running).
- Every aircraft is drawn with its own lights; the beacons flash out of step with each other.

Pictures: [evidence/](evidence/). Sources and estimates: [data-provenance.md](data-provenance.md). Open
points: [remaining-gaps.md](remaining-gaps.md).

## What six aircraft look like

Six simulated hours per fleet size, backend test `TestAirTrafficKeepsEveryFleetApartAndMoving`
([data/fleet-runs.txt](data/fleet-runs.txt)):

| Aircraft | Flights in 6 h | In the air on average | Closest two aircraft ever | Longest wait on the ground |
|---|---|---|---|---|
| 1 | 49 | 0.5 | – | 45 s |
| 2 | 98 | 1.0 | 870 m | 45 s |
| 3 | 132 | 1.3 | 40 m (in the queue) | 4.5 min |
| 4 | 168 | 1.7 | 39 m | 4.5 min |
| 5 | 202 | 2.0 | 39 m | 6 min |
| 6 | 242 | 2.4 | 39 m | 7 min |

"In the air" counts climb, cruise and approach. Two aircraft that are both climbing or cruising were never
closer than 370 m (four aircraft; 500 m or more for the other sizes). Nobody ever held in the air.

So with six aircraft about two and a half are in the air, one or two are landing, taking off or taxiing,
and the rest wait. In steady running that is mostly one waiting and one moving at each airport; the queue of
three is only seen at the start ([evidence/01](evidence/01-kungsangen-start-queue-and-line-up.png)). The
reason is the runways, not the number of aircraft: a landing aircraft has to turn and taxi 700–800 m back
along the runway to reach the loop, so each runway takes one arrival and one departure per 176 s.

## How it works (backend, `internal/sim/airtraffic.go`)

**Ground.** Per airport one path: from where the landing roll ends, back along the centre line, round the
loop, onto the threshold. Aircraft keep their order on it and 40 m between noses, so nothing ever meets
head on and nothing can lock up. The loops are mapped taxiways (OpenStreetMap ways 101516378 at Kungsängen;
104336417 and 104336403 at Bråvalla), not invented stands.

The first choice at Bråvalla, way 104336414, turned out to run through two mapped buildings: the first
pictures showed aircraft about to taxi through houses. The two ways used instead keep clear of every
building; the nearest is 1.7 m from a wing tip ([data/clearance.json](data/clearance.json), written by
`scripts/air-traffic/clearance.mjs`, which fails if a path touches a building).

**Runway rules.**

1. One user at a time: an arrival from touchdown until it is 50 m off the centre line on the loop, a
   departure from the hold line until it is airborne.
2. A departure is cleared only if it is airborne at least 28 s before the next touchdown at its own airport,
   and if its own touchdown at the other airport comes at least 160 s after the one before it there (time
   for that one to vacate, and for one departure to leave).
3. An arrival that would still find the runway taken circles at the approach fix and asks again each lap.
   Rule 2 prevents it; the circle exists so that rule 2 does not have to be exact. It is tested by blocking
   a runway by hand.

**Timetable.** With every aircraft leaving as soon as rules 1–2 allow, the two runways fall out of step:
arrivals come just too close together for another flight to fit between them. Measured: six aircraft
completed 191 flights in six hours, fewer than five did (212). So with five or six aircraft, departures
leave in slots, one per 176 s from each airport, placed so that each flight touches down just as the other
runway has let one arrival vacate and one departure go. With the slots six aircraft complete 242 flights,
which is all two runways can take (test `TestTimetableKeepsTheLargestFleetInStep`). Five complete 202 with
the slots: 5 % fewer than the 212 without, the price of not depending on how the runways happen to fall
into step. Up to four aircraft cannot fill the runways and leave as soon as they may; waiting for a slot
would only cost them flights.

**In the air.** A flight is a turn, a straight and a turn onto the approach (radius 500 m), not the single
curve of the earlier shuttle, on which an aircraft reversed almost on the spot. Flights from Kungsängen
cruise at 300 m, flights from Bråvalla at 200 m, because the two tracks cross west of Kungsängen. Both
descend to 150 m before a 5° approach; a longer approach would put the turn onto it outside the mapped area
west of Bråvalla. All tracks stay inside the map.

**Changing the number.** The aircraft with the highest numbers leave at once; new ones appear at the back of
the shorter queue as soon as there is room.

**Old clients and the reference traces.** A settings command without `planes` flies the single shuttle of
`flight.go` exactly as before, so the frozen Kotlin reference (`testdata/golden.json`) passes unchanged and
an interface from before this phase keeps working against the new server. The other way round, this
interface notices a server that rejects `planes`, sends the settings without it, disables the slider and
says "Servern flyger ännu bara ett flygplan".

## Interface (`src/`)

| File | Change |
|---|---|
| `lib/transportModels.ts` | One body per aircraft: the first model is copied for the others (shared geometry and materials, own beacon lens). An aircraft that appears starts where it is |
| `lib/lighting/aircraftLightsView.ts` | Lights for six aircraft (was four); beacon level per aircraft |
| `lib/lighting/aircraftLights.ts` | Light rule for the phases `QUEUE` (as parked) and `HOLDING` (as cruise) |
| `lib/flights.ts` (new), `lib/city.svelte.ts` | `planes` in the settings, phase names, `city.configure()` with the fallback for an older server |
| `App.svelte`, `style.css` | The slider, the list in the Flyg tab, the chosen aircraft, "N i luften" in the tile and the list heading |
| `lib/FreeCamera.svelte`, `lib/Scene.svelte`, `lib/perf/perfProbe.ts` | Follow an aircraft by its id; beacon lens per aircraft; all aircraft counted as the part "aircraft" |

Changed texts: *Vid uppställningsplats* → *Står på taxislingan*, *Taxar till uppställning* → *Taxar in från
banan* (there is no stand any more).

## Checks

| Check | Result |
|---|---|
| Backend `gofmt -l`, `go vet ./...` | clean |
| Backend `go test ./... -count=1` | pass (api 1.2 s, sim 18.9 s), including the frozen Kotlin reference traces, unchanged |
| `npm run check` | 0 errors, 0 warnings (2004 files) |
| `npm run build` | OK |
| `npm test` (Vitest) | 646 of 647. The one failure is `police.test.ts` (a checksum of the police emblem file), which failed the same way before this work |
| `npm run test:e2e` (Playwright), all 26 files | 45 of 46 against the first version of the backend. The one failure was `interface-u4`, "controls are at least 44 px": the map did not start within 3 min while heavy backend tests ran on the same machine. Run alone afterwards: 3 of 3 |
| Playwright against the final backend, 8 files that use flights | 14 of 14: `air-traffic` (4, new), `aircraft-lights`, `airport-lights`, `interface-u1` (2), `simulation`, `sse-reconnect` (2), `transit`, `visitor-city` (2) |
| `npm run board:check` | OK |
| In the running app | Three aircraft at the start, the list, "2 i luften" seen in the browser; six aircraft, both queues, a take-off past the queue, following NK-04 and the lights at night in [evidence/](evidence/) |
| Reproducibility | `data/geometry.json` written twice: the same SHA-256 (`ce5e4565…`) |
| Earlier phases | No file under `src/lib/data`, `public`, earlier `docs/**/evidence`, or the backend's `testdata` and `src/main/resources` is changed (`git status`) |

Not run: the backend tests with `-race`; the 17 other Playwright files against the *final* backend (they ran
against the first version; the backend changes after it were the flight tracks and the Bråvalla loop);
the published build; a phone or tablet; the light theme.

New tests: backend `internal/sim/airtraffic_test.go` (8 tests, the data generator and a benchmark: every fleet size for six
simulated hours at three step lengths, with separation, one runway user at a time, a free runway before
every touchdown, no jumps, no endless waits; determinism; a changing fleet size; holding; the timetable;
the mapped loops; the city service) and one API test; here `src/lib/airTraffic.test.ts` (6) and
`tests/air-traffic.spec.ts` (4).

## Cost

- **Server:** one tick of six aircraft takes 1 µs (`BenchmarkAirTrafficTick`, 0.98 µs). A whole city step
  with three aircraft measured 321 µs against 314 µs with the single shuttle, within the run-to-run spread.
- **Stream:** 229 bytes per aircraft in a snapshot before compression: 52.2 kB with six against 51.1 kB with
  one at the start traffic (+2 %).
- **Drawing** ([data/frames.json](data/frames.json), development build, 1500 × 1000, RTX 5070 Ti, camera on
  Kungsängen's loop, half the fleet in view; the middle of three interleaved rounds):

  | Aircraft | Draw calls | Triangles | Frame time, median / p95 |
  |---|---|---|---|
  | 0 | 503 | 2 073 177 | 6.1 / 6.2 ms |
  | 1 | 559 | 2 077 599 | 6.1 / 6.2 ms |
  | 3 | 613 | 2 082 043 | 6.1 / 6.2 ms |
  | 6 | 667 | 2 086 509 | 6.1 / 6.2 ms |

  The frame time is the screen's refresh interval in every row (p95 = the time 95 % of the frames stay
  under), so the measurement shows no slowdown but cannot show how much headroom is left. Each aircraft in
  view costs about 55 draw calls (a draw call is one batch of geometry sent to the graphics card) and 4 400
  triangles, because the model is 55 separate parts. Six in view at once would be about 330 calls more than
  none. Merging the model into a few parts would remove most of that; not done here.
- **In steady running with six aircraft** (sampled from the running server over 25 simulated minutes): 2.4
  in the air; at each airport "one waiting, one moving" 50–60 % of the time, otherwise one waiting alone or
  two moving.

## Coordinates

Nothing is converted in this phase: the backend reads the mapped points in scene coordinates (local SWEREF
99 TM, EPSG:3006, 25 m per unit, X east, Z south, Y up) and sends positions in the same system. See
[data-provenance.md](data-provenance.md).
