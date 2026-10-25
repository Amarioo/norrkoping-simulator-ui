# Claude progress report — Norrköping geospatial reconstruction

This file is the recovery checkpoint. Newest status first.

## Landmark Phase B1 part 1 — Rådhuset and Gull-Olle, geometry by day (2026-10-25) — approved (user, 2026-10-25), committed and pushed, merged into `main`

[Full report](landmark-b1/README.md). Branch `claude/landmark-b1` from `main` = `951f3cd`. **Committed
and pushed:** `main` fast-forwarded to this branch on `origin` (user, 2026-10-25). Backend unchanged. Part 2 (façade lighting) not started: no documentation of
floodlighting found ([remaining-gaps.md](landmark-b1/remaining-gaps.md) §1).

- **Result:** the OSM box (20 m, estimated) and the illustrative tower (≈ 83 m, in the courtyard) are
  replaced by a measured model (`src/lib/landmarks/radhuset/`): U-shaped brick building on the OSM
  footprint, eave 22.5 m RH2000, mansard/hip roofs and courtyard blocks from LiDAR, tower on the north
  façade (10.6 m square, cornice 58 m, pyramid roof from slices), Gull-Olle 68.65–73.15 m RH2000 →
  **68.7 m above Tyska torget** (municipality: 68 m; sculpture 4.5 m). Clocks, openings, bands,
  windows, colours and the statue's silhouette are labelled estimates (Commons photos 2015/2016/2025).
- **Data:** `scripts/landmark-b1/radhuset_lidar.py` → `docs/landmark-b1/data/radhuset-lidar.json`
  (Lantmäteriet tile y20c012-64950_5675_25, 2020-02-03, CC BY 4.0; byte-identical rebuild). Fit:
  median |Δ| 0.34 m, p90 1.47 m over 1 782 roof cells. OSM data unchanged (`DETAILED_BUILDING_IDS`).
- **Measured (paired production builds, traffic on, 11 rounds):** p95 −0.1 … +0.2 ms day and night,
  map-ready −5 ms, heap +0.14 MB, calls −3, triangles +1.2–1.5 k, 20 programs.
- **Checks:** type check 0; build OK; Vitest 435/435; Playwright 11/12 then 12/12 (only the known A3
  picture check, which fails 3/3 on `main` too); new e2e test passes.
- **Local only:** `.claude/launch.json` + `b1-*` (4); `work/landmark-b1/` (baseline app, captures, perf).

## Vehicle Lights Phase F1 — headlights and tail lights (2026-10-25) — approved (user, 2026-10-25), committed and pushed

[Full report](vehicle-lights-f1/README.md). Branch `codex/vehicle-lights-f1` from `main` = `43e1a4d`.
**Committed and pushed:** `main` fast-forwarded to this branch on `origin`. Backend unchanged.

- **Result:** at night cars, trucks and buses show glowing headlamps and red tail lamps (all vehicles,
  following the smoothed pose every frame); the ≤ 16 vehicles nearest the camera whose beam can reach
  the view throw a dipped-beam pool (±40°, cut-off ≈ +2°, 60 m) in the existing shader patch (fixed
  uniform array, no three.js lights, no new programs). Off by day (day pictures pixel-identical).
  All values are estimates (`vehicleLights.ts`, provenance in docs). Trams/trains (F2) unchanged.
- **Measured (paired production builds, traffic on via backend copy 8095, frozen world):** night p95
  ≤ +0.8 ms, day ≤ +0.5 ms pooled (one worst-case series +0.7 ms by day, treated as noise), map-ready
  +30 ms, heap +0.16 MB, calls/triangles +0, 20 programs.
- **Checks:** type check 0; build OK; Vitest 423/423 first run (later runs 422/423: known 5 s timeout in
  `infrastructure.test.ts`, same on `main`); Playwright 4 runs 10/11, 9/11, 10/11, 9/11 — new F1 test
  always passes; failures only in the known flaky A2/A3 picture checks (4 px ±1, reproduced on `main`
  7/10) and `simulation`/`transit` specs (`main` failed both).
- **Local only:** `.claude/launch.json` + `f1-*`; `.gitignore` + `/work/vehicle-lights-f1/`.

## Lighting Phase L2bc — paths, squares, junctions and motorways (2026-10-25) — implemented, committed and pushed, for review

[Full report](lighting-city-l2bc/README.md). L2b and L2c run together (user request). Branch
`codex/lighting-l2bc` from `main` = `0f86143`. **Committed and pushed:** `main` fast-forwarded to this branch on `origin`. Backend unchanged.

- **Result:** 7 723 new fixtures (path lanterns 7 077, square perimeter 154 on 24 squares, motorway
  brackets 437, junction-interval brackets 54, mapped OSM lamps 4); rendered total 22 346, max 16 per cell.
- **Generator:** flags `includeMotorways`, `squares`; spec `candidate`, `litRanges` (all off for
  earlier rollouts). A1/A2/A3 byte-identical; L2a runtime identical, its provenance changed only in
  `meta.inputs.generator.sha256`.
- **Data:** `scripts/data/lighting-l2bc-source.json` (6 655 ways, 25 lamps); runtime
  `src/lib/data/streetlights-l2bc.json` (584 KB, fetched with L2a); provenance in docs.
- **Measured (two paired production series, pooled):** p95 −0.3…+0.45 ms, map-ready −1 ms, heap
  +4.1 MB (L2a + L2bc +12 MB), calls ≤ +3, triangles ≤ +51 k, 20 programs.
- **Checks:** type check 0; build OK; Vitest 411/411 ×3 (one earlier run 1 unexplained failure, not
  reproduced); Playwright 10/10.
- **Local only:** `.claude/launch.json` + `l2bc-*`; `.gitignore` + `/work/lighting-city-l2bc/`.

## Lighting Phase L2a — street lighting in the whole city (2026-10-25) — implemented, committed and pushed, for review

[Full report](lighting-city-l2/README.md). Branch `codex/lighting-l2` from `main` = `e93f7b4` (L0 + L1
pushed there). **Committed and pushed:** `main` fast-forwarded to this branch on `origin`. Backend unchanged (`main` = `origin/main` = `3673568`, nothing to commit).

- **Result:** 14 350 new estimated street brackets on every car road L0 judged lit (tag 5 110, rule
  9 224, gap 16), placed with the A1–A3 policy unchanged; rendered total 14 623; Norrtull lit.
- **Generator:** spatial indexes (whole city in 0.7 s); A1/A2/A3 regenerate byte-identically; new
  `litEvidence` option (L0 evidence instead of only lit=yes; OSM tags untouched).
- **Data:** `scripts/data/lighting-l2-source.json` (pinned L0 snapshot, 3 402 ways); runtime
  `src/lib/data/streetlights-l2.json` in compact format `lighting-compact-v1` (1.08 MB, separate asset
  fetched before map-ready); provenance `docs/lighting-city-l2/data/` (4.3 MB, compact rows).
- **Memory fix for L1's gap:** registry records kept only in development (`keepRecords`).
- **Measured (paired production, main vs L2a):** p95 −0.1…+0.3 ms, map-ready +23 ms, heap +7.9 MB,
  calls ≤ +7, triangles ≤ +50 k, 20 programs — all gates met.
- **Checks:** type check 0 errors; build OK; Vitest 405/405; Playwright 10/10 (new L2a test; A-phase
  tests open with `lighting=a3`).
- **Local only:** `.claude/launch.json` + `l2-*`; `.gitignore` + `/work/lighting-city-l2/`.

## Lighting Phase L1 — scalable rendering (2026-10-24) — implemented, committed and pushed, for review

[Full report](lighting-city-l1/README.md). Branch `codex/lighting-phase-a2`, on top of L0. **Committed** in the commit after L0 `d5f242b`; `main` was fast-forwarded to this branch and pushed to `origin` (with Phase 0–A3 and L0). Baseline for comparisons: committed A3 `53468b0`
(exported to ignored `work/lighting-city-l1/before-app`). No runtime data changed (still 273 fixtures).

- **Light index:** 16 fixed slots per 25 m cell → cell header (start, count; RG32F) + one lamp list
  (R32F); `MAX_PER_CELL` 16 → 32 (loop guard; > 32 still rejects the set, nothing dropped). Today's
  index 74 KB → 18 KB; rebuilt into the 16-slot form it equals the Phase 0/A1/A2/A3 pinned hashes.
  Shader key `city-lights-v3`; 20 programs.
- **Fixture visuals:** per-area meshes → housings/lenses gathered per fixture near the camera (full
  detail ≤ 250 m, low detail ≤ 600 m, lenses ≤ 1 km, re-gather after 12.5 m; exact capacity, 0 drops)
  and one halo mesh for all lamps. ≤ 13 meshes regardless of city size.
- **Test load:** `scripts/lighting-l1/stress-set.ts` → ignored `work/lighting-city-l1/l0-stress-set.json`
  (25 041 L0 stations at an approximate kerb + occlusion; 8 MB; not runtime data). Dev hook
  `registries.runtimePlus`; hook also in builds with `VITE_LIGHTING_HOOK=1` (absent otherwise).
- **Measured (RTX 5070 Ti, production builds, 3 rounds):** 273 before/after p95 −0.4…+0.5 ms, map-ready
  +91.5 ms (noise ±98), heap −0.02 MB, App +2.5 KB. 273 → 25 314 lamps: p95 −0.6…+0.5 ms, calls +0…+3,
  night triangles +50…+103 k, swap 130 ms, textures 6 MB, **heap +24.9 MB (gate 10 MB missed)**.
- **Pixels (273):** 10/22 captures identical; others ≤ 492 px at pole/lens silhouettes 250 m+ away.
- **Checks:** type check 0 errors; build OK; Vitest 395/395; Playwright 9/9 first run; L0 and L1
  harnesses byte-identical. Tests adapted to the new format without weakening (list in README).
- **Decisions open:** memory gate → compact runtime format in L2; night triangle gate (+103 k in one
  view); keep capacity 32.
- **Local only:** `.claude/launch.json` + `l1-*` entries; `.gitignore` + `/work/lighting-city-l1/`.

## Lighting Phase L0 — citywide lighting map, rule `lighting-city-v1` (2026-10-24) — approved (user, 2026-10-24)

[Full report](lighting-city-l0/README.md) · map: `node scripts/lighting-city/serve-map.mjs` →
http://127.0.0.1:5195/. Branch `codex/lighting-phase-a2`. **Committed as `d5f242b`** (with the roadmap). No
runtime/app change; earlier fixtures, extracts and evidence unchanged (`git diff` empty for them).

- **Decisions** (roadmap §6, user chose the recommendations): untagged streets in an SCB tätort lit;
  paths lit beside streets / in residential areas, dark in forest, unpaved or simple paths; gap fill
  between lit pieces (lights Norrtull); lighter review; SCB 2023 tätorter (CC0).
- **Sources** (new snapshot, pinned in `scripts/lighting-city/sources.json`): OSM base
  2026-10-24T19:51:21Z (all highway ways + signals/crossings/lamps/places, SHA `e2858621…`); SCB
  Tatorter_2023 (SHA `37fd1ada…`); NASA Black Marble 2016 via GIBS (SHA `e2e9f863…`). Raw in ignored
  `work/lighting-city-l0/raw/`; committed extract `scripts/data/lighting-city-source.json` (3.3 MB).
- **Result inside the map:** 12 246 ways; lit 784 km, partly 18.6 km, dark 820 km of 1 623 km. Lit by
  evidence: tag 256 km, gap 0.8 km, rule 529 km. Norrtull's three pieces lit by gap fill.
- **Preliminary stations:** 25 041 (8 000 tag, 18 gap, 17 023 rule; 4 386 × 8 m, 12 218 × 6 m, 8 437
  lanterns); 326 inside A1–A3/pilot zones not placed, of which 71 empty slots (Norrtull 2, Matchgatan
  11, Skvallertorget 5, Tyska torget 3 …) → L2 seam work.
- **Capacity (L1 input):** with the real `lightIndex`, 18 cells > 16 lamps (max 23), all from L0
  stations; atlas 5.2 MB.
- **Satellite:** Spearman ρ 0.69 over 1 265 pixels; largest misses = privately lit port/industry/retail
  (Marbystrand/Lindö, Ingelsta, Slottshagen, Sylten), left dark on purpose (`dark-private-service`).
- **Reproducible:** build ≈ 1 s, byte-identical twice (write.test.ts) and checked in the main suite.
- **Checks:** type check 0 errors; build OK; Vitest 391/391 (+11 new); L0 harness byte-identical;
  Playwright first full run 7/9 (A3 frame-equality + known `simulation.spec.ts` baseline), both passed
  alone, second full run 9/9. No runtime change, so no app screenshots or perf run; map verified in browser.
- **Local only:** `.claude/launch.json` + `l0-map` (original in `work/lighting-city-l0/launch.json.before`);
  `.gitignore` + `/work/lighting-city-l0/`.

## Roadmap — whole-city lighting and the rest of the vision (2026-10-24) — plan only, for review

[docs/roadmap.md](roadmap.md) (Swedish checklist). No code or data changed. A3 is committed as `53468b0`
(the A3 entry below predates that commit).

- **Change of method proposed:** stop hand-drawn corridors; one rule-based generator for the whole map
  (`lighting-city-v1`), reviewed on a citywide 2D lighting map before any 3D work.
- **Measured:** only ≈ 14 % of the ≈ 1 800 km in the map has `lit=yes` (2 % `lit=no`, 84 % untagged);
  residential streets 31 % `lit=yes`. Rough citywide need ≈ 17 000 (streets) – 29 000 (with paths)
  fixtures vs 273 today (estimate, building-proximity proxy for built-up area, assumed spacing).
- **Rule source:** Norrköping's *Riktlinje för belysning* (2023-06-07) §2.4.1: street lighting mainly in
  built-up areas; roundabouts, crossings and signalised junctions always lit; park paths may stay dark.
  Check source: NASA Black Marble VNP46A4 (district-level only).
- **Stages:** L0 lighting map → L1 scalable renderer → L2a–c rollout → vehicle lights → town hall,
  police, runway, aircraft, churches, fuel, trams/trains → Vrinnevi vegetation and lit trail.
- **Open decisions** (roadmap §6): rule for untagged streets/paths, gap-fill (would light Norrtull,
  reversing the A2/A3 decision), lighter review, built-up boundary source.

## Lighting Phase A3 — rest of the Kungstorget ring; Norrtull kept unlit (2026-10-24) — implemented, for review

[Full report](lighting-phase-a3/README.md). Branch `codex/lighting-phase-a2` (UI). Before A3, with
approved file lists: `7519862` "docs: add project instructions" (CLAUDE.md) and `b42dd37` "Lighting
Phase A2 — …" (the 64 A2 files; the A2 entry below describes that state). **A3 is not committed,
pushed or merged.** Backend unchanged. `.claude/` untracked (five `a3-*` entries added to
`launch.json`; original in ignored `work/lighting-a3/`).

- **Norrtull:** user decision = option 1 (keep 286445696/300186798/1050773512 unlit). No lamp added;
  illuminance there identical before/after (tested). What an OSM `lit` check would need:
  `lighting-phase-a3/remaining-gaps.md` §1.
- **Zone F** (7 130 m², `lighting/corridorA3.ts`): 8 m outside the seven remaining ring ways (210.7 m,
  not ≈ 250 m), closed along A2 zone D's west edge (vertices reused exactly). No overlap (tested).
- **Fixtures:** 6 new estimated 8 m brackets on the outer kerb (no mapped lamp exists); rendered total
  273. The 267 earlier fixtures are bit-identical (files, records, lamp rows, cells, housings).
- **Pipeline:** same pinned snapshot → 24 KB extract (`extract-source.mjs a3`; A1/A2 extracts
  byte-identical) → shared generator + `A3_SPEC` (policy `lighting-a3-v1` = A2's; slot identity also
  covers A2) → `streetlights-a3.json` (+ provenance). 0 rejections.
