# Lighting Phase 0 — production-ready registry, deterministic capacity and sparse spatial index

Implemented 2026-10-24 (Europe/Stockholm) on branch `codex/lighting-phase0` (UI only). **Not committed, pushed or
merged.** No geographic fixture was added. Phase A1 was not started.

**Readiness, in one line:** the renderer side is ready for Phase A1 (see [§16](#16-readiness-for-phase-a1)); the
geographic data side is not — a licensed municipal fixture register, verified illumination and operating state are
still missing.

## 1. Starting state (verified, not assumed)

| | UI | Backend |
|---|---|---|
| After `git fetch origin` | `main` = `origin/main` = `step61b-bus-reachability` = **`bf5f726`**, clean | `main` = `origin/main` = `step61b-bus-reachability` = **`3673568`**, clean |
| Step 6.1b present | yes (`650c071`, `bf5f726`) | yes (`3da6528`, `3673568`) |
| Work branch | `codex/lighting-phase0` created from `main` (`bf5f726`) | none: no backend change was needed |
| `AGENTS.md` | none in either repository | |

Other local state left untouched: the user's own Vite dev server (this checkout, port 5173) and IntelliJ backend
(port 8080). All Phase 0 runs used separate ports: dev 5193, baseline dev 5192, production previews 5190/5191,
an isolated backend copy of `3673568` on 8095 with an E2E dev server on 5194 proxying to it (`.claude/launch.json`).

The paired baseline is an exact `git archive` of `bf5f726` under ignored `work/lighting-phase0/baseline-app/`.

## 2. Baseline implementation (before Phase 0)

- **Data.** `scripts/step6/import-streetlights.mjs` (no randomness) writes `src/lib/data/streetlights.json` (bundled,
  scene units) and `streetlights-provenance.json` (not bundled). Inputs: the pinned OSM lighting snapshot
  `scripts/data/norrkoping-lighting-source.json` (bases 2026-10-21T15:53:24Z / 15:54:26Z) and the map snapshot.
- **105 fixtures: 10 mapped, 95 estimated.** Mapped = OSM `highway=street_lamp` nodes (1 Kungsgatan, 9 Strömparken).
  Estimated = stations along `lit=yes` ways (41 Kungsgatan, 16 Strömparken, 35 Idrottsparken) plus 3 Idrottsparken
  entrance posts. 7 estimates stand on the Bergsbron deck (bridge-profile support), 98 on the rendered ground.
- **IDs** `<pilot>:osm-node-<node>`, `<pilot>:est-way-<way>-<station>`, `<pilot>:est-entrance-<i>`. The station is
  counted per way, so IDs do not depend on way order; the generator's estimate de-duplication ("0.55 × spacing from
  an *earlier* estimate") does. That is a generator property, unchanged here (see §15).
- **Representation.** x/z in scene units (4 decimals = 2.5 mm), grid-aligned with SWEREF 99 TM. Heading in scene
  radians (arm direction (sin h, cos h), x east / z south); null for mapped lamps. Type table gives height, CCT,
  candela, range, profile. Support height is derived at runtime (terrain ground or deck profile + road surface).
- **Render path.** `fixtureLamps` → `ShaderLamp` (emitter at the lens offset) → `packLamps` (RGBA32F, 8 texels/lamp,
  13,440 B) and `buildLightGrid`: a **dense** 36 × 50 rectangle of 25 m cells × 16 slots (**115,200 B**), of which
  279 cells (15.5%) hold lamps; max 8 per cell; overflow counted but not rejected; ties resolved by input order.
- **Materials.** One fixed patch per lit material (`WeakSet`), program key `city-lights-v1`, uniforms copied into
  the shader at compile. **Latent defect:** a material patched by one controller kept that controller's uniforms
  forever; patching it from a new controller was a no-op.
- **Visuals.** 3 pilot groups, 19 `InstancedMesh` (housing per type, lens per CCT, one halo set per pilot); detail
  by distance to the group's *centre* (poles < 50 units, lenses < 140); halo bounds from the 1 × 1 quad only.
- **Lifecycle.** Owned textures/geometry/materials disposed; typed arrays kept on the textures for context restore.
- **Diagnostics.** DEV-only `__cityLighting.describe()` and `__cityPerformance`.

Frozen before any edit: [`src/lib/lighting/testdata/pilot-baseline.json`](../../src/lib/lighting/testdata/pilot-baseline.json)
(every packed lamp row, every non-empty cell's lamp list, every fixture instance matrix and halo colour), written by
`scripts/lighting-phase0/freeze-baseline.test.ts` from the unmodified code.

## 3. Design decisions

| Decision | Chosen | Rejected and why |
|---|---|---|
| Registry storage | In-memory adapter over the existing bundled file ([`registry.ts`](../../src/lib/lighting/registry.ts)); provenance joined at import/test time; inputs pinned by [manifest](measurements/registry-manifest.json) | A second runtime registry file: duplicates data and invites coordinate round trips. Bundling the 68 KB provenance file: not needed at runtime |
| Canonical IDs | Step 6.2 convention (`osm:node/…`, `estimate:step6-pilot-v1:way/…:s<n>`), crosswalk to the pilot ID | Keeping pilot-prefixed IDs: the same OSM node imported citywide later would get a different ID |
| Capacity | Reject the whole set on any cell > 16; full conflict report; previous set retained | Truncation (silent loss), a priority/contribution policy (not approved), more slots (global shader cost) |
| Cells | Unchanged 25 m cells (1 scene unit), boundaries fixed at integer scene coordinates | Any new cell size would change which lamps a point evaluates |
| Pages | 4 × 4 cells (100 m), R32F directory over the non-empty-chunk rectangle, RGBA32F page atlas | 250 m pages: 2.4× the payload in the synthetic city load (§6); shader hash lookup: more ALU, probing |
| Residency | Static: every non-empty page resident | Camera streaming: not needed at pilot (41 KB) or synthetic-city (2.2 MB) scale; async swaps would add risk without benefit now |
| Build | Synchronous on the main thread (2.4 ms pilot) | Worker: no measurable need; nothing to cancel |
| Visual grouping | Keep the 3 pilot groups; detail distance to the nearest point of the group's bounds; halo bounds + 2 units | Per-chunk groups: more draw calls for no Phase 0 benefit |
| Lamp atlas | Wrap into 8-texel column blocks beyond `maxTextureSize` rows | Hard limit at `maxTextureSize` lamps |
| Material rebinding | Replace the binding in every compiled uniforms object of the material | Module-level singleton uniforms (two live controllers would fight); getter indirection (a call per uniform per draw) |

## 4. Registry, schema and adapter

[`registry.ts`](../../src/lib/lighting/registry.ts) defines `RegistryFixture` and keeps the four concepts separate:
existence/placement (`placement`), geometry (`position`, `support`), illumination evidence (`illumination`),
activation (`activation`); runtime representation is derived later (`toPilotFixture`).

| Field group | Pilot content | Status |
|---|---|---|
| `id`, `runtimeId` | canonical ID, Step 6 pilot ID (crosswalk) | — |
| `source` | dataset `osm-lighting-snapshot`, element (`node/…`, `way/…`; null for the 3 entrance posts at runtime, filled from provenance at import), snapshot = OSM base per pilot, licence ODbL-1.0 | — |
| `generator` | `scripts/step6/import-streetlights.mjs`, version `step6-pilot-v1`, seed `null` (no randomness), method, station | — |
| `position` | E/N EPSG:3006 derived from the stored scene x/z (kept for rendering); `heightRh2000M: null`; meaning `fixture-base` | mapped `known` (mapped, not surveyed), estimates `estimated` |
| `support` | `ground` (rendered ground) or `bridge-deck` (deck segment, station) | `derived` |
| `mountingHeightM` | type height above the support | `estimated` |
| `orientation` | `sceneHeadingRad` and `gridAzimuthDeg` (clockwise from grid north; azimuth = atan2(sin h, −cos h)) | estimates `estimated`; mapped `unknown` (null) |
| `photometry` | type, CCT, candela, range, profile | `estimated` |
| `occlusionM` | 16 sectors | `derived` |
| `activation` | `solar-night`, schedule `null` | `estimated` (pilot assumption) |

Coordinate contracts: horizontal EPSG:3006 E/N metres; scene → E/N is the fixed affine reference of
`geo/sweref99tm.js` (`E = 569030 + x·25·0.9996584126`, `N = 6494989 − z·25·0.9996584126`). Rendering uses the stored
scene values, so no fixture moves; tests prove E/N ↔ scene agree to < 1 µm and mapped E/N lie < 5 mm from an
independent lat/lon → TM conversion of the OSM nodes. No RH2000 pole elevation is claimed.

**Validation** (`validateRegistry`, before any allocation): CRS/datum/version; unique canonical and runtime IDs;
canonical ID syntax; role; parent references; source dataset, snapshot and licence; generator script/version;
mapped/estimated consistency of ID prefix, illumination label, method and position status; node ID ↔ element;
explicitly unlit source elements; finite E/N inside the supported map (missing geometry or 0/0 is rejected, never
placed at the origin); E/N ↔ scene consistency; support segment; mounting height; fixture type supported by the
renderer; candela, range (≤ 100 m), CCT, profile bounds; a directional street profile without orientation;
azimuth ↔ heading consistency; 16 occlusion sectors within range; activation.

**Duplicates:** duplicate canonical IDs are rejected; nothing is merged by distance (a test keeps two distinct IDs at
one position as two fixtures). No crosswalk to municipal assets exists or was invented.

**Explicit unlit:** the import-level manifest lists the `lit=no` ways of each pilot snapshot and validates that no
fixture derives from them (kungsgatan/stromparken/idrottsparken lists in the manifest).

**Frozen inputs:** [registry-manifest.json](measurements/registry-manifest.json) pins SHA-256 and git blob IDs of the
runtime file, provenance, OSM lighting snapshot, map, terrain, bridge profiles, generator, pilot bounds and projection
code, plus the code of the new modules; it records output hashes (lamp texture, page payload, page directory,
canonical order), counts and the full crosswalk. [pilot-registry.json](evidence/pilot-registry.json) has one compact
provenance line per fixture. The Step 6.2 research datasets were not modified.

## 5. Capacity policy and conflict reports

[`lightIndex.ts`](../../src/lib/lighting/lightIndex.ts): any cell with more than 16 contributing lamps rejects the
build. The report gives, per conflicting cell (all cells counted; first 200 listed): cell and chunk coordinates,
cell centre, capacity, **all raw IDs** (canonical order) and a review-only candidate split
(`candidateRetained` = nearest 16 to the cell centre with canonical-ID tie-break, `candidateDropped` = the rest),
which is **never applied**. Behaviour:

- **Development, tests, CI:** the initial set throws with the report (`describeRejection`); unit tests fail.
- **Production:** the rejection is logged (`console.error`), nothing is uploaded, the previous set stays rendered
  (initial: none), and `describe().streetLighting` reports `status` (`ok` / `rendering-previous` / `rejected`) and
  `lastRejection`. A truncated set is never reported as rendered.

Example (unit test `lightIndex.test.ts`, 17 co-located lamps): `raw` = `lamp-00 … lamp-16`, `candidateDropped` =
`["lamp-16"]` (equidistant → canonical tie-break), `overflowCells` = number of cells with histogram count 17.
A real-scale example from the synthetic city load is in §6.

Step 6.2's `scripts/step62/grid-audit.test.ts` is kept as **historical evidence** against the unchanged dense grid
(moved to `legacyGrid.ts`, header added). The opposite expectations for the runtime index are new tests.

## 6. Sparse index and memory accounting

Cells are the Step 6 cells; a lamp is listed in every cell whose closed square is within its horizontal range (the
same test as before). Pages are 4 × 4-cell chunks aligned to the scene origin (chunk = ⌊cell / 4⌋, also for
negative coordinates). The **page directory** (R32F, one texel per chunk over the bounding rectangle of non-empty
chunks, −1 = empty) is the only structure that scales with the rectangle: 4 B per 100 m chunk, 1/256 of the dense
grid. The **page atlas** (RGBA32F) holds only non-empty pages, laid out in rows within `maxTextureSize`. Lamp data
are stored once. Directory, atlas and lamp atlas dimensions are checked against the renderer's
`capabilities.maxTextureSize` (2048 assumed when unknown) before allocation; non-finite or > 100 m ranges,
coordinates beyond ±250 km and more than 4 M candidate cell entries are rejected before any per-cell allocation.

| Pilot (measured in the browser and in Node) | Before | After |
|---|---:|---:|
| Lamp texture | 8 × 105 RGBA32F, 13,440 B | 8 × 105 RGBA32F, 13,440 B (identical bytes per lamp) |
| Grid / page atlas | 144 × 50 RGBA32F, **115,200 B** | 640 × 4 RGBA32F, **40,960 B** (40 pages) |
| Directory | — | 10 × 13 R32F, **520 B** |
| Street-lighting texture total | 128,640 B | **54,920 B (−57%)** |
| Fixture instance buffers / geometry | 21,420 B / 46,800 B | unchanged |
| Non-empty cells / max occupancy / overflow | 279 / 8 / 0 | 279 / 8 / 0 |
| Build (main thread, dev) | not instrumented | 2.4 ms build, 3.3 ms texture upload submission |

Byte figures are CPU typed-array sizes; GPU texture sizes are the same arithmetic, **not measured VRAM**.

**Synthetic citywide load** ([synthetic-city.json](measurements/synthetic-city.json)) — hypothetical centreline
emitters every pilot spacing along the 1,824 classified `lit=yes` ways of the pinned Step 6.2 snapshot (8,937
emitters). **Not an inventory, never rendered.**

| Page size | Pages | Atlas | Directory | Total index | Node build |
|---|---:|---:|---:|---:|---:|
| 25 m (1 cell) | 18,550 | 1.31 MB | 877 KB | 2.19 MB | 28 ms |
| 50 m | 5,927 | 1.57 MB | 220 KB | 1.79 MB | 23 ms |
| **100 m (chosen)** | 1,992 | 2.10 MB | 56 KB | **2.15 MB** | 19 ms |
| 200 m | 677 | 4.19 MB | 14 KB | 4.21 MB | 19 ms |
| 250 m (Step 6.2 proposal) | 500 | 5.24 MB | 9 KB | 5.24 MB | 15 ms |
| Dense rectangle (before) | — | 14.0 MB | — | 14.0 MB | — |

Plus 1.14 MB of lamp data. 100 m pages keep the directory small for future residency control while staying near the
minimum total. The same load is **rejected**: 4 cells exceed 16 contributors (max 19) in the dense centre, e.g. cell
(−8, −23) at E 568842.6 / N 6495551.3 with 19 emitters from 15 ways. Real fixture spacing is unknown, so this is a
capacity **risk** for Phase A1, not a measured conflict. Shuffled input produced the identical outcome.

**Residency path.** All pages are resident (`describe().streetLighting.index.pages`: allocated = resident). Because
lookups go through the directory, residency control later only needs to rewrite directory entries and atlas pages
(versioned, swapped atomically, retained on failure) without touching shaders or lamp data.

## 7. Shader and material interface changes

`cityLights.ts`, program key `city-lights-v1` → **`city-lights-v2`** (same number of programs):

- New uniforms: `cityPageTex` (R32F page directory), `cityChunkCells` (int), `cityPagesPerRow` (int),
  `cityLampRows` (int, lamp atlas column-block height).
- `cityGrid.xy` is now the directory origin (chunk-aligned scene units), `.z` still 1 / cell, `.w` directory columns
  in chunks; `cityGridRows` directory rows in chunks. `cityGridTex` is the page atlas.
- Per night fragment: one extra `texelFetch` (directory) and integer arithmetic, skipped entirely by day
  (`cityLampLevel` branch). Lamp evaluation, distributions, occlusion, bridge clipping, stadium code: unchanged.
- `patchMaterial` rebinds an already patched material to the calling controller's uniforms by replacing entries in
  every compiled uniforms object (three.js reads them by name on each upload): no recompilation, no per-frame cost.
  A compile after context restoration injects the current binding. `describe().reboundMaterials` counts rebinds.

## 8. Determinism and boundary tests

New tests: [`registry.test.ts`](../../src/lib/lighting/registry.test.ts) (34),
[`lightIndex.test.ts`](../../src/lib/lighting/lightIndex.test.ts) (17), [`phase0.test.ts`](../../src/lib/lighting/phase0.test.ts) (18).

- **Parity with the frozen baseline:** all 105 packed lamp rows bit-identical; every one of the 279 non-empty
  cells lists exactly the same lamps; 7,600 receivers (random, exact cell boundaries/corners ± 1e-9) evaluate the
  frozen lamp set; brute-force CPU illuminance over all 105 lamps equals the indexed sum at 3,000 receivers (no lamp
  missed or counted twice; > 50 contributions come from emitters in another page); housing, lens and halo instance
  transforms and halo colours equal the frozen ones.
- **Capacity:** 0, 1, 16 (accepted), 17 (rejected), equidistant rings, 2,000-lamp crowds (all overflowing cells
  counted, report bounded), rejection reports order-independent.
- **Determinism:** shuffled registry (5 seeds) → identical lamp/payload/directory bytes, uniforms and instance
  buffers; pinned output equals the manifest hashes; index arrays identical for 6 shuffles; synthetic citywide
  load identical when reversed.
- **Boundaries:** negative coordinates, chunk corners, cell edges, cross-page influence (95 m lamp), empty chunks,
  chunk sizes 1–10 give identical membership; membership equals the independent legacy dense grid everywhere.
- **Limits:** NaN/∞/huge coordinates, zero/negative/oversized ranges, duplicate/missing IDs, entry budget, ≥ 2²⁴ lamps,
  directory/atlas above `maxTextureSize` rejected; small-limit multi-row atlas resolves every cell; lamp atlas wrap
  addresses exact rows; every payload/directory value is −1 or an exact integer, slots contiguous, pages referenced
  once.

## 9. Visual comparison

`scripts/lighting-phase0/capture.mjs` against DEV servers of the baseline (`bf5f726`) and Phase 0, Edge 156 /
ANGLE D3D11 / RTX 5070 Ti, 1400 × 1000, DPR 1, Europe/Stockholm, 2026-10-21, labels off, API aborted (no traffic).
Nine poses (Kungsgatan street/elevated, Bergsbron north end, Strömparken path/elevated, stadium pitch/elevated,
pilot overview, inner-city overview) × day 12:39, sunset 17:36, twilight 17:52, night 21:30 (stadium OFF) and, for
the stadium and pilot overview, TRAINING and MATCH: **42 images per build**. Comparison
([pixel report](measurements/visual-diff.json), [noise control](measurements/visual-noise.json)) uses no tolerance:

- Baseline vs a second baseline run (noise floor): 12 changed pixels in 1 of 42 images, max 1 level.
- **Baseline vs final Phase 0: 33 of 42 images pixel-identical**; 3 differ by 1–5 pixels at 1 level
  (Bergsbron sunset, Kungsgatan street night, Strömparken path day), within the noise floor. An earlier Phase 0
  capture (before the last Scene change, §10) had 36 identical; the two Phase 0 runs differ from each other by
  6 pixels at 1 level, i.e. the same run-to-run noise.
- The 6 `pilot-overview` images differ in 39–41 pixels each (max 44 levels): single pixels at fixture positions where
  pole housings are now drawn at ≈ 1.25 km because detail distance is measured to the group's nearest bound, not its
  centre (+5 draw calls, +6,208 triangles). Halos, light pools, colours and dark surroundings are unchanged.
- Draw calls/triangles at the Step 6.1 fixed cameras are unchanged (Kungsgatan 1888 / 3,080,884; stadium pitch
  MATCH 2407 / 3,752,301). The inner-city overview gains 3 calls / 118 triangles with no visible pixel change.
- Programs: 20 in every capture, before and after, across all day/night/stadium states.

Evidence (half-resolution before | after | difference ×16): [evidence/visual/](evidence/visual/).

## 10. Lifecycle and context restoration

| Check | Where | Result |
|---|---|---|
| 10 controller creation/disposal cycles | `phase0.test.ts` (Node) | every owned geometry, material and texture (incl. the new directory) disposed each cycle; identical resource count per cycle |
| 10 street-lighting replacements | `phase0.test.ts` | each swap installs a complete new set and disposes the previous one; only the current set is alive |
| Rejected replacement | `phase0.test.ts` | capacity conflict and duplicate ID: previous textures stay bound, `status: rendering-previous`, report exposed; a valid set clears it |
| Invalid initial data | `phase0.test.ts` | throws in development; with `strict: false` logs, renders no street lamps, stadium still configured |
| Shared-material rebinding | `phase0.test.ts` | material patched by controller A, then B: already-compiled uniforms now read B's holders, no `needsUpdate`, same program key; a later compile injects B |
| CPU data for restore | `phase0.test.ts` | lamp/payload/directory textures keep their full typed arrays, no `onUpdate` hook, no mipmaps; eager `initTexture` upload |
| No day/night rebuild | `phase0.test.ts`, E2E | 300 time/floodlight changes: same texture objects and versions, `builds` = 1 |
| **Real scene** | `tests/lighting.spec.ts` (new test) | 10 rebuilds + 10 full controller recreations on the live map at night: geometries/textures/programs flat at 4143/226/20 after every cycle (≤ the start: 4148, the initial precompile also uploaded detail-hidden fixture meshes); 1,227 shared materials rebound; the Kungsgatan frame is **byte-identical** before the cycles, after them and after WebGL context loss/restore ([data](measurements/lifecycle-e2e.json)) |
| Existing context-loss test | `tests/lighting.spec.ts` | passes |
| Program count | captures, E2E | 20 programs in every state, before and after; toggles add none |

**Memory over cycles** ([lifecycle-memory.json](measurements/lifecycle-memory.json)). Post-GC JS heap over 40 cycles:
control (frames only) +0.7 KB/cycle; rebuild +6.8 KB/cycle; recreation +4.9 KB/cycle. Live-object counts
(`Runtime.queryObjects`) of DataTexture, InstancedMesh, BufferGeometry, MeshStandardMaterial and Group stay constant
over 30 rebuilds and 30 recreations. A heap-snapshot diff (rebuild 10 → 40) attributes 93% of the residual growth to
V8 compiled code (`code`), plus one 96-byte native `WebGLProgram` wrapper per rebuild (the halo program is recompiled
because its only material is replaced). This is engine/browser caching, **not** retained lighting state.

**Defect found and fixed during this check.** Recreating the controller first retained one detached `city-lighting`
group per cycle: Threlte's `<T is={…}>` keeps every object ever passed as `is` in its disposal registry until the
component unmounts (retainer path from the heap snapshot). `Scene.svelte` now mounts a stable root group once and
swaps the controller's group inside it; after the fix the group count stays at 35 over 30 recreations. The captures
and the confirmation performance pair were re-run with this final code.

Coverage limits: full-scene recreation is exercised through a DEV hook on the live map (not a page reload); Node
tests cannot compile shaders, so program stability is verified in the browser only; context loss was triggered with
`WEBGL_lose_context`, not a real driver reset.

## 11. Performance

**Setup.** Production builds (`vite build`) served by `vite preview`: baseline `bf5f726` on 5190, Phase 0 on 5191.
`scripts/lighting-phase0/measure.mjs`: Edge 156 with ANGLE/D3D11 on an NVIDIA GeForce RTX 5070 Ti (host CPU and RAM in
the raw files), uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`), 1280 × 900, DPR 1, Europe/Stockholm,
2026-10-21, API aborted (no traffic), a fresh browser per run, run serially, before/after order alternating between
rounds. Each run: map-ready (DOM), then day 12:39 / night 21:30 stadium OFF / night MATCH × five focus views
(Kungsgatan, Strömparken, Idrottsparken pitch, Parken, inner city), 180 rAF intervals each, then post-GC JS heap.
Three series, all retained: series 1 and 2 (3 rounds each, build before the final `Scene.svelte` root-group change)
and a confirmation pair (2 rounds, final build). These are browser frame intervals, **not isolated GPU time**; JS
heap is not total memory or VRAM. Cold boot was not measured (warm OS file cache).

Pooled over all 8 rounds (median across runs of each run's median / p95, ms):

| Condition / view | Before median / p95 | After median / p95 | Δ median / p95 |
|---|---:|---:|---:|
| Day / Kungsgatan | 2.3 / 2.9 | 2.3 / 2.9 | 0 / 0 |
| Day / Strömparken | 5.6 / 6.55 | 5.5 / 6.45 | −0.1 / −0.1 |
| Day / stadium pitch | 6.2 / 7.2 | 6.2 / 7.4 | 0 / +0.2 |
| Day / Parken | 2.2 / 2.75 | 2.2 / 2.7 | 0 / −0.05 |
| Day / inner city | 7.2 / 8.4 | 7.3 / 8.7 | +0.1 / +0.3 |
| Night OFF / Kungsgatan | 2.3 / 2.95 | 2.3 / 2.8 | 0 / −0.15 |
| Night OFF / Strömparken | 5.85 / 6.95 | 5.75 / 6.8 | −0.1 / −0.15 |
| Night OFF / stadium pitch | 6.3 / 7.35 | 6.4 / 7.7 | +0.1 / +0.35 |
| Night OFF / Parken | 2.1 / 2.6 | 2.1 / 2.7 | 0 / +0.1 |
| Night OFF / inner city | 7.3 / 8.6 | 7.35 / 8.5 | +0.05 / −0.1 |
| Night MATCH / Kungsgatan | 2.2 / 2.85 | 2.25 / 2.7 | +0.05 / −0.15 |
| Night MATCH / Strömparken | 5.7 / 6.45 | 5.65 / 6.85 | −0.05 / +0.4 |
| Night MATCH / stadium pitch | 6.55 / 8.1 | 6.5 / 7.3 | −0.05 / −0.8 |
| Night MATCH / Parken | 2.2 / 2.7 | 2.1 / 2.6 | −0.1 / −0.1 |
| Night MATCH / inner city | 7.25 / 8.3 | 7.05 / 8.1 | −0.2 / −0.2 |

| Gate (Phase 0 target) | Series 1 | Series 2 | Confirmation (final) | Pooled | Status |
|---|---:|---:|---:|---:|---|
| Median map-ready Δ ≤ 100 ms | −32.8 | +0.2 | +31.5 | **−8.0** (3928.6 → 3920.6) | pass |
| Paired p95 Δ ≤ 1 ms (max over cells) | +2.2 | +0.4 | +1.2 | **+0.4** | pass pooled; see note |
| Daytime p95 Δ ≤ 0.5 ms | +0.3 | +0.4 | +0.75 | **+0.3** | pass pooled; see note |
| Post-GC heap Δ ≤ 10 MB | +0.36 | +0.36 | +0.37 | **+0.36 MB** | pass |
| No extra programs from toggles | 20 = 20 in every state | | | | pass |
| No night rebuild/upload by day | `builds` = 1, texture versions unchanged | | | | pass |
| Lighting buffers ≤ 16 MB | 54,920 B textures + 68,220 B fixture buffers (estimate) | | | | pass |
| Zero unapproved overflow | 0 cells | | | | pass |
| No unexplained growth over 10 cycles | flat GPU counts; residual heap explained (§10) | | | | pass |

**Note on single-cell p95 excursions.** Individual series exceed the p95 gates in single cells, in both directions:
series 1 inner city night OFF +2.2 ms (not reproduced: −0.5 ms in series 2), confirmation Strömparken night MATCH
+1.2 ms and Strömparken day +0.75 ms. Draw calls and triangles of those views are **identical** before and after
([perf-view-calls.json](measurements/perf-view-calls.json)); the same views also swing negative (stadium MATCH
−0.8 ms pooled). With 2–3 runs per series the per-cell p95 resolution of this method is about ±1 ms; the pooled data
do not show a regression, but sub-millisecond claims are not supported by this sample.

**Geometry/draw calls.** Unchanged at the Step 6.1 fixed cameras and at Strömparken, stadium and Parken focus views.
Night Kungsgatan focus view +1 call / +50 triangles, inner city +3 / +118, pilot overview capture +5 / +6,208 — all
from the corrected detail distance (poles/lenses now shown when a group's nearest fixture is within range).

**Index costs.** Pilot build 2.4 ms and texture upload submission 3.3 ms in the DEV browser (not instrumented
before; the dense grid build was comparable work). Production bundle: App chunk +6.5 KB gzip (registry validation,
index builder, diagnostics); the provenance join, CPU lookup emulation and legacy grid are tree-shaken.

**Hardware not tested:** no integrated, mobile or lower-tier GPU; no other browser or rendering backend. No claim is
made for constrained hardware.

## 12. Tests and baseline failures

| Suite | Result |
|---|---|
| Type check (`svelte-check`) | 0 errors, 0 warnings |
| Production build (`vite build`) | succeeds (existing > 500 kB chunk warning only) |
| Full Vitest (`vitest run`) | **25 files, 279 tests passed**, 22 s; includes the 69 new tests and the 36 pre-existing lighting tests |
| Step 6.2 historical grid audit | 3/3 passed (unchanged expectations, now against `legacyGrid.ts`) |
| Phase 0 harnesses | manifest and synthetic-city passed; freeze-baseline skipped by design (runs only with `FREEZE=1`, refuses to overwrite) |
| Playwright, full (`tests/`) | **6/6 passed**: lighting ×3 (incl. new lifecycle test and existing context-loss test), live Bergsbron bus/truck/car regression, transit, simulation |
| Backend default (`gradlew test`, isolated copy of `3673568`) | 62 tests: 61 passed, 1 opt-in skipped, 0 failures |
| `git diff --check` | clean |

Known baseline issues: `simulation.spec.ts` second-tab metrics timeout and Vitest geometry timeouts under full-suite
load **did not occur** in these runs (isolated servers on 5194/8095; full Vitest 22 s). They were not re-run on a
baseline checkout because nothing failed; this is not evidence that they are fixed. The live Bergsbron test ran
against the isolated `3673568` backend; Step 6.1b routing is unchanged (no backend change).

Problems met while testing, all resolved and not hidden: two new index tests and one bounds test had wrong
expectations (corrected to measured facts, §8 numbers); the first lifecycle plateau assertion compared with a start
count inflated by the initial precompile (now: plateau across cycles, never above the start); my first object-count
probe retained its own query results (fixed with a released object group); the Threlte retention described in §10.

## 13. Files changed (UI repository; backend unchanged)

Modified:
- `src/lib/lighting/cityLights.ts` — sparse lookup and lamp-atlas addressing in the shader, new uniforms,
  `lampLayout`/`packLampData`/`floatTexture`, rebindable material binding, `city-lights-v2`; dense grid moved out.
- `src/lib/lighting/controller.ts` — registry → validation → index pipeline, atomic `replaceStreetLighting`,
  strict/production rejection, eager upload, diagnostics, rebinding counts.
- `src/lib/lighting/fixtures.ts` — `FIXTURE_TYPES`, nearest-bound detail distance, halo cull margin, richer `counts()`.
- `src/lib/Scene.svelte` — stable lighting root group; DEV-only `recreate`, `reloadStreetLighting`, `renderer`, `group`.
- `src/lib/lighting/lighting.test.ts` — imports from `legacyGrid.ts`, program key v2, directory texture tracked.
- `scripts/step62/grid-audit.test.ts` — historical-evidence header, import from `legacyGrid.ts`.
- `tests/lighting.spec.ts` — new real-scene lifecycle/context-restore test.
- `.gitignore` — `/work/lighting-phase0/`.

New:
- `src/lib/lighting/registry.ts`, `lightIndex.ts`, `streetLighting.ts`, `legacyGrid.ts` (unchanged dense grid,
  reference only).
- `src/lib/lighting/registry.test.ts`, `lightIndex.test.ts`, `phase0.test.ts`, `testdata/pilot-baseline.json`.
- `scripts/lighting-phase0/` — `freeze-baseline.test.ts`, `manifest.test.ts`, `synthetic-city.test.ts`,
  `vitest.config.ts`, `capture.mjs`, `diff.py`, `measure.mjs`, `summarize-perf.mjs`, `view-calls.mjs`,
  `heap-probe.mjs`, `object-count.mjs`.
- `docs/lighting-phase0/` — this report, `measurements/`, `evidence/`.
- `.claude/launch.json` (untracked helper for the isolated servers; not required by any script, may be deleted).

Not changed: routing/access policy, RoadAccess, buses, transit data, terrain, road/rail geometry, bridge profiles,
Lantmäteriet data, coordinate contracts, stadium geometry/activation, `streetlights*.json`, Step 6.2 datasets, backend.

## 14. Reproduction (PowerShell, UI checkout)

```powershell
npx svelte-check --tsconfig ./tsconfig.json
npm run build
.\node_modules\.bin\vitest.cmd run                                   # full unit suite
.\node_modules\.bin\vitest.cmd run -c scripts/step62/vitest.config.ts  # historical dense-grid audit
.\node_modules\.bin\vitest.cmd run -c scripts/lighting-phase0/vitest.config.ts  # manifest + synthetic city
# Baseline app snapshot for paired runs (ignored scratch):
New-Item -ItemType Directory -Force work/lighting-phase0/baseline-app
git archive bf5f726 | tar -x -C work/lighting-phase0/baseline-app
cmd /c mklink /J work\lighting-phase0\baseline-app\node_modules node_modules
# Captures: DEV servers (baseline on 5192 from the snapshot, Phase 0 on 5193), then compare:
node scripts/lighting-phase0/capture.mjs work/lighting-phase0/captures/before-a http://127.0.0.1:5192/
node scripts/lighting-phase0/capture.mjs work/lighting-phase0/captures/after http://127.0.0.1:5193/
& 'C:\Users\amarg\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -X utf8 scripts/lighting-phase0/diff.py work/lighting-phase0/captures/before-a work/lighting-phase0/captures/after work/lighting-phase0/diff.json
# Performance: `vite build` in both trees, `vite preview` on 5190 (baseline) and 5191 (Phase 0):
node scripts/lighting-phase0/measure.mjs work/lighting-phase0/perf/run.json 3 5190 5191
node scripts/lighting-phase0/summarize-perf.mjs work/lighting-phase0/perf/run.json
# Lifecycle memory on a Phase 0 DEV server:
node scripts/lighting-phase0/heap-probe.mjs work/lighting-phase0/heap.json http://127.0.0.1:5193/ 40
node scripts/lighting-phase0/object-count.mjs http://127.0.0.1:5193/ recreate 30
# E2E against a DEV server whose /api proxies to a backend (API_TARGET), e.g.:
$env:E2E_BASE_URL='http://127.0.0.1:5194'; npx playwright test
```

Backend tests: `$env:JAVA_HOME="$env:USERPROFILE\.jdks\ms-25.0.4.1"; .\gradlew.bat test --offline` in the backend
checkout (here run on an isolated `git archive` copy). The baseline freeze is a one-time step and is not re-run.

## 15. Remaining limitations

- **No real fixture data added** and none available: the 95 estimates remain estimates; no municipal register,
  crosswalk or licence exists. Mounting heights, photometry, orientation of mapped lamps, RH2000 pole elevations and
  operating schedules remain unknown or estimated as labelled.
- **Capacity policy is reject-only.** The synthetic citywide load produced 4 overflowing cells (max 19); a real
  register may too. Phase A1 needs either data that fit, smaller cells for a dense area, or an owner-approved,
  documented priority policy — none is implemented or approved.
- **Static residency.** All non-empty pages are resident; the directory spans the non-empty-chunk rectangle (56 KB for
  the whole map at 100 m pages). Streaming/residency control is a documented path (§6), not implemented.
- **Single-thread build.** 2.4 ms for 105 lamps; 19 ms (Node) for ~9,000 synthetic emitters. A worker would only be
  needed for much larger sets.
- **Visual grouping stays per pilot area.** A citywide registry needs a grouping key (e.g. page/chunk) for culling and
  detail; `RegistryFixture.group` is the hook. Halo overdraw limits are unchanged.
- **Generator order dependence.** `import-streetlights.mjs` de-duplicates estimates against earlier estimates; a
  future importer should sort inputs canonically. The bundled output is pinned by the manifest.
- **Measurement limits.** One desktop GPU/browser; frame intervals, not GPU timers; ±1 ms per-cell p95 resolution;
  JS heap only; texture bytes are arithmetic, not VRAM; no cold-boot or lower-tier hardware measurement.
- **A rebuild recompiles the halo program** (its only material is replaced); program count stays constant.
  Irrelevant for the static pilot; a residency system should reuse fixture materials across rebuilds.

## 16. Readiness for Phase A1

**Phase 0 is complete and ready for review/acceptance.** The 105 pilot fixtures render with bit-identical lamp data
and identical per-cell lamp sets; provenance and mapped/estimated distinctions are explicit; reordered input is
deterministic; unapproved overflow is rejected and reported; the index allocates pages only where lamps are;
boundaries and offscreen emitters are correct; lifecycle and context restoration are verified; pooled performance
and memory gates pass (with the single-cell noise noted in §11); Step 6.1b routing is untouched.

| Aspect | Status for Phase A1 |
|---|---|
| **Technical readiness (renderer, registry, validation, capacity, sparse index)** | **Ready** to accept a bounded corridor of additional registry records (e.g. Kungsgatan/Bergsbron extension) through `replaceStreetLighting` / the registry adapter, with validation and capacity checks before upload |
| **Availability and licensing of geographic fixture data** | **Not ready.** No municipal fixture register or licence; OSM has 25 lamp nodes in the map and `lit=yes` tags on ways, which only support estimates |
| **Verified illumination and operating state** | **Not ready.** No verified switching groups, schedules or fittings; `solar-night` is a pilot assumption |

Decisions or data Phase A1 still needs:
1. The municipal lighting-point export (EPSG:3006/RH2000, IDs, mount type, heights, fittings, switching groups) and
   an explicit redistribution licence — or an explicit decision to extend with labelled estimates only.
2. A crosswalk rule set for municipal ↔ OSM ↔ estimate identities (no proximity merges).
3. A capacity decision for dense areas, should real data exceed 16 contributors per 25 m cell.
4. A registry ingestion format for new records (the adapter currently reads the Step 6 pilot file) and a grouping key
   for fixture visuals beyond the three pilot areas.
5. A first A1 polygon and its acceptance views/gates (same paired method as here).
