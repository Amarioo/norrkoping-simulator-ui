# SSE reconnect — remaining gaps

1. **Noticed after about 5 s, not at once.** The guard declares a stream dead after 5 s without an
   event (checked every second), so the header switches to "Ansluter till simulatorn…" 5–6 s after
   the backend stops. A shorter limit would react faster but risks false alarms when the machine is
   busy.
2. **Reconnecting can take up to 10 s after the backend is back.** While the backend is away the
   guard retries at once, then after 1, 2, 4, 8 and from then on every 10 s. If the backend has been
   away a long time, the next try can be up to 10 s after it is up again.
3. **The silence limit relies on how often the backend sends.** Measured in the backend code: the
   city and world streams publish every 100 ms and telemetry every 500 ms, also while paused
   (`CitySimulationService.step`, `SimulationService.step`). If the backend ever sends only on
   change, the limit must be raised or the backend must send a small heartbeat; otherwise a quiet
   but healthy stream would be reconnected every 5 s. The backend is unchanged.
4. **Drone streams (`/api/sse/world`, `/api/sse/telemetry`) are covered by unit tests only.** They
   use the same guard, but the current UI never opens them (`world.connect()` is not called), so
   they were not tested in the app or against the backend.
5. **Old error messages stay.** A message such as "Kunde inte läsa simulatorns data." is not cleared
   when the stream comes back (unchanged behaviour). The connection banner and header are.
6. **Only the dev setup was tested against the real backend.** The guard does not depend on the Vite
   proxy (it also covers a plain network error and a closed EventSource), but a production setup
   behind another proxy was not tried.
7. **Background tabs.** Browsers slow down timers in hidden tabs, so the guard may notice a dead
   stream later there. It never reconnects a stream that is still delivering events.
8. **Terrain mismatch does not cause a reconnect loop.** When the backend's terrain revision differs
   from the UI's, the app shows its existing error and stays "not connected", but events still
   arrive, so the guard sees a live stream and leaves it alone (by design).
