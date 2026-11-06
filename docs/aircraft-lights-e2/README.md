# Aircraft Lights Phase E2 — lights on the simulated aircraft (2026-11-06)

Worked directly on local `main` (= `origin/main` `afa08cf`), as agreed with the user on 2026-11-02.
Tested locally by the user, **committed and pushed to `origin/main`** (2026-11-06). Backend unchanged. Roadmap track E, step E2;
plan: `docs/step62/airport-lighting-plan.md`, section "Aircraft lights, separate from runway systems".

## Result

- **Position lights the right way round.** Steady red on the left wing tip, green on the right, white
  at the tail (EASA CS 25.1385), each seen only within its sector (CS 25.1387: red and green from
  dead ahead to 110° to their side, white within 70° of dead astern) with a small overlap at the
  boundaries (estimate within CS 25.1395). From behind only the white tail light shows, from the left
  only red, from the right only green; from in front the red light is on the right of the picture
  ([evidence 01–05](evidence/)).
- **Found and fixed an old model error:** the red and green wing-tip lenses of the drawn aircraft were
  swapped (red on the right wing tip). Now red is left.
- **Anti-collision lights flash** (red beacon on top of and under the fuselage, white strobes at the wing
  tips and the tail), timed by the **simulation clock**: they stop when the simulation is paused, run
  faster at a higher time scale, are deterministic (phase seeded by the aircraft's id, so several
  aircraft would not flash in step) and never skip a pulse at time scale 20. Periods 1.2 s and 1.09 s
  (50 and 55 per minute) are **estimates** inside the CS 25.1401 range of 40–100 per minute; the real
  pattern depends on the aircraft type and the shuttle is fictional.
