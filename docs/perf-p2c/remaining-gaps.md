# Phase P2c — remaining gaps

1. **No faster frames on this computer.** Since P2b the overview and the airport views are limited by
   the GPU (GPU time ≈ frame time), so P2c's CPU saving (≈ 0.5–0.75 ms at the airports) does not
   shorten frames here. It may on a weaker CPU; not measured.
2. **CPU p95 higher in the airport views** (+0.6 / +1.45 ms at 3–4 ms frames): `renderer.render()`
   waits for the GPU more often once the CPU is done sooner (uncapped, 250+ frames/s). Not a visible
   problem at 60 or 164 Hz; not measured on the real display.
3. **Merged meshes span both airports** (Kungsängen and Bråvalla F13, ≈ 8 km apart), so they are
   culled as a whole. 0.02 M triangles; no measurable cost.
4. **One machine, headless, uncapped**, as in P1–P2b.
5. **Older bug, found during the user's test: taxiway pavement blotches over the runway ends.** Where
   OSM taxiways run onto the runway, the taxiway asphalt and the runway surface lie in the same plane
   with the same depth rank (`layeredSurface(…, LAYER_RANK.asphalt)` for both), so they fight pixel by
   pixel (hatched patterns), and the round taxiway joint caps (instanced cylinders) show as dark blobs
   on the threshold markings. Identical on `main` (16 close-ups, 0 differing pixels). Not fixed in P2c;
   **fixed afterwards** (user's decision, 2026-11-02): see
   [docs/airfield-overlap/](../airfield-overlap/README.md).
6. **Next steps by measurement:** the remaining frame time is GPU time. P2d (traffic) is mostly CPU
   work and may also show little here; a GPU profile of the overview (what fills the 6.4 ms) would
   show whether further P2 steps are worth it, or whether P3 (quality settings) matters more.
