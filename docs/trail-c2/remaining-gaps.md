# Phase C2 — remaining gaps

What this phase does not do or could not verify, most important first.

1. **The switch-off hours are an assumption.** 06.00–22.00 comes from the municipality's text for
   another trail (Abborreberg). Nothing found states the hours for Vrinnevi. To settle it: ask
   Norrköpings kommun, kultur- och fritidskontoret (they run the exercise trails), or read the sign at
   the trail's start. Changing it is one constant (`TRAIL_SCHEDULE`).
2. **No lamp register.** All 101 positions on the loop are estimates (58 from this phase, 43 from
   Lighting Phase L2bc). The only check is a visitor's count of 100 lamps from 2019. If the municipal
   lighting register arrives (board card L-REG), the trail's lamps may not be in it: the trail's
   lighting is run under a separate contract by kultur- och fritidskontoret (NT 2019), so it may need
   its own request.
3. **The route is OpenStreetMap's, checked by length only.** The municipality's 2.4 km and the
   relation's 2 369 m agree, and all 14 ways are tagged as lit. The municipality's own map layer
   (Norrköpingskartan, "motionsspår") was not compared line by line.
4. **Lamp type.** The lanterns are the project's existing 4.2 m park lantern, so the loop looks the
   same all the way round. Real illuminated trails often have taller poles (6–8 m) with a simple
   downlight. A dedicated trail pole would be a new lamp type (geometry and light values, all
   estimates) and would replace all 101.
5. **Two spacings on one loop.** L2bc's part has a lantern every 21–22 m, this phase's every 24.8 m.
   Not visible to the eye, but not uniform. Regenerating L2bc's 43 would touch an earlier phase.
6. **Trees do not block light.** The lighting model knows buildings, not trees, so a lantern lights
   the ground behind a trunk. The trunks themselves are lit correctly.
7. **Side of the trail.** Every post stands on the right-hand side in the generator's walking
   direction. The real side is unknown and probably varies.
8. **The 34 broken lamps of 2019 are not modelled**, nor the dark car park the article mentions; the
   municipality said the fault would be repaired.
9. **The connecting trail from Navestad (1.5 km)** is not part of the loop relation and gets no lamps.
10. **The schedule is the same every day of the year.** Between 06.00 and 22.00 the lamps follow the
    same dusk/dawn level as the street lighting.
11. **Carried over from C1:** the rest of the reserve's forest, level of detail and separate loading
    of the tree data, the map's south edge, and a clean timing of the C1b rollout.
