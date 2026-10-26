# SSE debug panel — remaining gaps

1. **EventSource cannot see unknown event names.** The browser's `EventSource` delivers a named event
   only to code that listens for exactly that name, and it never exposes `:` comment lines or the
   `retry:` field. The tap listens for the default `message` event plus the names the app itself
   listens for (`city`, `world`, `telemetry`). Anything else is only visible with the **raw reader**
   (checkbox "Rå läsare" or `?sse-debug=raw`), which opens its own `fetch()` connection and parses the
   text itself. That is a second connection per stream, so its events are a separate copy of what the
   server sends (normally identical; checked against the real backend: same event names and rates),
   not the exact bytes the app's EventSource received.
2. **The first `open` can be missed.** The panel is loaded on demand, slightly after the app has opened
   its stream. The log then starts with an `attach` entry that records the connection's state at
   that moment (`readyState` 1 = open) instead of the `open` event itself. Everything after that is
   recorded. Events that arrived while the panel was closed are not recorded at all (by design: a
   closed panel must cost nothing).
3. **History is short with the city stream.** The city stream sends ~7–10 snapshots per second of
   ~53 kB each (~0.5 MB/s). The log keeps at most 1 000 entries **or** 32 MB of event data, whichever
   is reached first, so it holds the last ~60–80 s of city traffic. Older entries are dropped (the
   panel says how many). Pause stops storing (counters keep counting) when you want to keep a moment.
4. **Silent streams through the Vite dev proxy (existing app behaviour, not changed here).** When the
   backend stops, the dev server's proxy keeps the browser's connection open: no `error` event
   reaches the app, `city.connected` stays true (no "Ansluter till Ktor…" banner), and after the
   backend restarts the page does not reconnect until it is reloaded. The panel now shows this as
   "öppen, tyst N s" in the stream table, but the app itself is not fixed. A fix (a client-side
   watchdog that reconnects when no event arrives for a few seconds, and/or a backend heartbeat) is a
   separate task.
5. **`world` and `telemetry` are wired but not used by the UI.** `world.connect()` (drone simulation)
   is never called in the current app, so only `/api/simulator/stream` shows up through EventSource.
   The other two streams are visible with the raw reader.
6. **Fps cost: profiler yes, frame times inconclusive.** The tool's own CPU time was measured with the
   browser's profiler (closed 0 ms/s; open ≈ 2 ms/s script + ≈ 3 ms/s layout; open + raw ≈ 5 + 4 ms/s).
   Whole-frame times were too noisy on this shared machine (another session ran performance work at
   the same time) to show differences that small, and they measured the first, slower version. Not
   measured on the user's 164 Hz display in a normal (headed) browser.
9. **What "tyst" (silent) means.** The panel flags a stream that is open but has had no event for
   over 3 s. For the city stream this reliably means a problem: the backend publishes a new snapshot
   every 100 ms, also while the simulation is paused (`CitySimulationService.step` always calls
   `publish()`, which raises `sequence`). For `/api/sse/world` and `/api/sse/telemetry` this was not
   checked in the backend code; they sent ~10 and ~2 events/s while running.
10. **The panel covers part of the page.** It sits on the left (over the control column and the left
    edge of the map) so the fps counter stays visible; the arrow button moves it right. It cannot be
    resized or minimised.
7. **Clipboard.** "Kopiera post" uses the Clipboard API and falls back to `document.execCommand('copy')`
   where the browser refuses; tested in Edge only.
8. **Not in production builds.** Normal builds contain none of the panel code (checked: no debug chunk
   in `dist/`); `tapEventSource` is a one-line function that returns its argument. To use the panel in
   a production build, build with `VITE_SSE_DEBUG=1`.