- **Landing and taxi lights by flight phase** (a simulator rule, not an airline SOP; SERA.3215 does
  not regulate them): landing lights for takeoff, climb-out, approach and landing, taxi light only
  while taxiing with the gear down, strobes off while taxiing ([table](data-provenance.md#simulator-rule-lights-per-flight-phase)).
  They glow towards the front only. Emissive only: they do not light the ground (gap 2).
- **By day too:** the lights are switched by phase day and night alike (SERA.3215(c)/(d) require
  anti-collision lights by day). By day the flashing beacon and strobes are drawn at 65 % (estimate),
  the steady glows fade with the night level and the lenses keep their colour
  ([evidence 08](evidence/08-day-front-left-quarter.png)).
- **Own switch** in "Tid och ljus": *Flygplansljus* — *Efter flygfas* (default) or *Av*.
  URL `?aircraftLights=auto|off`.
- **Cheap:** two instanced glow buffers for all aircraft lights (normal lights; landing, taxi and
  strobe lights with a larger glare), capacity 4 aircraft × 11 lights, both with the street lights'
  halo shader (**no new shader program**, checked in the Playwright test), no three.js lights, no
  shadow maps; +4 draw calls in all. Paired against `origin/main`: frame time within noise (overview
  at night +0.05 ms on the recheck, Kungsängen −0.01 ms); the light update costs 0.0017 ms of CPU per
  frame.

## How it works

- `src/lib/lighting/aircraftLights.ts` — pure model: 11 sockets in the aircraft's model frame
  (+z forward, +y up, **+x = left**), sectors, flash timing (`flashLevel` averages a pulse over the
  frame's simulation-time window), the phase rule, and `createSimClock` (simulation time from the
  backend's snapshots, interpolated at the time scale, at most 0.25 s ahead, held when paused, never
  backwards except after a reset).
- `src/lib/lighting/aircraftLightsView.ts` — each frame: world position of every socket = the drawn
  body's object matrix (`airplane.matrixWorld`, the same interpolated transform as the body) × socket;
  colour = phase rule × flash × sector towards the camera × display level, written into the instance
  colours of two `InstancedMesh`es with the halo shader (glare 1.3 m / at least 3 px for position
  lights and beacons; 4 m / 6 px for landing, taxi and strobe lights; estimates).
- `src/lib/transportModels.ts` — lenses at the sockets (red, green, beacon domes, one merged white mesh
  for tail, strobes, landing and taxi lights), the tip lenses' sides fixed, `aircraftPoses()`,
  beacon lens flashing with the beacon.
- `src/lib/Scene.svelte` — per frame after the models moved; `App.svelte` and
  `lighting/state.svelte.ts` — the switch; `perf/perfProbe.ts` — the glow counts under the
  'aircraft' part in measurements.

## Measured

Paired timing against `origin/main` `afa08cf` (hook builds; fullscreen 2560×1440, traffic on with
flights, Edge headless uncapped, 600 frames per view, builds in rotated order, a round starts only when
background CPU ≤ 18 %; `scripts/aircraft-e2/paired.mjs`, copied from E1's with an extra view *plane* =
camera following the aircraft). Paired difference to `main` of the same round, median [min … max], ms:

| view | `main` rAF mean | E2 | final run (5 rounds) | recheck (5 rounds) | draw calls (aircraft part) |
|---|---:|---:|---:|---:|---:|
| Overview, night | 6.13 ms | 6.34 ms | +0.31 [+0.02 … +0.58] | +0.05 [+0.02 … +0.21] | 2 012 → 2 016 (52 → 56) |
| Kungsängen, night | 3.20 | 3.55 | +0.16 [−0.04 … +0.36] | −0.01 [−0.38 … +0.40] | 696 → 698 (0 → 2) |
| Kungsängen, day | 2.93 | 2.97 | +0.04 [+0.04 … +0.12] | – | 694 → 696 (0 → 2) |
| Following the aircraft, night | 4.23 | 2.22 | −0.82 [−2.47 … −0.06] | – | 819 vs 504 (52 → 56) |

- **Reading:** no regression we can separate from noise. The final run's +0.31 ms in the overview did
  not repeat (+0.05 ms on the recheck); the first version (one glow buffer) measured +0.00
  [−0.11 … +0.12] there ([data](data/paired-first-version-summary.md)). A real cost of the order of
  0.05 ms (4 draw calls) cannot be excluded. The view following the aircraft is **not comparable**
  between builds: the shared backend puts the aircraft in a different place for each build (819 vs
  504 draw calls), so its difference is the scenery, not the lights.
- At Kungsängen the aircraft was out of view (aircraft part 0 calls on `main`); the 2 calls on E2 are
  the two glow buffers, which are never frustum-culled (a few dozen quads).
- **CPU, light update alone:** 0.0017 ms per frame for one aircraft, 0.0055 ms for four
  ([data/update-bench.md](data/update-bench.md)).

Data: [data/paired.json](data/paired.json) ([summary](data/paired-summary.md)),
[data/paired-recheck.json](data/paired-recheck.json) ([summary](data/paired-recheck-summary.md)),
[data/paired-first-version.json](data/paired-first-version.json)
([summary](data/paired-first-version-summary.md)).

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; built twice, all 29 files of `dist/` byte-identical (SHA-256); no test hook in `dist/` |
| Vitest (PowerShell, `C:\` path) | 544 / 545; new `aircraftLights.test.ts` 16 / 16. The one failure is the known `police.test.ts` (CRLF line endings of `public/assets/polis-emblem.svg` in this checkout; unrelated, untouched) |
| Playwright, full suite (26 tests incl. the new `aircraft-lights.spec.ts`), dev server `phase0-e2e` + backend `phase0-backend` | 26 / 26 twice in a row on the final code (and twice on the first version). One earlier run had 2 failures caused by me: I built test bundles inside the project folder and edited `Scene.svelte` while it ran, so the dev server reloaded the page in the middle of two tests ("execution context was destroyed", "pictures differ"); not repeated in four later full runs |
| Prettier | new files formatted; `transportModels.ts`, `state.svelte.ts`, `perfProbe.ts` still clean (`Scene.svelte` and `App.svelte` were not Prettier-clean before E2 and were not reformatted) |
| In the running app | evidence below, colours measured at each projected light |

What the new tests check:

- `src/lib/lighting/aircraftLights.test.ts`: red left / green right / white tail; **handedness through
  the real drawn transform** (`createTransportModels`) for 24 headings × 3 banks × 3 pitches, from
  behind (left tip on the left of the picture) and in front (on the right); the drawn red lens on the
  left tip; sectors (110° / 140°, overlap, every direction covered), beams; flash range 40–100 per
  minute, seeding, periodicity, frame-window averages (additive, paused = instantaneous, nothing lost
  at time scale 20); the phase rule for every phase; the clock (time scale, cap, monotonic, pause,
  reset).
- `tests/aircraft-lights.spec.ts` (with the backend): 11 lights at night with flights on; the beacon
  seen both on and off over 3 s and the clock never backwards; paused = frozen clock and flashes (and
  never frozen in a strobe flash); from behind the left tip is left of the right tip and only the white
  tail light shows (bright pixel); in front the reverse; from the left a red pixel at the left tip,
  from the right a green one at the right tip; switch *Av* removes the glow and switching costs no
  shader program (page loaded with the lights off as reference); WebGL context loss and restore: the
  same red pixel again, no extra programs.

## Evidence

All at night on 2026-10-21 21:30, simulation paused on the approach to Kungsängen (time scale 20 until
then), camera at fixed points of the aircraft's own frame (`scripts/aircraft-e2/shots.mjs`, measured
colours in [evidence/shots.json](evidence/shots.json)):

- [01 in front](evidence/01-night-front.png): the left (red) tip on the right of the picture, the right
  (green) tip on the left, both dim (seen 15° outside their own sectors from 42 m, gap 4); the landing
  lights' glare; red beacon on top.
- [02 behind](evidence/02-night-behind.png): only the white tail light (and the beacon); the runway
  lights of Kungsängen ahead.
- [03 left side](evidence/03-night-left-side.png): red; [04 right side](evidence/04-night-right-side.png):
  green.
- [05 front-left quarter](evidence/05-night-front-left-quarter.png): red, beacons top and bottom.
- [06 chase, wide](evidence/06-night-chase-wide-towards-kungsangen.png): the aircraft lined up with the
  lit runway.
- [07 head-on, 120 m ahead](evidence/07-night-head-on-120m-ahead-landing-lights.png): the two landing
  lights.
- [08 by day](evidence/08-day-front-left-quarter.png): coloured lenses by day.

Measured pixel colours (sRGB, mean of 6×6 px at the projected light): left tip seen from the left
(238, 187, 175), red-dominant with a white-hot centre; right tip from the right (201, 232, 219); tail
from behind (226, 227, 230); lights outside their sector stay at the background level.

## Files

New: `src/lib/lighting/aircraftLights.ts`, `aircraftLightsView.ts`, `aircraftLights.test.ts`,
`tests/aircraft-lights.spec.ts`, `scripts/aircraft-e2/` (`shots.mjs`, `update.bench.ts`, `paired.mjs`,
`summarize.mjs`),
`docs/aircraft-lights-e2/`. Changed: `src/lib/transportModels.ts`, `src/lib/Scene.svelte`,
`src/App.svelte`, `src/lib/lighting/state.svelte.ts`, `src/lib/perf/perfProbe.ts`, `.gitignore` (`/work/aircraft-e2/`),
`docs/roadmap.md`, `docs/claude-progress.md`. Local only: `.claude/launch.json` (`e2-main` 5321,
`e2-new` 5322), `work/aircraft-e2/` (hook builds, raw runs, logs; the temporary `origin/main` worktree was removed after measuring).

## Reproduce

```
npx vitest run src/lib/lighting/aircraftLights.test.ts            # PowerShell, uppercase C:\ path
E2E_BASE_URL=http://127.0.0.1:5194 npx playwright test tests/aircraft-lights.spec.ts   # phase0-e2e + phase0-backend
node scripts/aircraft-e2/shots.mjs http://127.0.0.1:5194 <new-dir>
npx vitest bench --run scripts/aircraft-e2/update.bench.ts
# hook builds (VITE_LIGHTING_HOOK=1) of origin/main (worktree) and of the working tree; preview e2-main 5321, e2-new 5322
VIEWS=night/overview,night/airport,day/airport,night/plane MAX_BUSY=18 \
  node scripts/aircraft-e2/paired.mjs <new.json> 5 main=http://127.0.0.1:5321 e2=http://127.0.0.1:5322
node scripts/aircraft-e2/summarize.mjs <run.json> > <summary.md>
```

See also [data-provenance.md](data-provenance.md), [remaining-gaps.md](remaining-gaps.md).
