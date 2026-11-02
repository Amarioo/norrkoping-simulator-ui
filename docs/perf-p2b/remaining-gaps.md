# Phase P2b — remaining gaps

1. **Why page screenshots vary more often with the branch was not found.** The renderer is
   deterministic on both (30/30 identical read-backs); page screenshots of an unchanged view vary by
   1/255 in 1–4 pixels, more often with the branch (4–19 of 29 vs 0–5 of 29). The tests now tolerate
   exactly that noise (≤ 1/255, ≤ 0.1 % of the pixels; approved 2026-11-02) and pass 9/9 ×4 on both.
   A real change of 1/255 in fewer than 0.1 % of the pixels would no longer be caught; nothing in the
   app works at that level.
2. **A few pixels differ from `main`** (0–5 of 3.7 million per view by more than 8/255, up to 25/255):
   coplanar surfaces of the same layer now drawn in another order. Not visible; to be approved.
3. **Street views cost a little more GPU** (Kungsgatan +0.71 ms frame time, Innerstaden +0.21 ms):
   1 km cells are culled less precisely. Not a problem on this RTX 5070 Ti (≈ 260 frames/s in
   Kungsgatan); on a weak GPU 500 m cells (`CITY_CELL = 20`) would be safer. Not measured on such a
   GPU (P3).
4. **One machine, headless, uncapped.** As in P1/P2a: Edge headless with vsync off. The real 164 Hz
   screen and weaker computers were not measured.
5. **Larger single buffers.** The largest mesh is now 114 117 triangles (a 1 km road cell, ≈ 15 MB of
   vertex data: 342 351 vertices × 11 floats) instead of 3 000. WebGL draws them without problems here; a very old GPU driver with
   buffer-size limits was not tested.
6. **Peak memory in the workers was not measured.** The JS heap of the page at map ready fell by
   22 MB; the workers' own peak (a cell's arrays grow by doubling) was not recorded.
7. **`police.test.ts` fails in this checkout** because `public/assets/polis-emblem.svg` has CRLF line
   endings on disk (git stores LF). Unrelated to P2b; the file was not touched. A fresh checkout (or
   `git checkout -- public/assets/polis-emblem.svg` after normalising line endings) would fix it; not
   done, to leave the user's working tree as it was.
8. **Source maps of hook builds are not reproducible** (`three.core-*.js.map`, known from P2a).
   Production builds are byte-identical.
