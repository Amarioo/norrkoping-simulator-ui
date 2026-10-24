# Lighting Phase L0 — citywide lighting map (rule `lighting-city-v1`)

2026-10-24 · branch `codex/lighting-phase-a2` · **not committed, pushed or merged** · no 3D/runtime change.

**Open the map:** `node scripts/lighting-city/serve-map.mjs` → http://127.0.0.1:5195/ (or the
`l0-map` entry in `.claude/launch.json`). The file is self-contained:
[lighting-map.html](lighting-map.html).

## Verdict

Every one of the 12 246 OSM highway ways inside the map now has a decision (lit, partly lit or dark)
and a stated reason, made by one deterministic rule instead of hand-drawn corridors. Inside the map,
**802 of 1 623 km** are lit: 256 km because OSM says `lit=yes`, 1 km by filling short gaps between lit
pieces (this lights **Norrtull**), and 529 km by Norrköping's own lighting guideline (2023) applied as
a rule. That gives **≈ 25 000 preliminary lamp positions** (vs 273 fixtures today). The rule agrees
with the 2016 satellite night image at district level (rank correlation 0.69); the main disagreement
is privately lit industry/port/retail land, which the rule leaves dark on purpose.
Recommendation: **approve** the rule as the basis for L1/L2, with the decisions below.

## Decisions taken (roadmap §6, user 2026-10-24) and how they are implemented

| Decision | Implementation |
|---|---|
| Untagged streets inside a tätort are lit (guideline §2.4.1) | `rule-street-in-tatort`; tätort = SCB Statistiska tätorter 2023 (way lit if ≥ 50 % of its length is inside) |
| Paths: lit beside streets / in residential areas, dark in park/forest without a tag | sidewalks, crossings and paths ≤ 12 m from a lit street for ≥ 70 % of their length are lit **by the street's lamps** (no own fixtures); other footways/cycleways inside a tätort lit unless in forest, unpaved or informal; `highway=path` lit only if paved and designated |
| Fill short gaps between lit neighbours (lights Norrtull) | chain of untagged ways of the same street < 60 m whose every end meets a `lit`-tagged piece of that street |
| Lighter review | this README + the map + JSON data + 6 screenshots; no per-street tables |
| SCB boundary with fallback | SCB 2023 used (CC0); the fallback was not needed |

Other rule parts (from the guideline, labelled as rule): outside a tätort dark, except roundabouts and
±50 m at traffic signals, pedestrian crossings and roundabout entries; untagged motorways dark (state
roads); private service roads (driveways, parking aisles, unsubtyped `service`) and tracks dark;
`lit=no` always wins. Full definition: [`src/lib/lighting/cityRule.ts`](../../src/lib/lighting/cityRule.ts).

## Results (inside the map clip)

| | km | ways |
|---|---:|---:|
| Lit | 784.2 | 6 564 |
| Partly lit (junction rule) | 18.6 (3.3 lit) | 32 |
| Dark | 820.1 | 5 650 |

Lit length by evidence: **OSM tag 255.9 km · gap fill 0.8 km · rule 529.4 km**; of all lit length,
129 km are sidewalks/paths lit by street lamps. By reason, groups and district: [coverage.md](coverage.md).

Preliminary stations (centreline, Step 6 type table; positions are estimates for counting and
capacity only — L2 places the real kerb positions):

| Type | Spacing | Count |
|---|---:|---:|
| street-bracket-8m (motorway, trunk … tertiary) | 30 m | 4 386 |
| street-bracket-6m (residential, unclassified, alley …) | 27 m | 12 218 |
| park-lantern-4m (footway, cycleway, path …) | 22 m | 8 437 |
| **Total** | | **25 041** (8 000 tag · 18 gap · 17 023 rule) |

Not placed: 326 inside the existing pilot/A1–A3 zones (those fixtures stay as they are) and 403
outside the map clip. Of the 326, **71 slots have no existing fixture within half a spacing** — lit by
the rule but dark in today's app — incl. **Norrtull (2 slots, westbound)**, Matchgatan (11),
Skvallertorget (5), Tyska torget (3); listed in [data/stats.json](data/stats.json)
`uncoveredInsideExistingZones` and drawn as magenta rings on the map. Fixing them touches earlier
zones, so it is L2 seam work.

### Capacity (input for L1)

