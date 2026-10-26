# Phase P1 — remaining gaps

1. **One machine, headless.** Every number is from the user's computer (Ryzen 7 9800X3D, RTX 5070 Ti,
   Edge/ANGLE D3D11) in headless Edge with vsync and the frame-rate limit off, so ms per frame shows
   headroom. On the real 164 Hz display the browser caps at 6.1 ms per frame; a frame that takes
   17–34 ms there is a dropped frame just the same. Weaker computers were not measured (P3).
2. **GPU timer is an upper bound.** `EXT_disjoint_timer_query_webgl2` exists in Edge here, but on
   ANGLE/D3D11 it measures elapsed GPU-timeline time between the begin and end marks, which includes
   the GPU waiting while the CPU is still submitting commands. Resolution scaling and the
   lamps-off comparison are the evidence for the GPU side, not the absolute timer value.
3. **Part costs overlap.** Hiding a part removes its draw calls *and* its share of shared per-frame
   work (sorting, render list), and parts interact (fewer material switches when a part with many
   unique materials disappears). The per-part deltas therefore do not add up exactly to the whole
   frame; the "everything hidden" row gives the fixed remainder.
4. **Hidden parts still pay the matrix walk.** `scene.updateMatrixWorld()` visits every node,
   visible or not; hiding a part does not remove that share, so its cost is shown by the CPU profile
   (matrix update) rather than by the part deltas.
5. **Profiler overhead.** The CDP sampling profiler (100 µs) slows the page a little; the profile's
   split (shares) is the result, its absolute ms are slightly above unprofiled frames.
6. **Function names come from source maps** of the minified hook build. A few small functions may be
   mapped to a neighbouring name; categories use the source file plus the phase function
   (setProgram, projectObject, ...), which are unambiguous.
7. **Background load.** During the first hours a game, the user's own dev server (port 5173, ≈ 1–2
   cores) and another Claude session's dev server and test browser ran; timing waited until the user
   had stopped them (the suite starts each step only when background CPU ≤ 18 % for 40 s; measured
   14–20 % before each round, including this run's own backend and preview server). Test runs made
   under load were discarded. Counts (draw calls, triangles, objects) do not depend on load and were
   taken earlier. Spotify, the Claude app and similar stayed open.
8. **Traffic varies.** The simulator moves vehicles, so draw calls of traffic and the number of
   snapshot frames vary slightly between captures and rounds (3 captures and 3 rounds kept).
9. **Merge estimates are estimates.** The P2 call counts after merging (per 500 m / 1 km / 2 km cell)
   are counted from the whole scene before frustum culling; the real per-view numbers and the
   picture must be measured in P2.
