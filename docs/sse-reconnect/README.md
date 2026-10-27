# SSE reconnect — the app recovers by itself after a backend restart (2026-10-26)

Branch `claude/sse-reconnect` from `main` = `ad2967d`. **Not committed.** Backend unchanged. Fixes the
bug found with the SSE debug panel ([sse-debug](../sse-debug/README.md), gap 4): after the backend
was stopped, the app kept saying "Simulatorn är ansluten" and never reconnected after a restart
until the page was reloaded. No geodata, no coordinates, no earlier phase's output touched.

## What was wrong (measured)

[proxy-probe-log.txt](evidence/proxy-probe-log.txt) (`scripts/sse-reconnect/proxy-probe.mjs`, real
backend behind the Vite dev proxy, backend stopped at ~4 s and restarted at ~28 s):

- The open connection went **silent with no error**: no data after the stop, and it stayed silent
  even after the backend was back (it still was at 68 s). The browser's EventSource only reconnects
  after an error, so it waited forever, and the app still showed "connected".
- New connections while the backend was away got **502 Bad Gateway** from the proxy. On an HTTP
  error EventSource gives up for good (readyState CLOSED) and never tries again.
- After the restart, new connections worked at once (200).

## The fix

`src/lib/sseWatchdog.ts`, `watchStream()`: a small guard around each EventSource.

- **Silent:** no event for 5 s (checked every second) → the stream is dead. The backend publishes
  every 100 ms (city, world) or 500 ms (telemetry), also while paused (checked in
  `CitySimulationService.step` and `SimulationService.step`), so 5 s is at least 10 times the longest
  normal gap. An `open` without events does not count as alive (a proxy can answer before the
  backend has sent anything).
- **Closed:** the browser gave up (readyState CLOSED) → the stream is dead. A transient error while
  the browser is still retrying by itself (readyState CONNECTING) is left to the browser.
- When dead: the app is told (`connected = false`, so the header and the "Ansluter till Ktor…"
  banner show it), the old EventSource is closed and a new one is opened: at once, then after
  1, 2, 4, 8 s and from then on every 10 s, until events arrive again (then the count resets).
- `city.svelte.ts` uses it for `/api/simulator/stream`; `world.svelte.ts` for `/api/sse/world` and
  `/api/sse/telemetry` (not opened by the current UI). Everything else in the stores is unchanged,
  including the online/offline handling and the terrain-revision check. Each new EventSource is still
  wrapped by the SSE debug tap, so the debug panel shows the reconnections.

## Result against the real backend

[restart-log.json](evidence/restart-log.json) (`scripts/sse-reconnect/restart-check.mjs`): dev server
5281 → backend 8101, the backend stopped and restarted by hand, the header sampled every 250 ms.

| Moment | Time (s since page load) |
|---|---:|
| App connected | 3.7 |
| Backend stopped (direct request fails) | 11.4 |
| App shows "Ansluter till simulatorn…" + banner | 16.5 (**5.1 s** after the stop) |
| Backend answers again | 36.6 |
| App shows "Simulatorn är ansluten" again | 41.8 (**5.2 s** after the backend was back) |
| Page loads (navigations) | 1 (no reload) |

Screenshots: [01 connected](evidence/01-connected.jpg), [02 backend stopped: "Ansluter…" and the
banner](evidence/02-backend-stopped-connecting.jpg), [03 reconnected; the simulation clock restarted
with the new backend](evidence/03-reconnected.jpg). (`streamRequests` in the log counts finished
stream requests from the browser's resource timing; it is indicative only.)

Before the fix (same situation, earlier session): the header stayed on "Simulatorn är ansluten"
throughout and the map stopped updating until reload.

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; still no SSE debug code in `dist/` |
| `npm test` (Vitest, PowerShell, `C:\` path) | 511/512 = 500 before + 11 new. The 1 failure is the known `terrain.test.ts` worktree path (reads `../norrkoping-simulator-backend` relative to the worktree). |
| New unit tests `src/lib/sseWatchdog.test.ts` | 11/11: live stream left alone; silent → reconnect; `open` alone is not alive; CLOSED → reconnect at once; transient error left to the browser; back-off 1/2/4/8/10 s and reset on events; late events from a replaced source ignored; `stop` cancels a pending reconnect and closes; custom limit; default delays |
| New Playwright `tests/sse-reconnect.spec.ts` | 2/2 with the fix. A small SSE server in the test sends a city snapshot every 100 ms; "backend away" as measured: (proxy) open connection silent + new requests 502, (silent) connections open but no events. Requires "Ansluter…" within 8 s, then "ansluten" again within 25 s after the backend is back, no reload. |
| Same spec on untouched `main` (`ad2967d`, a temporary copy, removed afterwards) | **0/2**, both fail because the header still says "Simulatorn är ansluten" after the stream died: [before-fix-e2e-on-main.txt](evidence/before-fix-e2e-on-main.txt). The test catches the bug. |
| Whole Playwright suite (dev server 5282 → backend 8101) | **22/23**; the 1 failure is the known flaky Lighting A3 picture check (fails on unchanged `main` too, see [sse-debug](../sse-debug/README.md)); A3 alone afterwards 2/2. An earlier run had all tests fail because the test server crashed (it was watching a temporary `main` copy inside the worktree); the copy was removed and the suite re-run. |

## Files

New: `src/lib/sseWatchdog.ts`, `src/lib/sseWatchdog.test.ts`, `tests/sse-reconnect.spec.ts`,
`scripts/sse-reconnect/{proxy-probe.mjs, restart-check.mjs}`, `docs/sse-reconnect/{README.md,
remaining-gaps.md, evidence/}`. Changed: `src/lib/city.svelte.ts`, `src/lib/world.svelte.ts`,
`.gitignore` (`/work/sse-reconnect/`). Local only: `.claude/launch.json`, `work/sse-reconnect/` (scratch).

Remaining gaps: [remaining-gaps.md](remaining-gaps.md).
