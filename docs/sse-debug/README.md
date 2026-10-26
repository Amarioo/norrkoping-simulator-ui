# SSE debug panel — read every server-sent event (2026-10-26)

Branch `claude/sse-debug-29a00e`, started from `main` = `9cb9a3e` and brought up to `main` =
`753475e` (Performance P1 merged) by a fast-forward; the uncommitted changes were kept and re-applied.
**Committed and pushed on this branch** (user, 2026-10-26); not merged into `main`. Backend unchanged. A developer tool, separate from the performance track; no
geodata, no coordinate changes, no earlier phase's output touched (P1's files are not modified).

## How to open it

- **Key `L`** ("logg") opens and closes the panel — same rules as `F` and `P`: no modifier keys, not
  while typing in a form field. Esc closes it while focus is in the panel.
- **URL flag** `?sse-debug` opens it when the page loads (so recording starts as early as possible);
  `?sse-debug=raw` also starts the raw readers on all three streams.
  Example: `http://127.0.0.1:5173/?sse-debug`.
- **Where:** development builds (`npm run dev`), and production builds made with
  `VITE_SSE_DEBUG=1 npm run build`. A normal production build contains none of the panel code.
- **Browser console:** `__sseLog` (`entries()`, `channels()`, `export()`, `open()`, `close()`,
  `setRaw(stream, on)`, `recording`, `listeners`, `rawReaders`) in the same builds.

## What it shows

- **Placement:** a panel on the left of the window by default, so the fps counter in the map's
  bottom-right corner stays visible; the arrow button moves it to the right and back.
