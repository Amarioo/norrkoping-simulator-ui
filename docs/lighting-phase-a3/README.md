# Lighting Phase A3 — the rest of the Kungstorget ring (Norrtull stays unlit)

Implemented 2026-10-24 (Europe/Stockholm) in the UI repository on branch `codex/lighting-phase-a2`,
on top of the committed Phase A2 (`b42dd37`, preceded by `7519862` "docs: add project instructions").
**A3 is not committed, pushed or merged** (a separate A3 commit follows only after approval).
Backend unchanged.

**In one line:** 6 new labelled estimates (8 m brackets) on the seven `lit=yes` ring ways A2 left dark
light the whole Kungstorget ring; the combined 273-fixture set fits the 16-lamp cell capacity (max 15,
unchanged; A3 cells ≤ 8) with no overflow; the 267 earlier fixtures are bit-identical; the A2 seam is
continuous; Norrtull is unchanged by decision; two short ring stretches stay dim under the existing
per-way station rule.

| Report | Content |
|---|---|
| [coverage.md](coverage.md) | zone F boundary (EPSG:3006), how it was derived, the seam with A2, what is lit and what is not |
| [data-provenance.md](data-provenance.md) | sources, snapshot, licence, identity, policy `lighting-a3-v1`, the 6 positions |
| [capacity-report.md](capacity-report.md) | occupancy, cells A3 reaches, headroom, rejection behaviour |
| [visual-validation.md](visual-validation.md) | before/after captures, noise floor, ring illuminance, seams, Norrtull |
| [performance.md](performance.md) | paired production runs vs committed A2, draw calls, bundle, timings |
| [remaining-gaps.md](remaining-gaps.md) | Norrtull decision and what an OSM check would need; dim ring stretches; missing data |
| [data/](data/) | machine-readable registry, coverage, capacity, ring profiles, manifest, visual diff, noise floor |

## 1. Starting state and commits (verified)

| Step | Result |
|---|---|
| Start | branch `codex/lighting-phase-a2`, HEAD `1fe6296` (A1) with the uncommitted A2 work and the untracked `CLAUDE.md`, `.claude/` |
| Commit 1 (approved file list) | `7519862` "docs: add project instructions" — `CLAUDE.md` only |
| Commit 2 (approved file list) | `b42dd37` "Lighting Phase A2 — western Norra Promenaden and northern Kungsgatan" — the 64 files of the A2 README §11 (12 modified, 52 new); `.claude/`, `work/`, `dist/`, `test-results/` excluded |
| A3 | uncommitted on top of `b42dd37` |

Not pushed, not merged. `.claude/` stays untracked; five `a3-*` server entries were **added** to its
`launch.json` (existing entries kept; original backed up in ignored `work/lighting-a3/launch.json.before`).
`/work/lighting-a3/` was added to `.gitignore`. No new dependency, no new OSM download, no network
request for data.

## 2. Zone

One zone **F** (7 130 m², 39 vertices): 8 m outside the ring centreline of the seven remaining ring
ways, closed along zone D's west edge (A2 vertices 4–9, reused exactly). No overlap with A2, A1 or a
pilot (tested); the approach streets are outside except their mouths, where no station falls.
Details: [coverage.md](coverage.md).

![A3 corridor](evidence/corridor-map.png)

## 3. Fixtures

| Zone | 8 m bracket | Mapped | Estimated |
|---|---:|---:|---:|
| F — Kungstorget ring (north, west, south arcs) | **6** | 0 | 6 |
| A2 (unchanged) | | 0 | 35 |
| A1 (unchanged) | | 10 | 117 |
| Pilot (unchanged) | | 10 | 95 |
| **Rendered total** | | **20** | **253** → **273** |

Rule `lit-way-roundabout-outer` for all 6 (outer kerb, no shift, no side fallback); 0 candidates
rejected; the two short ring ways 312486752 (14.5 m) and 684962393 (10.7 m) are below half the 30 m
spacing and get no station (existing rule). The ring ways cover 210.7 m (the A2 README's "≈ 250 m"
was an estimate).

## 4. Import, identity and duplicates

1. **Source:** the pinned Step 6.2 OSM snapshot (base 2026-10-23T09:05:06Z, SHA-256 re-verified),
   clipped to zone F + 60 m into the committed 24 KB extract `scripts/data/lighting-a3-source.json`
   (`extract-source.mjs a3`; the A1 and A2 extracts regenerate byte-identically).
2. **Generator:** the shared `corridorGenerator.ts` with a new spec `A3_SPEC` (additions only). A1 and
   A2 regenerate byte-identically with it (tested). Policy `lighting-a3-v1` = A2's policy; station-slot
   identity also covers A2. Outputs `src/lib/data/streetlights-a3.json` (bundled) and
   `streetlights-a3-provenance.json` (not bundled); byte-identical regeneration and input-order
   independence tested.
