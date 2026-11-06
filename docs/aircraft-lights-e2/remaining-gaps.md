# Aircraft Lights Phase E2 — remaining gaps

1. **No real airframe.** The shuttle `NK-01` is fictional; socket positions, flash periods, pulse
   lengths and patterns (single pulse, beacons together) are estimates inside the CS 25.1401 range.
   A real type (e.g. a chosen turboprop's maintenance manual) would replace them; until then they
   stay labelled ESTIMATE.
2. **Emissive only.** Landing and taxi lights glow but light nothing: no beam on the runway, taxiway or
   ground. A bounded ground spill (one or two selected aircraft as extra emitters in the existing
   lighting patch, like the F1 vehicle beams) is a possible next step with its own budget.
3. **Vertical sectors.** The position lights are seen at full strength from any elevation; real ones
   fade towards straight up / down (CS 25.1391/1393 intensity tables not modelled). The beacons are
   drawn all round and rely on the depth test (the fuselage hides the top beacon from below).
4. **Overlap curve.** How bright a real red/green lamp is just outside its sector is unknown; the drawn
   curve stays within the CS 25.1395 caps. Consequence: seen head-on from close by (≈ 40 m in front,
   15° outside each light's own sector) both forward lights are dim (10 %); from farther ahead they are
   full.
5. **Lenses follow the night level, not the phase.** The steady lenses (position, tail, strobe,
   landing, taxi; one merged white mesh) glow at night whether or not their light is on in that phase;
   only the beacon lens flashes. The glow (the visible light) does follow the phase rule.
6. **No operational data.** Which lights are on in which phase is a simulator rule (informed by
   SERA.3215), not an operator SOP; no ATC instruction, crew action or dazzle reduction is simulated.
7. **One aircraft.** The simulator flies one aircraft and the model draws `aircraft[0]` only; the
   light buffer holds up to 4 (`AIRCRAFT_MAX`), so more aircraft need the body drawn for each first.
8. **Interpolated clock between snapshots.** Flashes are timed on simulation time interpolated between
   the backend's 10 snapshots per second (at most 0.25 s ahead); when a snapshot arrives behind the
   interpolation the clock holds briefly, so a pulse can be a few milliseconds late on screen. The
   pattern itself is a pure function of simulation time.
9. **Strobe glare covers the wing-tip colours** for the length of a flash (0.08 s simulation time), as
   on a real aircraft; a screenshot taken while paused during a flash shows white tips (the test and
   the evidence script re-pause until no strobe is lit).
10. **Colours are perceptual.** The glow colours are not matched to the aviation colour boundaries
   (chromaticity).
