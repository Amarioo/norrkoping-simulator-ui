# Lighting Phase L1 — scalable rendering

2026-10-24 · branch `codex/lighting-phase-a2` · committed after L0 `d5f242b`, `main` fast-forwarded and pushed · baseline: committed
A3 `53468b0` (exported to ignored `work/lighting-city-l1/before-app`).

## Verdict

The renderer now carries a whole-city lighting set: the citywide test load of **25 314 lamps** (the
273 rendered fixtures + every L0 station moved to an approximate kerb) is accepted, renders the whole
city at night and costs **no measurable frame time** on this machine (p95 −0.6 … +0.5 ms per view,
draw calls +0 … +3, 20 shader programs at most). Today's 273-fixture scene is unchanged in its light
(lighting-index bytes rebuilt into the old format are identical to the A1–A3 pinned hashes); only
pole and lens silhouettes 250 m or more away change slightly (simpler shapes). One gate is missed: **JS memory +24.9 MB** at 25 000 lamps
(target ≤ 10 MB per step), caused by per-lamp JavaScript objects; the fix is a compact data format,
planned for L2. Recommendation: **approve**, with the memory gate handled in L2 (decision 1).

## Decisions needed

1. **Memory gate** (+24.9 MB heap at 25 000 lamps vs ≤ 10 MB/step, ≤ 20 MB cumulative). Recommended:
   accept for L1 and make a compact runtime format (columnar, records built on demand) a requirement
   of L2, which ships the real ≈ 25 000 fixtures anyway (their JSON in today's format would be ≈ 8 MB).
2. **Triangle gate** at night: halos of all lamps add ≈ 50 k triangles; Strömparken night is +103 k
   (target ≤ 100 k). Recommended: accept (no frame-time effect measured); revisit if a weaker GPU is
   measured.
3. **Capacity 32 per cell** (was 16) replaces "reject the whole set" for crowded junctions without
   dropping any lamp; worst-case shading cost per pixel doubles only in those cells (18 cells in L0
   had 17–23). Recommended: keep (taken in L1 under "aldrig tyst bortfall"; no dropping policy).

## Risks / not verified

- Measured on one machine only (RTX 5070 Ti, Edge/ANGLE D3D11); no weaker GPU tested.
- The test load is **not** a placement: centreline stations moved 0.8 m beyond half the road width,
  always to the right of the way direction; no bridge decks, water, rail or seam rules (L2 does that).
- Frame times are browser frame intervals, not isolated GPU time; heap is JS heap, not VRAM.
- Earlier phases' report harnesses (`scripts/lighting-a*/reports.test.ts`, `scripts/lighting-phase0/
  synthetic-city.test.ts`) still compile but would now report L1-format byte counts; they were not
  re-run and their outputs are untouched.

## What changed

| Area | Before (Phase 0 – A3) | After (L1) |
|---|---|---|
| Light index per 25 m cell | 16 fixed slots (RGBA32F, −1 padding); > 16 lamps rejected the set | cell header (start, count; RG32F) + one lamp list (R32F); ≤ 32 lamps (`MAX_PER_CELL`), > 32 rejects, nothing dropped |
| Index memory, today's set | ≈ 74 KB payload (72 pages × 1 KB) | 17.9 KB (headers 9.2 KB + list 8.7 KB) |
| Index memory, 25 314 lamps | would need 4.5 MB (and reject: 18 cells > 16) | 1.79 MB (headers 1.05 MB incl. row padding + list 0.74 MB) |
| Housings and lenses | one mesh per (area, type); poles to 1.25 km, lenses to 3.5 km per area | gathered per fixture near the camera: full detail ≤ 250 m, low detail ≤ 600 m, lenses ≤ 1 km; re-gathered after 12.5 m of camera movement |
| Halos | one mesh per area | one mesh for all lamps |
| Draw calls for lighting visuals | grows with areas (≈ 7 per area) | constant: ≤ 13 meshes (≤ 10 drawn in street views) |
| Shader | `city-lights-v2` | `city-lights-v3` (list lookup); still 20 programs |

Code: [`lightIndex.ts`](../../src/lib/lighting/lightIndex.ts), [`cityLights.ts`](../../src/lib/lighting/cityLights.ts)
(shader + `MAX_PER_CELL = 32`), [`fixtures.ts`](../../src/lib/lighting/fixtures.ts) (gathering, LOD),
[`controller.ts`](../../src/lib/lighting/controller.ts) (list texture), [`Scene.svelte`](../../src/lib/Scene.svelte)
(dev hook `registries.runtimePlus`; hook also in builds with `VITE_LIGHTING_HOOK=1`, absent otherwise).

## Results

### Today's scene (273 fixtures), paired production builds, 3 rounds × 10 views × 3 conditions

| Gate | Result |
|---|---|
| Paired p95 Δ ≤ 1 ms | **−0.4 … +0.5 ms** (all 30 view/condition cells) |
| Day p95 Δ ≤ 0.5 ms | max +0.5 ms (city, stadium) |
| Map-ready Δ ≤ 100 ms | +91.5 ms median (per round −90 / −28 / +98: noise both ways) |
| Heap Δ ≤ 10 MB | −0.02 MB |
| Bundle | App chunk +2 462 B (648 536 → 650 998) |
| Pixels | 10 of 22 captures identical (A3 ring at street level, Strömparken, city overview, Hageby, Klockaretorpet; day and night); the rest differ in ≤ 492 of 1.4 M pixels, only at pole and lens silhouettes (low-detail housings 250–600 m away, none beyond 600 m, lenses beyond 1 km) ([data/diff-before-after.json](data/diff-before-after.json), triptychs in [evidence/](evidence/)) |
| Index identity | the L1 index rebuilt into the 16-slot form equals the Phase 0, A1, A2 and A3 pinned hashes byte for byte (tests) |

### City scale: 273 vs 25 314 lamps in one production bundle (hook build), 3 rounds × 10 views × day/night

| Measure | 273 | 25 314 | Gate |
|---|---:|---:|---|
| p95 Δ per view | — | **−0.6 … +0.5 ms** | ≤ 1 ms ✔ |
| Draw calls per view | e.g. 2 057 (Strömparken) | +0 … +3 | ≤ 40 ✔ |
| Triangles per view (night) | — | +50 k … +103 k (halos ≈ 50 k + nearby housings) | ≤ 100 k ✘ by 3 % in one view |
| Shader programs | 20 | 20 (19 by day) | no new variant ✔ |
| Post-GC JS heap | 118.07 MB | 142.99 MB (**+24.9 MB**) | ≤ 10 MB ✘ |
| Swap (validate + index + upload) | — | 130 ms (prepare 99 ms, upload 2 ms) | — |
| Lighting textures (CPU arithmetic) | 0.1 MB | lamp 4.19 + headers 1.05 + list 0.74 + directory 0.06 = 6.0 MB | ≤ 16 MB ✔ |
| Instance buffers | 72 KB | 2.95 MB | (in 16 MB) ✔ |
| Overflowing cells / max per cell | 0 / 15 | 0 / 22 | ≤ 32 ✔ |

Node figures (deterministic, [data/scale.json](data/scale.json)): street views gather 2 900 – 4 340
housings/lenses = 38 k – 63 k triangles; 400 random cameras never drop an instance; a 4 096-texel
device limit works too (lamp atlas wraps into 7 column blocks).

## Screenshots ([evidence/](evidence/))

01 whole city at night with the 25 314-lamp test load · 02 inner city · 03 Drottninggatan /
Saltängsbron · 04 Kungsgatan at street level (pilot brackets right, test-load lanterns left) · 05
Hageby · 06 today's 273 fixtures, same overview · `diff-before-after-*`: before | after | difference ×16.

## Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK |
| `npm test` | **395/395** (30 files; 391 after L0 + 4 new in L1: lamp-list storage, gathering determinism, synthetic 28 000-lamp city ×2) |
| `npm run test:e2e` (backend copy 8095, dev 5194) | **9/9** first run |
| L0 harness / L1 harness | byte-identical rebuilds |

Changed tests (format changed by design, meaning kept, nothing weakened):
- "17 lamps crowding a cell are rejected" → MAX_PER_CELL + 1 = 33 (Vitest and Playwright).
- A1–A3 capacity checks still require ≤ 16 per cell for those sets (`STEP6_MAX_PER_CELL`).
- Pinned-hash tests compare the old 16-slot form rebuilt from the new index (`toStep6SlotPayload`) with the
  unchanged A1–A3 and Phase 0 manifests.
- Frozen-transform tests compare per fixture after gathering at every fixture, instead of per area mesh.
- Shader cache key v2 → v3.
- L0's capacity analysis now uses a frozen copy of the 16-slot index (`scripts/lighting-city/phase0LightIndex.ts`)
  so its outputs stay byte-identical.

## Reproduce

```powershell
.\node_modules\.bin\vitest.cmd run -c scripts/lighting-l1/vitest.config.ts   # stress set → work/, scale.json check (WRITE=1 writes)
node node_modules/vite/bin/vite.js build                                      # after; before: same in work/lighting-city-l1/before-app
$env:VITE_LIGHTING_HOOK='1'; node node_modules/vite/bin/vite.js build --outDir work/lighting-city-l1/dist-hook; $env:VITE_LIGHTING_HOOK=$null
# previews: l1-before-preview 5214, l1-preview 5213, l1-hook-preview 5215 (.claude/launch.json)
$env:VIEWS='kungsgatan,ingelstaBridge,policeEmblem,station,grandHotel,centrum,city,stromparken,idrottsparkenPitch,parken'; node scripts/lighting-phase0/measure.mjs work/lighting-city-l1/perf/paired.json 3 5214 5213
node scripts/lighting-l1/measure-scale.mjs work/lighting-city-l1/perf/scale.json 3 5215
node scripts/lighting-l1/capture.mjs work/lighting-city-l1/captures/after http://127.0.0.1:5211/   # STRESS=1 for the test load
```

Raw results: [data/performance-paired.json](data/performance-paired.json),
[data/performance-scale.json](data/performance-scale.json). Provenance: [data-provenance.md](data-provenance.md).
Gaps: [remaining-gaps.md](remaining-gaps.md).
