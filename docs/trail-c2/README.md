# Phase C2 — Vrinneviskogen: the illuminated trail (elljusspåret) (2026-11-13)

Worked directly on local `main` (= `origin/main` `3161e89`), backend unchanged. **Approved by the
user on 2026-11-13; committed (`2155a5a`) and pushed to `origin/main`.** Started on the user's "Start C2" of 2026-11-13.

## Verdict

The whole 2.4 km illuminated trail in Vrinneviskogen is now lit in the app: 58 new lamp posts stand
along the 1.4 km that was dark before, and together with the 43 lanterns an earlier phase had already
placed there are 101 lamps round the loop (a visitor counted 100 in 2019). After 22.00 the loop goes
dark while the city's street lighting stays on, and it comes on again at 06.00.
Recommendation: **approve**. All checks pass and the cost is about 0.1 ms per picture, far inside
the 60-pictures-per-second target. One thing is an
assumption you should know about: the switch-off hours (decision 1).

To see it: choose **"Vrinneviskogen · norra slingan"** in the *Utforska* list, open the tab *Tid och
ljus* and set the time to about 21:30 (lit), then past 22:00 (dark).

## Decisions still open (the user approved the result on 2026-11-13; these were not answered)

1. **The switch-off hours, 22.00 to 06.00.** No source gives them for Vrinnevi. They are taken from
   the municipality's text for its Abborreberg trail ("tända kl. 6.00 till gryning och från skymning
   till kl. 22.00"). *Recommended: keep 22.00–06.00 until you know better* (the sign at the trail's
   start, or a question to kultur- och fritidskontoret, would settle it; it is one number to change).
2. **Lamp type: the same 4.2 m park lantern as the 43 that were already there.** A real illuminated
   trail often has taller, plainer poles. *Recommended: keep*; a dedicated trail pole would be a new
   estimated lamp type replacing all 101, a small follow-up if you want the look.
3. **The earlier 43 lanterns now also switch off at 22.00.** They were placed by the path-lighting
   phase (L2bc) and stayed on all night. Their positions and data are untouched; only the switch-off
   is new. *Recommended: keep*, since they are part of the same loop.
4. **Next step.** The roadmap's planned order is now complete (C2 was its last step). Open choices:
   the rest of the reserve's forest (needs level of detail first), performance P2d/P3, or the
   interface track. *Recommended: decide after testing this.*

## Risks / not verified

