# Airport Lighting Phase E1 — runway lights at Norrköping-Kungsängen (2026-11-03)

Worked directly on local `main` (= `origin/main` `ff96ae0`), as agreed with the user on 2026-11-02:
tested locally by the user, **committed (`24724eb`) and pushed to `origin/main`** (2026-11-03). Backend unchanged. Roadmap track
E, step E1; plan: `docs/step62/airport-lighting-plan.md`.

## Result

- **470 lights on RWY 09/27, from the current AIP** (AIRAC AIP AMDT 6/2026, effective 2026-10-29,
  read 2026-11-03; same values as the plan's AMDT 1/2026): edge lights white with yellow caution
  zones (72), combined threshold/end rows green outwards and red inwards (32), Calvert CAT I approach
  lights 540 m (RWY 09) and 900 m (RWY 27) (268), PAPI on the left of each landing direction (8), and
  blue edge lights on taxiways B and C only (90). Nothing on the grass runway 11/29 (unlit per the
  AIP) or at Bråvalla. No centreline, touchdown-zone, wing-bar or stopway lights (none published), no
  beacon (none listed). Where the AIP gives no detail, ICAO Annex 14 rules fill it in, labelled
  ESTIMATE ([data-provenance.md](data-provenance.md)).
- **Geometry checked.** The map's runway ends lie on the AIP threshold coordinates within 0.024 m
  (after EPSG:3006 conversion); the mapped length is 2204.8 m (AIP 2205 m).
- **Seen like real lights.** Each light's colour depends on where it is seen from: a pilot on the
  3° slope to RWY 27 sees the green threshold, white edges turning yellow in the last 600 m, red end
  lights, the approach centreline and crossbar, and the PAPI as **two white, two red**; above the
  slope four white, below four red ([evidence 01](evidence/01-night-approach-27-on-slope.png),
  [02](evidence/02-night-threshold-27-papi-2-white-2-red-zoom.png)). From the side and from above the
  edge rows show dimly (side spill, estimate) ([04](evidence/04-night-side-view-edge-lights.png)).
- **Own switch, independent of the street lighting.** In "Tid och ljus": *Banljus Kungsängen* —
  *Tänds när det är mörkt* (default; follows the street lights' night level, a simulator rule),
  *Alltid på*, *Av* — and *Bana i bruk* — 27 (default, an estimate: no operational data) or 09. The
  runway in use switches the approach lights, the PAPI and which end shows green or red
  ([03](evidence/03-night-approach-09-runway-09-in-use.png)). URL: `?airport=auto|on|off&runway=09|27`.
- **By day:** dark on *auto*; small housings, approach-light stands and PAPI boxes stand where the
  runway's earlier 0.9 m illustrative boxes were (those are removed on 09/27; 11/29 and Bråvalla keep
  theirs, unlit) ([05](evidence/05-day-auto-off-and-on-and-housings.png)).
- **No measurable cost.** Paired against `origin/main` (5 rounds, fullscreen 2560×1440, night with
  traffic): frame time −0.23 … +0.04 ms (median per view, all within noise, sign mixed); +5 … +6 draw
  calls; **no new shader program** (the glow reuses the street-light halo program; checked by the new
  Playwright test). Recolouring all lights for a moving camera: 0.017 ms per frame.

## How it works

- `src/lib/airport/runwayLights.ts` — pure layout: every light's position (scene x/z), height and
  faces (direction, colour, which runway must be in use, PAPI angle), plus `faceSeen()` (main beam
  ±30° fading to ±60°, side spill, PAPI white above / red below its angle within ±10°).
- `src/lib/airport/runwayLightsView.ts` — one instanced glow mesh (the street lights' halo shader and
  parameters, so the same program) and instanced housings. The glow colours are computed on the CPU
  when the camera, the runway in use or the switch changes, and written as instance colours.
- Wired in `mapView.ts` (created with the map), `Scene.svelte` (per-frame update, hook
  `__cityLighting.airport()`), `lighting/state.svelte.ts` (switch state, URL), `App.svelte` (two
  selects). `lighting/fixtures.ts` now exports its halo shaders. `mapLandmarks.ts` no longer draws the
  illustrative boxes on 09/27. `perf/perfProbe.ts` counts the new group under 'lights'.

## Measured

| view (night unless noted) | `main` rAF mean | E1 | paired difference [min … max] | draw calls |
|---|---:|---:|---:|---:|
| Overview | 6.36 ms | 6.30 ms | −0.23 [−0.83 … +0.26] | 2 004 → 2 010 |
| Kungsängen | 3.45 | 3.43 | −0.03 [−0.12 … +0.47] | 688 → 694 |
| Innerstaden | 6.66 | 6.37 | −0.10 [−1.19 … +0.36] | 1 216 → 1 221 |
| Overview, day | 5.31 | 5.25 | −0.06 [−0.67 … +0.07] | 2 003 → 2 008 |
| Kungsängen, day | 3.11 | 3.07 | +0.04 [−0.48 … +0.09] | 687 → 692 |

Data: [data/paired.json](data/paired.json), [summary](data/paired-summary.md),
[data/recolor-bench.json](data/recolor-bench.json). The camera stands still during those runs; the
recolouring cost of a moving camera is the separate benchmark (`scripts/airport-e1/recolor-bench.mjs`).

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; built twice, 29 files byte-identical; no `__perfP1` in `dist/` |
| Prettier | new files clean; existing files: only the changed lines (the rest was left as it was) |
| Vitest (PowerShell, `C:\`) | 526/527 — new `runwayLights.test.ts` 10/10; the known `police.test.ts` CRLF failure |
| New Playwright `airport-lights.spec.ts` | counts per group; auto lit at night, off, by day dark on auto and lit on 'on'; runway 09 switches the 27 approach lights and PAPI off; PAPI RRWW on slope, WWWW above, RRRR below; no new programs; same picture after a WebGL context loss |
| Playwright, full suite (25 tests incl. the new one), twice | **25/25, 25/25** |
| Layout data rebuild | `data/layout.json` byte-identical on rebuild |

## Files

- New: `src/lib/airport/runwayLights.ts`, `runwayLightsView.ts`, `runwayLights.test.ts`;
  `tests/airport-lights.spec.ts`; `scripts/airport-e1/` (`layout-summary.mjs`, `paired.mjs`,
  `summarize.mjs`, `recolor-bench.mjs`); this folder.
- Changed: `src/App.svelte`, `src/lib/Scene.svelte`, `src/lib/mapView.ts`, `src/lib/mapLandmarks.ts`,
  `src/lib/lighting/state.svelte.ts`, `src/lib/lighting/fixtures.ts`, `src/lib/perf/perfProbe.ts`,
  `.gitignore`.

## Reproduce

```
node scripts/airport-e1/layout-summary.mjs <out.json>         # compare with data/layout.json
node scripts/airport-e1/recolor-bench.mjs
# hook builds of origin/main (from a worktree) and of the working tree; preview servers e1-main 5311, e1-new 5312
VIEWS=night/overview,night/airport,night/city,day/overview,day/airport MAX_BUSY=18 \
  node scripts/airport-e1/paired.mjs <new.json> 5 main=http://127.0.0.1:5311 e1=http://127.0.0.1:5312
node scripts/airport-e1/summarize.mjs <run.json> > <summary.md>
```
