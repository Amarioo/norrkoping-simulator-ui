# Stream early start — remaining gaps

1. **The test is still a start-up speed check.** `simulation.spec` line 36 gives a second tab 5 s to load the
   whole city while the first tab keeps drawing. The fix leaves ≈ 2–2.5 s of margin here, but the time depends on
   the machine (and its GPU process) more than on the code: `main` took 5.0 s on 2026-10-27 and 3.1 s on
   2026-10-29. The test was not changed; an explicit, commented timeout would need the user's approval.
2. **Why the machine was slower on 2026-10-27** (and why the test passed before the P2a rebase) was not found.
   Edge 156 was installed ≈ 22–24 October, probably before those passing runs.
3. **The page's own start is unchanged.** Before the app mounts, the main thread is busy ≈ 2–3 s (data parse,
   scene build, WebGL context), then 0.6 s (first-frame shaders) and 1.1–1.6 s (worker layers: shader link waits,
   buffer uploads). These are start-up performance work (Track P), not part of this fix.
4. **An early stream that is never taken stays open** if the app fails to start (map data not downloadable).
   One idle connection on an error page; not closed.
5. **Measured in dev mode only** (Vite dev server, the setup the e2e tests use). Production start-up was not
   re-measured; the change there is the same (request sent before the data parse).
6. **`old` comparison used its own backend** (port 8097): the backend accepts commands from one origin only.