3. **IDs:** `estimate:lighting-a3-v1:way/<id>:s<n>`; independent of the earlier rollouts (tested).
4. **Duplicates by identity, never by distance.** The 267 earlier records are inputs only; nothing was
   suppressed by them (nearest earlier lamp 33.7 m away).

## 5. The 267 earlier fixtures are unchanged (proof)

| Check | Result |
|---|---|
| `streetlights.json`, `-a1.json`, `-a1-provenance.json`, `-a2.json`, `-a2-provenance.json` | `git diff` empty against `b42dd37`; SHA-256 asserted in `corridorA3.test.ts` |
| Regeneration of A1 and A2 with the extended generator | byte-identical (A1/A2 write harnesses and main-suite tests) |
| Registry merge | the first 267 records of the 273 set deep-equal the A2 state, in order |
| Lamp texture rows | all 267 bit-identical (105 pilot rows equal the frozen baseline) |
| Light index | every cell of the A2 state keeps all its lamps; the 35 cells that gain lamps gain only A3 lamps |
| Housings | all 267 instance transforms unchanged; pilot visuals equal the frozen baseline |
| A2 test suite | `corridorA2.test.ts` (pinned to the A2 state) 35/35; A2 manifest hashes unchanged |

## 6. Capacity, seams, supports, grouping

- **Capacity:** combined 273 accepted, **max 15 / 16** (A1's square, unchanged), **A3 cells ≤ 8**, 0
  overflow, 561 cells, 72 pages, +3 840 B textures; spacing halved would still fit (A3 cells ≤ 9).
  [capacity-report.md](capacity-report.md)
- **Ring light:** A3 ring centreline median 0.0 → **11.4 lux**; the A2 arc's minimum rises 0.3 → 3.3 lux;
  within ± 20 m of both seam crossings ≥ 3.3 lux. **Two dim stretches remain:** north arc ≈ 15 m below
  3 lux (min 0.5 lux) and west link ≈ 5 m at 2.4–2.9 lux, where short ring ways get no station.
  [visual-validation.md](visual-validation.md)
- **Norrtull:** illuminance on the three untagged pieces identical before/after (tested exactly).
- **Supports:** all 6 on the rendered ground, emitter at the type's lens height; no bridge within
  range; occlusion measured from the emitter (verified independently).
- **Grouping/LOD:** A3 joins chunk group `chunk:-1,-1` (no new group or material); no lamp within the
  detail distance is hidden around the ring and the seam (300 cameras, > 10 000 checks).

## 7. Performance

Deterministic (load-independent): **draw calls unchanged** in all 14 captured views × 3 states;
triangles +12 … +552 per view; **20 programs** everywhere; exposure identical; textures +3 840 B;
App chunk +3.5 KB (+0.7 KB gzip); Node pre-upload pipeline 1.06 → 1.13 ms; post-GC heap +0.017 MB.

The paired frame-time series (3 rounds, production builds A2 `b42dd37` vs A3) was **disturbed**:
another session on the machine ran Vitest workers and Edge browsers throughout (load log: mean 31,
peak 71 CPU-s per 10 s). Map-ready came out 342 ms *faster* and per-round p95 deltas ranged −6.7 …
+10.7 ms — noise, not an effect of 6 lamps. Kept and flagged; **a re-run on an idle machine is
recommended before acceptance**. [performance.md](performance.md)

## 8. Tests

| Suite | Result |
|---|---|
| Type check (`svelte-check`) | 0 errors, 0 warnings (1 158 files) |
| Production build | succeeds (pre-existing > 500 kB chunk warning only); generator code not in the bundle |
| Vitest (`vitest run --no-file-parallelism`) | **28 files, 380 tests passed** (342 earlier + 38 new in `corridorA3.test.ts`); corridor suites re-run after formatting: A1 28 + A2 35 + A3 38 = 101 passed |
| A3 harnesses (`scripts/lighting-a3`) | write (byte-identical), reports (re-run gives byte-identical data), timing pass |
| A1 / A2 write harnesses | pass without `WRITE` (committed A1/A2 files equal a fresh generation); A1/A2/Phase 0 report harnesses **not re-run** (they would rewrite history evidence) |
| Playwright (isolated backend copy on 8095, E2E dev server on 5194) | first full run **8/9**: the A2 E2E test failed one frame-equality check after its set swaps, while another session's 5 Vitest workers loaded the CPU; the same test then passed 2/2 alone and the full lighting spec passed **6/6** in sequence (incl. the **new A3 test**). Bridge bus/truck, transit and `simulation.spec.ts` passed (the latter is a known baseline failure in A2's report; it passed here) |
| `git diff --check` | clean |
| Backend | not affected, not changed, not run |

