# Phase C1 — Vrinneviskogen: trees measured from laser data (2026-11-13)

Two steps, both on local `main` (= `origin/main` `ac6ecf0`), backend unchanged, **nothing committed**:

1. **C1, the pilot:** one 250 m square, and the check of the map's south edge. Approved by the user
   on 2026-11-13.
2. **C1b, the rollout around the northern trail loop:** 14 squares, on the user's decision of
   2026-11-13 ("Roll out trail loop"). Approved by the user on 2026-11-13.

## Verdict

The forest around the northern trail loop of Vrinneviskogen now stands in the app as the 2020 laser
scan saw it: 8 071 tree tops in 14 squares of 250 m, at their real positions, with their real heights
(typically 22 m, up to 36 m) and crown widths, and a forest floor under the canopy. Clearings, the
pond's shore and the trails are open. Before, the whole area was bare ground without a single tree.
Recommendation: **approve**. It has a small cost of about 0.1–0.8 ms per frame, far inside the
60-frames-per-second target, and all checks pass. Two things should be done before the rest of the
reserve is built (decision 1 below).

To see it: choose **"Vrinneviskogen · norra slingan"** (the whole loop) or **"Vrinneviskogen ·
pilotruta"** (the first square, closer) in the *Utforska* list.

Found on the way (unchanged since the pilot):
- **The map's south edge cuts off 21 % of the reserve** (59 of 286 hectares).
- **The app draws most of the forest as bare ground**: the map marks only about a third of the reserve
  as woodland, although the laser data shows trees over 81 % of it.

## Decisions still open (the user approved the result on 2026-11-13; these were not answered)

1. **Continue with the rest of the reserve inside the map** (about 160 hectares more, roughly 19 000
   more trees by extrapolation)? *Recommended: yes, but first two technical steps*: draw distant trees
   more simply (level of detail), and load the tree data separately instead of inside the app's code
   file. Without them the rest would roughly triple today's cost and download size.
2. **Extend the map southwards to include the cut-off fifth of the reserve?** *Recommended: not now*
   (new terrain, roads and land cover for a strip 400–600 m deep; it touches every earlier phase).
3. **Only the reserve is measured.** Trees just outside the reserve line (gardens, the wood west of
   the loop) are left as before, because outside the reserve the laser data cannot easily tell a tree
   from a house or a shed. *Recommended: keep this limit for now.*
4. **Next roadmap step, C2 (the illuminated trail):** the loop used here is OpenStreetMap's, and its
   match with the municipality's 2.4 km illuminated loop is not verified. *Recommended:* verify it (or
   ask the municipality) before any lamp is placed.
5. **One neutral tree shape, and the forest floor from the laser data:** as in the pilot.
   *Recommended: keep.*

## Risks / not verified

