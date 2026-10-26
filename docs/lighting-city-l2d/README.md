# Lighting Phase L2d — site lighting on private land (parking, rail yard, industry, retail)

2026-10-26 · branch `claude/lighting-l2d` (from `main` = `705d4f3`) · approved by the user 2026-10-26 with the recommended decisions; committed on the branch, **not pushed** · backend unchanged.

## Verdict

At night the parking lots and the rail yard around Polishuset (Stinsen 1) and Norrköping C, and the
parking and site roads of industrial, port, retail and commercial land across the city, are now lit:
**3 503 new estimated fixtures** in a **category of their own** ("site lighting", rule
`lighting-l2d-v1`), separate from street lighting, with two new fixture types (a 10 m site pole and an
18 m yard mast) whose light values are estimates. Every performance gate is met with a wide margin
(frame time −0.5 … +0.05 ms, memory +1.9 MB, ≤ 6 extra draw calls, 20 shader programs), and every
earlier phase's output is byte-identical. Recommendation: **approve**, with the decisions below;
the biggest remaining gap (open industrial and port yards such as Braviken/Lindö) needs better
evidence than OSM has.

## Decisions needed (recommendation first)

1. **Large parking lots: perimeter poles + an interior grid** (done) — or only poles along the edge.
   Recommended: keep both; only lots wider than ≈ 40 m get grid poles (63 in total).
2. **Industry and retail lit all night** (done, like the streets) — or switch off retail lots after
   closing. Recommended: keep all night for now; real schedules are unknown and switching needs a small
   shader change (one per-lamp flag, no new program).
3. **Rail yard with 18 m high masts** (done, 95 masts at Norrköping C) — or ordinary 10 m poles.
   Recommended: keep the masts (rail yards are typically lit from tall masts).
4. **Minimum lot size 500 m²** (≈ 20 spaces; 224 smaller lots stay dark) — recommended: keep.
5. **Colour 4 000 K** (neutral white LED) for site lighting vs the streets' warm 2 700–3 000 K —
   recommended: keep; it is an estimate but also makes the category visible.
6. **Open industrial/port yards** (Braviken paper mill, Holmen, Lindö): not lit, because OSM maps no
   lots or roads there. Recommended next step: find the real lighting masts in Lantmäteriet's laser
   data (as D1b measured the police tower) instead of guessing a grid.

## Risks / not verified

- **Everything is an estimate**: OSM does not say whether a lot or yard is lit (0 of 609 lots tagged),
  and no positions, types or light values exist for private sites.
- One machine (RTX 5070 Ti, Edge/ANGLE D3D11); one measurement series (4 rounds). Weaker GPUs not tested.
- The measured production build was generated before a cosmetic fix of the statistics keys in the
  runtime file's metadata (`L#` → `L0`); fixtures and rendering are identical (only metadata text).
- The satellite comparison is a plausibility check only (2016 image, saturated, 240 × 460 m pixels).
- The 4 000 K light makes lots look whiter than streets; whether that matches Norrköping is unverified.

## Rules and counts

| Rule | Fixtures | Type | Where |
|---|---:|---|---|
| Rail-yard tracks (`service=yard/siding` on `landuse=railway`) | 95 | yard mast 18 m | Norrköping C yard (way 94253955) |
| Lot perimeter (328 lit lots ≥ 500 m², 82 ha) | 1 501 | site pole 10 m | whole map |
| Lot interior grid (32 m lattice, ≥ 19.2 m from the edge) | 63 | site pole 10 m | large lots |
| Site roads (dark `highway=service` on industrial / port / retail / commercial / railway land, 572 ways, 75 km) | 1 844 | site pole 10 m | e.g. Holmen Timber 166, Ingelsta retail 130 + 93, Braviken mill 121 |
| **Total** | **3 503** | all estimates | |

Decisions for every candidate site (4 240), with the reason, are in the provenance file: e.g. lots —
328 lit, 224 too small, 46 street-side, 11 not open-air, 28 mapped only as a point; service roads —
572 lit, 1 936 outside site land, 378 aisles inside a lit lot, 259 aisles outside lots and site land,
125 driveways/emergency access, 5 `lit=no`; tracks — 100 yard tracks, 42 spurs, 159 disused /
abandoned / tram, 21 not on railway land. Rejected candidates (1 574): 782 too close to another L2d
fixture, 440 within 12 m of street lighting ("lit by the street"), 352 no valid position (carriageway
217, rail clearance 106, building 23, lot outline 5, platform 1).

Satellite check (Black Marble 2016): mean L2d fixtures per pixel rise with brightness — 0.05 (darkest)
→ 0.44 → 1.45 → 2.21 → **6.87** (brightest); 26 of the 124 bright pixels without street lighting now
have site lighting; 3 of 195 dark pixels got some (10 fixtures).

## What was built

