# A city per visitor — each visitor's own simulation (2026-11-18)

Worked directly on local `main` (= `origin/main` `c2cc223`) and on the backend's local `main`
(= `faa1106`). Approved by the user on 2026-11-18, committed and pushed in both repositories (backend `2b3b5bb`). No geodata, no coordinates, no earlier
phase's output touched. First step towards a public deployment (interface on Vercel, backend in the
user's k3s cluster); the deployment itself is not started (see "Not done").

## Why

The backend ran one city. Everybody who opened the page watched that city, and the traffic
settings, pause and reset of one visitor changed it for all. The user asked how three visitors at
the same time would work and chose "a simulation of their own per visitor".

## What it does now

- **Backend** (`norrkoping-simulator-backend`): every `/api/simulator/*` route takes an optional
  `?session=<id>` (8–64 characters of `A–Z a–z 0–9 _ -`). The first request with a new id creates a
  city with the start values and runs it at 10 steps a second like the shared one. A city is removed
  when nobody has listened to its stream or sent it a command for `CITY_IDLE` seconds (default 60);
  a city with a listener is never removed. At most `MAX_CITIES` (default 20) exist at once; the
  next visitor gets HTTP 503 with "Simulatorn har fullt med besökare just nu. Försök igen om en
  stund." Requests **without** the parameter use the shared city exactly as before, so the routes,
  bodies and the frozen reference traces are unchanged.
- **Interface**: `src/lib/citySession.ts`. With `VITE_CITY_SESSIONS=1` in the build (to be set for
  the public deployment) or `?own-city` in the address, the tab makes a random id (32 hex
  characters, nothing about the visitor), keeps it in the tab's sessionStorage, and adds it to the
  stream and to every command. A reload keeps the city; a new tab gets a new one. Without the
  switch nothing changes: local development, the tests and the capture scripts keep the shared
  city, which they steer through the API and watch in the page.
- When the stream fails in visitor mode the interface asks once why; if every city is taken it
  shows the backend's message as the error toast.
- The camera, the time of day and the light switches were already per browser.

## Cost of one more city (measured)

[backend-tests-and-cost.txt](evidence/backend-tests-and-cost.txt), new benchmarks in the backend's
`internal/sim/city_bench_test.go`, on the development machine (Ryzen 7 9800X3D, one core used per
city; a cluster node is probably slower, not measured):

| | Per step | Processor time per second | Share of one core |
|---|---|---|---|
| Start values (192 road vehicles, 8 trams, 2 trains, time factor 3) | 0.30 ms | 3 ms | 0.3 % |
| Heaviest allowed (1 000 road vehicles, 40 trams, 12 trains, time factor 20) | 6.1–6.4 ms | 61–64 ms | about 6 % |

Creating a city takes 14 ms (the map is loaded once per process and shared). A city holds about
5.4 MB of memory. Twenty cities at the heaviest setting are therefore a little over one core and
about 110 MB on this machine; that is where the default limit of 20 comes from. Network traffic per
visitor (the size of the snapshots) is **not measured**.

## Checks (2026-11-18)

| Check | Result |
|---|---|
| Backend `gofmt -l`, `go vet ./...` | clean |
| Backend `go test ./...` | pass, including the two new tests (own cities, the limit, malformed ids; a listened city is kept and an abandoned one removed). `-race` needs cgo and was **not run** locally; the backend's CI runs it |
| `npm run check` | 0 errors |
| `npm run build` | OK |
| `npm test` | 640/641; the one failure is the known `police.test.ts` (emblem checksum), as before this change |
| Playwright against the new backend | `visitor-city` 2/2 (new), `interface-u1`, `simulation`, `sse-debug`, `sse-reconnect`, `bridge-traffic` all pass. The other spec files were **not run** |
| Running app | two tabs with `?own-city`: ids `814a42…` and `9fab78…`; paused the first at 00:00:44, six seconds later it still showed 00:00:44 while the second had gone from 00:00:52 to 00:01:01; the shared city was not paused; no console errors |

New test: `tests/visitor-city.spec.ts`. Visitor A lowers the traffic and pauses through the
interface; visitor B keeps the start values and a running clock; the shared city is unchanged; a
reload keeps A's city; without `?own-city` no id is sent.

## Files

Interface: `src/lib/citySession.ts` (new), `src/lib/cityStreamStart.ts`, `src/lib/city.svelte.ts`,
`src/lib/debug/sseRecorder.svelte.ts` (the debug panel's raw reader follows the tab's city),
`tests/visitor-city.spec.ts` (new).
Backend: `internal/sim/sessions.go` (new), `internal/sim/city_bench_test.go` (new),
`internal/api/server.go`, `internal/api/server_test.go`, `cmd/simulator/main.go`, `README.md`.

## Gaps and risks

1. **No protection against abuse.** Anyone can make up ids and fill the 20 places; they free up
   60 s after the streams close. A public deployment needs a limit per address in front of the
   backend (the cluster's ingress can do it).
2. **One backend process only.** The cities live in memory. With two copies behind a load balancer
   a visitor's stream and commands could reach different copies. Run one replica.
3. **A restart of the backend gives every visitor a fresh city** (start values, clock at zero).
   The interface reconnects by itself.
4. **A duplicated tab shares the original's city**, because browsers copy sessionStorage to the
   duplicate.
5. **The shared city keeps running** beside the visitors' cities (0.3 % of a core at the start
   values).
6. A visitor who is refused (full) sees the message, and the interface keeps retrying in the
   background; there is no queue.

## Not done (the deployment itself)

A Dockerfile for the backend, cross-origin answers (CORS) so that a page on Vercel may read the
stream from another domain, a configurable backend address in the interface, the k3s manifests and
HTTPS. The interface and the backend must also be released together: the interface refuses a
backend whose elevation data has another revision.