- **Capacity:** max 15/16 (A1's square, unchanged), A3 cells ≤ 8, 0 overflow, 72 pages, +3.8 KB.
- **Light:** A3 ring centreline median 0 → 11.4 lux; A2 seam ≥ 3.3 lux. Two dim stretches remain
  under the per-way station rule: north arc ≈ 15 m < 3 lux (min 0.5), west link ≈ 5 m at 2.4–2.9 lux.
- **Tests:** type check clean; build OK; Vitest 380/380 (28 files; A2 tests pinned to the A2 state);
  Playwright first full run 8/9 (the A2 E2E failed one frame-equality check under heavy CPU load
  from another session); that test then passed 3 of 3 times, the lighting spec 6/6 incl. the new A3 test.
- **Perf:** draw calls unchanged in all captured views, +12…+552 triangles, 20 programs, +3.8 KB
  textures, App +3.5 KB. The paired frame-time series was disturbed by another session's load
  (map-ready −342 ms = noise); re-run on an idle machine recommended.
- **Incidents:** a production build during a capture pass spoiled six twilight noise captures (repeated);
  another session's vitest/Edge processes were running during the E2E and performance runs.

## Lighting Phase A2 — western Norra Promenaden + northern Kungsgatan (2026-10-24) — implemented, for review

[Full report](lighting-phase-a2/README.md). Branch `codex/lighting-phase-a2` (UI), created from the
committed A1 state `1fe6296` (Phase 0 `b40908a` below it; both local only). Backend unchanged
(`3673568`, clean). **Not committed, pushed or merged.** User's untracked `.claude/` not staged
(five `a2-*` server entries added to `launch.json`; original backed up in ignored `work/lighting-a2/`).

- **Area:** two EPSG:3006 zones (0.0198 km², `lighting/corridorA2.ts`): D Norra Promenaden from A1's
  west edge to the Kungstorget east junction (incl. Norrtull tram stop), E Kungsgatan from Kungstorget
  to the pilot's north bound (incl. Slottsgatan mouth). Seams on A1's edge and the pilot bound; no
  overlap (tested).
- **Fixtures:** 35 new, all labelled estimates (no mapped OSM lamp exists there): 22 × 8 m, 1 × 6 m
  bracket, 12 lanterns. Rendered total 267 (pilot 105 + A1 127 + A2 35). The 232 earlier fixtures are
  bit-identical (records, lamp rows, cells, housing transforms).
- **Pipeline:** same pinned Step 6.2 snapshot → committed 26 KB extract (`extract-source.mjs a2`) →
  the A1 generator with a corridor spec (A1 output byte-identical) → `streetlights-a2.json`
  (+ provenance). Policy `lighting-a2-v1` = A1 + two seam rules (earlier estimates count as accepted;
  A1 station-slot identity). One candidate skipped at the pilot seam; IDs never merged by distance.
- **Capacity:** combined accepted, max 15/16 (A1's square, unchanged), A2 cells ≤ 9, 0 overflow,
  69 pages, +10.6 KB textures.
- **Seams:** continuous (centreline minima 10.0 lux at the pilot seam, 5.3 lux at the A1 seam, not
  below those inside the neighbours); junctions within A1's brightness range; reference views change
  only where A2 appears in the distance; 20 programs everywhere.
- **Decision needed:** Norra Promenaden pieces 286445696/300186798/1050773512 at Norrtull have no
  `lit` tag → left unlit (≈ 0 lux over ≈ 35–40 m per carriageway). Options in
  `lighting-phase-a2/remaining-gaps.md`.
- **Perf:** series 1 (idle machine) map-ready −2.8 ms, heap +0.06 MB, max p95 +0.4 ms, day p95 ≤ +0.3 ms,
  ≤ +7 calls / +15.7 k triangles per view, 20 programs. Two later series were disturbed by a game running
  on the machine (kept, flagged); re-run on an idle machine recommended.
- **Tests:** type check clean; build OK; Vitest 342/342 (single worker; parallel runs hit known 5 s
  geometry timeouts under load); Playwright lighting 5/5, bridge bus/truck and transit pass;
  `simulation.spec.ts` second-tab timeout fails identically on the committed A1 app.
- **Incident (fixed):** re-running the Phase 0 harnesses rewrote two Phase 0 evidence files again;
  restored to the committed content.

## Lighting Phase A1 — central city corridor (2026-10-24) — implemented, for review

[Full report](lighting-phase-a1/README.md). Same branch `codex/lighting-phase0` (UI, HEAD `bf5f726`), on
top of the uncommitted Phase 0 work, which was snapshotted first (`work/lighting-a1/phase0-snapshot/`,
ignored). Backend unchanged (`3673568`). **Not committed, pushed or merged.**

- **Area:** three EPSG:3006 zones (0.083 km², `lighting/corridorA1.ts`): A Resecentrum + Norra
  Promenaden (Aurorarondellen – Sveagatan), B Drottninggatan to Saltängsbron, C Saltängsbron + Hamngatan
  junctions + Drottninggatan tram street to Gamla Rådstugugatan. Clear of all pilots (≥ 45 m).
- **Fixtures:** 127 new (10 mapped OSM lamps, 117 labelled estimates on `lit=yes` ways; 6 on the
  Saltängsbron deck); rendered total 232. `lit=no`, untagged ways, platforms and Tyska torget get none.
  No municipal ID, photometry or schedule invented.
- **Pipeline:** pinned Step 6.2 snapshot (2026-10-23, SHA-verified) → committed 68 KB extract → pure,
  order-independent generator (`corridorGenerator.ts`) → `streetlights-a1.json` (+ provenance, not
  bundled), byte-identical regeneration. IDs `osm:node/…`, `estimate:lighting-a1-v1:way/…:s<n>`;
  duplicates by identity only; municipal precedence (`reconcileSources`) implemented, unused.
- **Placement:** outer-kerb rows on dual carriageways, roundabout rings, deck edges; carriageway, tram
  (2.2 m), rail, platform, water, building and deck rules; ground lamps occlude through elevated decks
  (0 lux under Saltängsbron through the deck); occlusion measured from the emitter.
- **Capacity:** combined 232 accepted, max 15 / 16, 0 overflow; tightest cell is driven by the 8 real
  mapped lamps; 85 % estimate spacing would overflow (reported, not applied).
- **Grouping:** A1 visual groups = fixed 800 m chunks; pilot groups unchanged.
- **Regression:** pilot lamp rows bit-identical inside the combined set; 24/33 pilot-pose captures
  byte-identical, the other 9 differ only where the new corridor appears in the background; 20
  programs everywhere. Pooled perf: map-ready −9 ms, heap +0.32 MB, p95 within the ±1 ms method noise.
- **Tests:** type check clean; build OK; Vitest 307/307; Playwright 7/7 (new A1 E2E); A1 harnesses pass.
- **Incident (fixed):** re-running the Phase 0 harnesses overwrote two Phase 0 evidence files; restored
  byte-for-byte; the manifest writer now uses the pilot registry explicitly.
- **Next (recommended):** A2 — Norra Promenaden west + Kungsgatan north link to the Kungsgatan pilot.

## Lighting Phase 0 — registry, deterministic capacity and sparse spatial index (2026-10-24) — implemented, for review

[Full report](lighting-phase0/README.md). Branch `codex/lighting-phase0` in the UI repository, created from verified
`main` = `origin/main` = `bf5f726` (Step 6.1b included). Backend unchanged (`main` = `3673568`, clean, no branch).
**Not committed, pushed or merged.** No geographic fixture added; Phase A1 not started.

- **Registry** (`lighting/registry.ts`): the 105 pilot fixtures (10 mapped, 95 estimated) as records with canonical
  IDs (`osm:node/…`, `estimate:step6-pilot-v1:way/…:s<n>`), crosswalk to the pilot IDs, source/snapshot/licence,
  generator version and (absent) seed, E/N EPSG:3006 derived from the stored scene values (rendering unchanged),
  RH2000 elevations null, per-field known/derived/estimated/unknown status. Semantic validation before allocation;
  pinned inputs and output hashes in `docs/lighting-phase0/measurements/registry-manifest.json`.
- **Capacity** (`lighting/lightIndex.ts`): canonical-ID order, any cell above 16 contributors rejects the set with a
  full conflict report; no truncation. Development/tests throw; production keeps the previous set and reports it.
- **Sparse index:** same 25 m cells and 16 slots; 100 m pages in an atlas plus an R32F page directory. Pilot street
  textures 128,640 → 54,920 B. Synthetic citywide load (8,937 hypothetical emitters): 2.15 MB vs 14.0 MB dense, and
  4 overflowing cells (rejected) — a capacity risk for Phase A1.
- **Parity:** lamp texture rows bit-identical; all 279 non-empty cells list the same lamps; 33/42 paired captures
  pixel-identical, 3 within the 1-level noise floor, 6 pilot-overview images show poles now drawn by the corrected
  detail distance. Programs 20 in every state.
- **Fixes:** shared materials now rebind to a recreated controller (previously kept the old uniforms); fixture
  detail distance measured to the nearest bound; halo cull margin; Threlte `<T is>` retention of replaced lighting
  groups avoided with a stable root group.
- **Validation:** type check clean; build OK; Vitest 279/279; Playwright 6/6 (incl. new real-scene lifecycle test and
  live Bergsbron regression, isolated backend copy); backend 61 passed + 1 opt-in skipped. Pooled 8-round performance:
  map-ready −8 ms, max p95 +0.4 ms, day p95 +0.3 ms, heap +0.36 MB; single-cell p95 excursions up to +2.2 ms in
  individual series did not reproduce (identical draw calls).
- **Phase A1:** renderer technically ready; fixture data, licence and verified operating state are not.

## Step 6.1b — bus reachability without reintroducing reversals (2026-10-24) — ACCEPTED as a bounded routing correction

[Full report](step61b/README.md). Branch `step61b-bus-reachability` in both repositories, created from UI `1cdf45f` and
backend `39a9709` (the Step 6.2 commits on `main`).

- **Commits:** Step 6.1b is UI `650c071` and backend `3da6528`. The review follow-up and the final documentation
  corrections are the next commit on the same branch in each repository (hashes in `git log`).
- **Not pushed or merged.**
- **Scope of acceptance:** the generic roaming-bus routing correction only. Scheduled route 21 service is **not**
  implemented; buses remain generic roaming traffic.
- **Known baseline test failures:** both also fail on clean baseline worktrees.
  - `simulation.spec.ts:36` (second-tab timing).
  - Vitest 5 s geometry timeouts under full-suite load.

### Review follow-up (same day; committed with the final documentation corrections)

- **Browser test made real.** The Bergsbron test now uses a controlled, deterministic scenario (150/50/100/80, speed
  20). It needs one observed bus to enter the deck and continue north past the Bredgatan junction, matched per entry
  episode, with window edges handled explicitly. 7 analyzer unit tests. Passes on the branch (bus #359, 672 → 684 s);
  **fails as intended** against the Step 6.1 backend (`bus crossings 0 < 1`).
- **Runtime regression by default.** New `Step61bTrafficRegressionTest` (about 16 s) replays the live service exactly
  (seed 1309, the service's tick arithmetic). It asserts: 0 artificial reversals, 0 transitions outside a vehicle's
  policy, 0 truck trap entries, a bus crossing north, a Skvallertorget bus dwell, and car passages; diagnostics name
  the vehicle, edge or node and time. The opt-in 3,600 s run now reports skipped by default and asserts when enabled,
  including that the Step 6.1 policy reproduces the lost service. Both pass.
- **Exact tracing.** Minimal internal hook `RoadTraffic.transitionListener` (default `null`, no behaviour change). Per-tick
  sampling had hidden about 0.02% of transitions. This is the only production-code change.
- **Classification corrected.** 96 blocking roads were checked against current OSM tags, from two sets: the 95 seed
  roads behind the 684 filtered-out edges, and 1 driveway (`1111771303`) isolating the 2 retained-but-unreachable
  edges. None carries an explicit bus restriction. The 979 removed edges, on two separate axes:
  - **Simulator status:**
    - 293 restored and usable;
    - **684 filtered out** (566 dead end + 118 island);
    - 2 retained but unreachable.
  - **Real-world evidence:**
    - 8 verified access;
    - 285 turnaround restorations;
    - 682 unresolved access (562 dead end + 118 island + 2 retained but unreachable);
    - 4 graph topology;
    - 0 verified restrictions.
  The earlier "643 correctly excluded" and "seven ends have no lawful bus access" are **retracted**. Access stays
  closed conservatively.
- **Route 21 wording corrected.** The service and its stop sequence are operator-verified; the corridor geometry
  comes from the 2023 OSM relation and is not.
- **New analyzer defect found and fixed.** A car exiting onto Bredgatan and later returning south (turning at
  Bredgatan's mapped road end) was flagged as `turnedBack`. It is now `exitedAtJunction`. Not a routing defect.
- **Validation.**
  - Backend: 62 tests (61 passed, 1 opt-in skipped).
  - Opt-in evidence run: passed.
  - Analyzer: 7/7.
  - Live bridge test: passed.
  - Playwright: 4/5. `simulation.spec.ts:36` fails identically on clean baseline worktrees (UI `1cdf45f` + backend
    `39a9709`).
  - Vitest: geometry tests hit 5 s timeouts under load, also on baseline; the affected files pass alone, and nothing
    Vitest loads differs from `main`.
  - Type check and build: clean.
- **Open (non-blocking).**
  - Current GTFS verification of route 21 geometry and of the 13 relation-only service ways.
  - Missing terminal and bus-only topology (Resecentrum, Söder Tull, Drottninggatan) for a future re-import.
  - Unresolved real-world access for 682 edges (680 filtered out, 2 retained but unreachable).
- **Final corrections (2026-10-24):** blocking-road count scope (95 seed roads vs 96 tag-checked) and the simulator
  status counts (684 filtered out vs 686 not usable) reconciled with `removed-bus-edges.json`. Documentation only:
  no code, tests, access data or dated evidence changed.

### Original Step 6.1b entry (claims superseded where marked above)

- **Root causes.**
  - The importer's bus heuristic closes all `living_street`/`service` roads and ignores `bus`/`psv` tags.
    Route 21 uses four unrestricted Kungsgatan `living_street` ways between Bergsbron and Skvallertorget.
  - `throughRoadEdges` treated mapped turning circles with a driveway beyond them as policy dead ends.
- **Fix (backend only).**
  - Data-driven `road-access.json` with provenance:
    - 4 `verified-service` ways (route 21, checked against transit.land and the operator index);
    - 2 explicit-tag ways (`psv=yes`, `bus=designated`);
    - 249 mapped turnaround facilities.
  - Relation-only evidence is listed but not granted (13 ways).
  - Pruning algorithm, truck/car policies, `fillPath` and all geometry/shared data are unchanged; nothing is
    hardcoded in routing code.
- **Results.**
  - Skvallertorget is in the main bus network in both directions; route 21 legs Norr Tull ↔ Väster Tull follow
    their mapped ways.
  - Bus-stop nodes in the main network: 245 → 249 (legacy 251).
  - Of the 979 edges Step 6.1 removed: 293 restored and usable, 643 correctly excluded, 22 uncertain, 2 retained
    but unreachable. *(Superseded: "correctly excluded" was not evidenced; see the follow-up.)*
  - The seven Step 6.2 bus ends are islands with no lawful bus access. *(Superseded: they are islands under the
    simulator policy; real-world access is unresolved.)*
  - Trucks: 0 Bergsbron trap entries; 0 artificial reversals in any class (deterministic 3,600 s run and live
    browser run). Buses now cross Bergsbron, use the gångfartsområde (living street) and dwell at Skvallertorget.
- **Validation.**
  - Backend: 60/60 tests.
  - Frontend: type check and build clean. Vitest 209/210: an `infrastructure.test.ts` timeout under parallel
    load; the file passes alone.
  - E2E: 4/5. `simulation.spec.ts` second-tab timing fails identically with the baseline backend.
- **Performance.** No systematic startup or tick change within measurement noise.
- **Open.**
  - GTFS shapes for the other services.
  - Bus-only ways the importer drops (Resecentrum, Söder Tull, Drottninggatan): a topology change for a future
    re-import.
  - Slåttergatan B/D and S:t Persgatan.

## Step 6.2 — lighting inventory and rollout foundation (2026-10-23) — research complete, for review

[Executive report and all deliverables](step62/README.md), [checkpoint readiness](step62/checkpoint-readiness.md),
[verification](step62/verification.md), [interactive SWEREF inventory map](step62/inventory-map.html).

- Corrected stale recovery assumptions: both repositories initially clean on `main`; UI `bd13495`, backend
  `c3d9860`, already on remote `main` (read-only `ls-remote` confirmed). No reset/stash/commit/push this session.
- Bounded routing review reproduces 11 compact /125 truck /979 bus edge removals. **Bus reachability at
  Skvallertorget is lost**, and seven genuine mapped bus-end edges disappear. Service21 via Skvallertorget is
  independently confirmed by the current operator index. Roaming buses are not designated transit; bundled
  tram/train paths remain independent. Road51 is a primary-road reference, not bus service51. Existing tests
  passing does not establish transit-preserving readiness. New backend audit test writes a local report.
- Actual EPSG3006 map envelope E561804.869–575355.539 /N6490994.115–6501805.721; use the true clip polygon,
  not its rectangular envelope. RH2000 retained. Runtime OSM2026-10-16, lighting pilots2026-10-21; no shared
  runtime data changed, UI/backend hashes still equal. Vrinnevi longer routes extend past southern coverage.
- Fresh bounded OSM base2026-10-23T09:05:06Z: 25 lamp nodes,2040 lit/175 unlit highway ways,32 fuel features.
  Curated geographic evidence retains source dates/IDs, unknown lighting/geometry and ODbL attribution.
  Operator-only/reconciliation candidates are recorded separately, not counted as automatically distinct sites.
- Municipal fixture register/licence remains unavailable in this bounded public search. Police reception moved
  to Luntgatan32 inJanuary2026 while some services remain at the old police complex; existing emblem/tower
  geometry is present, actual POLIS sign dimensions/illumination unknown. Gull-Olle mesh absent atop existing
  approximate townhall tower. No blanket landmark floodlighting inferred.
- Vrinnevi2.4km lit trail distinguished from longer loops; OSM5703856 is a candidate (~2.36km), historic2011/12
  brochure topology checked, current licensed alignment/fixture points still required. Existing procedural
  trees have coarse outer spacing/global cap; canopy/height-constrained tiled instancing/LOD designed only.
- Current LFV edition on research date: AIP AMDT1/2026 effective2026-08-07;09/27 lit,11/29 unlit. Approach/PAPI/
  taxiway B/C distinctions recorded; no liveNOTAM/switch-state certification. Existing edge-box geometry on
  all runways is not verified operational lighting. Aircraft light conventions/state/transform plan separate.
- Architecture audit: dense geographic rectangle,16-light cells, nearest-centre truncation, input-order ties,
  texture-height/device limits, material/instance ownership and context restoration. Proposed sparse paging,
  overflow failure/reporting, budgets and phased rollout; **no runtime architecture/lighting change**.
- Validation:14 targeted backend tests,54 existing lighting/coordinate tests,3 new grid stress tests passed;
  eight schema examples and all retained JSON validated;25 E/N conversions independently match PROJ within
  0.7mm arithmetic error (not survey accuracy). Inspector controls/layout checked in Edge. Performance
  extracted from actual Step6.1 measurements; no full simulator rebuild or lower-tier GPU claim.
- Changed only UI `docs/step62/**`, `scripts/step62/**`, this entry and targeted `/work/step62/` ignore; backend
  new `Step62RoutingAuditTest.kt`. Raw research and optional validator packages remain local/ignored.

**Exact next task:** Step6.1b bounded bus-policy/destination/terminus correction and regressions, preserving
the Bergsbron truck result; then Phase0 registry/grid capacity hardening with existing105 fixtures before
central-city expansion. Commit/push remains subject to explicit approval. Step6.2 stops here.

## Step 6.1 — night polish and bridge routing (2026-10-22) — implemented, for review

Continued the interrupted session, preserving the uncommitted Step 6 working tree. No commit or
push. [Complete report, exact file inventory and comparison images](step61/README.md),
[performance](step61/performance.md), [network IDs/coordinates/hashes](step61/measurements/network.json).

- Inspected the importer, vehicle policies, transport graph, bridge/render alignment, interpolation
  and route fallback. The pictured bridge is Bergsbron on Kungsgatan: road way `26154805`, north
  node `286409016` (index 4903), SWEREF E568512.876703 / N6495020.614197. Onward living-street
  way `26154806` excludes trucks/buses under the existing simulation policy.
- Root cause: reciprocal bridge edges survived directed-dead-end pruning, leaving trucks only the
  runtime reverse fallback. New general `throughRoadEdges` preprocessing removes policy-cut
  branches, preserves real cul-de-sacs and uses no geographic exception or new per-tick search.
- Live browser evidence: 13 truck reversals before, zero after; nine cars observed continuing
  beyond the northern junction after the fix. Cars already had connectivity before. Full timed
  extracts and browser captures are linked in the report; these are not injected test routes.
- Kungsgatan receives oriented road-favoring light distribution, less rear spill, smaller halos and
  warmer night adaptation. Strömparken gets softer lantern falloff with dark lawns retained.
  Idrottsparken OFF/TRAINING/MATCH was reviewed and retained, including geometry and emitters.
- Only four existing UI source files differ from the saved Step 6 baseline: lighting `cityLights.ts`,
  `fixtures.ts`, `reference.ts`, `lighting.test.ts`. Added live bridge E2E, evidence utilities and
  `docs/step61`. Backend: `CityTransport.kt`, new `RoadRouting.kt` and `RoadRoutingTest.kt`.
  Full paths/inventory are in the report. Other Step 6 changes and `.vscode/` are preserved.
- Checks: 210 frontend tests, type check 0 errors/warnings, production build passed (existing chunk
  warning); 49 backend tests including six routing regressions; all five browser E2E passed on
  final routing. Both lighting/WebGL E2E tests passed again after final shader simplification;
  32 final captures completed without exceptions. Temporary verification servers were stopped.
- Final paired median map-ready 3825.7 → 3873.6 ms (+47.9 ms); heap 114.560 → 114.565 MB;
  draw calls/triangles unchanged. Largest frame-median increase 0.1 ms. Earlier shader startup
  overhead +221.1 ms led to arithmetic simplification; both measurement series are retained.
  Backend median initialization +2.06 ms, tick 0.1900 → 0.1555 ms; noisy, not a speedup claim.
- No city-wide rollout, data/geometry changes or lighting architecture rewrite. Shared terrain,
  bridge profiles and transport data remain byte-identical. Approximate photometry and existing
  pale jagged road-depth overlap remain. Restart the normal backend to load the routing fix.

---

## Step 6 — day/night pilot and Idrottsparken (2026-10-21) — implemented, for review

**State:** UI HEAD `994b881`, branch `codex/step6-night-lighting`, uncommitted Step 6 working tree.
Backend HEAD `e143535`, clean `main`, unchanged. No commit or push. This continues the interrupted
Step 6 session, preserving its implementation and measurements. The pre-existing untracked
`.vscode/extensions.json` was left untouched.

**Delivery:** [Step 6 report and image index](step6/README.md),
[performance/budgets](step6/performance.md), [exact file inventory](step6/files.md),
[architecture](step6/lighting-architecture.md), [lamp provenance](step6/lighting-data.md),
[stadium discrepancies and sources](step6/stadium-references.md).

- Exactly three pilots: Kungsgatan/Kungsbron, Strömparken and Idrottsparken. 105 fixtures
  (10 mapped, 95 estimated), restricted to documented lit routes and labelled entrance estimates.
- Europe/Stockholm date/time, solar orientation using the existing SWEREF frame, seasonal solar
  presets, smooth sky/fog/exposure and separate off/training/event floodlights.
- Surface illumination uses a fixed spatial-grid shader patch; no extra PointLights/SpotLights,
  no shadow maps. Max 8 lamps/cell in the pilot (budget 16), 14 stadium emitters (budget 16).
- Arena rebuilt from OSM footprint, 2020 LiDAR and compatible dated photographs: lower roofs and
  corrected overhangs, distinct stands, north standing terrace, roofed NE/SW corners, open SE corner,
  corrected mast positions/heights, main-stand glazing and adjacent halls. Anchor/scale unchanged.
- 113 deterministic full captures, 24 comparison panels, plus the Kungsgatan baseline artifact
  comparison. [Daylight arena](step6/evidence/before-after/stadium-elevated-se.jpg),
  [pitch floodlights](step6/evidence/floodlights/stadium-pitch-north.jpg),
  [street](step6/evidence/time-of-day/kungsgatan-street.jpg),
  [park](step6/evidence/time-of-day/stromparken-path.jpg).
- Recovery fixed WebGL context restoration: retain typed vertex arrays; free temporary merge
  buffers. The browser regression failed before the fix and passes after it.

**Checks:** 208 unit tests passed, 0 type errors/warnings, production build passed (large-chunk
warning retained), all 4 Playwright tests passed against Ktor :8091. Those temporary E2E servers
were stopped afterward. Relevant lighting/stadium tests (43) were rerun after the recovery fix.
Shared terrain, bridge profiles and transport network are byte-identical across repositories;
surface revision remains `lm-dtm-b976b87a19446d3d-surface-70559be0073d`.

**Performance:** worker geometry is unchanged (8,563,150 triangles / 1,130.3 MB buffers).
Arena: 55,822 triangles, 10 meshes, 5.78 MB buffers; `parken` draw calls 939 → 255 in daytime.
The original startup regression was reduced from +1.4 s to +102 ms, still over the +100 ms target.
Recovery medians: map ready **3457.2 → 3504.7 ms (+47.5 ms)** and post-GC heap
**123.11 → 121.43 MB (−1.69 MB)**. The latest median meets the targets, but one pair and the
earlier +102 ms series exceed the startup target; consistent sub-100 ms overhead is not established.
All rounds, raw data and final budget comparisons are in [performance.md](step6/performance.md).
Do not reuse the earlier upload-time array deletion to
recover memory: it breaks context restoration.

**Limits for review:** approximated occlusion/photometry; no 2026 survey of mast/projector layout;
coarse surrounding terrain; pre-existing pale jagged road-depth overlaps on Kungsgatan remain in
both baseline and Step 6. The pilot is not a full-city rollout and does not claim every visual or
performance target passed. See the report before accepting the trade-offs.

---

**Git checkpoint (2026-10-21), geometry phase approved:** committed on `main` in both repositories with the
user's authorisation:
- Backend: `e143535`.
- UI: `85fd462` (scratch ignore rules), `05a3505` (code, tests, scripts and runtime data), then the documentation commit.

Both repositories carry identical runtime data: `terrain.json` surface revision
`lm-dtm-b976b87a19446d3d-surface-70559be0073d`, `bridge-profiles.json` and `transport-network.json`.
Measurement scratch (`work/step5/`, `work/step51/`, `work/step51opt/`) stays local and is ignored.

---

## Step 5.1 geometry cost optimisation (2026-10-20) — COMPLETE, trade-off for review

**Action for the user:** restart the Ktor backend (:8080). `terrain.json` changed in both repositories (identical
files); new surface revision `lm-dtm-b976b87a19446d3d-surface-70559be0073d`. The DTM grid is unchanged.
`TerrainService.kt` has three optional patch fields (`groups`, `members`, `classesBase64`). Nothing committed or pushed.

### Trade-off (measured)

| | Step 5 | Step 5.1 | **Optimised** | Optimised vs Step 5 |
|---|---|---|---|---|
| Static triangles | 8 412 094 | 8 711 319 (+3.56 %) | **8 563 150** | **+1.80 %** |
| Vertex buffers | 1 110.4 MB | 1 149.9 MB | **1 130.3 MB** | +19.9 MB (Step 5.1: +39.5) |
| Geometries | 5 488 | 5 592 | **5 537** | +49 (Step 5.1: +104) |
| Patch triangles | 23 341 | 86 577 | **65 461** | (−24 % vs Step 5.1) |
| Map ready, prod., median of 3 | 3 186 ms | 3 462 ms | **3 387 ms** | **+0.20 s** (Step 5.1: +0.28) |
| Page ready | 4 149 ms | 4 320 ms | 4 285 ms | +0.14 s |
| JS heap | 140.8 MB | 148.8 MB | 145.6 MB | +4.8 MB |
| GPU upload: excess / longest frame | 925 / 901 ms | 928 / 905 ms | **869 / 885 ms** | better than both |
| Frame time overview / city | 12.5 / 5.0 ms | 13.3 / 5.1 ms | 12.6 / 4.9 ms | = |
| Draw calls overview / city | 8 205 / 3 450 | 8 307 / 3 507 | 8 253 / 3 479 | +48 / +29 (Step 5.1: +102 / +57) |
| Rendered triangles, overview | 9.49 M | 9.78 M | 9.63 M | +1.55 % |

Production builds served by `vite preview`, uncapped, 3 alternating rounds (`measure-startup.mjs`). Draw calls
and rendered triangles were measured on dev servers (30 frames per view). Builder times (Node harness, 5 runs): network
2 191 / 2 380 / 2 302 ms, terrain 1 753 / 1 859 / 1 764 ms.

**Targets.** Geometry is at +1.80 %, within the 1–2 % target. **Map ready (+0.20 s) misses the 0.1 s target.**
Data parsing and hydration of the larger `terrain.json` cost only 10–15 ms (`city-data:*` measures). The rest is
the network worker (the critical path), which is +111 ms in the harness. That time scales with the triangles it
emits: draped non-member strips and kerb margins cut by the finer patch triangles. To go lower, fewer patch sites
would be needed. That would reverse verified corrections, so I stopped here. **All 88 selected sites (91 groups) are kept.**

### What changed

1. **Asphalt ownership (priority 1).** Every patch triangle carries a class: 0 terrain, 1 road asphalt, 2 track bed
   (`classesBase64`). Road members of a patch are listed in `members`.
   - The network worker draws class-1 triangles once, as the asphalt layer (`surface.patchTriangles(1, …)`).
   - It skips the member's asphalt strip and owned junction fans.
   - It draws the member's kerb only as its two visible margins, with the inner edge exactly on the outline
     (`strip(…, hole)`/`band`). There is no overlap and no double layer.
   - Members drawn with a narrowed outline (negative pad), linear (profiled) pieces and mixed fans keep their
     own strips.
   - Result: −148 k static triangles vs Step 5.1.
2. **Steiner point removal** (`scripts/geo/cdt.py remove_steiner`).
   - The conforming Delaunay added Steiner points on constraints (37 % of vertices).
   - Each is removed by re-triangulating its star, but only if:
     - no T-junction results;
     - every leaf is still tiled exactly;
     - no new triangle is narrower than 2 cm (`STEINER_MIN_WIDTH`).
   - Rail-bed Steiner points are kept, because Pendeln at E 567 972 rose from 1.71 % to 2.01 % without them.
   - Result: 84 groups are "reduced" (13 767 points removed). 7 groups keep the conforming triangulation, as in Step 5.1.
3. **Patch boundary continuity (priority 2), general.**
   - *Axial feathering:* where a member road meets a road kept on the RTIN, member asphalt blends into the RTIN
     over 8 m along the road. Fan wedges there are set to the RTIN (266 feathered nodes).
   - *Ghost outlines:* the footprints of non-member roads, rails, trams, paths, linear pieces and bridges crossing
     patched leaves become constraints at RTIN height. The terrain under them stays what it was.
   - *Ghost clearance (new in this round):* ghost outlines keep `GHOST_CLEAR` = 0.5 m from member asphalt.
     Without it, 41 vertical micro-walls appeared where a ghost vertex sat 1 cm beside a lifted outline vertex
     (worst E 570 589 N 6 493 307: 2.5 m).
   - No offsets are hardcoded.

### Results

| Check | Step 5.1 | Optimised |
|---|---|---|
| Gamla Övägen boundary crease | −0.35 m | **−0.07 m** |
| Eksundsvägen boundary crease | −0.36 m | **−0.28 m** |
| Sandbyhovsgatan boundary crease | +0.58 m | **+0.26 m** |
| Micro-walls (< 2 cm wide, slope > 5), map-wide | 81 (16 with > 0.2 m step) | **11 (3)** |
| Steep facets (slope > 0.6) in patches | 3 844 | 2 803 |
| Pendeln max / p99 (1 m sampling) | 2.46 / 1.85 % | **2.46 / 1.85 %** |
| Former Pendeln peaks (14) | < 2.0 % | < 2.0 % |
| Wheel − rail top | 0 | 0 (< 1 mm, 20 000+ samples) |
| Terrain outside patches vs RTIN | exact | exact (4 000 samples) |
| Cross-section errors / warnings (Step 5: 11 / 806) | 9 / 732 | **8 / 733** |
| Steep-grade errors / warnings (Step 5: 80 / 275) | 78 / 257 | **77 / 257** |
| Grade-break errors / warnings (Step 5: 86 / 356) | 79 / 353 | 79 / 354 |
| Below-terrain errors / warnings (Step 5: 4 / 333) | 4 / 313 | 4 / 312 |
| Junction-fan warnings / junction-step errors (Step 5: 20 / 4) | 0 / 3 | 0 / 3 |
| Creases on patched leaves: new or worse than Step 5 | 8 of 20 | **4 of 21** |

Screenshots: `docs/step51opt/{before,after,compare}` contain 23 identical camera poses
(`docs/step51opt/poses.json`). "Before" is Step 5.1 and "after" is the optimised build.
- Mean absolute pixel difference is ≤ 0.81 per view.
- Sandbyhovsgatan visibly improves: the Step 5.1 twist and depression at the T-junction is gone.
- Elsewhere: marking and kerb positions shift by a few pixels. No missing asphalt, z-fighting or seams were seen.
- `microwall-570589` is new: there is no wall in either build. The kerb line across the slip road is the same as in Step 5.1.

### Tests

`src/lib/step51opt.test.ts` (11 tests) checks:
- the patch is watertight in 3D;
- no new micro-walls;
- no missing asphalt, and asphalt lies exactly at the vehicles' surface;
- ownership: one asphalt layer and no kerb under it;
- kerb margins have exactly the strip's area, so nothing is drawn twice;
- visible kerb margins are present;
- no added twist at any group-boundary node;
- the three boundary sites;
- train-to-rail alignment;
- the Pendeln grades and former peaks;
- terrain outside the corridors is exactly the RTIN.

Suite results:
- **Vitest:** 165/165 tests in 18 files.
- **`npm run check`:** 0 errors.
- **`npm run build`:** OK. The chunk-size warning already existed.
- **Backend `dev.ps1 test`:** OK.
- **Playwright E2E:** 2/2, against a backend on :8091 serving the new revision.

### Remaining issues

- Map ready is +0.20 s vs Step 5 (above).
- Four creases on patches are still worse than in Step 5 (Step 5.1: 8). Rule: drawn > Step 5 + 0.1 m, or newly > 0.3 m.
  - E 567 535 N 6 496 850, way 996110633: 0.49 m (Step 5: 0.31 m);
  - E 567 535 N 6 496 877, way 26417564: −0.32 m (Step 5: 0.13 m);
  - E 563 854 N 6 500 639, ways 972886811 / 980881391: 0.35 / 0.44 m (Step 5: 0.18 / 0.19 m). Step 5.1 classified way
    972886811 as measured relief (native 0.20 m).
- The two known ~5 cm seams (E 574 108 N 6 491 910, E 565 181 N 6 494 359) remain. Each is closed by a sliver, so there is no gap.
- 3 micro-walls with a step > 0.2 m remain, all at retained deck edges and DTM cliffs, where the step is real.

### Final visual check (2026-10-21, approved scope; no code or data changed)

Method:
- Drawn cross-sections were compared with the native 1 m DTM on three lines, 1 m apart, every 0.5 m.
- Centreline profiles were sampled every 1 m.
- Close-up captures at driver height were taken in Step 5, Step 5.1 and the optimised build.

**The four creases**

| Site | Drawn crease | Native 1 m DTM | Verdict |
|---|---|---|---|
| Ekhöjdsgatan, E 567 535 N 6 496 850 | +0.43–0.49 m | +0.23–0.67 m (noisy) | **Measured relief and horizontal error, pre-existing.** A 2.2 m wall crosses the OSM centreline (native 20.36 → 22.58 m within 2 m). Step 5 already draws the same ~1 m dip before it (20.49 m; now 20.50 m). |
| Sandbyhovsgatan, E 567 535 N 6 496 877 | −0.33 m | −0.51 m | **Measured.** The left 3 m of the drawn strip lies on a 1.3 m embankment slope; the OSM centreline is ~3 m beside the carriageway (horizontal). The drawn surface is closer to the DTM than in Step 5. |
| Way 972886811, E 563 854 N 6 500 639 | +0.33 m | +0.22–0.30 m | **Measured.** The junction is dished, and the drawn surface is within ~0.1 m of the DTM. |
| Ringstadmovägen, same node | +0.41 m | +0.39–0.40 m | **Measured,** at the native value. |

- None is visibly disruptive at driver height. Sandbyhovsgatan and Ekhöjdsgatan look cleaner than in Step 5, which shows kerb fragments on the carriageway there.
- No small general fix applies. Ekhöjdsgatan would need a horizontal realignment of the OSM centreline. **Known issue, not changed.**

**The two seams**
- All 4 T-junction vertices are closed by sliver triangles in the patch data: 3 at E 574 108–574 118 (≤ 4.9 cm) and 1 at E 565 181 (5.1 cm).
- The land drape drops those zero-area slivers, so each seam is a ≤ 5 cm vertical step along a 28–42 m leaf edge.
- Eight low captures (camera height 0.6 m, azimuths every 45–90°) show no see-through line and no hole.

**Found during the check: street-level fan flicker, pre-existing.**
- At E 574 112 N 6 491 904, a large junction fan's kerb wedge (rank 10) and asphalt wedge (rank 11) are exactly coplanar.
- When the camera is ~0.6 m above them, both wedges cross the near plane. The one-rank depth bias then does not hold, so the foreground flips between asphalt and kerb.
- The geometry is identical in Step 5, Step 5.1 and the optimised build, and nudging the camera by a few cm shows the same flip in all three.
- Fixing it means changing the layered-ground depth scheme (e.g. a larger bias at street level). That is outside this phase. **Known issue.**

### Reproduce

    python scripts/geo/road_patches.py --apply            # codex-runtimes Python 3.12; ~6 min
    pwsh -File scripts/geo/step51-after.ps1                # diagnostics, rail evidence, patch sites
    npx vitest run src/lib/step51opt.test.ts               # PowerShell, C:\ path
    BOX=560000,6488000,576000,6504000 OUT=… npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-steep-facets.test.ts
    GEOMETRY_OUT=… RUNS=5 npx vitest run -c scripts/geo/vitest.geometry.config.ts
    UNCAPPED=1 E2E_BASE_URL=http://127.0.0.1:<port>/ node scripts/measure-startup.mjs <out.json>
    POSES=docs/step51opt/poses.json node scripts/capture-reference-views.mjs <dir>

---

## Step 5.1 (2026-10-19): targeted infrastructure geometry corrections — COMPLETE, waiting for approval

**Action for the user:** restart the Ktor backend (:8080). Data and `TerrainService.kt` (two new optional patch
fields) changed. The new surface revision is `lm-dtm-b976b87a19446d3d-surface-cb8af1f00f7c`; the DTM grid itself
is unchanged. Nothing committed or pushed.

**Decision needed:** the corrections cost **+3.6 % static triangles and +0.27 s map ready**. I stopped at
"priority A" and did not expand further (see *Performance* and *Trade-off*).

**Reference screenshots:** the three Hamngatan × Drottninggatan screenshots again did not arrive. The junction
was verified against the Step 5 poses and from above (below).

### Summary

| Item | Root cause (measured) | Result |
|---|---|---|
| **Pendeln peaks** | The diagnostic sampled every 5 m and missed the worst chord: the real max was **4.80 %**, not 3.79 %. All 14 peaks are on Södra stambanan (Trafikverket mainline, mixed traffic, 110–150 km/h). In 12 of them the rendered bed departed 0.2–1.1 m from a measured bed (native DTM and LiDAR class 2 agree) that is at most 1.6 % steep: 5 m grid nodes lie on cutting/embankment slopes 2–3 m from the double track. In the 2 peaks next to the underpass bridges, rail deck ends were anchored on the 0.1–0.45 m wrong rendered mesh, and the first node past a deck end lay 0.65 m low in the removed-bridge gap. | Rail-bed breakline patches over 14 stretches; rail deck ends anchored on the measured bed; 1 track deck-end notch. Pendeln **max 4.80 → 2.46 %, p99 2.15 → 1.85 %**: within the 25 ‰ that is the steepest gradient anywhere on Södra stambanan. Every former peak now ≤ 1.98 %. Wheel − rail top is still 0. |
| **Road twists (817)** | Checked against the native 1 m DTM across each strip. **532: the mesh adds > 0.3 m** to the measured crease. **241 are horizontal**: 209 OSM centrelines beside the carriageway, 32 drawn widths over verges/walls. **44 are measured relief.** Every crease > 1 m that the mesh does not explain is horizontal. | Patches where the mesh adds > 0.5 m (priority A, 88 sites): 68 within limit, 3 improved, 3 at the measured value, 4 unchanged, 10 kept on the RTIN because the measured footprint is not planar. Horizontal and measured cases are reported, not "corrected". |
| **Prototype boxes' four twists** | Tvåstugubacken (3 left): native crease 0.54–0.80 m inside the drawn strip. The OSM centreline cuts the inside of a hairpin (LiDAR view `docs/step51/lidar/tvastugubacken-bend.png`), or the strip spans a wall. | Horizontal, kept and documented. |
| **Junction fans (20)** | A wedge between a linear and a draped strip was either a plane or a lifted drape, so it was exact on only one of its two edges. | Blend rule in `fanWedge`, exact on both edges by construction: **20 → 0**. |
| **Hamngatan × Drottninggatan** | – | All Step 5 C.1 checks still pass. Viewed from above: continuous asphalt, level tram tracks, no depressed triangles. The deck-corner facet is a kerb/quay-path wedge between OSM's bridge end and the quay 4–5 m further on: network geometry, unchanged (see remaining issues). |
| **Järngatan / E4** | LiDAR under the E4 footprint (s = −4…+20 m along Järngatan): every return is **class 2 at 14.8–15.0 m**, 0 class 17, 0 returns below 11 m. Järngatan class 2 is 9.39 m (west) / 9.35 m (east). The deck was classified as ground. | Confirmed. The E4 deck is drawn at its surveyed 14.4–15.5 m; Järngatan at 9.1–9.8 m in the corrected trench; > 4.5 m apart; the ground under the deck is the trench floor (< 10 m). Regression test added. |
| **Brännerigatan** (E 569 776) | A road leaving a bridge took a measured fit that included the DTM's stream gap: a 1.1 m "tent". | Deck-end rule (level cross-section at the abutment): gone. |
| Lidaleden (E 571 559) | An engineered span over a path underpass, not a grounded piece. | Classified as abutment (reported). |

### A — Pendeln (Södra stambanan) grade peaks

Evidence: `scripts/geo/rail_grade_evidence.py`, `work/step51/rail-grade-evidence*.json`. LiDAR is the local Laserdata
NH 2020 COPC tiles (`scripts/geo/lidar_window.py`).

Line facts:
- OSM tags on every peak way: `operator=Trafikverket`, `usage=main`, `railway:traffic_mode=mixed`,
  `maxspeed` 110–150, `axle_load=22.5`, single track per way (double-track line).
- Swedish Wikipedia gives **25 ‰** as Södra stambanan's steepest gradient. The Trafikverket capacity plans
  (Norrköping–Fiskeby, Linköping–Norrköping) returned 404, and no local Trafikverket profile was available.
- The relevant reference is therefore the measured bed (DTM/LiDAR ≤ 1.6 % over 20 m), with 25 ‰ as an upper
  bound. RAIL_GRADE_LIMIT stays 2.5 %.

Peaks, 20 m chord, ridden; LiDAR is class 2 within 1 m of the track centre:

| E | N | Way | Before % | Native DTM max % | LiDAR % | Rendered − native max m | Under it | After % |
|---|---|---|---|---|---|---|---|---|
| 567 444 | 6 497 092 | 94364274 | 4.24 | (bridge gap) | 0.75 | 0.57 | deck/ground/span | 1.98 |
| 565 361 | 6 496 830 | 97538951 | 2.68 | 1.33 | 0.98 | 0.44 | ground | 1.92 |
| 564 926 | 6 494 770 | 177890699 | 3.48 | 0.66 | 0.40 | 0.68 | ground | 0.61 |
| 564 464 | 6 494 524 | 177890703 | **4.80** | 0.81 | 0.09–0.23 | 1.09 | ground | 0.82 |
| 565 160 | 6 494 925 | 177890745 | 2.63 | 0.61 | 0.0 | 0.36 | ground | 0.69 |
| 565 449 | 6 497 064 | 97538966 | 2.70 | 1.26 | 0.87 | 0.42 | ground | 1.42 |
| 567 189 | 6 497 198 | 94364267 | 3.14 | 1.26 | 1.0 | 0.36 | ground | 1.69 |
| 567 390 | 6 497 125 | 94364267 | 2.66 | (bridge gap) | 1.2 | 0.83 | deck/ground/span | 1.89 |
| 567 524 | 6 497 045 | 177890726 | 3.29 | 1.53 | 1.0 | 0.48 | ground | 1.65 |
| 567 768 | 6 496 730 | 177890726 | 3.79 | 1.62 | 1.1 | 0.43 | ground | 1.44 |
| 567 804 | 6 496 616 | 177890726 | 2.88 | 1.47 | 0.92 | 0.44 | ground | 1.39 |
| 567 835 | 6 496 445 | 177890726 | 2.83 | 1.56 | 1.05 | 0.41 | ground | 1.45 |
| 567 972 | 6 496 027 | 95557980 | 2.50 | 1.32 | 0.93 | 0.20 | ground | 1.71 |

Corrections (all general rules, none keyed to coordinates):
1. **Rail-bed patches**: stretches where the measured bed is within the limit but the rendered one departs by more
   than 0.1 m, extended while it departs by more than 5 cm. The 5 m bed of every parallel track within 6 m is
   integrated as a measured surface.
2. **Rail deck anchors on the measured bed** (`prepare-bridge-profiles.py` rule 1): the median of the native DTM
   along the track 4–12 m out, instead of the rendered mesh. This moved 36 rail/tram deck ends (median 0.07 m,
   max 0.45 m), and each checked one now matches LiDAR class 2 along the track. Händelöspåret: 5.77 / 5.77 m and
   4.88 / 4.89 m (native / LiDAR); before, the rendered anchor was 0.45 m low. The second underpass deck now
   lies within ±0.08 m of its class 17 returns (was +0.11 m at the west end).
3. **Track deck-end notch** (rule 1c): the depth threshold is 0.3 m along track (1 m for roads, where valleys
   and stairs must never be lifted). One node map-wide: E 567 452 N 6 497 087, 21.63 → 22.50 m.
4. **Deck-end dip on long track approaches** (rule 2b, ≥ 0.15 m within 15 m of a deck end): 2 rail approaches.
5. **Diagnostics:** ridden grade sampled every 1 m (was 5 m) and measured along the track (20 m), not over the
   straight chord. At the route's reversal the chord counted the same 10 m twice: 3.4 % on 1 % track.

Visual check (`docs/step51/compare/pendeln-*.png`): the tracks are level and straight. Beside a cutting the
slope now rises from the bed edge in visible facets (the measured cutting shape) instead of from bumps in the
track.

### B — Selective road refinement (priority A only)

**Selection** (`scripts/geo/refinement_targets.py` → `scripts/data/geometry-refinement-targets.json`, 1 322
candidates). Every diagnostic issue is tested against the native 1 m DTM (median of three lines ±1 m):

- **Cross-sections:**
  - *mesh*: measured strip planar and uncreased, or the mesh adds > 0.3 m to the measured crease;
  - *alignment*: the measured strip has a step, but shifted ≤ 3 m sideways it is planar;
  - *width*: planar at 60 % of the drawn width;
  - otherwise *measured*.
- **Grades:** corrected only if the measured grade is within the road limit, much flatter than drawn, and the
  measured strip is planar. A genuinely steep road is not "corrected" towards a still-steep measurement.
- **Below-terrain:** non-bridge linear pieces are integrated. Bridges and ways with an underpass span are
  *abutment* (reported).
- **Rail:** from the evidence above.

Priority A (patched): rail stretches, below-terrain pieces, grade errors (> 1.5 × limit), and twists where the
mesh adds > 0.5 m. Priority B (reported, `--priority=B` would add them): the rest.

**Builder** (`scripts/geo/road_patches.py`; additions to the Step 5 algorithm, all general):

- **Groups:**
  - targets → touched RTIN leaves → closure (depth 1) over every road/track entering them;
  - groups sharing a leaf or leaf edge are merged;
  - the 5 prototype boxes are kept and merged with targets that touch them.
- **Lean density for targets:** outline vertices at 10 m, no free centreline points. Study on 25 targets:
  −21 % triangles, asphalt RMSE 0.056 → 0.064 m.
- **Draped parts:** segments partly covered by spans, and tapered approaches, take part with their draped
  intervals. Their ends are pinned to the span/deck level with a level cross-section.
- **Ghost outlines:** a road, track or tram that is not a member but crosses a patched leaf keeps the RTIN
  under its footprint. Its edges are constraints with RTIN heights, so no new creases appear beside a patch.
- **Planarity guard:** no measured surface where the measured footprint is not planar (wall, terrace; strip
  residual > 0.5 m at three stations or at a classified site of the way). Such a road stays on the RTIN.
- **Deck ends:** a road leaving a bridge meets the abutment level across, never lowered.
- **Terrain detail:** native pixels where the patch itself made the terrain > 0.25 m and 0.1 m worse than the
  RTIN, ≥ 1.5 m from asphalt, become vertices. No general refinement.
- **Robustness:** retries with ±3/8 cm outline pads; drops sub-mm or stalled ghost constraints; a group that
  still cannot be tiled exactly is skipped and reported (1 of 91).
- **Data:** `terrain.json mesh.patches` gains `groups` (name → box) and `members` (segments drawn on the
  measured surface); backend `SurfacePatches` and `surfaceMesh.ts` read both.

**Result**: 91 groups, 818 segments, 9 940 leaves → 86 577 patch triangles (Step 5: 2 123 → 23 341). In the
patched leaves, asphalt vs native DTM RMSE **0.183 → 0.061 m** and terrain 0.381 → 0.334 m. Saltängsbron box
terrain 0.185 (Step 5) → 0.156 m.

Full per-location table: `docs/step51/refinement-report.md` (+ `.json`): coordinates, category, magnitude,
correction, before/after re-measured with the diagnostics' own rules, uncertainty.

### C — Map-wide diagnostics (identical code on the Step 5 baseline copy and on this tree)

| Check (error / warning) | Step 5 | Step 5.1 |
|---|---|---|
| cross-section | 11 / 806 | **9 / 732** |
| steep-grade | 80 / 275 | **78 / 257** |
| grade-break | 86 / 356 | **79 / 353** |
| below-terrain | 4 / 333 | 4 / **313** |
| junction-fan | 0 / 20 | **0 / 0** |
| junction-step | 4 / 0 | **3** / 0 |
| sag, shore, building, spikes | – | unchanged (sag 7 / 60) |
| Pendeln p99 / max (1 m, along track) | 2.15 / 4.80 % | **1.85 / 2.46 %** |
| Tram 2 / tram 3 max | 6.49 / 6.23 % | unchanged (tram limit 8 %) |

Creases now on patched leaves: 20, of which 12 are unchanged or better than Step 5. Of the other 8:

- **5 are measured relief**, kept honestly: the native crease is as large or larger.
  - Ringstadmovägen: 0.44 m (measured 0.41 m).
  - Ekhöjdsgatan: 0.90 m (measured 1.13 m).
  - Way 996110624: −1.12 m (measured −1.46 m).
  - Way 1089721868: −0.40 m (measured −0.72 m).
  - Way 972886811: 0.34 m (measured 0.20 m).
- **3 are patch artefacts:**
  - Sandbyhovsgatan, E 567 549 N 6 496 858: 0.58 m against a measured 0.54 m (Step 5: 0.24 m).
  - Gamla Övägen, E 568 588 N 6 493 273: −0.35 m (Step 5: −0.24 m). In the Ektorpsgatan box, where a
    non-member road starts at a member's end line and the measured edge blends into the RTIN.
  - Eksundsvägen, E 563 423 N 6 493 362: −0.36 m (Step 5: −0.28 m).

### D — Performance (production builds side by side, same machine, 3 alternating runs, medians)

| | Step 5 | Step 5.1 |
|---|---|---|
| Patch triangles / leaves | 23 341 / 2 123 | 86 577 / 9 940 |
| Static triangles | 8 412 094 | 8 711 319 (**+3.56 %**: land +88 k, roads +187 k, markings +25 k) |
| Vertex buffers | 1 110 MB | 1 150 MB (+3.6 %) |
| Geometries (≈ draw calls) | 5 488 | 5 592 (+1.9 %) |
| `terrain.json` | 33.2 MB | 35.4 MB |
| Worker build terrain / network / markings (Node) | 1 734 / 2 206 / 493 ms | 1 927 / 2 388 / 545 ms |
| Map ready | 3 261 ms | **3 529 ms (+0.27 s)** |
| Upload excess / longest upload frame | 877 / 910 ms | 985 / 971 ms |
| JS heap | 129 MB | 151 MB (consistent +20 MB in every run) |
| Frame time, uncapped: overview / city / campus / industry / parken / kungsgatan | 13.3 / 5.2 / 3.4 / 1.8 / 2.2 / 1.6 ms | 13.8 / 5.4 / 3.4 / 1.8 / 2.2 / 1.7 ms |

**Trade-off:**
- *Where the cost goes:* most of the static increase is roads draping over the denser patch triangulation
  (+187 k), not the patches themselves (+88 k).
- *Cost of expanding:* all candidates incl. priority B would add ≈ +430 k patch triangles. Dry run: 435 groups,
  14.7 MB, roughly +1.4 M static triangles. Not done.
- *Options to trim the current cost,* if +0.27 s / +3.6 % is too much:
  - draw road strips on patches straight from the patch's asphalt triangles (removes most of the +187 k);
  - drop ghost outlines where no non-member road actually creases;
  - raise the priority-A crease threshold from 0.5 to 0.6 m (37 instead of 88 twist sites).

### E — Tests and verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **154 / 154** (17 files; new `step51.test.ts` 10 tests) |
| `npm run build` | OK; dev overlay absent from `dist` |
| Backend `dev.ps1 test` | **43 / 43** (fixtures regenerated) |
| `npx playwright test` | **2 / 2** (dev server + backend on :8091 at the new revision) |
| Browser captures | 18 identical-camera views before/after, no page errors (`docs/step51/{before,after,compare}`, poses `docs/step51/poses.json`) |
| `?inspect=infra` | Loads in the browser: 1 489 refinement sites, 70 on patches (white halo), 0 rail peaks; `globalThis.__refinementSites` |

New tests (`src/lib/step51.test.ts`):
- **Pendeln:** max within 25 ‰; the measured bed at the former 4.8 % site; the deck-end notch.
- **Junction fans:** no fan > 5 cm map-wide; every mixed wedge exact on both edges.
- **Road selection:** priority-A selection from evidence only; horizontal cases never seeded; patched twists at
  the measured shape; overlay sites; grounded pieces above terrain.
- **Järngatan/E4:** two separate levels.

Test adaptations:
- `coordinateSystem` 697 → 698 profile keys (track notch).
- `step5` box test limited to the prototype boxes, with the Gamla Övägen residual pinned (< 0.4 m).
- `infrastructure` reversed-edge helper no longer re-adds spans to integrated segments (a helper bug that the
  new integrated approaches exposed).
- Rail grade metric along the track.

### F — Visual evidence

- `docs/step51/compare/`: before | after | difference for every pose.
  - Pendeln ×4: level track.
  - `crease-brannerigatan`: tent gone.
  - `fan-570420`: deck end level.
  - Motorway/Lundatorp twists.
  - Hamngatan ×4 and `saltangsbron-corner`: unchanged apart from the moving tram.
  - Järngatan ×2 and Tvåstugubacken.
- `docs/step51/lidar/`: LiDAR intensity | LiDAR classes | native-DTM hillshade with the OSM strips. Real
  imagery stand-in: no orthophoto is available offline; Lantmäteriet's needs an API account.
  - `jarngatan-e4`: the deck is ground class, the trench is continuous after correction.
  - `tvastugubacken-bend`, `hattingsgatan`: hairpin/inside cut.
  - `kvarngatan-alignment`: carriageway on the upper half of the OSM strip, wall below.
  - `way794772996-width`.
  - `saltangsbron-south`: class 17 ends at the diagonal quay, 4–5 m past OSM's bridge end.
- `docs/step51/inspect-infra.png`: the overlay.

### Files

**UI, modified:**
- `src/lib/infraDiagnostics.ts` (1 m along-track rail grades, `refinementCandidates`), `cityMesh.ts`
  (`fanWedge` blend), `surfaceMesh.ts` (`groups`, `members`), `inspectInfra.ts` (patched halos, sites).
- Tests: `step5.test.ts`, `coordinateSystem.test.ts`, `infrastructure.test.ts`.
- Scripts:
  - `prepare-bridge-profiles.py` (native track anchors, track notch, deck-end dips);
  - `geo/road_patches.py` (targets, groups, closure, parts, ghosts, planarity, deck ends, detail, robustness);
  - `geo/infra-step5-fans.test.ts` (OUT).
- Data: `terrain.json`, `bridge-profiles.json`, `buildings-3d.json` (revision); `geo/network-profile-control.json`,
  `geo/rail-track-control.json`, `geo/terrain-mesh-control.json`.
- Docs: `ELEVATION.md`, `DATA-LICENSE.md`.

**UI, new:**
- `src/lib/step51.test.ts`.
- `scripts/data/geometry-refinement-targets.json`.
- `scripts/geo/{refinement_targets,rail_grade_evidence,refinement_report,lidar_window,lidar_topview}.py`.
- `scripts/geo/infra-step51-{railprofile,measure,patchsites,patchtri,cars,poses}.test.ts`.
- `scripts/geo/step51-after.ps1`.
- `docs/step51/`.

**Backend:**
- `TerrainService.kt` (`SurfacePatches.groups`, `.members`, both optional).
- Resources `terrain.json`, `bridge-profiles.json`; test fixtures regenerated.

**Reproduce** (geodata Python; order matters; also in `ELEVATION.md`):
```
INFRA_OUT=work/step51/diagnose-before.json npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-diagnose.test.ts   # on the Step 5 surface
npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step51-railprofile.test.ts
python scripts/geo/rail_grade_evidence.py && python scripts/geo/refinement_targets.py
python scripts/prepare-bridge-profiles.py && python scripts/geo/road_patches.py --apply
pwsh -File scripts/geo/step51-after.ps1      # fixtures, diagnostics, evidence, report
```

**Rollback:** `work/step51/orig/` holds tarballs of every uncommitted file of both repositories before Step 5.1
(`pre-step51-backup.tgz`, `pre-step51-backend-backup.tgz`, file lists alongside). `work/step51/before-app/` is a
runnable Step 5 copy (its `node_modules` is a junction: remove it with `rmdir` before deleting). Its
`src/lib/infraDiagnostics.ts` was replaced by the Step 5.1 one to measure the baseline with identical code; the
original is `work/step51/before-app-infraDiagnostics.step5.ts`.

### Remaining issues

1. **Cost decision** (D): +3.6 % geometry, +0.27 s map ready, +20 MB heap. Options are listed above.
2. **Three patch artefacts:** Gamla Övägen −0.35 m, Eksundsvägen −0.36 m, Sandbyhovsgatan 0.58 m. All are
   group-boundary blends; the fix is to draw roads on patches from the patch's own asphalt triangles.
3. **One group not tiled** (grade-break-414, service road E 567 158 N 6 494 469): skipped, unchanged from
   Step 5.
4. **Horizontal problems, not corrected by heights:** 209 OSM centrelines beside the carriageway, 32 widths over
   verges/walls, incl. Kvarngatan 1.8 m and the Tvåstugubacken hairpins. These need OSM geometry/width review.
5. **Priority B:** 444 twists where the mesh adds 0.3–0.5 m, 99 grade breaks and 27 steep grades. Reported, not
   patched (budget).
6. **Saltängsbron deck corner:** a kerb/quay-path wedge between OSM's bridge end and the quay (class 17 shows the
   deck reaches the quay 4–5 m further). Needs the bridge end or a quay breakline, not terrain.
7. **Beside level track in cuttings** the slope now shows its measured facets. Physically right, visibly more
   faceted.
8. Unchanged from Step 5: P-hus Spiralen ramps, three DTM pits, footbridge 1051570519, tram terminus track,
   two-level junction nodes.

### Git status

- UI: `main` = `d85f6ec letsgo`; all geometry-pass, Step 5 and Step 5.1 work uncommitted.
- Backend: all Step 1–5.1 changes uncommitted.
- Nothing committed or pushed.

---

## Step 5 (2026-10-19): road surface integration and remaining grades — COMPLETE, waiting for review

**Action for the user:** restart the Ktor backend (:8080). Data and `TerrainService.kt` changed; the new
revision is `lm-dtm-b976b87a19446d3d-surface-ead9e05ccfd3` (the DTM grid itself changed: retained bridge
decks removed). A backend on an older revision is rejected by the client. Nothing committed or pushed.

**Note on C.1:** the three screenshots of the Hamngatan × Drottninggatan defect did not arrive with the
message. The site was located from the data (below); please send the camera positions if what you saw
differs from the views in `docs/step5/`.

### Summary

| Item | Root cause (measured) | Result |
|---|---|---|
| **A** Pendeln 8.5 %, E 567 423 N 6 497 104 | Not the bridge clearance. The embankment between two underpass bridges was 1.2–1.5 m too low in the rendered mesh (native DTM 22.4–23.1 m, mesh 21.1–21.8 m). The mesh's class cache had a fixed name; when it was built, 112 track segments still carried the legacy invented `bridge` flag, so the rail corridor was skipped and only the coarse land tolerance applied. The flags were removed in the geometry pass, but the mesh was never rebuilt. | Caches keyed on the map content; mesh rebuilt; new **track-bed** class (running lines ±2.5 m, tolerance 0.25 m). Pendeln max **8.46 → 3.79 %**, p99 **3.02 → 2.12 %** (below the 2.5 % mainline limit), grade issues 41 → 13. Trains still follow the rails (wheel − rail top 0.000 m). |
| **B** Järngatan 47.7 %, E 567 340 N 6 498 034 (way 1239608192) | The DTM **kept the E4 bridge deck as ground**: LiDAR class 2 at 14.8–15.1 m, 0 class-17 returns, a 27 m plateau with vertical walls. Järngatan was draped over the deck (+5.6 m). The generic 4.5 m clearance rule then lifted the E4 deck to 19.6 m on top of the draped Järngatan (15–19 % ramps on the E4). | Retained-deck detector + DTM correction (deck removed the way the DTM removes bridges, linear between the real ground on both sides). 2 retained decks in the whole map. Järngatan runs through the underpass at 9.3–9.7 m (≈1 %). The E4 deck sits at 14.7–15.2 m (its LiDAR surface); its steep-grade errors are gone. |
| **C.1** Hamngatan × Drottninggatan, Saltängsbron south end, E 568 912 N 6 495 374 | Two at-grade Drottninggatan nodes lay 1–4 m inside the DTM's removed-bridge gap (river surface 0.92 / 1.64 m) between the deck (3.71 m) and the street (3.3 m): a **2.5 m hole** of draped asphalt, approach ramps and junction fans. Contributing: junction fans drawn flat at node level next to sloping strips, and two independent engineered profiles (tram and road approach hulls). | Deck-end notch rule (2 nodes map-wide: 3.51 / 3.55 m), new junction-fan rule, and the breakline patch with grounded pieces and level tram corridors. **0 diagnostics issues remain** in the box; the hole, steps and triangles are gone (`docs/step5/compare/hamngatan-*`). Cars ride exactly on the asphalt and trams on the rails. |
| Similar triangles elsewhere | The **flat-fan rule** is map-wide: 54 junctions had fan steps > 5 cm, 20 > 0.3 m, max 1.73 m (E 569 780 N 6 495 653). The notch case exists only at Saltängsbron. | Fans now meet their strips: **0 > 0.3 m**, max 0.27 m, 20 > 5 cm (residual mid-edge creases). |
| **C** Road/terrain integration | The 5 m mesh crosses walls, kerbs and verges under the road (the 829 crease warnings). | Prototype **breakline patches** in 5 bounded boxes: asphalt against native DTM RMSE 0.10–0.22 → 0.014–0.094 m; creases in the boxes 17 → 4 (the 4 are Tvåstugubacken switchbacks where OSM cuts the bend). Terrain outside the touched leaves is unchanged by construction. |
| Cost | | Static triangles +2.13 %, map ready +0.23 s, frame time no regression. City-wide at the prototype density: not recommended (≈ +13 M triangles); see next steps. |

### A — Pendeln (railway grade)

- Exact location: track segment way 94364274 / 94364280, s = −20…+10 m around E 567 432 N 6 497 098, between
  Södra stambanan's two underpass bridges (ways 94364277/94364281 and 94364283/94364291).
- Native 1 m DTM along the track centre (median across ±1 m): 22.44 → 22.56 → 22.71 → 22.85 → 23.02 m over
  55 m, **0.8 %**. Rendered mesh before: 21.15–21.8 m on 14–20 m triangles with vertices on the embankment
  slopes (19.0, 18.4 m). Bridge decks and clearances were not involved: decks 22.0–23.3 m, consistent with the
  track on both sides.
- Trafikverket/Lantmäteriet comparison: Södra stambanan here is a level mainline; the measured embankment
  (0.8 %) is the reference. No online Trafikverket profile was consulted (none available offline); the native
  DTM is the authoritative measurement used.
- Fixes: `terrain_mesh_study.py` caches keyed by the map hash (categories, built-up area) and the split-error
  stamp by map + corrections + class definitions (`inputs_key`); new `track` class: running lines only
  (`service` untagged in `scripts/data/norrkoping-railway-tags-source.json`: 33 of 89 km; sidings and yards
  carry no vehicle), tolerance 0.25 m (≤ 2.5 % over a 10 m triangle).
- Remaining Pendeln peaks are cuttings where a 5 m grid node 2–3 m from the track lies on the cut slope
  (e.g. E 567 769 N 6 496 729, 3.8 %); the RTIN is already at 5 m there. The rail breakline prototype
  (`rail-pendeln-cutting`, E 565 795 N 6 497 442) removed that site's 4.1 % (track bed vs DTM RMSE
  0.22 → 0.09 m).

| Vehicle grade, 20 m chord | Before (geometry pass) | After |
|---|---|---|
| Pendeln p99 / max | 3.02 / 8.46 % | **2.12 / 3.79 %** |
| Tram 2 p99 / max | 4.81 / 6.49 % | 4.81 / 6.49 % |
| Tram 3 p99 / max | 5.05 / 5.79 % | 5.05 / 6.23 % (E 567 512 N 6 494 220: a real ≈5.5 % street; track within 0.12 m of the DTM; tram limit 8 %) |

### B — Järngatan under the E4

- Exact coordinates: Järngatan way 1239608192 (one 87 m segment) crosses under Stockholmsvägen bridge ways
  4384899 and 4384901 at E 567 350–567 363, N 6 498 035. The OSM geometry is consistent: E4 `bridge=yes`,
  Järngatan at grade; the classification is an underpass.
- Evidence: native DTM plateau 14.8–15.1 m from s = 33 to 58 m with walls of 5.5 m; LiDAR: 1 733 class 2
  returns, plateau returns class 2 at 14.8–15.1 m, **no class 17**; Järngatan rims 9.37 / 9.38 m (class 2).
  Clearance 15.0 − 9.4 m = 5.6 m surface to surface (≈4.6 m free height under a ≈1 m deck: a normal value).
- Fix (data, not an offset): `scripts/geo/retained_decks.py` lists every OSM bridge crossing an at-grade way
  whose deck the DTM kept (plateau, walls ≥ 2.5 m both sides, ≤ 5 class 17 returns): **2 bridges in the whole
  map**: the E4 over Järngatan and its footpath, and footbridge way 1051570519 over path 145121960 (E 571 216
  N 6 491 462, 6 m ridge at 20.7 m, ground 17.5 m, 0 class 17). `scripts/geo/dtm_corrections.py` removes the
  deck as the DTM removes bridges: per station across the bridge axis, plateau and wall pixels are replaced by
  the ground beyond the walls, linearly (854 native pixels, 45 grid nodes, −0.01 to −5.76 m); native files
  unchanged; the 5 m nodes are resampled with `prepare-dtm.py`'s bilinear rule; new grid revision. Footbridge:
  71 of 231 stations qualify (the rest have an embankment, not a wall, on one side: left as measured).
- Then the existing rules do the rest: the deck anchors on the E4 at 14.7–15.2 m, no clearance lift is needed,
  and Järngatan is draped through the open underpass.

### C.1 — Hamngatan × Drottninggatan (Saltängsbron south)

- Contributors inspected (`scripts/geo/infra-step5-probe.test.ts`, native DTM grid, mesh triangles):
  - Hamngatan (ways 8236738, 285599454, 297690886, 475524194);
  - Drottninggatan (92459627, 92459645, 312486749, 501428820/822, decks 47460598/501428826);
  - tram 92385211, 270608831/832 and Saltängsbron's deck profile (LiDAR 3.71 m);
  - adaptive terrain triangles; junction fans.
- No duplicate geometry or winding error was found. The depression was **conflicting elevation**: nodes in
  the DTM's bridge gap (0.92 m) and fans flat at node level beside sloping strips.
- Real layout: the native DTM quay edge runs diagonally from E 568 898 N 6 495 369 to E 568 938
  N 6 495 383. The street south of it is 3.1–3.5 m, the deck 3.7 m; OSM's bridge end stops 4–5 m short of
  the quay.
- Fixes:
  1. `prepare-bridge-profiles.py` 1c "deck-end notches": walking ≤ 25 m from a deck end along road/tram/rail,
     a node whose ground is ≥ 1 m below both the deck end and the land rim (rim within 1.5 m of the deck)
     takes the upper-hull level. 2 nodes map-wide.
  2. Junction fans (`cityMesh.ts fanWedge`): corners from the strips' own surfaces, node at its level,
     planar between linear pieces, draped otherwise; the choice is shared with the diagnostics.
  3. The breakline patch integrates the street, the grounded notch/approach pieces (drawn and driven draped
     on the surface they shaped: `patches.integrated`, same rule in `TerrainService.kt`) and level tram
     corridors.
- Verified: drawn surface ≥ 2.9 m within 15 m of both notch nodes (before 1.06 m); no junction step, no fan
  > 0.15 m, nothing below the terrain; grades within limits; cars at exactly 5 cm on every transport edge;
  tram wheel − rail 0 (`src/lib/step5.test.ts`). Screenshots: `docs/step5/compare/hamngatan-{a-top,
  b-from-river,c-low-east,d-from-se}.png`.
- Residual: a small sloped kerb/fan facet at the east deck corner (≈E 568 922 N 6 495 383) seen from the
  river. Terrain RMSE in that box 0.128 → 0.185 m: the abutment fill ends at the DTM's river edge, so the
  slope down to the water is on the water side of the quay (under the bridge end).

### C — Road/terrain integration prototype (breaklines)

**Design** (`scripts/geo/road_patches.py`; runtime `surfaceMesh.ts`, `TerrainService.kt`):
- Only RTIN leaves touched by the drawn asphalt are re-triangulated (conforming Delaunay on scipy, every
  constraint recovered, each leaf tiled exactly; no new dependency).
- Every leaf edge is a constraint, so each patch triangle lies in one leaf: runtime lookup = leaf, then its
  triangles (root-cell flags skip it elsewhere).
- Constraint edges: the asphalt outline (union of the strips and draped fans exactly as `cityMesh.ts` draws
  them), tram corridor edges and leaf edges. Patch boundary points are linear on the RTIN edge (no cracks:
  worst step 0.16 mm over 70 023 edges).
- Asphalt heights = measured road surface: a robust local plane of native 1 m DTM pixels inside the asphalt
  (2.5 m, trimmed at 0.12 m; 5 m where steeper than 25 %). Long profile, crown and crossfall are the DTM's;
  kerbs and walls beside the road no longer tilt it.
- Terrain vertices keep their DTM node heights; walls and verges become slopes between the road edge and the
  leaf corner; terrain cannot pass through the asphalt.
- Contract nodes are exact vertices: network nodes, span/deck ends (any kind) and grounded linear pieces (data
  profile, then draped). Tram corridors are level across the gauge at the tram's height. Bridges, spans over
  underpasses and culverts are never filled.

| Box (SWEREF) | Leaves → triangles | Asphalt vs native DTM RMSE / p95 / max (m), RTIN → patch | Terrain in touched leaves RMSE |
|---|---|---|---|
| Saltängsbron south 568 800–569 100 / 6 495 250–450 | 326 → 4 987 | 0.103/0.211/0.49 → **0.023/0.044/0.18** | 0.128 → 0.185 (abutment fill, see C.1) |
| Ektorpsgatan 568 500–568 800 / 6 493 200–500 | 700 → 8 968 | 0.171/0.383/1.91 → **0.022/0.041/0.61** | 0.391 → 0.348 |
| Tvåstugubacken 571 200–571 500 / 6 493 200–500 | 703 → 5 665 | 0.167/0.332/1.10 → **0.078/0.138/0.99** | 0.187 → 0.179 |
| Järngatan / E4 567 280–567 440 / 6 497 990–8 080 | 175 → 1 838 | 0.129/0.223/1.07 → **0.014/0.028/0.08** | 0.475 → 0.406 |
| Pendeln cutting (track bed) 565 740–565 870 / 6 497 400–495 | 219 → 1 883 | 0.222/0.430/1.64 → **0.094/0.114/1.24** | 0.338 → 0.292 |

- Sample spacing study: 2.5 / 5 / 10 m → 28 881 / 20 718 / 17 023 patch triangles for the same accuracy
  (p95 0.055/0.056/0.062 m at Saltängsbron). 5 m was chosen.
- Things tried and rejected while building it (render check, `docs/step5`):
  - averaging overlapping tram and road hulls (pale ground poked through between the tracks);
  - a measured street surface under embedded tram rails (rails dipped under the asphalt);
  - outline vertices snapped onto terrain points (a 2 m slope at the quay).
  All three are fixed by the rules above.
- **Not recommended city-wide at this density**: ≈320 extra static triangles per road segment → ≈ +13 M for
  the 41 162 at-grade road segments. Recommended: targeted patches where a check fails (the remaining 817
  creases, 333 below-terrain, fan creases, notch-like sites) plus adaptive vertex density.

### D — Tests and diagnostics

New `src/lib/step5.test.ts` (14 tests):
- Hamngatan site: no hole, notch levels, no steps/fans/sinking, grades, cars on the asphalt and trams on
  the rails;
- Järngatan profile and E4 deck level;
- Pendeln against the native embankment and the vehicle grade limits;
- patch continuity and location, no creases on integrated asphalt, junction fans map-wide, span pieces
  untouched.

New diagnostic `junctionFans` (overlay colour `#00897b`). New checks/tools:
- `scripts/geo/infra-step5-{probe,tri,patchcheck,fans,railgrade,perf}.test.ts`;
- `infra-mesh-control.test.ts` (backend fixture incl. 2 000 patch points);
- `grade_evidence.py`.

Backend:
- `NetworkProfileTest` gains the `integrated` group;
- `TerrainMeshTest` checks 5 000 points (2 000 in patches) against the UI surface within 2 µm.

Map-wide diagnostics (same diagnostics code on the pre-Step-5 tree and now; `work/step5/diagnose-*.json`):

| Check (error / warning) | Before | After |
|---|---|---|
| steep-grade | 92 / 312 | **80 / 273** |
| grade-break | 101 / 358 | **86 / 356** |
| junction-fan (new) | 20 / 34 | **0 / 20** |
| cross-section | 13 / 816 | 11 / 806 (in the prototype boxes 17 → 4) |
| below-terrain | 4 / 358 | 4 / 333 |
| junction-step | 4 / 0 | 4 / 0 (documented two-level nodes) |
| sag, shore, spikes | unchanged | unchanged |

Remaining steep grades, top 30 against the native DTM (`scripts/geo/grade_evidence.py`,
`work/step5/grade-evidence.json`): 22 are as steep in the DTM (e.g. Storbacken 19.4 % measured; driveways,
car-park ramps, sidings on unmodelled structures). 8 come from our profiles/mesh:
- P-hus Spiralen ramps 270848683 / 270848407 (E 569 234 / 569 265 N 6 494 8xx);
- way 794772996 (E 562 774 N 6 493 492);
- 1214636004 (E 563 787 N 6 491 506);
- 257600153 (E 562 503 N 6 493 541);
- the motorway 317703365 (E 565 579 N 6 495 454);
- Spiggvägen 984598452;
- 1527957988 (E 565 752 N 6 497 837).

### E — Performance (same machine; production builds side by side; 3 alternating runs, medians)

| | Before | After |
|---|---|---|
| Terrain mesh triangles | 925 494 | 930 790 (+0.6 %) |
| Patch triangles (replacing 2 123 leaves) | – | 23 341 (0.80 MB base64 in `terrain.json`, 33.2 MB) |
| Static triangles | 8 236 554 | 8 412 094 (+2.13 %; road patches ≈ +84 k, track class and rail box the rest) |
| Vertex buffers | 1 087 MB | 1 110 MB |
| Geometries | 5 437 | 5 488 |
| Worker build terrain / network / markings / buildings (Node, ms) | 1 708 / 2 084 / 474 / 319 | 1 725 / 2 220 / 508 / 319 |
| Network build with vs without patches (same data) | – | ≈2 200 vs ≈2 080 ms |
| Map ready / page ready | 3 007 / 3 969 ms | 3 234 / 4 172 ms |
| Longest upload frame / upload excess | 961 / 968 ms | 929 / 932 ms |
| JS heap | 162 MB | 142 MB (noise ±15 MB) |
| Frame time overview / city / campus / industry / parken / kungsgatan | 15.2 / 6.0 / 4.1 / 2.4 / 2.8 / 2.2 ms | 12.9 / 5.1 / 3.4 / 1.9 / 2.3 / 1.6 ms (lower in every run; run order is a likely factor: no regression) |

Web Workers, SWEREF 99 TM, RH2000, the adaptive mesh and the simulation are unchanged in design; patches
are an additive mesh layer read identically by client and backend.

### Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **144 / 144** (16 files; 14 new in `step5.test.ts`) |
| `npm run build` | OK; dev overlay absent from `dist` |
| Backend `dev.ps1 test` | **43 / 43** |
| `npx playwright test` | **2 / 2** (dev server + backend on :8091 with the new revision, `ALLOWED_ORIGIN` set) |
| Browser captures | 11 identical-camera views before/after, no page errors (`docs/step5/{before,after,compare}`, poses `docs/step5/poses.json`) |

Test adaptations:
- `surfaceMesh.test.ts`: the triangle count includes patches; the rtin.py reference, accuracy bounds and
  vertex values apply to the RTIN outside patches; the reference heights were refreshed for the rebuilt
  mesh at the same positions, and the old limits were kept;
- `terrain.test.ts`: patch strings are held decoded;
- `coordinateSystem.test.ts`: 697 profile keys (+2 notch nodes).

### Files

**UI, modified:**
- runtime: `src/lib/surfaceMesh.ts` (patches, `leafKey`, `patchedAt`), `terrain.ts` (`integrated`),
  `mapModel.ts`, `cityMesh.ts` (`fanWedge`), `infraDiagnostics.ts` (`junctionFans`), `inspectInfra.ts`;
- tests: `surfaceMesh.test.ts`, `terrain.test.ts`, `coordinateSystem.test.ts`;
- scripts: `prepare-bridge-profiles.py` (1c notches), `prepare-terrain-mesh.py` (track tolerance, stamp),
  `geo/terrain_mesh_study.py` (cache keys, track class, corrected native pixels);
- data: `terrain.json` (grid corrected, mesh, patches, revision), `bridge-profiles.json`, `buildings-3d.json`
  (revision), `geo/network-profile-control.json`, `geo/rail-track-control.json`,
  `geo/terrain-mesh-control.json` (mesh heights only);
- docs: `ELEVATION.md`, `DATA-LICENSE.md`.

**UI, new:**
- `src/lib/step5.test.ts`;
- `scripts/geo/{retained_decks,dtm_corrections,road_patches,grade_evidence}.py`;
- `scripts/geo/infra-step5-*.test.ts`, `scripts/geo/infra-mesh-control.test.ts`;
- `scripts/data/dtm-retained-decks.json`;
- `docs/step5/`.

**Backend:**
- `TerrainService.kt` (patch surface, `integrated`), `NetworkProfileTest.kt`;
- resources `terrain.json`, `bridge-profiles.json`;
- test resources `network-profile-control.json`, `rail-track-control.json`, `terrain-mesh-control.json`.

**Reproduce** (order matters; also in `ELEVATION.md`):
```
python scripts/geo/retained_decks.py && python scripts/geo/dtm_corrections.py --apply
python scripts/prepare-terrain-mesh.py --activate --recompute
python scripts/prepare-bridge-profiles.py
python scripts/geo/road_patches.py --apply
npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-profile-control.test.ts scripts/geo/infra-mesh-control.test.ts
```

**Rollback:** `work/step5/orig/` holds pre-Step-5 `terrain.json`, `bridge-profiles.json`, `buildings-3d.json`
(UI and backend) and tarballs of every uncommitted file of both repositories (`pre-step5-backup.tgz`,
`pre-step5-backend-backup.tgz`, file lists alongside). `work/step5/before-app/` is a runnable pre-Step-5 copy
(remove its `node_modules` junction with `rmdir` before deleting).

### Remaining issues and next steps

1. **Targeted breakline patches** instead of a city-wide rollout: generate patches only around failing checks
   (817 creases, 333 below-terrain, 20 fan creases), with adaptive vertex density; estimate first, then
   expand.
2. **Rail breaklines along running lines** for the remaining Pendeln cutting peaks (3.5–3.8 % at
   E 567 769 N 6 496 729, E 564 485 N 6 494 530, E 564 983 N 6 494 806); proven in the prototype box.
3. Eight pipeline steep grades (listed in D), incl. P-hus Spiralen ramps outside the documented exception.
4. Saltängsbron: the small east-corner fan facet; quay walls as vertical faces instead of slopes (needs
   breaklines along quay edges).
5. Tvåstugubacken switchbacks: the OSM centreline cuts hairpins; road geometry, not elevation.
6. Footbridge 1051570519: the retained deck remains where one side is an embankment (160 of 231 stations).
7. Earlier open items unchanged: three DTM pits, measured rail decks (class 17 parapet separation), tram-2
   terminus track, two-level junction nodes.

### Git status

- UI: `main` = `d85f6ec letsgo` (1 ahead of `origin/main`); all geometry-pass and Step 5 work uncommitted.
- Backend: all Step 1–5 changes uncommitted.
- Nothing committed or pushed.

---

## Geometry pass (2026-10-18, evening): COMPLETE — waiting for review

**Action for the user:** restart the Ktor backend (:8080). Data, `RailTraffic.kt`, `TerrainService.kt` and
`CityTransport.kt` changed; the new revision is `lm-dtm-8eccbc3691700b78-surface-5a5ae7528bd2`. A backend
on the old revision is rejected by the client ("Kartans och serverns höjddata skiljer sig").

### Summary

| Area | Result |
|---|---|
| Git | `letsgo` rebuilt without 560 generated files (push 550 MiB → ≈153 MiB, largest file 32 MB), 24.37 GiB temp garbage quarantined, backup verified. Ready for a normal fast-forward push of `d85f6ec`. Not pushed. |
| Trains/trams on rails | Wheel contact − drawn rail top: deck RMSE 3.0–4.0 m (max 7.0 m) → **0.000 m** on all 31 247 route samples; pitch on two bogies; wheels at gauge. |
| Rail profiles | 112 invented rail/tram "decks" (flat-scene ramps, no OSM bridge) removed; Ståthögavägen 14.7 % → level track over the underpass. Vehicle grade max: Pendeln 14.7 → 8.5 %, tram 2 11.9 → 6.5 %, tram 3 9.9 → 5.8 %. Rail grade p99 (10 m) 4.66 → 4.41 %, max 35.5 → 25.5 %. |
| Roads | Untagged service roads 6.6 m → 3–4.5 m (12 100 segments); twisted cross-sections 1 060 → 829 (> 1 m: 23 → 13); road steep-grade errors 101 → 78, grade-break errors 119 → 95 (non-path); Linköpingsvägen, Folkborgsvägen, Söderköpingsvägen fixed. |
| Bridges | Spans now cross OSM way splits and junctions; approaches no longer hump over the DTM's removed-bridge gap; 240 road/path deck nodes measured from LiDAR class 17 (estimates were off by RMSE 0.59 m, max 4.7 m). Hamnbron deck RMSE vs LiDAR 0.20 → 0.11 m, Saltängsbron 0.33 → 0.22 m, Gamlebro 0.93 → 0.84 m. |
| Terrain | Gamlebro/Industrilandskapet faceting is real relief at the 5 m mesh limit (documented, not smoothed). 3 isolated DTM pits listed for orthophoto checks. Road-surface mesh refinement tested and rejected (+15 % triangles, no crease gain). |
| Performance | Static triangles 9.07 M → **8.24 M (−9 %)**, vertex buffers 1 198 → 1 087 MB; startup and frame times equal or slightly better. |
| Tests | UI 130/130 (13 new), backend 43/43 (3 new), svelte-check 0/0, build OK, Playwright 2/2, browser captures with live vehicles. |

### Priority 0 — Git recovery (done)

**Diagnosis**
- `main` at `40531ae letsgo`, one commit ahead of `origin/main` (`b04d9aa`, confirmed with
  `git ls-remote`). Working tree clean. No pack files: all 2 320 objects were loose (1.26 GiB).
- Published history (`origin/main`, 224 objects) never contained anything under `work/`; its largest blob
  is a 30 MB `terrain.json`. All 566 tracked `work/` files and all four blobs > 100 MiB
  (`work/step35/water/{labels,reach,dtm2}.npy` 218.75 MB each, `cells.npz` 153 MB) came from `letsgo` only
  (709 new blobs, 1.47 GB uncompressed, 550 MiB packed).
- Push failure was a combination: GitHub failed server-side while storing the 550 MiB pack
  (`unable to rename temporary '*.pack' file` → `index-pack failed`), and the four files exceed GitHub's
  100 MiB hard limit, so the push would have been rejected anyway.
- The 313 "garbage" files (24.37 GiB) were all in `.git/objects/09/`, all truncated zlib streams of the
  same 218 750 128-byte blob `09eb8c31…` (`dtm2.npy`), written 14:44–17:42 today (repeated interrupted
  writes). The complete object exists. No Git process was running.

**Backup** (verified before any change): `C:\Users\amarg\dev\backups\norrkoping-ui-git-recovery-20261018\`
- `history-all-refs.bundle` (`git bundle --all`, verified: complete history incl. original `40531ae`);
- `tree/`: robocopy of the whole repo incl. `.git` (13 672 files, 0 failures; `git fsck --full` clean
  inside it; sample SHA-1s of datasets identical; every source file present);
- `quarantine-tmp_obj/`: the 313 temp files, moved (not deleted). Safe to delete when you are satisfied.
- `README.txt` explains each item.

**Tracking policy** (`.gitignore`): `work/**` is ignored except hand-written `*.py`, `*.mjs`, `*.md`,
`*.txt`; the app snapshots (`before-app/`, `optionB-app/`, `before-snapshot/`,
`coordinate-migration-backup/`) and `work/geodata/` stay ignored; `__pycache__/`, `*.pyc` ignored.
Runtime data in `src/lib/data/` (largest 32 MB, below GitHub's 50 MB warning) stays in Git: it is
already in published history, the app needs it to build, and Git LFS would require rewriting published
history and adds bandwidth quotas — not justified now. Raw survey data stays outside Git
(`work/geodata/`, documented download scripts).

**Unpublished commit rebuilt**: 560 generated files untracked (`git rm --cached`; all still on disk),
`.gitignore` added, `letsgo` amended → `d85f6ec`. Outgoing push: 475 blobs, 206 MB uncompressed,
≈153 MiB packed, largest blob 32 MB, fast-forward of `origin/main`. `git fsck --full` clean, garbage 0.
Published history unchanged. Not pushed.

### Batch A — rail vehicles on their tracks (done)

**Root cause (measured).** Two height paths for one track:
1. The renderer draws rails from the map's rail segments, whose deck profiles and spans are keyed by the
   node's legacy level `(x, z, legacyY)` (`bridge-profiles.json`).
2. The backend (`RailTraffic.kt`) moved vehicles along `transitRoutes`, whose points were stored at
   `railHeight(p) + 0.018` (`scripts/import-transit.mjs`): a baked-in "vehicle above rail" lift. The key
   therefore never matched: **0 of 2 535 route points** hit a deck key (351 drawn rail ends do). On every
   deck the vehicles fell back to "ground + legacy flat-scene lift", e.g. the 7 m rail ramps that
   `import-norrkoping.mjs railHeight()` builds within 50 m of road tunnels.
   Horizontally the route polylines coincide with the drawn track (2 528 of 2 532 segments; the other 4
   are a ~30 m reversing move at a tram terminus without drawn track).
3. Secondary: rails were draped individually at ±0.7 m, so on creased terrain the two rails differed by up
   to 0.5 m while the vehicle used the centreline; vehicles had no pitch; wheels were drawn at ±1.33 m
   (outside the rails).

**Fix — one canonical track** (`src/lib/trackProfile.ts`, mirrored by `RailTraffic.kt`):
- Route points carry the track node's own reference level (data migrated by
  `scripts/geo/transit-reference.mjs`, idempotent; `import-transit.mjs` fixed), so vehicles get exactly
  the drawn rails' rules (deck profiles, spans, approaches, terrain).
- `terrain.profileHeight` span branch returns the span itself (as drawn); vehicle offsets are not data.
- Rail head above the running surface per kind: ballasted rail 0.18 m (60E1 rail + pad), embedded tram
  rail 0 m (flush with the street). Was 0.25 m for both. Standard gauge 1 435 mm; rails drawn at
  ±0.754 m.
- Rails are drawn level across the gauge at the centreline profile (`cityMesh.profileStrip`, breaks at
  the exact mesh-edge crossings `SurfaceMesh.crossings`).
- Each section rests on its two bogies (X61 ±6.24 m, tram module ±1.8 m): position on the chord, heading,
  **pitch** (new `pitch` field on `VehicleSection`/`VehicleView`; client applies it).
- Wheels modelled at the gauge.
- Shared fixture `src/lib/geo/rail-track-control.json` (1 700+ poses incl. every deck node): Kotlin
  reproduces the UI within 1e-7 units (`RailTrackTest.kt`).

**Vehicle wheel contact − drawn rail top** (`railAlignment()`, every 2 m of every route,
`scripts/geo/infra-rail.test.ts`; reports `work/batchA/rail-alignment*.json`):

| Route | Before: ground RMSE / max | Before: decks RMSE / max | After (all) |
|---|---|---|---|
| Östgötapendeln (9 566 samples) | 0.139 / 2.21 m | **3.96 / 7.01 m** | 0.000 / 0.000 m |
| Tram 2 (12 117) | 0.088 / 2.67 m | **3.23 / 6.05 m** | 0.000 / 0.000 m |
| Tram 3 (9 564) | 0.097 / 2.67 m | **2.98 / 5.71 m** | 0.000 / 0.000 m |

Worst before: Pendeln E 565 246 N 6 495 468 (bridge over the river, train 7.0 m *below* the deck, in the
water); Ståthögavägen E 569 194 N 6 495 989 (+7.0 m floating) and E 569 129 N 6 495 919 (−2.4 m); tram 2
E 565 895 N 6 497 283 (+6.1 m, modules in a staircase).

**Browser evidence** (live backend, vehicle in frame, simulation paused; `scripts/capture-vehicle-views.mjs`
with `docs/batchA/vehicle-poses.json`): `docs/batchA/before/`, `after/`, `compare/` (8 views).

With vehicles on the decks, their pitch exposed that the estimated rail deck profiles at Ståthögavägen
were far steeper than any mainline: that went to Batch C.

### Batch B — road geometry (done, with documented limits)

**Diagnosis (measured, `scripts/geo/infra-xsection.test.ts`).** Draped roads follow the 5 m adaptive mesh
exactly. Mesh triangles are larger than the road (tolerance 0.4 m built-up / 0.75 m elsewhere), so the
asphalt shows creases: centre − mean of edges > 5 cm at 16.8 % of narrow-road and 32.3 % of wide-road
stations, p99 0.30 m, max 4.35 m. The broken look is these creases plus flat shading.

**Options tested and rejected (with numbers):**
1. *Separate engineered road plane* (centreline profile + least-squares crossfall): terrain would poke
   through the asphalt > 5 cm at 11.4 % of stations and > 15 cm at 3.2 %. Rejected (visible regression;
   the road is part of the DTM it was measured from).
2. *Tighter mesh on road/tram surfaces* (new `network` class; `scripts/geo/network_mesh_budget.py`,
   `MESH_NETWORK_CLASS=1` in `terrain_mesh_study.py`): 0.25 m costs +28 % terrain triangles and +14.8 %
   static triangles (10.41 M) and did **not** reduce creases (> 5 cm: 16.8 → 25.4 %): the 1 m DTM has real
   crowns (≈2.5 %), gutters and kerbs. Activated, measured, and the original mesh restored (hash checked).
3. *Kerbs as edge strips* instead of a full strip under the asphalt: +0.44 M triangles (thin draped strips
   cross as many mesh edges). Reverted.

**Root causes fixed:**
- **Service road widths** (data defect): `import-norrkoping.mjs` used `max(4, lanes × 3.3)` with lanes
  defaulting to 2, so 11 730 untagged two-way service segments (plus 358 driveways, 8 alleys) were 6.6 m.
  Tags fetched (Overpass, tags only, `scripts/data/norrkoping-service-roads-source.json`); untagged:
  driveway 3.0 m, alley/drive-through 3.5 m, other two-way 4.5 m, parking aisles and one-way unchanged.
  `scripts/geo/service-road-widths.mjs` (12 100 map segments, 23 410 network edges, UI + backend);
  importer fixed. Twisted cross-sections 1 060 → 872 at this step.
- **Cornices draped on the terrain** (geometry bug): the roof-edge cornice strip copied the relief 10–30 m
  below the roof and was cut at every mesh triangle. Now linear at wall top: 902 k → 163 k triangles.
- Long-profile peaks/dips on roads were mostly removed-structure trenches → fixed by the span work in
  Batch C (Linköpingsvägen, Folkborgsvägen, Söderköpingsvägen).

**Limit (documented):** 816 crease warnings (0.3–1 m) and 13 errors (> 1 m) remain where the 5 m mesh
crosses walls, terraces and steep verges (worst: way 794772996 E 562 631 N 6 493 509, Vattenverksvägen
E 565 295 N 6 495 353, Kvarngatan E 568 591 N 6 494 808). They are the terrain's own facets, not a road rule.
A real fix needs breaklines (road edges as constrained mesh edges) — a mesh-format change shared with
the backend.

**Junction screenshot (dark triangles, 17:39):** its location could not be identified from the image.
Junction fans were checked analytically (no reflex fans possible: offsets are centrally symmetric) and
map-wide: junction steps 5 → 4, all documented two-level nodes. Please send the camera position (the
`?inspect=infra` console prints SWEREF coordinates) if it persists.

### Batch C — rail decks, spans, approaches, junction levels (done)

**Root causes and fixes** (`scripts/prepare-bridge-profiles.py`, data regenerated for UI and backend):
1. **Invented rail decks.** `import-norrkoping.mjs railHeight()` raised track within 50 m of road tunnels
   by up to 7 m and flagged it `bridge`. Only 33 of 145 flagged rail/tram segments are bridges in OSM
   (tags fetched: `scripts/data/norrkoping-railway-tags-source.json`); none at Ståthögavägen (the road is
   `tunnel=yes`). `scripts/geo/rail-legacy-ramps.mjs`: 112 segments unflagged, 151 node levels back to
   network level (real bridge levels kept at shared nodes), 47 route points follow. Importer fixed.
2. **Span rims on uniform grades.** The hull edge ran to the window ends, so trenches in graded roads
   were never bridged. Rims now move inwards while the profile stays on the edge (1 cm).
3. **Spans per OSM way.** Södra stambanan changes way *inside* the Ståthögavägen trench; the chain started
   on the trench floor. Span detection now follows **strokes** (straightest same-kind continuation, < 45°)
   across way splits.
4. **Junctions inside spans** were rejected; now the joining segment gets a linear join piece at the
   span's level (13), and a final pass gives every node one level (1 node reconciled).
5. **Approach humps.** An approach (one end on a deck) added the deck end's offset measured against the
   ground in the DTM's removed-bridge gap: on a level embankment that built a hump (tram 2 E 569 870
   N 6 493 611: +3.1 m). Now: terrain with the far end's offset, pinned to the deck, upper hull (280
   approaches changed where it differs > 0.1 m); long approaches (> 80 m) only bridge removed-bridge
   notches (Linköpingsvägen).
6. **Measured decks.** LiDAR class 17 (Laserdata NH 2020, all 41 local tiles, 145 106 returns,
   `scripts/geo/lidar_deck_points.py`): per node, densest 1 m band within 2.5 m, ≥ 8 returns. 240 of 598
   deck nodes measured (estimate − measurement: mean −0.12, RMSE 0.59, max 4.66 m). Road/path decks only:
   on rail bridges class 17 is dominated by parapets/troughs ≈1 m above the ballast, so rail/tram decks are
   anchored to the **track** on the embankment (median ground 4–12 m along the connected track).

**Vehicle-perceived grades (20 m chord, every 5 m; `railGrades()`):**

| Route | Before (after Batch A) p99 / max | After p99 / max |
|---|---|---|
| Östgötapendeln | 4.67 / 14.7 % (Ståthögavägen) | 3.02 / 8.5 % |
| Tram 2 | 5.12 / 11.9 % | 4.81 / 6.5 % |
| Tram 3 | 5.24 / 9.9 % | 5.05 / 5.8 % |

**Decks vs LiDAR class 17** (rendered surface, `scripts/geo/measure-elevation.test.ts`, mean / RMSE m):
Hamnbron −0.15/0.20 → −0.06/0.11; Saltängsbron −0.30/0.33 → −0.17/0.22; Gamlebro −0.24/0.93 → −0.14/0.84;
Bergsbron 0.23/0.30 (same); Laxholmsbron −0.18/0.20 (same); Spången 0.01/0.07 → −0.06/0.07. The
"other" row (−1.15/2.53 → −1.38/2.70) compares class 17 returns with whatever drawn surface a vertical ray
hits; it worsened because rays that hit the invented 6 m-wide rail slabs at Ståthögavägen now hit the
road in the underpass beside the at-grade track (coverage, not deck error).

### Batch D — diagnostics and regression tests (done)

- `src/lib/infraDiagnostics.ts`: every issue has severity (`warning`/`error`) from physical limits and an
  optional documented `exception` (`EXCEPTIONS`: P-hus Spiralen ramps; `highway=steps`). New checks:
  `cross-section` (crease > 0.3 m), `vehicle-off-track` (> 5 cm), `terrain-spike` (5 m node > 3 m above/below
  all neighbours), vehicle grades per route (`railGrades`, limits 2.5 % train / 8 % tram), `railAlignment`.
- Report: `npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-diagnose.test.ts`
  (`INFRA_OUT=…`, 5 s): every issue with SWEREF E/N, kind, value, severity, exception, plus counts.
  `infra-rail.test.ts` writes the vehicle report. Final: `work/batchC/diagnose-final.json`.
- `?inspect=infra` overlay: new kinds coloured (pink cross-section, green vehicle off track, brown spike),
  exceptions hidden; checked in the browser (no page errors).

| Check (count error / warning) | Before Batch B–C | Final |
|---|---|---|
| below-terrain | 6 / 99 | 4 / 358 (new: uphill edges of bridged approaches, level cross-section, median 0.10 m) |
| junction-step | 4 / 1 | 4 / 0 (documented two-level nodes) |
| grade-break (all kinds) | 126 / 387 | 101 / 358 |
| steep-grade (all kinds) | 116 / 351 | 92 / 312 |
| sag | 8 / 65 | 7 / 60 |
| cross-section | 23 / 1 037 | 13 / 816 |
| vehicle-off-track | (not measured; 360 > 5 cm at Batch A start) | 0 |
| terrain-spike | 3 / 0 | 3 / 0 |

Tests added: `src/lib/geometryRegression.test.ts` (13: route levels = drawn levels, wheel contact on rails,
bogie poses, rail heads, vehicle grades, no non-OSM rail decks, Ståthögavägen level within 0.5 m over
120 m, one level per junction, service widths, cross-section counts, severity/exception classification,
no vehicle off track, flat cornices); `elevation.test.ts` vehicle test is now exact; backend
`RailTrackTest.kt` (fixture `rail-track-control.json`, 1 700+ poses within 1e-7).

### Priority D — terrain

- North of Gamlebro (your screenshots 17:40–17:41): native 1 m DTM shows real relief — the east bank falls
  from 8–9 m to 3–5 m within 60 m, the west bank has a ≈4 m terrace between 9–10 m ground and the channel.
  The grey facets are this relief at the 5 m mesh (Step 3 limit), not an artefact. Not smoothed.
- Isolated DTM pits (`terrain-spike`, all need an orthophoto check; not edited): E 563 067 N 6 493 594
  (≈137 m², down to −20.7 m in 32 m ground), E 572 344 N 6 500 117 (7 m², −6.9 m), E 564 482 N 6 491 375
  (21 m², 7.7 m deep). Possibly shafts/pits/docks or LiDAR artefacts.
- Quay walls, retaining walls and terraces remain 5 m-wide slopes; modelling them needs breaklines.

### Performance (same machine; production builds side by side, no backend, 3 alternating runs)

| | Before | After |
|---|---|---|
| Static triangles | 9 073 356 | **8 236 554 (−9.2 %)** |
| Vertex buffers | 1 198 MB | **1 087 MB** |
| Geometries | 5 645 | 5 437 |
| Worker build terrain / network / markings / buildings | 1 871 / 2 315 / 442 / 772 ms | 1 859 / 2 258 / 507 / 356 ms |
| Map ready (median) | 3 109 ms | 3 047 ms |
| Longest upload frame (median) | 1 056 ms | 1 044 ms |
| JS heap | ≈145 MB | ≈142 MB |
| Uncapped frame time overview / city / campus / industry / parken / kungsgatan | 18.1 / 7.2 / 4.6 / 2.3 / 2.8 / 1.9 ms | 17.3 / 6.7 / 4.3 / 2.1 / 2.8 / 1.8 ms |

Terrain mesh unchanged (925 494 triangles); Web Worker build, SWEREF 99 TM and RH2000 untouched.

### Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **130 / 130** (15 files) |
| `npm run build` | OK; overlay absent from `dist` |
| Backend `dev.ps1 test` | **43 / 43** (new `RailTrackTest`) |
| `npx playwright test` | 2 / 2 (dev server + backend on :8091 with the new revision) |
| Browser | live vehicles captured paused on decks/bridges; `?inspect=infra` loads |

### Screenshots (identical cameras)

- Vehicles: `docs/batchA/before/`, `docs/batchA/after/` (Batch A only), `docs/geometry-pass/vehicles-after/`
  (final), composites `docs/geometry-pass/vehicles-compare/`; poses `docs/batchA/vehicle-poses.json`.
- Static: `docs/geometry-pass/before/` (original tree), `after/`, `compare/`; poses
  `docs/batchA/static-poses.json` (Ståthögavägen ×2, Linköpingsvägen culvert, tram 2 bridge approach,
  Gamlebro, Kvarngatan, Industrilandskapet service roads). Overlay: `docs/geometry-pass/inspect-infra-underpass.png`.

### Files

**UI, modified:** `.gitignore`, `DATA-LICENSE.md`, `ELEVATION.md`, `src/lib/terrain.ts` (span rule,
`lineBreaks`), `src/lib/surfaceMesh.ts` (`crossings`), `src/lib/cityMesh.ts` (`profileStrip`, rails from the
track contract, cornices), `src/lib/publicTransport.ts` (pitch, bogies, gauge), `src/lib/city.svelte.ts`,
`src/lib/infraDiagnostics.ts`, `src/lib/inspectInfra.ts`, tests `elevation`, `infrastructure`,
`cityStructures`, `coordinateSystem`; scripts `import-norrkoping.mjs`, `import-transit.mjs`,
`prepare-bridge-profiles.py`, `geo/terrain_mesh_study.py`, `geo/infra-diagnose.test.ts`,
`geo/infra-profile-control.test.ts`, `geo/measure-elevation.test.ts`; data `norrkoping-map.json`,
`transport-network.json`, `bridge-profiles.json`, `terrain.json` (revision only), `buildings-3d.json`
(revision), `geo/network-profile-control.json`.

**UI, new:** `src/lib/trackProfile.ts`, `src/lib/geometryRegression.test.ts`, `src/lib/geo/rail-track-control.json`,
`scripts/capture-vehicle-views.mjs`, `scripts/geo/{transit-reference,service-road-widths,rail-legacy-ramps}.mjs`,
`scripts/geo/{lidar_deck_points,network_mesh_budget,road_profile_probe}.py`,
`scripts/geo/infra-{rail,xsection,offsets,probe-route,probe-seg,probe-node}.test.ts`,
`scripts/data/norrkoping-{railway-tags,service-roads}-source.json`, `docs/batchA/`, `docs/geometry-pass/`.

**Backend:** `RailTraffic.kt` (`RailContract`, `RailTrack`, bogie poses), `CityTransport.kt` (`pitch`),
`TerrainService.kt` (span rule), resources `transport-network.json`, `bridge-profiles.json`, `terrain.json`;
new `RailTrackTest.kt`, test resources `rail-track-control.json`, `network-profile-control.json`.

**Reproduce** (geodata Python; order matters):
```
node scripts/geo/transit-reference.mjs && node scripts/geo/service-road-widths.mjs && node scripts/geo/rail-legacy-ramps.mjs
python scripts/geo/lidar_deck_points.py
python scripts/prepare-bridge-profiles.py            # profiles, spans, revision (UI + backend)
npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-profile-control.test.ts   # fixtures
npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-diagnose.test.ts         # report
```
Rollback: originals in the backup `tree/` (`C:\Users\amarg\dev\backups\norrkoping-ui-git-recovery-20261018`)
and `work/batchB/orig/` (terrain, profiles, map before ramps).

### Remaining defects and next steps

1. Twisted road cross-sections at walls/terraces (816 warnings, 13 > 1 m): needs road-edge breaklines in
   the terrain mesh (format change shared with `TerrainService.kt`).
2. One rail deck lifted by an *estimated* clearance (Pendeln E 567 423 N 6 497 104, 8.5 %): needs the
   real clearance or a lower-band LiDAR deck model for rail bridges (parapet separation).
3. Rail bridges are anchored to the track, not measured; separating ballast from parapet returns in
   class 17 would allow measured rail decks.
4. Below-terrain warnings at uphill edges of bridged approaches (median 0.10 m): span pieces have a level
   cross-section; a terrain-following cross-section for approach pieces would remove them.
5. Järngatan (E 567 340 N 6 498 034, 47.7 %) and the steep unclassified/service ways near
   E 571 9xx N 6 500 3xx: not trenches by the DTM test; need imagery (ramps, car-park entries?).
6. Three DTM pits (above) need orthophoto verification.
7. The ~30 m tram-2 terminus reversing move has no drawn track (OSM ways missing from the extract).
8. The junction defect of screenshot 17:39 is unlocated.

### Git status at the end of this pass

- UI: `main` = `d85f6ec letsgo` (rebuilt), 1 ahead of `origin/main`, **ready for a normal fast-forward
  push** (≈153 MiB pack, largest blob 32 MB, no file > 50 MB; `git fsck` clean). The geometry-pass work
  above is **uncommitted** in the working tree (no file > 33 MB; generated data under `work/` is ignored).
- Backend: unchanged branch state; all Step 1–3.5 and geometry-pass changes uncommitted.
- Nothing committed or pushed beyond the `letsgo` rebuild.

---

## Current status (2026-10-18): Step 3.5 COMPLETE — waiting for approval

Step 3.5 (terrain, road and water integration) is implemented in the working tree and verified. Work has
stopped. Railway bridge defects are assigned to Step 4 and tram/train alignment to Step 5 (section 9).

**Action for the user:** restart the Ktor backend (:8080). `bridge-profiles.json`, `terrain.json` and
`TerrainService.kt` changed; the new revision is `lm-dtm-8eccbc3691700b78-surface-1c04d2698aea`. A backend
still on the old revision shows "Ansluter till Ktor… Starta om backend" in the client.

### Summary

The six screenshots showed three independent root causes, not one:

1. **Water draped on the DTM.** Water had no level of its own: it was drawn on the terrain mesh. Over
   water the mesh interpolates between flat water nodes and bank nodes, so the river had sloped triangular
   facets that climbed banks, quays, building walls and bridge ends. Screenshots 3–6.
   Fix: every water polygon is flat at its measured reach level (LiDAR class 9). Motala ström is several
   reaches separated by falls. Dry banks inside OSM polygons are drawn as land; sloping streams keep the
   terrain.
2. **Bridge decks and approaches anchored on the pre-Step-3 mesh with the flat-scene layer lift.**
   Approach segments (one end on a deck) were drawn as straight lines over the ground, so terrain
   humps buried them. Screenshot 2, Hamnbron. 523 deck/approach pieces were below the terrain, worst 5.3 m.
   Fix: deck profiles re-derived on the rendered mesh. Approaches now follow the terrain. Client and
   backend use the same rule.
3. **The DTM has bridges removed.** Every underpass, culvert and small bridge is an open trench in the
   ground model. At-grade ways crossing above them (OSM `tunnel=yes` on the lower way, no `bridge`
   tag above) were draped into the trench: motorways fell 5–6 m, Ståthögavägen's service road 5.6 m.
   Screenshot 1.
   Fix: 83 engineered spans bridge the trenches, from tunnel/stream crossings or the DTM signature.

Generic rail bridges at Ståthögavägen had invented piers every 9 m, standing on the road below. Piers are
now limited (section 3.5); deck reconstruction is Step 4.

### 1. Root cause per screenshot, with locations

Coordinates are SWEREF 99 TM (E, N), scene = (x, z).

| # | Location | Observed | Root cause | Kind |
|---|---|---|---|---|
| 1 | Ståthögavägen under Södra stambanan, E 569 210 N 6 495 914 (scene 7.2, −37.0). Service road way 89617052 over the Ståthögavägen tunnel (ways 39445117 / 89615815) | Dark winding road crossing Ståthögavägen at the bottom of a trench; triangular depression; rows of columns under the rail bridges | (a) The DTM shows the underpass as an open trench (bridge decks removed), and the at-grade service road 20 m south of the tracks was draped into it: 5.57 m deep, rims 2.85 / 2.82 m. (b) Generic bridge piers every 0.36 units (9 m), two per position, on every parallel rail bridge way, wherever the deck was 1.5 m above the ground; in the trench they stood on Ståthögavägen | (a) construction: the DTM is correct but was used as the road surface; (b) construction: invented structure |
| 2 | Hamnbron, E 569 412 N 6 495 482, detailed bridge way 501428838 | Beige terrain wedge over the approach lanes; overlapping road surfaces at the junction | Approach segments with one profiled end were linear between the deck end (from the old 10/40 m mesh plus 6 m layer lift) and the far node, so the terrain between them rose above the road. Junction fans of linear and draped segments overlapped at different heights | Construction (profile data and rule) |
| 3 | Footbridges over water: E 571 193 N 6 494 620 (way 104245498) and Industrilandskapet, e.g. E 568 429 N 6 494 920 (way 1212234772) | Deck ends "disconnected" from the shore; deck apparently under water | The draped water rose towards the banks, above the deck ends: 75 decks within 0.5 m of the drawn water, worst 1.68 m **under** it. The decks themselves met their paths (0 junction steps) | Rendering of water (water had no level) |
| 4 | Saltängsbron, E 568 906 N 6 495 419, way 501428827 | Bridge "submerged"; water between the road and the far railing | Same draped-water cause at the abutments, plus the deck 1.1 m low (old profile). The band seen at grazing angles is the open water beside the deck; close up, the deck is intact | Water rendering + estimated profile |
| 5 | Holmen riverbank, E 568 723 N 6 495 346 | Triangular, faceted water and bank | Water draped on large mesh triangles (water tolerance 2.25 m) spanning water and bank nodes | Water rendering; the 5 m grid cannot represent quay walls (DTM limit) |
| 6 | Strömmen at Gamlebro, E 568 821 N 6 494 939. Nearest view; the exact camera could not be recovered | Buildings and land standing in faceted water | Draped water climbing walls and banks. Numerically only 1 building has more than 10 % of its footprint in measured water (way/1355629338, E 567 672 N 6 494 769, 75 %; likely a mill or hydropower structure, to be verified against imagery) | Water rendering |

Not every defect had the same cause. Rendering artefacts (draped water) and construction errors
(profiles, trenches, piers) dominate. The DTM itself was correct everywhere it was inspected. It is
hydro-flattened over water, bridges are removed by design, and it agrees with class 9 to 0.02–0.13 m.

### 2. How each system builds its geometry (diagnosis)

- **Adaptive terrain mesh:** unchanged (Step 3 RTIN, 5 m floor).
- **Roads, paths, rails** (`cityMesh.ts` `strip`): draped on the mesh triangles with the segment's end
  offsets interpolated along it. Linear only for decks.
  - Before: a segment was linear if *either* end had a profile point (approaches included).
  - Now: linear only if *both* ends have one (`terrain.linearBetween`).
  - Spans split a segment into draped and linear pieces (`networkPieces`).
- **Junction fans:** draped at nodes on the ground, flat at nodes on decks or spans.
- **Bridge decks:** `bridge-profiles.json` points, read identically by `terrain.ts` and `TerrainService.kt`.
  - Before: anchored on a replica of the pre-Step-3 10/40 m mesh, plus the flat-scene layer lift
    (+6 m per OSM layer).
  - Detailed bridges (`cityBridges.ts`) follow their lanes' profile.
- **Water** (`cityMesh.ts` `buildTerrain`):
  - Before: every OSM water polygon was draped at `terrain.waterHeight`, which is the DTM ground,
    because no water tile exists.
  - Banks were 1 m quads below the draped water.
- **Buildings:** lowest rendered ground under the footprint (unchanged).
- **Depth precision:** layer ranks (Step 2) order coplanar ground layers. No z-fighting cause was found
  among the six defects; the "overlapping surfaces" at Hamnbron were real height differences.

### 3. Corrections implemented

**3.1 Water at measured levels.**
`scripts/prepare-water-reaches.py` (pass 1, 25 s) and `scripts/prepare-water-reaches.mjs` (pass 2, 2 s)
produce `src/lib/data/water-reaches.json` (306 KB). The client reads it in `waterReaches.ts`.

- **Reach extent:** flat regions of the native 1 m DTM inside the OSM water mask, on a 2 m grid. A region
  has neighbouring cells within 3 cm and at least 400 m². Lantmäteriet's DTM is hydro-flattened over
  water.
- **Reach level:** median LiDAR class 9 return when at least 25 cells exist (55 reaches); otherwise the
  flattened DTM level, flagged `dtm-hydroflattened` (16 reaches, all small).
  The DTM level and class 9 agree within 0.02–0.13 m wherever both exist.
- **Sea and tidal river:** 15 flat regions below 1 m in the sea polygon are drawn at **+0.14 m** (SMHI
  2021–2025 mean, your decision). The scan-day level (0.21–0.50 m; two flight days) is recorded per reach.
- **Cutting the polygons:**
  - Each OSM polygon is cut exactly with `polygon-clipping`. The OSM shoreline is kept; reach boundaries
    inside the river are simplified (3 m).
  - A water cell never joins a reach more than 0.3 m above its own DTM surface, so falls step at their
    crest.
  - Sloping water that fits no reach (side channels, cascades) is `draped`: it follows the terrain as
    before.
  - Dry banks inside OSM polygons (DTM more than 0.5 m above the level, at least 4 m wide and 50 m²,
    touching the outline) are drawn as land, so the shoreline there is where the DTM meets the water.
  - 87 narrow or sloping polygons without a flat DTM surface stay draped, flagged `unmeasured`.
- **Faces:**
  - Shoreline edges get a vertical bank/quay face from 1 m below the water up to the ground, or up to
    the water where the land is lower, so there are no gaps.
  - Fall edges get a fall face.
- Motala ström reaches, centres:

| Reach | Level m RH2000 | Source | Class 9 p10–p90 | Centre E, N |
|---|---|---|---|---|
| r9 | 21.99 | class 9 (313 k cells) | 21.95–22.03 | 562 419, 6 496 379 |
| r19 | 21.97 | class 9 | 21.87–22.03 | 563 930, 6 494 986 |
| r17 | 19.13 | class 9 | 18.94–19.42 (sloping) | 566 535, 6 495 148 |
| r32 | 18.66 | class 9 | 18.64–18.69 | 568 079, 6 494 781 |
| r28 | 15.69 | class 9 | 15.66–15.73 | 568 263, 6 494 885 |
| r27 | 12.12 | class 9 | 12.10–13.32 | 568 549, 6 494 928 |
| r30 | 3.94 | class 9 | 3.67–4.78 | 568 829, 6 494 864 |
| r16 (river below the falls) | 0.14 (scan day 0.50) | SMHI mean | 0.47–1.79 | 569 617, 6 495 544 |

**Uncertainty:**
- Levels are a 2020 scan-day snapshot; regulated reaches vary with discharge, and no gauge data exists
  for the river reaches.
- r17 slopes about 0.5 m within the reach (rapids) and is drawn flat at its median.
- The falls between r30 and r16 are steep cascades and are partly drawn as draped water.

**3.2 Network profile rules v4** (`scripts/prepare-bridge-profiles.py`; client `terrain.ts`, `mapModel.ts`,
`cityMesh.ts`; backend `TerrainService.kt`).

- **Deck ends:** on the highest rendered ground within 10 m outward along the bridge axis, without the
  layer lift. This anchor was chosen by testing against LiDAR class 17 on the generic decks of the central
  tiles:

| Anchor | Mean | RMSE |
|---|---|---|
| Old profile | +0.66 m | 3.18 m |
| Ground at the end node | −1.14 m | 1.63 m |
| Highest ground within 5 m | −0.44 m | 0.77 m |
| **Highest ground within 10 m (chosen)** | −0.30 m | 0.61 m |

  The DTM at an OSM bridge end often already lies on the slope into the removed-bridge gap.
- **Interior nodes:** linear between the ends. Pedestrian bridge networks are solved between their land
  connections, as before.
- **Constraints** (308 nodes raised, at most 5.6 m):
  - never below the rendered ground;
  - at least 0.5 m above measured water;
  - generic bridges only: clearance over crossed at-grade ways (road 4.5 m, service 3.0 m, rail 5.5 m,
    tram 5.0 m, path 2.5 m; normal Swedish values, **not surveyed**).
  - Detailed bridges are lifted as a whole, so all lanes keep one profile. They get no crossing
    clearance: against LiDAR class 17 that clearance lifted Saltängsbron 1.5 m too high, because the
    quay paths drawn beneath its ends pass beside it.
- **Approaches:** a segment with one profiled end follows the terrain, with the end offsets tapered along
  it. This is identical in the backend, so vehicles stay on the drawn surface.

**3.3 Engineered spans** (`bridge-profiles.json` `spans`, keyed by a segment's end nodes; 83 spans on 165
segments).

- **Where:** an at-grade road, rail, tram or path crossing an OSM tunnel or stream. Tunnel ways are
  extended 15 m, because OSM underpasses often stop short of parallel tracks.
- **Geometry:** the way's own profile is replaced by its upper hull, using the narrowest window
  (15–40 m) whose rims lie inside it.
- **Acceptance:** the dip must be at least 0.5 m deep and at most 80 m long.
- **Trench rule (roads and rails only):** a dip with the DTM signature of a removed bridge (2 m deep or
  more, 30 m wide or less, walls of 20 % or more) also qualifies.
- **Rejected:** spans containing a junction with another way (3 rejected; a shared node means the same
  level).
- **Rendering:** span sides get fascia beams, never piers.
- **Vehicles:** cars, trams and trains use the same spans (`profileHeight`). Rail routes keep their
  +0.018 offset on spans.
- **Coverage:** E4/motorway underpasses, Söderleden, Linköpingsvägen, Södra stambanan, Bravikenvägen
  (culvert, 4.6 m), the Ståthögavägen service road and others. `spanInfo` lists way, crossed ways, rims,
  length and depth for each span.

**3.4 Railway bridges (targeted only).** Generic piers are now:
- none on a bridge way of 30 m or less (a single span between abutments);
- otherwise about every 20 m instead of every 9 m;
- never on another way's corridor.

Overlapping parallel rail decks are not changed (Step 4).

**3.5 Diagnostics and dev overlay.**

- `src/lib/infraDiagnostics.ts` checks:
  - running surfaces below terrain (centre and edges);
  - junction steps;
  - steep grades, grade breaks and sags (sags under a bridge excluded);
  - deck clearance over water;
  - land below water at shorelines;
  - buildings in water;
  - missing DTM samples and duplicate bridge ownership.
- `scripts/geo/infra-diagnose.test.ts` writes a map-wide JSON report in 4.5 s.
- Dev server `?inspect=infra` shows pins coloured by defect kind, a console table and
  `globalThis.__infraIssues` with SWEREF coordinates.
  - It runs in about 3.4 s after the map is ready.
  - It is loaded by dynamic import behind `import.meta.env.DEV`; the production bundle contains none of it
    (verified).

### 4. Numerical validation (before = pre-Step-3.5 tree, after = this step; identical diagnostics code)

**Map-wide, `infraDiagnostics.ts`:**

| Check | Before | After |
|---|---|---|
| Deck/approach/span pieces below terrain > 5 cm | **523**, worst 5.27 m | **105**, worst 1.25 m (deck edges at quay walls; road/rail worst < 0.6 m) |
| Decks < 0.5 m above the drawn water | **75**, worst 1.68 m *below* | **0** |
| Drawn river/lake water vs measured level (24 911 samples, 10 m) | RMSE 0.20 m, max 6.87 m, 7.9 % > 0.25 m | 0 (flat at the level) |
| Sea vs scan-day level | −0.03 m | −0.28 m (by decision: 2021–2025 mean) |
| Sags > 1.5 m within ±25 m, per way, not under bridges | 134, worst 6.0 m | 73 (road/rail/tram 17, worst 3.15 m; the rest footpaths) |
| Junction steps > 5 cm | 6, worst 7.54 m | 5, worst 3.31 m (all the documented lifted-land-bridge nodes, Step 4) |
| Rail grade p99 / max (10 m windows) | 7.2 % / 43 % | 4.7 % / 35 % |
| Road grade p99 / max | 9.9 % / 65 % | 9.2 % / 52 % |
| Buildings with > 10 % of footprint in water | 3 | 1 |
| Shoreline vertices with land > 0.25 m below the water | 0 (water was the ground) | 181 (p01 −0.45 m; dam crests and harbour piers) |
| Dry banks inside OSM water polygons | n/a (draped) | 15.1 km → 8.7 km of 146.8 km shoreline (narrow strips kept as quay faces) |

**Bridge decks vs LiDAR class 17** (rendered surface, `scripts/geo/measure-elevation.test.ts`, mean / RMSE):

| Bridge | Before | After |
|---|---|---|
| Saltängsbron | −1.10 / 1.13 | −0.30 / 0.33 |
| Bergsbron | −0.09 / 1.00 | +0.23 / 0.30 |
| Hamnbron | −0.39 / 0.42 | −0.15 / 0.20 |
| Laxholmsbron | −0.68 / 0.70 | −0.18 / 0.20 |
| Gamlebro | −0.34 / 0.95 | −0.24 / 0.93 |
| Spången | −0.05 / 0.09 | +0.01 / 0.07 |
| Generic bridges, central tiles (n = 1 597) | −1.32 / 3.58, median \|e\| 2.58 m | −1.15 / 2.53, median \|e\| 0.23 m |

**Unchanged (verified):**
- Ordinary roads and paths vs the native DTM: paths RMSE 0.197 m, land cover and buildings identical.
- Cars ride 5 cm above the drawn asphalt at all 219 996 samples.
- 0 height jumps at 73 762 shared network nodes.
- Trains off bridges: Pendeln RMSE 0.30 → 0.20 m.

### 5. Screenshots (identical absolute cameras: `docs/step35/cameras.json`)

- **Folders:** `docs/step35/before/`, `after/`, and `compare/` (before | after, JPEG).
  - `s1-stathogavagen`, `s2-hamnbron-preset`, `s3-footbridges-east`, `s4-saltangsbron-*`,
    `s5-holmen-*`, `s6-gamlebro-river`: the six screenshot locations.
  - Also the falls (`falls-*`) and the Gamlebro, Laxtrappan, Bergsbron, Campus and Industry presets.
- **Changed pixels per view:** 0.4–14.7 % (`changed-pixels.json`).
- **Pinning:** cameras are pinned through the dev `__cityCamera` hook (`POSES=` in
  `capture-reference-views.mjs`).
- **Overlay:** `work/step35/inspect/` has the overlay at Industrilandskapet and Ståthögavägen.

### 6. Performance (same machine; before and after served side by side)

| | Before | After |
|---|---|---|
| Static triangles | 9 274 904 | **9 076 403 (−2.1 %)** |
| Water triangles | 369 691 | 143 965 |
| Vertex buffers | 1 224 MB | 1 198 MB |
| Geometries (draw groups) | 5 673 | 5 645 |
| Worker build: terrain / network / markings | 1 863 / 2 074 / 437 ms | 1 691 / 2 083 / 482 ms |
| Dev main-thread scene build (median of 3) | 837 ms | 866 ms (+29 ms: pier corridor grid, span lookups) |
| Production: map ready / geometry in scene (median of 3, alternating) | 5 342 / 3 165 ms | 5 026 / 3 273 ms (within run-to-run noise) |
| Production: longest upload frame | 1 036 / 1 156 / 2 030 ms | 1 492 / 1 588 / 1 498 ms (inconclusive; noise > difference) |
| JS heap | 132 MB | 135 MB |
| Settled frame time, uncapped (overview / city / campus / industry / parken / kungsgatan) | 12.9 / 5.4 / 3.5 / 1.8 / 2.3 / 1.6 ms | 13.0 / 5.6 / 3.7 / 2.0 / 2.3 / 1.7 ms |

- **Data:** `water-reaches.json` 306 KB (inlined in the main and worker bundles); `bridge-profiles.json`
  34 → 55 KB.
- **Unchanged:** Web Worker build, SWEREF 99 TM, RH2000 and the adaptive mesh.

### 7. Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | **117 / 117** (14 files; 16 new in `src/lib/infrastructure.test.ts`; `elevation.test.ts` adapted: ordinary = no profiled end and no span) |
| `npm run build` | OK; the overlay is absent from `dist` |
| Backend `dev.ps1 test` | **40 / 40** (3 new in `NetworkProfileTest.kt`: Kotlin reproduces 1 644 client network heights for spans, approaches, decks, ordinary edges and rail routes) |
| `npx playwright test` | 2 / 2 against the backend on :8080 with the new revision (started for the test, stopped afterwards) |
| `infrastructure.test.ts` covers | ground-level road/terrain intersection, junction continuity, gradient discontinuities and sags, spans never across junctions, vehicles on decks/approaches/spans, water levels vs class 9, polygon tiling without gaps or overlaps, flat drawn water, bridge/water clearance, shoreline consistency, building/water conflicts, duplicate bridge ownership, the linear-deck contract, the shared client/backend fixture |

Note: on this machine vitest only runs from a path starting `C:\` (PowerShell). From the lowercase `c:\`
working directory every file fails with "Cannot read properties of undefined (reading 'config')": the
module is loaded twice because of the drive-letter case.

### 8. Files

**UI, modified:**
- `src/lib/terrain.ts`: `spans`, `linearBetween`, `profileHeight` rules v4.
- `src/lib/mapModel.ts`: linear flag, spans.
- `src/lib/cityMesh.ts`: flat water, banks, falls, dry banks, `networkPieces`, span-aware strips, fans
  and markings.
- `src/lib/cityBridges.ts`: span fascias, pier policy.
- `src/lib/Scene.svelte`: dev overlay hook.
- `src/lib/elevation.test.ts`.
- `scripts/prepare-bridge-profiles.py`: rewritten, rules v4.
- `scripts/geo/rtin.py`: `SURFACE_RULES` v4.
- `scripts/capture-reference-views.mjs`: `POSES=`.
- `ELEVATION.md`.
- Data: `bridge-profiles.json`, `terrain.json` (revision only), `buildings-3d.json` (revision).

**UI, new:**
- `src/lib/waterReaches.ts`, `src/lib/infraDiagnostics.ts`, `src/lib/inspectInfra.ts`,
  `src/lib/infrastructure.test.ts`
- `src/lib/data/water-reaches.json`, `src/lib/geo/network-profile-control.json`
- `scripts/prepare-water-reaches.py`, `scripts/prepare-water-reaches.mjs`
- `scripts/geo/infra-diagnose.test.ts`, `infra-profile-control.test.ts`, `vitest.infra.config.ts`,
  `water_levels_study.py`
- `docs/step35/`

**Backend:**
- `TerrainService.kt` (spans, `linearBetween`, `profileHeight`, lenient profile JSON)
- `resources/bridge-profiles.json`, `resources/terrain.json`
- new `NetworkProfileTest.kt` and `test/resources/network-profile-control.json`

**Reproduce** (geodata Python, see ELEVATION.md):

```
python scripts/prepare-water-reaches.py && node scripts/prepare-water-reaches.mjs
python scripts/prepare-bridge-profiles.py              # client + backend profiles, revision
npx vitest run -c scripts/geo/vitest.infra.config.ts   # diagnostics report + shared fixture
```

**Roll back Step 3.5 only:**
1. Copy back `work/step35/before-snapshot/` (`src/…`, `scripts/…`, `backend-src/…`).
2. Delete the new files listed above.
3. Remove the `ELEVATION.md` section.

`work/step35/before-app/` is a runnable copy of the pre-Step-3.5 app. Remove its `node_modules` junction
with `rmdir` before deleting the folder.

### 9. Remaining issues and assignment

**Step 4 — bridges from LiDAR class 17:**
- Generic decks are still estimates: central tiles median |e| 0.23 m but p95 5.8 m. Examples: rail way
  89746083, whose structure extends beyond the OSM ends; the Spiralen car park ramps, E 569 240 N 6 494 839,
  with grades up to 52 %.
- Gamlebro RMSE 0.93 m.
- Overlapping parallel rail decks at Ståthögavägen.
- The five two-level junction nodes (lifted land bridges meeting ways below).
- Crossing clearances are estimates.
- 105 deck pieces whose edges touch the 5 m terrain slope at quay walls, worst 1.25 m (footbridges in
  Industrilandskapet).

**Step 5 — tram/train alignment:**
- Transit route points on bridges carry the legacy 6 m layer lift and miss the deck profile keys.
- Pendeln and tram vehicles on bridges ride 2.3 m above the drawn rails on average (RMSE 3.8 m; was mean
  0.9 / RMSE 3.9 m).
- Rails remain 0.25 m above the ballast.
- Rail sag of 1.6 m on Södra stambanan near Ståthögavägen (way 177890714).

**Step 6 — water:**
- Regulated levels vary with discharge; scan-day snapshot only.
- r17 is a sloping reach drawn flat.
- 87 unmeasured and 117 draped stream parts still follow the 5 m terrain.
- 181 shoreline vertices where land is lower than the adjacent water: dam crests at r27/r30 (vertical
  faces, physically plausible) and harbour piers (−0.5 to −0.7 m).
- Dry-bank strips narrower than about 4 m are kept as quay faces.
- way/1355629338 stands in the water; verify against an orthophoto.
- No quay-wall breaklines in the terrain: quays remain a 5 m slope behind the vertical face.

**Other:**
- Remaining road sags:
  - Linköpingsvägen 3.15 m, E 566 441 N 6 494 195. The DTM shows a narrow cutting with a path tunnel
    beside the road. The 15 m tunnel extension did not yield an accepted span; the cause is not yet
    confirmed.
  - Folkborgsvägen 2.91 m. A span was rejected because a junction lies inside it.
- The underpass trench itself is still visible beside spanned ways (correct: it is the open cutting).

---

## Status (2026-10-18): Step 3 COMPLETE — waiting for approval

Step 3 (adaptive terrain mesh) is implemented and verified; full report in **`docs/terrain-step3.md`**.
Work has **stopped**. Bridge reconstruction (Step 4) needs explicit approval.

**Open decision:** geometry budget. The active mesh (`bu0.4-0.75`) costs +43 % static triangles and
+367 MB vertex memory. It is the cheapest measured option that does not worsen Industrilandskapet/Campus
or the old 10 m centre. Option A (+13 %) is one command away (report, section 8).

**Result (rendered geometry vs native 1 m DTM):**
- ordinary roads RMSE 0.56 → 0.16 m (max 26.4 → 2.3 m);
- paths 0.67 → 0.20 m; rail ballast 0.78 → 0.18 m;
- buildings vs footprint minimum 0.54 → 0.16 m;
- all native land pixels 1.17 → 0.32 m; Industrilandskapet + Campus 0.233 → 0.166 m.

**Design:**
- RTIN over the existing 5 m DTM nodes (320 m → 5 m), refined against every native pixel with per-class tolerances.
- Conforming: no cracks or T-junctions.
- One split bit per node in `terrain.json` `mesh`, read identically by `surfaceMesh.ts` / `terrain.ts` and `TerrainService.kt`.
- Draped layers take the leaf planes.
- Web Worker architecture unchanged; worker builds are slightly faster.

**Tests:** `npm run check` clean; `npm test` 101/101; build OK; backend 37/37; e2e 2/2 (own backend on :8091).

**Action for the user:** restart the Ktor backend (:8080). Its resources now hold revision `…-surface-32977b9c2915`.

---

## Current status (2026-10-18): Step 2 COMPLETE — waiting for approval

Step 1 (coordinate system) and Step 2 (legacy elevation offsets removed) are implemented and verified.
Work has **stopped**. Bridge reconstruction (Step 4) and full tram/rail elevation correction (Step 5) need
explicit approval, as do Step 3 (terrain mesh / road profiles) and Step 6 (water).

**Action for the user:** restart your Ktor backend (the one running from IntelliJ on :8080). It still serves
the previous terrain revision, so the client shows "Ansluter till Ktor… Starta om backend" until restarted.

### User decisions in force (2026-10-18)
- Canonical CRS SWEREF 99 TM (EPSG:3006); Three.js scene = local frame relative to a fixed SWEREF 99 TM origin.
- No metres-per-degree constants. True north handled separately from the grid.
- Water (later step): coast/harbour default +0.14 m RH2000 (2021–2025 mean, Juten-Djurökvarn, verified from
  SMHI open data); scan-day +0.48 m kept as a historical option; Motala ström never one global level; no
  guessed river levels.
- Do not commit or push without permission. Preserve all uncommitted work.
- Step 2 (approved 2026-10-18): remove legacy offsets from ordinary roads, paths, land cover, buildings and
  ground-level rail; do not force bridge decks / elevated roads onto terrain; preserve bridge geometry and
  measured references for Step 4; no new floating/underground vehicles; no destructive git commands.

---

## Step 2 final report — legacy elevation offsets (2026-10-18)

### 1. Legacy offsets removed and their original purpose

The pre-DTM scene was flat. It separated its layers by height above a ground plane at −0.02 units
(1 unit = 25 m). On the measured DTM those layer gaps became metres of artificial lift.

| Legacy offset | Original purpose | Lift on the DTM | Now |
|---|---|---|---|
| Road level 0.071 + asphalt 0.006 (`terrain-levels.json`, `roadHeight` `max(0.071, y)` + 0.02) | Draw streets above lawns in the flat scene | +2.27 m kerb, +2.43 m asphalt | Asphalt, kerb, paths, ballast and markings on the rendered DTM; `roadHeight` removes 0.097 units from every network height |
| Path 0.007, markings 0.009, ballast −0.008 above the road level | Layering of thin strips | +2.45 / +2.5 / +2.1 m | On the DTM, ordered by depth rank |
| Land-cover levels 0.003–0.04 (`buildTerrain`) | Stack farmland < residential < … < apron | +0.57 to +1.5 m | On the DTM, ordered by depth rank |
| Bank top 0.024 | Visible quay edge above the water plane | +1.1 m | Measured ground at the shoreline |
| Building base `relativeHeight(first vertex, 0.045)` | Building floor above the flat land cover | +1.62 m at the first ring vertex (29.5 % of buildings > 2 m above their lowest ground) | Lowest rendered ground under the footprint (exact for the mesh); OSM / Simple 3D Buildings heights are from the lowest ground contact |
| Tree base 0.025 | Trunks standing on the flat grass | +1.1 m | Trunks start on the ground |
| Hand-made models (platforms 0.077/0.083, station 0.06, terminal 0.065, stadium 0.06, runways 0.08–0.09, pitches 0.075, Grand Hotel 0.075, Holmen 0.025, landmark towers 0) | Built on top of the flat street or lawn | +0.5 to +2.5 m | `placeLegacy`: each model keeps its design height above the surface it was modelled on, now the DTM (or its building's footprint minimum) |

**Deliberately kept (with reasons):**
- *Elevated lifts above the road level:* land-bridge `layer × 0.24` lifts, and rail rises at underpasses. These are elevated infrastructure, reserved for Step 4.
- *Shape of the estimated bridge deck profiles:* `bridge-profiles.json` is unchanged. The profiles were anchored at "approach ground + legacy road level", so the same 0.097 network drop applies to them, and every bridge still meets its approach road with no step.
  - Keeping decks at their old height instead would have added 15 % median extra grade to 443 approach segments, 39 % of them over 20 % (59 of those segments are tram or rail).
- *Rail top +0.016 above the network reference:* rails stay 0.25 m above the street, as before relative to the asphalt. Vehicles ride 0.002 above the rail top (route data and backend logic unchanged; Step 5).
- *Water surfaces:* unchanged (Step 6).
- *Camera presets:* unchanged, so before and after screenshots use identical camera positions.

**Ordering without metres.**
- Coplanar ground layers carry a depth rank: per vertex in `uv.x` for the worker-built city layers (one shader variant, `groundLayers.ts`), and through GL polygon offset for hand-made pavements and pitches (no extra shader programs).
- The camera near plane now scales with the camera's height above the terrain (2 %, minimum 0.015, maximum 10). The overview depth step drops from about 16 m to a few cm.
- Ground-level pavements and playing surfaces (runway, taxiways, pitches, ice rink) are built on the terrain grid itself (`groundRectangle`). Junction fans and markings are draped exactly.

### 2. Files changed

**UI, modified**
- `src/lib/terrain.ts`: `LEGACY_LEVELS`, `ROAD_SURFACE`, `placeLegacy`, `footprintGround`, `measured`; DTM `roadHeight` drop.
- `src/lib/cityMesh.ts`:
  - ranks, `surfaceAt`, exact junction and marking draping, `buildingBase`;
  - markings moved to the buildings worker task to keep the startup critical path;
  - `LAYER_BUILDERS`.
- `src/lib/mapView.ts`: layered materials, trees.
- `src/lib/FreeCamera.svelte`: dynamic near plane; floor kept 2.6 m above the street.
- `src/lib/placeBuilder.ts`: `standsOn` / `base`, `drape`, `groundRectangle`, ranked surfaces.
- `src/lib/cityPlaces.ts`: station and terminal on their footprints; pitches, rink and platforms draped.
- `src/lib/riverfrontDetails.ts`: Grand Hotel and Holmen on their footprints.
- `src/lib/mapLandmarks.ts`: per-object supports; airport pavements on the terrain grid.
- `src/lib/cityBridges.ts`: deck fallback uses `roadHeight`.
- `src/lib/cityStructures.test.ts`: Ingelsta rail assertion now checks the measured cut floor.
- `ELEVATION.md`: new "Höjdlager på DTM" section.
- `scripts/prepare-dtm.py`, `scripts/prepare-bridge-profiles.py`: `SURFACE_RULES = 'surface-grid-10-40-v2-dtm-layers'` (revision salt), plus docstring.
- `scripts/capture-reference-views.mjs`: `HIDE_BANNER` option.

**UI, new**
- `src/lib/groundLayers.ts`
- `src/lib/elevation.test.ts` (7 tests)
- `src/lib/geo/elevation-control.json`: 3 300 network, 2 000 land-cover and 600 building native-DTM fixtures.
- `scripts/geo/elevation_samples.py`, `scripts/geo/deck_points.py`, `scripts/geo/measure-elevation.test.ts`, `scripts/geo/vitest.measure.config.ts`
- `docs/elevation-step2/`: screenshots and performance JSON, 34 MB.

**Data**
- Terrain revision `lm-dtm-8eccbc3691700b78-surface-b8b8bb215874` → `…-surface-a26967db6d14`, updated in `src/lib/data/terrain.json`, `src/lib/data/buildings-3d.json` and the backend `terrain.json`.
- No geometry or height values in any data file changed. `bridge-profiles.json` is untouched.

**Backend**
- `TerrainService.kt`: `LEGACY_*` constants, `placeLegacy`, DTM `roadHeight` drop.
- `RegionalFlight.kt`: aircraft ground positions relative to the runway pavement.
- New `ElevationLayersTest.kt` (4 tests).

### 3. Measured elevation errors, before → after (metres)

Rendered geometry, sampled with vertical rays through the real worker meshes, against the native Lantmäteriet 1 m DTM (bilinear). "Ordinary" means more than 25 m from any bridge, tunnel or lifted segment.

| Surface | n | Mean | RMSE | p95 abs |
|---|---|---|---|---|
| Road (asphalt) | 243 798 | +2.458 → **+0.008** | 2.522 → **0.562** | 3.21 → 1.09 |
| Path | 161 901 | +2.466 → **+0.017** | 2.554 → **0.666** | 3.45 → 1.39 |
| Rail ballast | 18 170 | +1.922 → **−0.161** | 2.071 → **0.784** | 2.85 → 1.76 |
| Rail top | 18 558 | +2.492 → +0.077 | 2.608 → 0.767 | 3.42 → 1.70 |
| Tram street surface | 4 950 | +2.434 → **+0.014** | 2.438 → **0.135** | 2.63 → 0.28 |
| Tram rail top | 10 515 | +2.680 → +0.255 | 2.694 → 0.380 | 3.01 → 0.61 |
| Farmland / residential / industrial | ~2–4 k each | +0.62 / +0.54 / +0.69 → +0.04 / −0.10 / +0.02 | 0.66 / 0.89 / 0.95 → 0.24 / 0.72 / 0.65 | |
| Grass / wood / pitch / apron / square | ~1–4 k each | +1.01 / +0.92 / +1.47 / +1.48 / +0.86 → −0.02 / −0.15 / +0.09 / −0.02 / +0.01 | 1.16 / 1.54 / 1.53 / 1.49 / 0.88 → 0.57 / 1.24 / 0.44 / 0.11 / 0.16 | |
| Building wall bottom vs lowest DTM in footprint | 12 490 | +1.966 → **−0.047** | 2.129 → **0.543** | 3.26 → 1.08 |

- **Buildings more than 1 m / 2 m above their lowest ground:** 96.7 % / 32.3 % → **2.4 % / 0.1 %**.
- **What the remaining RMSE is:** after the change, the rendered surface on ordinary roads differs from the native DTM by RMSE 0.563 m (roads) and 0.668 m (paths). These equal the road and path rows above, so all remaining error is the 10 m / 40 m terrain mesh (Step 3). The bias is gone.
- **Continuity:** 0 height jumps at shared nodes (36 420 road, 32 589 path, 2 570 rail and 2 183 tram nodes). Six OSM nodes join a lifted land bridge to a path or road below; these are two-level crossings, unchanged.
- **Vehicles, unchanged:**
  - cars +0.050 m above the drawn asphalt (219 996 samples);
  - off bridges, tram line 2 +0.05 m, tram line 3 +0.06 m, Pendeln +0.02 m mean above the rail top.
  - On bridges the existing mismatch is unchanged (Step 5).

**Bridge decks vs LiDAR class 17** (highest drawn network surface; the profiles are still estimated linear decks):

| Bridge | n | Mean | RMSE | Max abs |
|---|---|---|---|---|
| Hamnbron | 521 | +2.00 → −0.39 | 2.01 → **0.43** | 2.45 → 2.11 |
| Saltängsbron | 434 | +1.30 → −1.10 | 1.33 → **1.13** | 2.15 → 1.40 |
| Bergsbron | 302 | +2.33 → −0.09 | 2.53 → **1.00** | 2.99 → **4.97** |
| Gamlebro | 62 | +2.02 → −0.38 | 2.27 → **1.12** | 3.40 → **5.85** |
| Laxholmsbron | 42 | +1.71 → −0.68 | 1.72 → **0.70** | 2.20 → 0.87 |
| Spången | 18 | +2.40 → −0.05 | 2.40 → **0.09** | 2.55 → 0.14 |
| Other (generic bridges) | 1 597 | +1.33 → −1.04 | 3.44 → 3.35 | 9.01 → 7.42 |

RMSE improved on every measured bridge. The maximum error grew at Bergsbron's west end and at one end of Gamlebro. There the straight-line estimated approach profile was already 2.5 m below the real deck and is now 4.9–5.9 m below it; Step 4 replaces these profiles with LiDAR.

### 4. Remaining known errors

1. **Terrain mesh (Step 3).**
   - Rendered vs native DTM: RMSE 0.56 m on roads and 0.67 m on paths. Rail corridors are 0.16 m too low on average, because embankments are flattened.
   - Worst single point: 26 m (a steep face in the 40 m zone). It was 23.9 m before, because the old +2.4 m lift partly hid it.
2. **Bridge decks are still estimated linear profiles (Step 4).**
   - Saltängsbron is −1.1 m (the crown is missing). Bergsbron's west end and Gamlebro are up to −5 to −6 m.
   - Bergsbron's fixed arch model now springs 1.7 m under the water: the model is 7 m deep, while the real deck is about 5 m above the water.
   - Land-bridge layer lifts (+6 m) and their steep approach ramps remain.
3. **Laxtrappan footbridges.**
   - Their shifted decks (2.0–3.5 m) sit 0.8–2.4 m above the LiDAR class 9 water (0.7–1.2 m) but below the drawn "water". That surface is the 10 m terrain mesh smoothed across a narrow channel (Step 3/6).
4. **Rails and trams (Step 5).**
   - Rails sit 0.25 m above the street or ballast, where reality is about 0 m for grooved tram rails and about 0.17 m on ballast. Vehicles are 5 cm above the rails.
   - On bridges, vehicles still ignore the deck profile: tram line 2 RMSE 2.7 m, Pendeln 3.2 m.
5. **Flat hand-made models.** Platforms, the stadium and buildings are rigid. On slopes their sides may meet the terrain a few dm differently. Platforms and pitches are draped.
6. **Tunnels.** OSM tunnel and underpass roads now lie on the DTM like ordinary roads. The +1.97 m mean of the road-tunnel samples comes from the vertical rays hitting the rail deck above the underpass, not from the road itself. Long tunnels under hills would be drawn on the surface; none were examined in Step 2.
7. **Overview depth bias.** Depth ranks scale with distance. At the overview, a 15-rank stack corresponds to under 1 m.
8. **Water.** Unchanged (Step 6). River water is draped on the mesh as sloped facets, as before.

### 5. Screenshots

- `docs/elevation-step2/before/views` and `after/views`: 24 fixed presets, identical cameras, no backend, banner hidden.
- `docs/elevation-step2/compare`: before | after | 4× difference.
- Industrilandskapet: `industry.png`. Campus: `campus.png`.
- `docs/elevation-step2/after/traffic`: following a car, bus, tram and train on the new backend.
- Captures were checked by eye. Two problems the screenshots revealed were fixed before this report: the airport runway and taxiways cut by the terrain, and pitches showing land-cover patches.

### 6. Test results

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | 82 / 82, 13 files (7 new in `elevation.test.ts`; 1 existing assertion updated) |
| `npm run build` | OK |
| Backend `dev.ps1 test` | 35 / 35 (4 new) |
| `npx playwright test` (own backend instance on :8091 with the new revision) | 2 / 2 |

### 7. Performance impact

Same machine, alternating before and after runs. The before code was served from a snapshot.

| Metric | Before | After |
|---|---|---|
| Dev map ready (median of 5) | 1 829 ms | 1 925 ms (+5 %) |
| Production ready (median of 5) | 3 929 ms | 4 149 ms (+5.6 %) |
| Main-thread scene build | 739 ms | 819 ms |
| Triangles (city view) | 4.86 M | 5.09 M (+4.6 %) |
| Draw calls | 3 390 | 3 473 |
| JS heap (production) | 115.3 MB | 116.0 MB |
| Settled frame time (120 frames) | | unchanged in all six views: city about 6.1 ms, overview about 11 ms |
| Worker build, network task | 1.80 s | 2.25 s |

- **Why the network task is slower:** exact draping of junction fans and markings.
- **Recovered:** markings moved to the buildings worker, so terrain (about 2.1 s) and network are now level. Pavement ordering uses polygon offset, so no extra shader programs compile; shader compile time is 1 271 → 1 296 ms.
- **Not taken:** a 1 cm fan tolerance would save 140 k triangles but let land cover show through junctions at close range.
- **Preserved:** Web Worker build, transfer, chunking, binary DTM and data sharing are unchanged.

### 8. Validation and rollback

- **Validate:**
  - `npm run check`, `npm test`, `npm run build`
  - backend `.\dev.ps1 test`
  - full measurement: `python scripts/geo/elevation_samples.py`, then `npx vitest run -c scripts/geo/vitest.measure.config.ts` → `work/elevation-step2/measure.json`
- **Roll back Step 2 only:**
  1. Copy the pre-Step-2 versions of exactly the modified files from `work/elevation-step2/before-snapshot/` (UI `src/…`; backend `backend-src/…` → `../norrkoping-simulator-backend/src/…`).
  2. Delete the new files listed in section 2.
  3. Revert `SURFACE_RULES` to `'surface-grid-10-40-v1'` in the two prepare scripts.
  4. Remove the `HIDE_BANNER` line from the capture script.

  Do not use `git checkout`: these files also hold Step 1 and the user's earlier uncommitted work.
- **Untracked folders:** `work/` is not ignored by git (only `work/geodata/` is): `work/elevation-step2` (snapshot 60 MB, samples 32 MB) and `work/coordinate-migration-backup`. Do not `git add` them.

---

## Step 1 final report

### 1. Coordinate errors corrected
| Error (verified in the audit and re-verified) | Before | After |
|---|---|---|
| Hard-coded 58 010 m/° longitude, 111 133 m/° latitude (the latter is the 45° value) | scale −0.253 % E–W, −0.229 % N–S | removed; Gauss–Krüger SWEREF 99 TM |
| Distance scale vs GRS80 geodesics (Lantmäteriet tile-corner pairs) | 0.99616 … 1.00134 | 0.999986 … 1.000020 |
| Landmark distances vs geodesics (36 pairs, test) | worst > 2·10⁻³ | all < 3·10⁻⁵ |
| Position drift from geodesic truth at map edges | up to 25.2 m (mean 12.3 m) | scene ≡ SWEREF 99 TM by definition (series error < 1 mm) |
| E–W scale varying with latitude (equirectangular) | 0.99648 S edge … 0.99918 N edge | conformal; ±1.1·10⁻⁵ over the map |
| DTM sampled through a WGS84 round trip | scene → WGS84 → TM | scene → TM directly (similarity transform) |

Source metadata re-checked: DTM GeoTIFFs and LAZ are EPSG:5845 = SWEREF 99 TM (GRS 80, CM 15°, k0 0.9996,
FE 500 000) + RH2000, 1 m pixels on integer metre grid. Independent reference points:
Lantmäteriet SWEPOS report point G5TA (implementation error 0.54 mm = print rounding), 53 Lantmäteriet STAC tile
corners (3.8 µm), PROJ (4.6 µm). Full report: `docs/coordinate-migration/verify-projection.json`.

**Scene contract (terrain dataset version 2):**
```
x = (E − 569030)  / (25 · 0.9996584126)   east
z = (6494989 − N) / (25 · 0.9996584126)   south      (E, N in SWEREF 99 TM)
```
0.9996584126 = SWEREF 99 TM point scale factor at the origin (verified vs PROJ to 3·10⁻¹¹), so 1 unit = 25
ground metres. Height reduction to the ellipsoid (~8 ppm) is neglected. Grid north = −z; true north is 1.0135°
west of grid north (`gridConvergenceDegrees = −1.0134914515`, `terrain.trueNorth`). Origin = legacy origin
rounded to the metre (58.589809 N, 16.187465 E), so the 10 m fine-mesh zone stays centred on the same place.
RH2000 heights unchanged (vertical scale still metres / 25).

### 2. Files and datasets modified
UI repository (`norrkoping-simulator-ui`):
- New: `src/lib/geo/sweref99tm.js` (projection + scene contract), `src/lib/geo/reference-points.json`
  (independent fixtures), `src/lib/coordinateSystem.test.ts` (18 tests), `scripts/geo/` (`sweref99tm.py`,
  `verify_projection.py`, `legacy-frame.mjs`, `migrate-to-sweref.mjs`, `compare_views.py`),
  `scripts/capture-reference-views.mjs`, `docs/coordinate-migration/` (before/after screenshots, composites,
  benchmarks, audits), this file.
- Code: `src/lib/terrain.ts` (GeoReference v2, project/unproject/fromSweref/toSweref/trueNorth),
  `src/lib/mapModel.ts` (camera presets migrated; overview cameras oriented to true north),
  `src/lib/mapLandmarks.ts` (police tower/solar panels), `src/lib/cityMesh.ts` (airport + bank-colour boxes),
  `src/lib/ingelstaTerrain.js` (trench axis), `src/lib/city.ts` (legacy hubs).
- Tests updated: `src/lib/mapModel.test.ts`, `src/lib/bridgeOwnership.test.ts` (legacy coordinates).
- Tools: `scripts/import-norrkoping.mjs`, `scripts/import-city-bridges.mjs`, `scripts/import-city-places.mjs`,
  `scripts/prepare-dtm.py` (+ `--keep-bridge-profiles`), `scripts/prepare-lidar-terrain.py`,
  `scripts/audit/common.py`, `scripts/audit/a5_positions.py`.
- Data (`src/lib/data/`): `norrkoping-map.json`, `transport-network.json`, `bridge-profiles.json` (keys only),
  `city-bridges.json`, `city-places.json` (regenerated from OSM source), `terrain.json` (regenerated from native
  DTM), `buildings-3d.json` (revision), `training-pitch.json`, `ingelsta-bridge.json`.
- Docs: `README.md` (Koordinatsystem), `ELEVATION.md`, `DATA-LICENSE.md`.
- Generated staging: `work/geodata/lantmateriet/dtm/prepared/*` (git-ignored).

Backend repository (`norrkoping-simulator-backend`):
- New: `Sweref99Tm.kt`, `Sweref99TmTest.kt` (3 tests).
- Modified: `TerrainService.kt` (GeoReference v2, SWEREF projection), `CityMap.kt` (places/hubs migrated),
  `TerrainServiceTest.kt`, `CityMapTest.kt`, resources `terrain.json`, `transport-network.json`,
  `bridge-profiles.json`.

Pre-existing uncommitted work in both repositories was preserved (only `terrain.ts` and `mapModel.ts`, which
already had uncommitted edits, were edited further).

### 3. Numerical accuracy before / after
| Check | Before | After |
|---|---|---|
| Projection vs Lantmäteriet G5TA / STAC corners | (equirectangular, not comparable) | 0.54 mm / 3.8 µm |
| Distance scale vs geodesic | 0.9962 – 1.0013 | 0.999986 – 1.000020 |
| Migrated OSM tram nodes vs direct projection of 1 904 OSM nodes | — | mean 1.3 cm, max 3.2 cm (double 0.001-unit rounding; original import alone max 1.8 cm) |
| OSM building vertices vs direct projection | — | < 5 cm (test) |
| Terrain grid vs native 1 m DTM at 400 SWEREF control points | — | RMSE < 0.15 m, bias < 0.03 m; a 10 m shift triples RMSE (registration test) |
| 5 m grid vs native DTM (land, whole map) | RMSE 0.10 m | RMSE 0.09 m |
| Rendered terrain vs native (whole / fine / test area) | 0.70 / 0.19 / 0.23 m | 0.70 / 0.19 / 0.23 m |
| Rendered water vs LiDAR class 9 | RMSE 0.20 m | RMSE 0.22 m |
| Camera preset targets vs their legacy geographic targets | — | < 0.3 m (stored to 0.01 unit) |
| Ingelsta trench ring vs migrated ground hole | — | < 0.1 m |
| Topology: route points on track nodes (tram-2/tram-3/pendeln) | 1075/838/620 | 1075/838/620 |
| Topology: detailed bridges' owned segments | 15,30,9,4,1,2,1,1,1 | identical |
| Bridge-profile keys on road endpoints | 810/810 | 810/810 (values unchanged) |
| Signals with changed orientation | — | 0 of 116 |

Elevation logic is untouched (not in scope); metrics confirm it: roads +2.45 → +2.44 m above DTM, bridge decks
vs LiDAR +2.05 → +2.05 m, trams on bridges RMSE 2.56 → 2.62 m.

### 4. Remaining deviations (known, documented)
- Terrain grid covers the axis-aligned box of the now slightly rotated map: 2713 × 2165 cells (+4.1 %);
  terrain asset 30.09 → 31.33 MB.
- The 10 m / 40 m mesh grid is now aligned to SWEREF axes, so mesh nodes fall on different ground points:
  per-point rendered heights change within the existing mesh error (e.g. outer-zone road max error 16.8 → 23.1 m;
  rail segments with > 10 % excess grade 9 → 18; RMSE values unchanged). The fine zone square is rotated 1.01°
  relative to its old geographic footprint (same centre and size).
- Scene axes follow the grid, not true north (by design); convergence 1.0135° at the origin, varying ±0.1° across
  the map. Overview cameras use true north; other hand-placed details keep their migrated absolute orientation.
- Procedural supplemental park trees use a scene-axis grid, so their illustrative positions shifted slightly.
- Legacy procedural drone city (`city.ts`, `norrkoping.ts`, `cityView.ts`, `world.svelte.ts`) is not
  geo-referenced and was not migrated, except the two hub positions shared with the backend.
- WGS84 (OSM) is treated as SWEREF 99 (ETRS89); the ~0.9 m 2026 plate-motion difference is not modelled.
- `docs/coordinate-migration/` is 28 MB of PNG/JSON evidence; drop it before committing if unwanted.
- All audit findings for heights (offsets, bridges, trams, water) remain open by design.

### 5. Test and build results
- `npm run check`: 0 errors, 0 warnings (1 099 files).
- `npm test`: 12 files, **75 / 75** passed (57 existing + 18 new).
- Backend `dev.ps1 test`: **31 / 31** passed (28 existing + 3 new).
- `npm run build`: success.
- `npm run test:e2e` (with Ktor running): **2 / 2** passed; server and client share revision
  `lm-dtm-8eccbc3691700b78-surface-b8b8bb215874`.
- Screenshots, 18 fixed presets (`docs/coordinate-migration/compare/`): 2.1–9.4 % of pixels changed
  (mostly sub-pixel edge shifts); same content at the same geographic place.

### 6. Performance impact
| Metric | Before | After |
|---|---|---|
| Dev: page ready | 3.38–3.85 s | 3.48–4.00 s |
| Dev: map ready (warm) | 1.79–1.80 s | 1.82–1.83 s (+2 %) |
| Dev: worker geometry build (warm) | 714–720 ms | 728–746 ms (+2–4 %) |
| Dev: triangles city / Parken view | 4 891 394 / 1 109 191 | 4 843 742 / 1 096 956 |
| Dev: mean frame | 6.67 ms | 6.07–6.68 ms |
| Prod (vite preview): page ready | 3.75–3.81 s | 3.91–4.04 s (+4–6 %) |
| Prod JS heap | 106–109 MB | 110–117 MB |
Cost comes from the 4 % larger terrain grid. Web Worker architecture and optimisations unchanged.

### 7. Validation and rollback
Validate:
```
npm run check && npm test && npm run build
python scripts/geo/verify_projection.py        # needs numpy, rasterio, pyproj, laspy, scipy
node scripts/geo/migrate-to-sweref.mjs         # must refuse: data already migrated
cd ../norrkoping-simulator-backend; .\dev.ps1 test
# visual: E2E_BASE_URL=http://127.0.0.1:5173/ node scripts/capture-reference-views.mjs out
#         python scripts/geo/compare_views.py docs/coordinate-migration/before/views out out-compare
```
Rollback (data and code; nothing committed):
- Data UI: `git checkout -- src/lib/data/` (these files were clean in git before Step 1) or copy from
  `work/coordinate-migration-backup/ui-data/`; delete `src/lib/geo/`.
- Data backend: `git -C ../norrkoping-simulator-backend checkout -- src/main/resources/`
  (or `work/coordinate-migration-backup/backend-resources/`).
- Code: revert the files in section 2. Careful: `terrain.ts` and `mapModel.ts` also contain the user's earlier
  uncommitted work, so revert only the Step 1 hunks there (see `git diff`).
- DTM staging: `work/coordinate-migration-backup/dtm-prepared-{manifest.json,ground.f32}`.

### Exact next steps (need approval)
1. ~~Step 2 — remove legacy height offsets~~ — done, see the Step 2 report above.
2. Step 3 — terrain mesh / road profiles from the 1 m DTM (the remaining 0.56–0.78 m RMSE on roads/paths/rail).
3. Step 4 — bridge decks from LiDAR class 17, no invented piers, measured water levels at structures.
4. Step 5 — shared rail/vehicle heights keyed by OSM node id; vehicle pitch.
5. Step 6 — water: coast/harbour +0.14 m default, river reaches from measured class 9 levels.

---

## History
- 2026-10-18: Audit delivered (`docs/elevation-audit-2026-10-18.md`, `scripts/audit/`).
- 2026-10-18: Step 1 approved and completed (this report).
- 2026-10-18: Step 2 approved and completed (legacy elevation offsets removed; report above).
- 2026-10-18: Step 3 approved and completed (adaptive terrain mesh; docs/terrain-step3.md). Geometry budget
  awaiting the user's decision.