- **Switch-off hours assumed** (decision 1).
- **All lamp positions are estimates.** There is no lamp register. The count (101) matches the one
  count found (100, a visitor's, 2019); the positions are evenly spaced guesses, ± 12 m.
- **The route is OpenStreetMap's.** Its length (2 369 m) matches the municipality's 2.4 km and all its
  14 pieces are tagged as lit, but it was not compared line by line with the municipality's own map.
- **Trees do not block lamp light** in this lighting model (buildings do), so light passes trunks.
- **Timing** was measured in three rounds on a quiet machine; the result (about +0.1 ms) is close
  to the smallest difference the method can show.
- **One existing browser test was extended** (one more term in a lamp-count sum); see "Checks".
- **The known failing unit test** `police.test.ts` (line endings, since before this phase) still fails.

## What was there before

| | Before | After |
|---|---|---|
| Loop length (OSM relation 5703856, 14 ways) | 2 369 m | 2 369 m |
| Lit part | 929 m (4 ways `highway=path`, 43 lanterns from L2bc) | 2 369 m |
| Dark part | 1 440 m (9 ways `highway=track` and a 7.7 m footway) | 0 m |
| Lamps on the loop | 43 | 101 (43 + 58) |
| On all night | yes | no: off 22.00–06.00 (assumption) |

Why 1.4 km was dark: the path-lighting generator (L2bc) has rules for footways, paths and cycleways
but none for `highway=track`, which is how most of this trail is mapped. The ways were classified as
lit (OSM `lit=yes`) and then got no lamps.

## What was done

1. **Checked the loop against the municipality** (the open point from C1): Norrköpings kommun lists
   "Vrinnevi elljusspår, 2,4 km"; the OSM loop is 2 368.9 m, one closed ring of 14 ways, all tagged
   `lit=yes`. Agreement on length and on being lit; not a line-by-line comparison.
2. **Found a lamp count:** Norrköpings Tidningar 2019-10-16 reports a visitor who walked the loop and
   counted 66 working and 34 broken lamps, 100 in all. The roadmap's own guess was 80–120.
3. **Generated 58 lanterns** on the dark 1 440 m (`src/lib/lighting/trailGenerator.ts`, policy
   `lighting-c2-v1`): the 10 dark ways are joined into one run, with a station every 24.8 m (25 m
   policy: 100 counted − 43 existing = 57 for 1 439 m), 1.2 m from the trail's centreline. None had
   to be dropped: no building, water or earlier lamp is in the way, and none stands inside a tree
   drawn from the laser data (checked by a test).
4. **Switch-off schedule** for all 101 lamps on the loop (`src/lib/lighting/trailSchedule.ts`): on
   from 06.00, off from 22.00, local time; a 1.5 s fade. Between those hours the lamps follow the
   same dusk/dawn level as all other lighting.
5. **How it is drawn:** the lanterns are ordinary fixtures of the city's lamp set. A lamp on the loop
   carries a flag in the lamp data; one new number (`cityScheduleLevel`) dims flagged lamps in the
   existing light shader, their glow dots and their lenses. No new shader program (still 20), no new
   texture, no rebuild when the clock passes 22.00.

Earlier phases' output is untouched: `git` reports no change in any earlier data file
([data/hashes.json](data/hashes.json)); the 43 earlier lanterns keep their records and positions.

## Checks

All run on the final state on 2026-11-13.

| Check | Result |
|---|---|
| Type check (`npm run check`) | 0 errors, 0 warnings |
| Build (`npm run build`) | OK; two builds byte-identical (93 files) |
| Unit tests (`npm test`, Vitest) | 642 of 643 pass. The one failure is `police.test.ts` "outline belongs to the current artwork", which failed before this phase too (line endings of a data file) |
| New unit tests (`trailLighting.test.ts`) | 12 of 12 |
| Browser tests (`npm run test:e2e`, Playwright, dev server + local backend) | 37 of 37 ([data/e2e.json](data/e2e.json)) |
| New browser tests (`tests/trail.spec.ts`) | 2 of 2 |
| Regeneration | the three generated files equal a fresh generation byte for byte; reversed input order gives the same result |
| Shader programs | 20 before and after, by day and at night |

Not run: the separate generation harnesses of L2a and L2bc (`scripts/lighting-l2`, long-running);
their generator files and inputs are untouched, so their hashes cannot have changed.

**A first full browser run had 3 failures; all three are explained:**
- `lighting.spec.ts` (citywide set) checks that the lamp total equals the sum of every phase's
  lamps. With 58 new lamps the sum needed one more term. I added the term and a check that the trail
  set is exactly 58 estimates, the same way Phase D2 added its 239 fuel lamps. No assertion was
  removed or loosened.
- `lighting-l2d.spec.ts` compares the city set with "the same set without site lighting". My
  development helper for that set had dropped the trail lamps too; I corrected the helper, the test
  is unchanged.
- `bridge-traffic.spec.ts` failed once while I was creating a second copy of the project on disk
  (it loads the dev server); it passes alone and in the second full run.

Measured in the browser test, ground beside a new post (brightness 0–255): 1.4 without the new
lamps, 73.2 with them at 21:30, 1.3 at 22:30 (switched off), 72.7 at 06:30.

## Performance

Paired measurement, main against this phase, 3 rounds in alternating order, 600 frames per view,
fullscreen 2560 × 1440 with traffic, measurement builds, machine 4–10 % busy (a quiet run; no round
was skipped). Raw data [data/paired-1.json](data/paired-1.json), tables
[data/paired-1-summary.md](data/paired-1-summary.md) (measured with the Phase C1 script, so its
headings say C1).

| View | Frame time main | This phase | Difference (median of 3, range) |
|---|---:|---:|---:|
| Loop from above, night 21:30 | 5.94 ms | 6.13 ms | +0.07 ms (+0.04 … +0.29) |
| On the trail, night 21:30 | 4.73 ms | 4.89 ms | +0.12 ms (+0.11 … +0.17) |
| Whole city, night 21:30 | 6.46 ms | 6.53 ms | +0.08 ms (+0.02 … +0.08) |
| On the trail, day | 3.80 ms | 3.85 ms | +0.01 ms (0.00 … +0.14) |

Frame time is how long one picture takes; 16.7 ms is the 60-pictures-per-second limit. The cost is
about 0.1 ms at night, at the edge of what this method can resolve (the range of one view spans
0.25 ms), and no frame in any view took longer than 16.7 ms. The slowest 5 % of frames ("p95") moved
by 0.0–0.2 ms.

- Draw calls (separate drawing jobs per picture): +1 near the trail (the lenses of the scheduled
  lanterns), otherwise the same. The other differences in the raw table are aircraft that happened to
  be in view.
- Download: the app's main file grows from 1 119 to 1 128 kB (compressed 306.6 → 309.2 kB): the 58
  lanterns (6.1 kB) and the new code.

## Evidence

Screenshots from fixed viewpoints ([evidence/](evidence/), `shots.json` lists camera positions in
SWEREF 99 TM): `before` = the set without this phase's lanterns at 21:30, `after` = with them at
21:30, `after-switched-off` = 22:30, `after-day` = 12:30.

| View | Before 21:30 | After 21:30 | After 22:30 |
|---|---|---|---|
| The loop from above | [01](evidence/01-before-loop-top.png) | [07](evidence/07-after-loop-top.png) | [13](evidence/13-after-switched-off-loop-top.png) |
| The loop from the south | [02](evidence/02-before-loop-from-south.png) | [08](evidence/08-after-loop-from-south.png) | [14](evidence/14-after-switched-off-loop-from-south.png) |
| West leg from above | [03](evidence/03-before-west-leg-above.png) | [09](evidence/09-after-west-leg-above.png) | [15](evidence/15-after-switched-off-west-leg-above.png) |
| West leg at eye level | [04](evidence/04-before-west-leg-eye-level.png) | [10](evidence/10-after-west-leg-eye-level.png) | [16](evidence/16-after-switched-off-west-leg-eye-level.png) |
| North leg from above | [05](evidence/05-before-north-leg-above.png) | [11](evidence/11-after-north-leg-above.png) | [17](evidence/17-after-switched-off-north-leg-above.png) |
| Where new meets old | [06](evidence/06-before-seam-south-west.png) | [12](evidence/12-after-seam-south-west.png) | [18](evidence/18-after-switched-off-seam-south-west.png) |

Day views: files 19–24.

## Files

- New: `src/lib/lighting/trailSchedule.ts` (loop ways, schedule), `trailLighting.ts` (rule and
  policy), `trailGenerator.ts`, `trailLighting.test.ts`; `src/lib/data/streetlights-c2.json` (58
  lanterns, 6.1 kB); `scripts/trail-c2/` (`extract-source.mjs`, `inputs.ts`, `write.test.ts`,
  `vitest.config.ts`, `shots.mjs`); `scripts/data/trail-c2-source.json`; `tests/trail.spec.ts`;
  `docs/trail-c2/`.
- Changed: `src/lib/lighting/cityLights.ts` (flag in the lamp data, one uniform, three shader lines),
  `fixtures.ts` (flag per lamp, glow dots and lenses follow the schedule), `controller.ts` (trail
  set, schedule level, `describe().trailLighting`), `src/lib/Scene.svelte` (the trail joins the city
  set; `?lighting=no-c2` and `registries.cityNoTrail()` for comparisons), `.gitignore`,
  `docs/board/board.json`, `docs/roadmap.md`, `docs/claude-progress.md`.
- Data and sources: [data-provenance.md](data-provenance.md). Open points:
  [remaining-gaps.md](remaining-gaps.md).

Sources read on 2026-11-13:
[Norrköpings kommun, Motionsspår](https://norrkoping.se/se-och-gora/motion-och-idrott/motionsspar),
[Naturkartan, Vrinnevis elljusspår](https://www.naturkartan.se/sv/ostergotlands-lan/vrinnevi-elljusspar),
[Naturkartan, Abborrebergs elljusspår](https://www.naturkartan.se/sv/ostergotlands-lan/abborrebergs-elljusspar),
[NT 2019-10-16](https://www.nt.se/nyheter/norrkopings-kommun/artikel/nu-ska-loparna-kunna-springa-i-ljus/9ly1wq9l).