Stations + the 273 existing fixtures through the renderer's own index (`lightIndex.ts`, 25 m cells,
16 slots): **18 cells overflow** (max 23 contributors; Östantill 7, Ljura 4, Söderstaden 4, Hageby,
Navestad, Saltängen 1 each); none involves an existing fixture. 49 090 non-empty cells, 4 418 pages,
page atlas 5.2 MB (dense equivalent 14.9 MB). The index rejects the set, as designed: L1 must decide an
overflow policy and kerb placement (centreline stations on parallel ways inflate counts). Details:
[data/capacity.json](data/capacity.json).

### Satellite check

1 265 Black Marble 2016 pixels (≈ 241 × 463 m) inside the map: Spearman ρ = **0.69** between
satellite brightness and modelled lit km per pixel; 210 pixels are saturated (255). 124 pixels are
bright (≥ 128) but have no modelled lit road; the 15 largest disagreements are the Marbystrand/Lindö
port, Ingelsta (industry/retail), Slottshagen and Sylten industrial land — private site lighting that
`dark-private-service` leaves dark. The reverse (model brighter) is mainly Hagsätter, Pryssgården and
Klockaretorpet outskirts (dim in 2016; newer development or over-lighting by rule — check in L2).
Only 4 pixels are dark in the satellite (< 40) but have ≥ 1 km modelled lit road. Details:
[data/satellite-check.json](data/satellite-check.json).

## Screenshots ([evidence/](evidence/))

01 overview · 02 night view (lamps as light) · 03 satellite overlay · 04 Norrtull close-up (cyan =
gap fill) · 05 inner city night view with magenta "lit but no fixture" rings · 06 phone width.

## Pipeline and reproducibility

1. `node scripts/lighting-city/fetch-sources.mjs` — one-off download to ignored `work/lighting-city-l0/raw/`
   (done 2026-10-24; hashes pinned in [`scripts/lighting-city/sources.json`](../../scripts/lighting-city/sources.json)).
2. `node scripts/lighting-city/extract-source.mjs` — verifies the hashes, writes the committed extract
   `scripts/data/lighting-city-source.json` (3.3 MB, SHA-256 `17c822fd…7558`).
3. `$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-city/vitest.config.ts write`
   — builds twice, asserts identical output, writes [data/](data/) and the map.
4. `node scripts/lighting-city/capture-map.mjs` (with the map server) — screenshots to `work/`.

Rebuilds are byte-identical (checked in `write.test.ts` and in the main suite,
`src/lib/lighting/cityRule.test.ts`); output hashes in
[data/lighting-city-l0-provenance.json](data/lighting-city-l0-provenance.json). Build time ≈ 1 s.
Coordinates and sources: [data-provenance.md](data-provenance.md). Gaps: [remaining-gaps.md](remaining-gaps.md).

## Files

New: `scripts/lighting-city/` (fetch-sources, sources.json, extract-source, build, map-html, write
test + config, serve-map, capture-map), `scripts/data/lighting-city-source.json`,
`src/lib/lighting/cityRule.ts` (+ test), `docs/lighting-city-l0/**`. Changed: `docs/roadmap.md`
(status), `docs/claude-progress.md`, `DATA-LICENSE.md`. Local only: `.claude/launch.json` gained
`l0-map` (original in `work/lighting-city-l0/launch.json.before`). No runtime file, earlier fixture or
earlier evidence changed.

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings (1 162 files; first run found 14 type errors in `build.ts`, fixed) |
| `npm run build` | OK (L0 code is not imported by the app) |
| `npm test` (vitest, PowerShell `C:\`) | **391/391** in 29 files (380 before + 11 new in `cityRule.test.ts`, incl. byte-identical rebuild and Norrtull) |
| L0 harness `vitest -c scripts/lighting-city/vitest.config.ts` | pass: two builds identical; committed files equal a fresh build |
| `npm run test:e2e` (isolated backend copy 8095, dev server 5194) | first full run **7/9**: A3 frame-equality check (`lighting.spec.ts:735`) and the known baseline `simulation.spec.ts` camera-travel poll failed; both then passed alone (A3 2/2, simulation 1/1) and a second full run passed **9/9**. L0 changes no file the app loads, so these failures cannot come from L0; logs in ignored `work/lighting-city-l0/e2e-run*.txt` |
| Running app | not re-verified visually: no runtime change. The L0 map was verified in the browser (6 screenshots, no console errors, phone width OK) |
| Performance | not measured: no runtime change (L1 will) |