| Part | Change |
|---|---|
| Rule ([`siteLighting.ts`](../../src/lib/lighting/siteLighting.ts)) | policy `lighting-l2d-v1`, two new types (estimates), identity, category `site` |
| Generator ([`siteGenerator.ts`](../../src/lib/lighting/siteGenerator.ts)) | sister of `corridorGenerator.ts` (left untouched, so L2a/L2bc provenance hashes stay valid): lots (perimeter + grid), yard tracks, site roads; A1–A3 conflict and occlusion tests; seams with every earlier fixture; deterministic acceptance order; 0.4 s for the whole city |
| Source ([`scripts/lighting-l2d/`](../../scripts/lighting-l2d/)) | `fetch-source.mjs` (one-off), `sources.json` (pinned SHA-256), `extract-source.mjs` → [`scripts/data/lighting-l2d-source.json`](../../scripts/data/lighting-l2d-source.json), `inputs.ts`, `write.test.ts`, `capture.mjs`, `poses.json` |
| Runtime | [`streetlights-l2d.json`](../../src/lib/data/streetlights-l2d.json), `lighting-compact-v1`, 265 KB (90 KB gzip), a third asset fetched in parallel with L2a/L2bc before map-ready; same light index (≤ 32 per cell; max 16), same shader patch |
| Controller ([`controller.ts`](../../src/lib/lighting/controller.ts)) | `l2dLightingRegistry`, `cityLightingRegistry(…, l2d)`, `describe().siteLighting` = { category, rollout, shown, fixtures, streetFixtures }; rollout `lighting-l2d-v1` in `describe().streetLighting.rollouts` |
| App ([`Scene.svelte`](../../src/lib/Scene.svelte), [`mapModel.ts`](../../src/lib/mapModel.ts)) | `?lighting=no-l2d` (dev / hook builds) leaves the category out; hook `registries.cityStreets()`; two new views: *Bangården vid Norrköping C*, *Ingelsta handel och industri* |
| Fixtures ([`fixtures.ts`](../../src/lib/lighting/fixtures.ts)) | geometry for `site-pole-10m` and `yard-mast-18m` (near and low detail) |

No three.js lights; shader program count unchanged (20).

## Results

Performance: paired production builds, `main` (`705d4f3`, via `git archive`, `node_modules` junction;
the only change is the two view entries, so both builds can select them) vs L2d, 4 alternating
rounds × 8 views × day / night / night-match, traffic API aborted
([data/performance-paired.json](data/performance-paired.json), [summary](data/performance-summary.json)).
p95 = the frame time that 95 % of frames beat.

| Gate | Result |
|---|---|
| p95 Δ ≤ 1 ms (night) | **−0.50 … +0.05 ms** (Polishuset +0.05, bangården +0.05, Ingelsta −0.05) ✔ |
| Day p95 Δ ≤ 0.5 ms | **−0.35 … −0.05 ms** ✔ |
| Map-ready Δ ≤ 100 ms | **−46 ms** median (per round −400 / −129 / −54 / +23) ✔ |
| Post-GC JS heap Δ ≤ 10 MB | **+1.9 MB** (127.76 → 129.67) ✔ |
| Draw calls ≤ 40 / triangles ≤ 100 k per view | **+0 … +6 / +0 … +14.3 k** ([data/calls-triangles.json](data/calls-triangles.json)) ✔ |
| Shader programs | **20** everywhere ✔ |

Pictures ([data/diff-before-after.json](data/diff-before-after.json)): at night 64 k – 268 k pixels
change per view (lots, yard, site roads); by day only pole pixels (≤ 1 736 px; Ingelsta 2 px; the city
overview 0 px).

## Screenshots ([evidence/](evidence/))

01 Polishuset at night · 02 the lots beside Polishuset at night · 03 the yard at Norrköping C at night ·
04 Ingelsta at night · 05 the lots beside Polishuset by day (new poles) · `diff-*`: main | L2d |
difference ×16, day and night, for Polishuset (two poses), the yard, Ingelsta and the city overview.

## Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings (first run: 1 type error in the generator, fixed) |
| `npm run build` | OK (App chunk 681.7 → 683.3 KB; L2d asset separate) |
| `npm test` (PowerShell, `C:\`) | **468/469** twice; the 1 failure is the known worktree path in `terrain.test.ts` (backend repo not at `../`); the same comparison with the absolute path is equal. First run also timed out in a new L2d test (5 s under full load) → its brute-force building scan was replaced by a box filter (same check), then passed. +8 tests in `siteLighting.test.ts` |
| `npm run test:e2e` (backend copy 8098, dev 5260) | first full run **15/16**: only the new L2d test, which expected 20 programs by day *after* swapping sets (by day no halo is drawn, so a swap releases the halo program: 19; the L2a test already allows "never more than before"). The test now checks 20 by day before the swap and "no new programs" after it; second full run **16/16** (the known flaky A2/A3, simulation and transit tests passed in both runs). L2d: lots at Polishuset luma 8.5 → **31.2** at night (frame 13.0 → 21.1), by day Δ 0.25; [data/e2e.json](data/e2e.json) |
| L2d harness | two generations identical; committed files equal a fresh generation; source extract rebuilt byte-identically |
| Earlier phases | A1, A2, A3, L0, L1, L2a + L2bc write harnesses pass; 38 output files (A1–A3, L0, L1, L2a, L2bc, B1, D1, D1b, F1) have the same SHA-256 as before |

Earlier test changed: the L2a citywide e2e test now also requires the L2d rollout and counts it in the
city total (its other expectations are unchanged).

## Reproduce

```powershell
node scripts/lighting-l2d/extract-source.mjs      # needs the pinned raw snapshot in work/lighting-city-l2d/raw/
$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2d/vitest.config.ts write; $env:WRITE=$null
# captures: node scripts/lighting-l2d/capture.mjs <out> <devUrl>   (main baseline: work/lighting-city-l2d/before-app)
# performance: VIEWS=kungsgatan,stromparken,idrottsparkenPitch,parken,city,police,stationYard,ingelsta node scripts/lighting-phase0/measure.mjs <out.json> 4 <beforePort> <afterPort>
```

Hashes: extract `508b80d6…25e4`; runtime `c67c64b0…6af6`; provenance and statistics in
`work/lighting-city-l2d/generate.json` after a run (the provenance file records every input's SHA-256).
Data and licences: [data-provenance.md](data-provenance.md). Gaps: [remaining-gaps.md](remaining-gaps.md).
