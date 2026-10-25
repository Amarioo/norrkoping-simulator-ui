# Lighting Phase L2a — street lighting in the whole city

2026-10-25 · branch `codex/lighting-l2` (from `main` = `e93f7b4`) · committed; `main` fast-forwarded and pushed · backend unchanged.

## Verdict

The app now shows Norrköping's streets lit at night: **14 350 new street lights** on every car road
that Phase L0 judged lit, placed at the kerb with the same rules as A1–A3, together with the 273
earlier fixtures (14 623 in total). Norrtull is lit. Every performance and memory target is met on
this machine (frame time +0.3 ms at most, map-ready +23 ms, memory +7.9 MB, ≤ 7 extra draw calls,
≤ 50 k extra triangles). All positions are estimates, as in A1–A3. Recommendation: **approve**; next
step L2b (footways, cycleways, squares) or L2c (junctions outside the tätort), as planned.

## Decisions needed

None blocking. For later:
1. Short road pieces (263 ways shorter than half a lamp spacing) get no lamp of their own, as in
   A1–A3 (that rule caused A3's dim ring stretches). Recommended: keep for now, revisit with a
   chain-based station rule if dark stubs show up in review.
2. 24 lit squares (`area=yes`) get no fixtures (positions cannot be derived from an outline).
   Recommended: handle in L2b with the paths.

## Risks / not verified

- All 14 350 positions, types and spacings are estimates; there is still no municipal register.
- One machine only (RTX 5070 Ti, Edge/ANGLE D3D11); no weaker GPU tested.
- The rendered map is the 2026-10-16 OSM snapshot, the lighting source 2026-10-24: 4 ways missing from
  the map and 17 with moved geometry get no fixtures (listed).
- Mapped OSM lamps: the single one nearest a car road conflicts with the rendered map and is rejected;
  24 near paths wait for L2b.

## What was built

| Part | Change |
|---|---|
| Generator ([`corridorGenerator.ts`](../../src/lib/lighting/corridorGenerator.ts)) | Spatial indexes for buildings, walls, roads, tram, rail, water, platforms, lit roads and accepted fixtures, so the whole city runs in **0.7 s**; every query keeps the original scan order, so A1, A2 and A3 regenerate **byte-identically** (their write checks and tests). New optional `litEvidence` (tag / gap / rule from L0) instead of only `lit=yes`; OSM tags are never changed. |
| L2a rollout ([`corridorL2.ts`](../../src/lib/lighting/corridorL2.ts)) | Zone = the whole supported map; A3 policy values unchanged; earlier estimates count for spacing; A1–A3 station slots are identities (108 met again, none duplicated). |
| Source ([`scripts/data/lighting-l2-source.json`](../../scripts/data/lighting-l2-source.json)) | From the pinned L0 snapshot: 3 356 lit car-road ways + their one-way partners (3 402), 1 lamp node. |
| Compact format ([`compactSet.ts`](../../src/lib/lighting/compactSet.ts)) | `lighting-compact-v1`: typed columns in base64, ≈ 75 bytes per fixture (A1–A3 JSON ≈ 330); decodes to the A1–A3 records, so validation and rendering are unchanged. |
| Loading ([`Scene.svelte`](../../src/lib/Scene.svelte), [`controller.ts`](../../src/lib/lighting/controller.ts)) | `streetlights-l2.json` is a separate asset (1.08 MB, 328 KB gzip) fetched at start and swapped in before map-ready; the App chunk grows 2.4 KB. `?lighting=a3` (dev/hook builds only) keeps the A1–A3 set for the earlier phases' tests. |
| Memory | Registry records are kept only in development (`keepRecords`); that is what brings the heap within target. |

## Results

| | Value |
|---|---|
| New fixtures | **14 350** (8 m brackets 3 301, 6 m brackets 11 049; 30 on bridge decks); by evidence: OSM `lit=yes` 5 110, guideline rule 9 224, gap fill 16 |
| Placement rules used | one side 12 220, dual-carriageway outer kerb 1 865, roundabout outer ring 171, staggered (≥ 9 m roads) 94 |
| Rejected candidates (with reason) | 1 566: too close to another estimate 1 329, A1–A3 slot identity 108, too close to an existing fixture 88, no valid position 40 (building 19, carriageway 9, rail 7, tram 5), mapped lamp in conflict 1 |
| Way coverage | 3 048 ways with lamps; 263 too short for a station; 24 squares; 46 partners not lit themselves; 17 geometry moved; 4 not in the map |
| Norrtull | 286445696, 300186798, 1050773512 now have 1 + 1 + 2 brackets |
| Rendered set | 14 623 fixtures, max 16 lamps per cell (limit 32), 20 shader programs |

Performance (paired production builds, `main` vs L2a, 3 rounds × 10 views × day/night/night-match;
[data/performance-paired.json](data/performance-paired.json)):

| Gate | Result |
|---|---|
| p95 Δ ≤ 1 ms (95 % of frames faster than this) | **−0.1 … +0.3 ms** ✔ |
| Day p95 Δ ≤ 0.5 ms | ≤ +0.3 ms ✔ |
| Map-ready Δ ≤ 100 ms | **+23 ms** median (per round −155 / +14 / +23) ✔ |
| Post-GC JS heap Δ ≤ 10 MB | **+7.9 MB** (118.05 → 125.95) ✔ |
| Draw calls ≤ 40 / triangles ≤ 100 k per view | +0 … +7 / ≤ +50 k ([data/diff-before-after.json](data/diff-before-after.json) metadata) ✔ |
| Shader programs | 20 everywhere ✔ |

Pictures: night views change strongly (e.g. Söderstaden luminance 4.7 → 12.2 in the e2e test); day
views only gain the new poles (≤ 1 397 changed pixels). Strömparken, already lit by the pilot, changes
in 620 pixels.

## Screenshots ([evidence/](evidence/))

01 whole city at night · 02 inner city · 03 Hageby · 04 Klockaretorpet · 05 Söderstaden by day (new
poles) · `diff-*`: main | L2a | difference ×16 for Norrtull (A3 ring street view), Söderstaden, city
overview, Kungsgatan and Hageby.

## Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors (first run: 4 type errors in the new test, fixed) |
| `npm run build` | OK |
| `npm test` | **405/405** (31 files; +10 in `corridorL2.test.ts`: byte-identical regeneration, types and IDs, seams, Norrtull, no fixture in a building, compact round trip and size, malformed input, registry validation, combined set with earlier lamp rows bit-identical) |
| `npm run test:e2e` (backend copy 8095, dev 5194) | **10/10** first run, incl. the new L2a test (loaded at map-ready, brighter Söderstaden, swaps, rejection, recreation, context restoration) |
| A1/A2/A3 write harnesses | byte-identical after the generator change |
| L2 harness | two generations identical; committed files equal |

Earlier tests changed: the A1, A2, A3 and "survives rebuilds" e2e tests open the app with
`lighting=a3`, because they check the 273-fixture set they were written for (their expectations are
unchanged).

## Reproduce

```powershell
node scripts/lighting-l2/extract-source.mjs                       # needs the pinned L0 raw snapshot in work/
$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2/vitest.config.ts write; $env:WRITE=$null
# captures: node scripts/lighting-l1/capture.mjs <out> <devUrl>   (main baseline: work/lighting-city-l2/before-app)
# performance: node scripts/lighting-phase0/measure.mjs work/lighting-city-l2/perf/paired.json 3 5217 5213
```

Data and licences: [data-provenance.md](data-provenance.md). Gaps: [remaining-gaps.md](remaining-gaps.md).