- **Timing was measured on a busy machine.** Other programs (among them the user's own dev server)
  kept the machine 20–35 % busy. Two of five planned rounds were clean, one was disturbed and two never
  started. The cost below rests on those two rounds and should be re-measured on a quiet machine.
- **The app's first download grows** by 0.34 MB (83 kB compressed), because the tree data is part of
  the app's code file: 740 → 1 076 kB, compressed 210 → 293 kB.
- **These are tree tops, not a tree count.** Crowns grown together count once; small trees under the
  canopy are not seen. 596 of the 8 071 are probably groups.
- **The scan is from 2020.** Felling, storm damage and growth since then are missing.
- **Estimates:** trunk thickness, crown shape and colour, forest-floor colour, the crown's lower edge
  for 634 trees, and the method's constants (tuned by eye on the pilot square).
- **403 measured trees are not drawn** because their stem would stand on a path, a road or a pitch,
  so trail corridors are slightly wider than in reality.
- **Hard edges** where the measured squares end inside the reserve (south and east of the loop), and a
  blocky forest-floor edge (5 m steps).
- **The reserve outline and the trail** come from OpenStreetMap; neither is checked against the
  authorities' own data.
- Not tried on a weaker computer or in other browsers than Edge.
- One unit test fails, as before this phase: `police.test.ts` (unrelated).

## What was built

| Part | Where | What |
|---|---|---|
| Measurement | [`scripts/vegetation-c1/forest_lidar.py`](../../scripts/vegetation-c1/forest_lidar.py) → [`src/lib/data/forest-c1.json`](../../src/lib/data/forest-c1.json) (341 KB) | Every visible tree top with height, crown radius and crown base, and a canopy mask in 5 m cells, for every 250 m square within 60 m of the trail loop that lies at least 10 % inside the reserve and wholly inside the map: 14 squares. Only ground inside the reserve and off buildings is measured. Also the reserve's area inside and outside the map. Deterministic: rebuilt twice, byte-identical. |
| Trees | [`src/lib/forest/forest.ts`](../../src/lib/forest/forest.ts), [`mapView.ts`](../../src/lib/mapView.ts) | One trunk and two crown lobes per tree inside the measured envelope (top, widest radius, crown base), standing on the rendered ground. They reuse the existing tree geometry and materials: no new shader program. Inside a measured square the illustrative planting is skipped; every other tree in the city keeps its look. |
| Forest floor | [`src/lib/forest/forestFloor.ts`](../../src/lib/forest/forestFloor.ts) | The canopy mask laid exactly on the terrain in the map's woodland colour, ordered above grass and below pitches, paths and roads. |
| Camera presets | [`mapModel.ts`](../../src/lib/mapModel.ts) | "Vrinneviskogen · norra slingan" and "Vrinneviskogen · pilotruta" in the *Utforska* list. |

How the trees are found, and what is measured versus estimated: [data-provenance.md](data-provenance.md).
What is still missing: [remaining-gaps.md](remaining-gaps.md).

## The rollout in numbers

| | Pilot square | All 14 squares |
|---|---:|---:|
| Area inside the reserve | 6.25 ha | 66.5 ha (of 87.5 ha of squares) |
| Tree canopy (≥ 2 m high) | 4.5 ha | 51.3 ha |
| Tree tops found | 649 | 8 071 |
| Drawn | 622 | 7 668 |
| Not drawn (stem on a path, road or pitch) | 27 | 403 |
| Tree height: 10 % under / median / 10 % over / tallest | 13.8 / 20.5 / 24.8 / 31.6 m | 16.1 / 22.5 / 28.2 / 36.4 m |
| For comparison | the app's illustrative trees are about 13 m tall everywhere | |

The pilot square's trees and canopy are identical in the rollout data and in the pilot's data.

![The measured squares](evidence/lidar-loop-tiles.png)

*The 14 squares in the laser data: tree height (brighter = taller), found tops (red), crown circles,
the reserve line (yellow) and the trail loop (white). Brown inside a square: open ground, or outside
the reserve and therefore not measured.*

## The reserve against the map

| | |
|---|---|
| Reserve area (OSM outline, county board's data) | 286.2 ha |
| Inside the map | 227.0 ha (79 %) |
| South of the map's edge | 59.2 ha (21 %) |
| Covered by the laser data on this machine | all of it |
| Tree canopy over 5 m, share of the reserve | 84 % (81 % of the part inside the map) |
| Drawn as woodland by the map today (part inside the map) | 32 %; 55 % has no land cover at all |
| Measured and built so far | 66.5 ha (29 % of the part inside the map) |

![The reserve in the laser data](evidence/lidar-reserve-overview.png)

*Yellow: the reserve. Red: the map's south edge. White: the bounds of the trail loop.*

## Pictures

Same camera positions on `main` and now (fixed SWEREF viewpoints, `shots.json`).

**The rollout** ([evidence/rollout/](evidence/rollout/); its `shots.json` lists 18 views, the 6 loop
views are kept as pictures):

| | `main` | Now |
|---|---|---|
| The loop from the south | ![before](evidence/rollout/before/06-day-loop-from-south.png) | ![after](evidence/rollout/after/06-day-loop-from-south.png) |
| From the north-east | ![before](evidence/rollout/before/07-day-loop-from-north-east.png) | ![after](evidence/rollout/after/07-day-loop-from-north-east.png) |
| From above | ![before](evidence/rollout/before/08-day-loop-top.png) | ![after](evidence/rollout/after/08-day-loop-top.png) |
| On the trail | ![before](evidence/rollout/before/09-day-loop-trail-eye-level.png) | ![after](evidence/rollout/after/09-day-loop-trail-eye-level.png) |
| Night, from the south | ![before](evidence/rollout/before/15-night-loop-from-south.png) | ![after](evidence/rollout/after/15-night-loop-from-south.png) |
| Night, on the trail | ![before](evidence/rollout/before/18-night-loop-trail-eye-level.png) | ![after](evidence/rollout/after/18-night-loop-trail-eye-level.png) |

**The pilot square alone** (taken before the rollout; [evidence/before/](evidence/before/),
[evidence/after/](evidence/after/)):

| | `main` | Pilot |
|---|---|---|
| From the south | ![before](evidence/before/01-day-oblique-south.png) | ![after](evidence/after/01-day-oblique-south.png) |
| From above | ![before](evidence/before/03-day-top.png) | ![after](evidence/after/03-day-top.png) |
| In the clearing | ![before](evidence/before/04-day-clearing-eye-level.png) | ![after](evidence/after/04-day-clearing-eye-level.png) |

The pilot's measurement sheet: [evidence/lidar-pilot-tile.png](evidence/lidar-pilot-tile.png).

## Measured

Paired timing against `main` (`ac6ecf0`): hook builds, fullscreen 2560×1440, traffic on (202
vehicles), Edge headless, uncapped, 600 frames per view, builds in rotated order. RTX 5070 Ti, Ryzen 7
9800X3D. The loop views use fixed camera poses, because `main` has no preset there.

*rAF* is the time between two frames as the viewer sees it; *p95* is the time that 95 % of the frames
stay under. 16.7 ms per frame is 60 frames per second.

### The rollout (14 squares)

Five rounds were planned. The machine was 20–35 % busy with other programs the whole time, so the
usual "quiet machine" rule was relaxed. **Rounds 1 and 2 were clean, round 3 was disturbed (frames of
up to 33 ms in one build only), rounds 4 and 5 never started.** The table gives rounds 1 and 2.

| View | `main` rAF mean | Now | Difference, round 1 / round 2 | p95 `main` → now | Draw calls | Triangles |
|---|---:|---:|---:|---:|---:|---:|
| The loop from the south, day | 3.83 ms | 4.11 | +0.29 / +0.25 | 4.7 → 4.9 | +42 | +564 662 |
| On the trail, day | 3.48 | 3.66 | +0.17 / +0.13 | 4.6 → 4.5 | +27 | +388 874 |
| The loop from the south, night | 5.68 | 5.96 | +0.27 / +0.23 | 6.4 → 6.7 | +42 | +563 838 |
| On the trail, night | 4.51 | 4.68 | +0.17 / +0.26 | 5.1 → 5.3 | +27 | +388 874 |
| Whole city, day | 4.52 | 5.29 | +0.76 / +0.24 | 5.3 → 5.9 | +42 | +560 262 |
| Whole city, night | 6.29 | 6.61 | +0.32 / +0.08 | 6.9 → 7.2 | +42 | +560 262 |

- **Reading:** a small, real cost: about 0.1–0.3 ms in most views, up to 0.8 ms in one round of the
  whole-city view (4–7 % of the frame). Every frame time stays far below 16.7 ms; in the two clean
  rounds no frame took longer than 9.9 ms.
- The cost comes from 0.56 million more triangles (5 % more than the 10.2 million of the whole-city
  view) and 42 more draw calls (three per square: trunks, crowns, floor). Shader programs: 20 before
  and after.
- **Weak evidence:** two rounds are fewer than the five used in earlier phases. The direction is
  consistent (every one of the 12 differences is positive), the size is uncertain.
- Data: [data/rollout-paired.json](data/rollout-paired.json)
  ([summary](data/rollout-paired-summary.md); its medians include the disturbed round 3).

### The pilot square alone (measured earlier the same day)

One clean run of five rounds: +0.02 ms and −0.01 ms by day, +0.12 ms at night (every round +0.02 …
+0.30); +3 draw calls, +45 827 triangles; no frame over 16.7 ms.
Data: [data/paired-4.json](data/paired-4.json) ([summary](data/paired-4-summary.md)). Two earlier runs
that day were disturbed by another program and are kept as `paired-2-loaded-machine` and
`paired-3-loaded-machine`. In `paired-4` the two "overview" rows repeated the "from above" pose (a
mistake in the harness, fixed since).

## Checks

All on the final code (the rollout).

| Check | Result |
|---|---|
| `npm run check` (type check) | 0 errors, 0 warnings (1 228 files) |
| `npm run build` | OK. Built twice: all 29 files of `dist/` byte-identical (SHA-256) |
| `npm test` (Vitest, PowerShell, `C:\`) | **621 / 622**. The one failure is the known `police.test.ts` "outline belongs to the current artwork" (fails on `main` too). `forest.test.ts` 14 / 14 |
| Playwright, full suite, 31 tests including `forest.spec.ts` (dev server `phase0-e2e` + backend `phase0-backend`) | **31 / 31** (7.4 min) |
| Measurement rebuilt | twice, byte-identical to the committed file (hash below) |
| Earlier phases' data | `git status`: under `src/lib/data` only the new `forest-c1.json`; no change to `norrkoping-map.json`, `scripts/data` or earlier `docs/**` |

The committed data file's SHA-256 is
`3122edfb064a853ed3d8d1f0b029b24ab6bfe1fa8682dd7c19295a2ebea2f7fb`; a unit test compares the file
with the hash in [forest-provenance.json](forest-provenance.json).

Not run: weaker hardware; other browsers than Edge; a timing run on a quiet machine for the rollout.

Unit tests ([`forest.test.ts`](../../src/lib/forest/forest.test.ts)): the data file (14 tiles on the
250 m grid and inside the map, every tree inside its tile with plausible sizes, sorted output, hash);
the pilot tile unchanged; every tree inside the reserve line; every vertex of the trail loop inside a
measured tile; the reserve numbers; the scene conversion; drawn + omitted = measured, and no drawn stem
on a path, road, pitch, water or building; the drawn crown stays inside the measured envelope; stems
stand on the rendered ground; the forest floors cover exactly their masks and lie on the terrain.

Playwright test ([`forest.spec.ts`](../../tests/forest.spec.ts)): the forest meshes of all 14 tiles
are in the scene (7 668 trunks, 15 336 crown lobes, the floors), sharing two geometries and three
materials; no crown lies outside its square; no illustrative tree is left inside a measured square;
20 shader programs by day and at night.

No test from an earlier phase was changed. The two forest tests were written for the pilot and
extended for the rollout in this same uncommitted work.

## Files

- **New:**
  - `scripts/vegetation-c1/{forest_lidar.py,reserve-osm.json,trail-osm.json,shots.mjs,paired.mjs,summarize.mjs}`
    (the last two copied from D2's)
  - `src/lib/data/forest-c1.json`
  - `src/lib/forest/{forest.ts,forestFloor.ts,forest.test.ts}`, `tests/forest.spec.ts`
  - `docs/vegetation-c1/**`
- **Changed:**
  - `src/lib/mapView.ts` (skips the illustrative planting inside a measured tile; adds the forest
    trees and floors; statistics)
  - `src/lib/mapModel.ts` (two camera presets)
  - `.gitignore`: `/work/vegetation-c1/`
  - `docs/board/board.json`, `docs/roadmap.md`, `docs/claude-progress.md`
- **Local only:**
  - `.claude/launch.json` (`c1-main` 5361, `c1-new` 5362, `c1-main-dev` 5363)
  - `work/vegetation-c1/` (hook builds, raw runs, logs, LiDAR rebuilds, first screenshots). The `main`
    worktree used for the comparison was removed.

## Reproduce

```
C:\Users\amarg\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -I scripts/vegetation-c1/forest_lidar.py <out.json> [sheet.png]
npx vitest run src/lib/forest                                                    # PowerShell, uppercase C:\ path
E2E_BASE_URL=http://127.0.0.1:5193 npx playwright test tests/forest.spec.ts      # phase0-dev, no backend
node scripts/vegetation-c1/shots.mjs http://127.0.0.1:5193 <new-dir>             # a DEV server
# hook builds (VITE_LIGHTING_HOOK=1) of main (worktree) and of the working tree; preview c1-main 5361, c1-new 5362 (+ phase0-backend)
MAX_BUSY=12 node scripts/vegetation-c1/paired.mjs <new.json> 5 main=http://127.0.0.1:5361 c1b=http://127.0.0.1:5362
node scripts/vegetation-c1/summarize.mjs <run.json> > <summary.md>
```

See also [data-provenance.md](data-provenance.md), [remaining-gaps.md](remaining-gaps.md) and
[forest-provenance.json](forest-provenance.json).