- **Recording runs while the panel is open.** Closing it removes every listener again.
- **Stream table** ("Strömmar"): per stream, status (ansluter / öppen / stängd, and **"öppen, tyst
  N s"** when the connection is open but nothing has arrived for over 3 s), events, events per second
  and kB per second (over the last 5 s), total size, errors, reconnections, last event id. Hover the
  stream name for counts per event name.
- **Event list**, newest first: receive time (ms), event name, stream, `lastEventId`, size in bytes and
  the first 160 characters of the data. Connection steps are listed too, with their own colour:
  `create` (the app made a new connection), `attach` (the panel started listening to an existing
  one), `open`, `reconnect` (opened again after an error), `error` (with the browser's state and what
  it means), `close` (the app closed it), and from the raw reader `comment` and `retry`.
- **Click an entry** for details: receive time, stream, connection number, `readyState`, notes, size,
  whether the data is JSON, the data pretty-printed (or as text when it is not JSON), and
  **"Kopiera post"** (the entry as JSON, with the parsed data, to the clipboard).
- **Filters:** free-text search (data, id, event name, notes), stream chips, event-name chips, "Dölj
  anslutningshändelser" (hide connection steps). Shows 200 rows at a time ("Visa 200 till").
- **Pausa / Fortsätt:** while paused nothing new is stored, but the counters keep counting (the panel
  says how many events came meanwhile). **Rensa** empties the log and the counters. **Exportera
  JSON** downloads the whole log (`sse-logg-<time>.json`, format `norrkoping-sse-debug-log/v1`:
  caps, counters and every stored entry with `data` and, where it parses, `json`).
- **Rå läsare (raw reader).** The browser's EventSource only delivers event names the app listens
  for, and never shows comment lines or `retry:` fields. Ticking a stream under "Rå läsare" opens a
  second connection with `fetch()` and reads the stream text itself, so it sees **every** event name,
  comments and retry values. Its entries appear on their own channel, e.g.
  `/api/simulator/stream [rå]`. It costs one extra backend connection per stream; it reconnects by
  itself (with the server's `retry` time) and stops when the panel closes.

## How it is wired (and why it costs nothing when off)

| File | Role |
|---|---|
| `src/lib/debug/sseTap.ts` | `tapEventSource(source, names)`: returns the same EventSource. In normal builds it does nothing. In dev / `VITE_SSE_DEBUG=1` builds it only remembers the connection and wraps `close()`; no listener is added until the panel records. |
| `src/lib/world.svelte.ts`, `src/lib/city.svelte.ts` | One line each: `new EventSource(url)` → `tapEventSource(new EventSource(url), [<names>])`. Their own listeners, error handling and online/offline logic are unchanged. |
| `src/lib/debug/sseLog.ts` | Pure log (no DOM): ring buffer capped at **1 000 entries or 32 MB of data**, per-stream counters, JSON parse with text fallback (lazy, cached), filters, export, and a `text/event-stream` parser for the raw reader (follows the HTML standard's rules). Unit tested. |
| `src/lib/debug/sseRecorder.svelte.ts` | Adds / removes the listeners (`open`, `error`, `message` + the app's names) when recording starts / stops; raw `fetch()` readers; the `__sseLog` hook. |
| `src/lib/debug/SseDebugHost.svelte`, `SseDebugPanel.svelte` | Key `L`, URL flag, the panel. The panel redraws at most 4 times a second (not per event) and only parses / pretty-prints the entry you expand. |
| `src/App.svelte` | Loads `SseDebugHost` with a dynamic import behind `import.meta.env.DEV \|\| VITE_SSE_DEBUG === '1'`, so the bundler drops it from normal builds. |

Checked in the built output: the normal `dist/` has **no** debug chunk and no panel strings;
`tapEventSource` there is `function(e,t){return e}`. The `VITE_SSE_DEBUG=1` build has a separate
23 kB (8.7 kB gzip) chunk loaded on demand.

## What the backend actually sends (measured with the raw reader, local backend, 2026-10-26)

| Stream | Event names | Rate | Size per event | Used by the UI |
|---|---|---:|---:|---|
| `/api/simulator/stream` | `city` | ~10 /s (≈ 520 kB/s) | ~53 kB | yes (`city.svelte.ts`) |
| `/api/sse/world` | `world` | ~10 /s | ~2 kB | no (`world.connect()` is never called) |
| `/api/sse/telemetry` | `telemetry` | ~2 /s | ~5 kB | no |

No comment lines, no heartbeats, no other event names. Every event carries `id` (= `sequence`) and
`retry: 1500` (Ktor repeats it in each event; the raw reader logs it only when it changes).
Source: `norrkoping-simulator-backend/src/main/kotlin/com/norrkoping/simulator/Application.kt`
(`ServerSentEvent(data, event, id, retry = 1500)`), confirmed live.

**Finding (existing behaviour, not changed):** when the backend stops, the Vite dev proxy keeps the
browser's connection open. The app gets no `error`, keeps `city.connected = true` (no "Ansluter till
Ktor…" banner), and does not reconnect after the backend restarts until the page is reloaded. The
panel shows it as "öppen, tyst N s". See [remaining-gaps.md](remaining-gaps.md) item 4.

## Cost (fps)

Two measurements, both with live traffic from a local backend (202 vehicles, city stream ~10
events/s × 53 kB), production builds, headless Edge with vsync off, 1280×900, AMD Ryzen 7 9800X3D.

**1. The tool's own CPU time (the reliable number).** V8's sampling profiler for 10 s in the
Innerstaden view, counting only functions in the debug code
([scripts/sse-debug/recorder-cpu.mjs](../../scripts/sse-debug/recorder-cpu.mjs), 2 runs each; ms of
main-thread time per second, where 1 000 ms per second = one fully busy core):

| Panel | Debug script, first version | Debug script, final | Style + layout, whole page |
|---|---:|---:|---:|
| closed (available but not open) | **0.00** | **0.00** | 1.7–2.1 (normal page) |
| open | 3.1–3.8 | **1.6–2.1** | 4.0–6.6 |
| open + raw readers on all three streams | 11.0–11.4 | **4.4–6.0** | 5.1–8.4 |

So with the panel open the tool uses about **0.2 % of the main thread for its scripts plus about
0.3 % for redrawing the list** (≈ 0.05 ms per frame at 100 fps); with all raw readers about 1 %.
Closed, it uses nothing. The first profile showed where the time went (byte counting of each 53 kB
snapshot, number formatting in the list, the raw reader's line splitting); those three were made
faster before the final numbers ([evidence/perf/recorder-cpu.json](evidence/perf/recorder-cpu.json)
→ [recorder-cpu-2.json](evidence/perf/recorder-cpu-2.json)).

**2. Frame times (too noisy here to show a difference this small).** Same method as P0's
counter-cost ([scripts/sse-debug/panel-cost.mjs](../../scripts/sse-debug/panel-cost.mjs)), four
variants alternating: plain build (no debug code), debug build with the panel closed / open / open +
raw. First set, 3 rounds, median of runs, median · p95 ms per frame (p95 = the frame time 95 % of
frames stay under):

| View | plain build | panel closed | panel open | open + raw |
|---|---:|---:|---:|---:|
| kungsgatan | 4.4 · 7.0 | 5.1 · 8.2 | 6.9 · 13.5 | 5.3 · 13.1 |
| stromparken | 13.5 · 18.0 | 14.3 · 20.7 | 15.6 · 33.7 | 18.9 · 35.9 |
| city (Innerstaden) | 16.7 · 34.7 | 19.6 · 34.9 | 19.9 · 35.0 | 26.6 · 46.2 |

The same variant varied by up to 10 ms between rounds, and in a second set of 5 rounds the whole
machine slowed down partway (plain build, city view 16 → 60 ms; another session was doing
performance work on the same computer). These frame times cannot separate effects of a few tenths
of a millisecond; they are kept as raw data ([panel-cost.json](evidence/perf/panel-cost.json),
[panel-cost-2.json](evidence/perf/panel-cost-2.json)) and measured the first version of the panel.
Heap after garbage collection: plain 129.6 MB, closed 129.9 MB, open 131.3 MB, open + raw 131.6 MB
(the stored log; it never exceeds 1 000 entries / 32 MB of data).

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; no debug chunk in `dist/` (the `VITE_SSE_DEBUG=1` build has a 23 kB chunk) |
| `npm test` (Vitest, PowerShell, `C:\` path) | 500/501, including the new file's tests. The 1 failure is the known one: `terrain.test.ts` reads `../norrkoping-simulator-backend` relative to the worktree folder (same in P0, L2d, D1b). |
| New unit tests `src/lib/debug/sseLog.test.ts` | 20/20: ring buffer cap, byte cap, pause, clear, counters and rates, UTF-8 size, JSON parse fallback and cache, export, filters (stream, event, lifecycle, text), SSE text parser (named/default events, multi-line data, ids, retry, comments, CRLF/CR/BOM, chunks split at every position, empty chunks, 60 kB lines) |
| New Playwright `tests/sse-debug.spec.ts` (mocked SSE, no backend) | 2/2; repeated 5× → 10/10, and after the last change 3× → 6/6 |
| Whole Playwright suite (dev server 5282 → backend 8101) | Final run **21/21**. Earlier runs: 18/21 (set-up mistake, see below) and 20/21 (only A3). |
| Lighting A3 picture check (known flaky) | Fails on unchanged `main` too: a copy of `main` (`9cb9a3e`) against the same backend failed it 2 of 3 times; this branch also 2 of 3. Not caused by this change. |
| In the running app, real backend | Screenshots [01](evidence/01-panel-live-city-stream.jpg) (live city stream, fps counter visible), [02](evidence/02-entry-expanded-json.jpg) (entry expanded, pretty JSON), [03](evidence/03-raw-readers-all-streams.jpg) (raw readers on all three streams), [04](evidence/04-search-filter.jpg) (search + hide connection steps). Stopping and restarting the backend showed the "tyst" state. |

**Re-run after bringing in `main` = `753475e` (Performance P1):** only `.gitignore` and
`docs/claude-progress.md` overlapped (both sides kept). `npm run check` 0 errors; `npm run build` OK,
no debug chunk in `dist/`; Vitest 500/501 (same known `terrain.test.ts` failure; P1 alone: 480/481,
plus the 20 new tests); whole Playwright suite **21/21** first time (A3 passed this run). New
screenshots on the merged code in [evidence/after-p1-merge/](evidence/after-p1-merge/) (the earlier
ones are kept). P1 adds no keyboard shortcut, so `L` still only opens this panel.

The first whole-suite run had 3 failures: A3 (above), and `simulation.spec.ts` / `transit.spec.ts`
with "Origin is not allowed", because my local backend had been started for port 5281 while the
tests ran on 5282 (a set-up mistake, not the code). With the backend restarted for 5282 both pass.

## Files

New: `src/lib/debug/{sseTap.ts, sseLog.ts, sseLog.test.ts, sseRecorder.svelte.ts,
SseDebugHost.svelte, SseDebugPanel.svelte}`, `tests/sse-debug.spec.ts`,
`scripts/sse-debug/{panel-cost.mjs, recorder-cpu.mjs, capture.mjs}`, `docs/sse-debug/{README.md, remaining-gaps.md, evidence/}`.
Changed: `src/lib/city.svelte.ts`, `src/lib/world.svelte.ts` (one line + import each),
`src/App.svelte` (dynamic import + one line of markup), `.gitignore` (`/work/sse-debug/`),
`docs/claude-progress.md`.
Local only (not for Git): `.claude/launch.json` in the worktree (`sse-*`, ports 8101, 5281–5284),
`work/sse-debug/`.