Test changes: `corridorA2.test.ts` and the A2 report/timing harnesses now take the A2 state explicitly
(`a2RuntimeLightingRegistry`), with every assertion unchanged — the same way A2 pinned the A1 tests.
`tests/lighting.spec.ts`: where a test uses the runtime set, the expected total rises 267 → 273, pages
69 → 72 and the A3 rollout joins the expected counts (an intended data change, as in A2); no assertion
was removed or loosened.

New A3 test coverage: byte-identical generation, pinned snapshot, input-order independence, stable IDs,
provenance per record, zone geometry re-derived from the extract, exact reuse of D's edge, no overlap,
scope (only ring ways; approaches and untagged ways none), clearances, outer-kerb placement, ground
supports, no deck in reach, emitter-based occlusion, ID disjointness, no doubled estimates, A2
slot-identity guard, earlier records and data files untouched (SHA-256), 267 records deep-equal and lamp
rows bit-identical, every A2-state cell keeps its lamps, capacity (max 15, A3 ≤ 8), housings, manifest
hashes, shuffled set, chunk grouping, LOD, cross-corridor influence, ring illumination incl. the two dim
stretches, Norrtull identical, 17-lamp rejection, A2-ID collision, 10 alternating swaps.

## 9. Decisions and remaining unknowns

- **Norrtull:** decided — option 1 (keep unlit). What an OSM `lit` check (option 2) would need is
  described in [remaining-gaps.md](remaining-gaps.md#what-an-osm-check-option-2-would-need).
- **Dim ring stretches:** follow from the per-way station rule; a whole-ring station rule would be a
  policy change (not made). See [remaining-gaps.md](remaining-gaps.md#2-the-ring-has-two-dim-stretches-by-the-existing-station-rule).
- All 6 positions are estimates; no municipal register, photometry, switching or RH2000 pole heights.

## 10. Files

New: `src/lib/lighting/corridorA3.ts`, `src/lib/lighting/corridorA3.test.ts`,
`src/lib/data/streetlights-a3.json`, `src/lib/data/streetlights-a3-provenance.json`,
`scripts/data/lighting-a3-source.json`, `scripts/lighting-a3/` (inputs, write, reports, timing,
corridor map, poses, vitest config), `docs/lighting-phase-a3/` (7 reports, `data/`, `evidence/`).

Modified (additions/pinning only): `corridorGenerator.ts` (`A3_POLICY`, `A3_SPEC`), `corridorRegistry.ts`
(`A3_IDENTITY`), `controller.ts` (runtime = pilot + A1 + A2 + A3; `a3LightingRegistry`,
`a2RuntimeLightingRegistry`), `Scene.svelte` (DEV registries `a3`, `a2Runtime`), `corridorA2.test.ts`
and `scripts/lighting-a2/{reports,timing}.test.ts` (pinned to the A2 state), `tests/lighting.spec.ts`
(runtime totals 267 → 273, A3 rollout in the expected counts, new A3 test),
`scripts/lighting-a1/extract-source.mjs` (`a3` mode), `.gitignore` (`/work/lighting-a3/`),
`docs/claude-progress.md`.

Not changed: pilot, A1 and A2 data and evidence, Phase 0 evidence, shader, light index, fixture
visuals, terrain, roads, bridges, routing, backend.

Proposed A3 commit (after approval): "Lighting Phase A3 — Kungstorget ring" with exactly the files
above; exclude `.claude/`, `work/`, `dist/`, `test-results/`.

## 11. Reproduction (PowerShell, UI checkout)

```powershell
node scripts/lighting-a1/extract-source.mjs a3          # needs the ignored Step 6.2 snapshot; verifies its SHA-256
$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts write; $env:WRITE=$null
.\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts reports   # docs/lighting-phase-a3/data
.\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts timing
.\node_modules\.bin\vitest.cmd run --no-file-parallelism   # includes corridorA3/corridorA2/corridor tests
node scripts/lighting-a3/corridor-map.mjs docs/lighting-phase-a3/evidence/corridor-map.png
# A2 reference app: git archive b42dd37 → work/lighting-a3/a2-app (+ node_modules junction)
# Paired captures (DEV: A2 reference on 5206, A3 on 5207): work/lighting-a3/capture-all.sh
# Paired performance (vite preview: A2 reference on 5208, A3 on 5209):
$env:VIEWS='kungsgatan,ingelstaBridge,policeEmblem,station,grandHotel,centrum,city,stromparken,idrottsparkenPitch,parken'
node scripts/lighting-phase0/measure.mjs work/lighting-a3/perf/series1.json 3 5208 5209
```
