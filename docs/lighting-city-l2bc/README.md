# Lighting Phase L2bc — paths, squares, junctions and motorways (L2b + L2c together)

2026-10-25 · branch `codex/lighting-l2bc` (from `main` = `0f86143`) · committed; `main` fast-forwarded and pushed · backend unchanged.

## Verdict

L2b and L2c were run together as one step. The app now also lights Norrköping's footways, cycleways
and paths, its squares, the junctions on rural roads and the lit stretches of the E4: **7 723 new
fixtures** (7 081 park lanterns, 488 street brackets, 4 mapped OSM lamps), **22 346 in total**. The
targets are met on this machine (pooled over two measurement series: frame time ≤ +0.45 ms, memory
+4.1 MB, map-ready unchanged; ≤ 3 extra draw calls). All positions except the 4 mapped lamps are
estimates. Recommendation: **approve**; the street-lighting track (L0–L2) is then complete.

## Decisions needed

None blocking. Taken in this step, each on only for L2bc (earlier rollouts unchanged):
1. **Squares** get lanterns along their outline, 1.5 m inside, and are exempt from the "within 10 m of
   a lit street = lit by the street" rule (street lamps light the edge, not the square). 24 squares,
   154 lanterns. Alternative: leave squares dark until real data exist.
2. **Motorways** (OSM `lit=yes` only) get 8 m brackets on the outer kerb; real masts are usually taller.
   437 fixtures. Alternative: a taller motorway type (needs a new estimated type).

## Risks / not verified

- Positions, types and spacing are estimates (A1–A3 policy); no municipal register.
- One machine (RTX 5070 Ti). Single series show day p95 +0.6 / +0.7 ms in one view each, with other
  views −1.0 ms in the same series: noise both ways; the pooled six rounds stay within the gates.
- One full Vitest run had 1 failure that did not recur in three further full runs (411/411 each); the
  output of that run was not saved, so the test is unknown (known 5 s timeouts under load are likely).
- 180 short path pieces get no station (way-local rule); 68 partners and 9 ways with geometry
  differences get none.

## Rules and counts

| Rule | Fixtures | Type |
|---|---:|---|
| Lit path beside the path (footway 3 936, cycleway 1 618, path 1 497, steps 26) | 7 077 | park lantern 4.2 m |
| Square perimeter (24 squares) | 154 | park lantern |
| Motorway / motorway link, one side (outer kerb of the carriageway) | 437 | 8 m bracket |
| Partly lit roads: stations inside the ±50 m intervals at signals, crossings, roundabout entries | 54 | 8 m / 6 m bracket |
| Mapped OSM lamps (nodes 2912701801, 2912701802, 2912702001, 5403554745) | 4 | by nearest way |
| **Total** | **7 723** | (52 on bridge decks) |

Evidence: guideline rule 5 813, OSM `lit=yes` 1 899, gap fill 7, mapped 4. Rejected candidates
(with reason, in the provenance file): 860 too close to another estimate, 524 lit by a nearby street,
57 no valid position (building 33, water 13, carriageway 6, rail 3, tram 2), 52 too close to an
existing fixture, 43 earlier station slots (identity), 4 suppressed by a mapped lamp, 1 mapped lamp in
conflict.

## Generator changes (all off unless a rollout turns them on)

[`corridorGenerator.ts`](../../src/lib/lighting/corridorGenerator.ts): policy flags `includeMotorways`
and `squares`, spec options `candidate` (context-only lit ways) and `litRanges` (stations per lit
interval). A1, A2 and A3 regenerate byte-identically; L2a's runtime file is identical, its provenance
file changed in one field only (`meta.inputs.generator.sha256`, the hash of the generator source).

## Results

| Gate | Series 1 | Series 2 | Pooled (6 rounds) |
|---|---:|---:|---:|
| p95 Δ ≤ 1 ms | −0.4 … +0.6 | −1.0 … +0.7 | **−0.3 … +0.45** ✔ |
| Day p95 Δ ≤ 0.5 ms | +0.6 | +0.7 | **+0.45** ✔ |
| Map-ready Δ ≤ 100 ms | +4 (rounds −127/+261/+130) | −6 (−141/+225/−6) | **−1** ✔ |
| Post-GC heap Δ ≤ 10 MB (cumulative ≤ 20 MB) | +4.13 | +4.13 | **+4.1** (L2a + L2bc +12.0) ✔ |
| Draw calls ≤ 40 / triangles ≤ 100 k per view | +3 max / +50.6 k max ([capture metadata](data/diff-before-after.json)) | | ✔ |
| Shader programs | 20 | | ✔ |

Rendered set: 22 346 fixtures, max 16 lamps per cell (limit 32), preparation 128 ms (DEV). Assets:
`streetlights-l2bc.json` 584 KB (160 KB gzip), App chunk +0.4 KB. Night pictures change in every
view (e.g. Klockaretorpet park paths); day pictures only in pole pixels (≤ 341 px).

## Screenshots ([evidence/](evidence/))

01 whole city at night · 02 Klockaretorpet · 03 Hageby · `diff-*`: main | L2bc | difference ×16.

## Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors |
| `npm run build` | OK |
| `npm test` | **411/411** in three consecutive full runs (+6 in `corridorL2bc.test.ts`: regeneration, rule types, intervals, squares inside their outline, seams, full city set); one earlier run had 1 unexplained failure (see risks) |
| `npm run test:e2e` | **10/10** (the citywide test now expects L2a + L2bc; Söderstaden luminance 4.7 → 12.5) |
| A1/A2/A3/L2a write harnesses, L0/L1 harnesses | byte-identical |

## Reproduce

```powershell
node scripts/lighting-l2/extract-source.mjs bc
$env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2/vitest.config.ts write-bc; $env:WRITE=$null
```

Data and licences: [data-provenance.md](data-provenance.md). Gaps: [remaining-gaps.md](remaining-gaps.md).
