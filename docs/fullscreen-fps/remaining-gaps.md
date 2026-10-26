# Phase P0 — remaining gaps

1. **Resolution and sharpness stay as before (`dpr` 1).** On the user's primary display (2560×1440,
   100 % Windows scaling) one canvas pixel is one screen pixel, so fullscreen is sharp. On a display
   with scaling above 100 % (e.g. a laptop at 150 %) the browser enlarges the picture and it looks
   soft, in the window as before and in fullscreen. Choosing `dpr` (and a quality setting) belongs to
   P3, as agreed.
2. **Frame time is not GPU time.** The counter shows the time between frames (what you experience) and
   the main-thread CPU time of each frame (Threlte tasks + `renderer.render()`, which only *submits*
   GPU work). GPU time needs `EXT_disjoint_timer_query_webgl2`; it is deliberately not queried
   (no extra GPU queries by default). P1 can add it behind a development switch.
3. **Draw calls / triangles are from the last frame**, read from `renderer.info.render` twice a second
   (three.js resets these numbers at the start of every `render()`; we only read, `autoReset` is
   untouched). There is one `render()` per frame in this app, so they are complete for that frame.
4. **Vsync and the 164 Hz display.** The fullscreen baseline is uncapped (vsync off) and headless, so it
   shows headroom (ms per frame), not what the monitor displays; in the real browser fps is capped at
   the refresh rate (164 Hz → 6.1 ms). Real-display numbers with vsync come from the counter itself.
5. **Esc in fullscreen.** Browsers leave fullscreen on Esc themselves; the app also handles Esc (needed
   for automated tests, where the browser passes the key to the page). Not tested on Safari/Firefox.
6. **Fallback.** Where the Fullscreen API is missing or refused (iPhone Safari, iframes without
   `allow="fullscreen"`) the map fills the browser window with CSS. Tested by refusing the API in
   Playwright, not on a real iPhone.
7. **Phone widths.** At ≤ 760 px the counter moves up to sit above the map key; with the vehicle
   inspector open *and* the counter expanded on a very narrow phone they can touch. Desktop and
   fullscreen layouts do not overlap (screenshots).
8. **The fullscreen and FPS buttons are new pixels in the map toolbar.** Pictures of the 3D scene are
   unchanged with the counter off, but a screenshot of the whole map panel differs in the toolbar box
   (two buttons). The earlier phases' tests compare pictures taken within the same run, so they are
   unaffected.
