# Performance Phase P2c — map details: airfield pavements and edge lights merged (2026-11-02)

Worked directly on local `main` (= `origin/main` `8bc891e`), as agreed with the user on 2026-11-02:
tested locally by the user, **committed (`a2240e5`) and pushed to `origin/main`** (2026-11-02). Backend unchanged. Third targeted
step of P2 (roadmap track P).

## Result

- **Change.** One file, `src/lib/mapLandmarks.ts`. The 678 taxiway rectangles (pavement and centre
  line per segment, at both airports) are now 2 meshes (all pavement, all centre lines), and the 230
  runway edge lights, already baked into world space and laid on the terrain vertex by vertex, are
  now 1 mesh. Same vertices, copied with `mergeGeometries`; same materials and shadow flags.
  Instancing the edge lights (P1's idea) was not used: every light's vertices follow the terrain on
  their own, so instanced copies of one shape would change the picture; merging does not.
- **Geometry unchanged, proven.** In the running app, all map details (982 meshes on `main`, 77 now)
  have the same 29 223 triangles, grouped by material look (29 looks), with the same fingerprint over
  every triangle's world position and uv ([data/details-identity.json](data/details-identity.json)).
  Changed looks: taxiway pavement 340 → 2 meshes (incl. the instanced joint caps), centre lines
  339 → 1, edge lights 230 → 1.
- **Picture unchanged.** Six fullscreen views (Kungsängen airport and Bråvalla F13 by day and at
  night, the overview by day and at night): five screenshots are **byte-identical files** to `main`;
  the night overview differs by 1/255 in 46 pixels, the same noise as `main` against itself (37).
- **Close-ups too.** After the user's local test (blotchy taxiway pavement over the runway thresholds),
  every runway end was photographed close up (8 ends × top and oblique view, dev servers, same camera)
  on `main` and P2c (`scripts/perf-p2c/airfield-closeups.mjs`): 0 pixels differ by more than 8/255 in
  all 16 views, 11 are byte-identical files ([data/runway-closeups.json](data/runway-closeups.json),
  [evidence 03](evidence/03-runway-end2-main-left-p2c-right.png),
  [04](evidence/04-runway-end5-main-left-p2c-right.png)). **The blotches exist on `main` exactly the same
  way**; they are an older bug, not caused by P2c (see remaining gaps).
- **Draw calls:** overview 2 910 → 2 005 (−31 %), Kungsängen 1 226 → 689, F13 1 003 → 664,
  Innerstaden 1 313 → 1 217. Map-details part: 975 → 70 calls in the overview, 543 → 6 at Kungsängen.
- **Time: CPU work down, frame time unchanged.** Paired against `main` (6 rounds, fullscreen
  2560×1440, night with traffic, median [min … max]):

  | view | CPU median | frame time (rAF mean) |
  |---|---:|---:|
  | Overview, night | −0.05 [−1.30 … +0.30] | −0.15 [−1.46 … +0.42] |
  | Overview, day | −0.30 [−1.30 … +0.20] | −0.40 [−1.42 … +0.30] |
  | Kungsängen, night | **−0.65** [−1.30 … +0.30] | +0.14 [−0.39 … +0.36] |
  | Bråvalla F13, night | **−0.45** [−1.20 … +0.50] | +0.07 [−0.43 … +0.26] |
  | Innerstaden, night | −0.10 [−0.50 … +0.60] | −0.04 [−0.49 … +0.65] |

  A second run with the GPU timer (4 rounds, [data/paired-gpu-summary.md](data/paired-gpu-summary.md))
  shows why: GPU time per frame ≈ frame time in all three views (overview 6.4 ms, Kungsängen 3.7–3.9 ms,
  F13 2.7–2.8 ms), so since P2b these views are limited by the GPU, not by the CPU's draw-call work.
  CPU there: Kungsängen 3.10 → 1.95 ms (−0.75), F13 2.55 → 1.70 (−0.50), overview −0.25; frame time
  −0.08 … −0.37 ms in that run. Taken together: frame time unchanged within ±0.4 ms on this computer.
  P1's estimate (−1.5 … −2 ms) was made when the overview was CPU-bound (before P2a/P2b).
- **What it buys.** About 0.5–0.75 ms less CPU per frame around the airports and 900 fewer draw calls
  in the overview: headroom for a weaker CPU, or for more traffic/aircraft, not a faster frame here.
  CPU p95 rose in the airport views (+0.6 / +1.45 ms, frames at 3–4 ms): the same effect as in P2b,
  `renderer.render()` waiting for the GPU in some frames when the CPU finishes sooner at 250+ frames/s.

## Method

- **Builds** (`scripts/perf-p2c/build-variants.mjs`): hook builds of `main` (`origin/main`'s
  `mapLandmarks.ts` swapped in and restored, hash checked) and of the working tree.
- **Identity** (`scripts/perf-p2c/details-identity.mjs`): every visible mesh under the landmark
  details group, in world space (instances expanded), per material look; fingerprint over positions
  and uvs rounded to 1e-5 scene units (0.25 mm); a second load of `main` as the noise floor.
- **Paired timing** (`scripts/perf-p2c/paired.mjs`, P2b's script capturing the map-details part):
  P1's set-up, 600 frames per view, 6 rounds, builds in rotated order, background CPU ≤ 18 % before
  each round; GPU run with `GPU=1`, 4 rounds. Data: [data/paired.json](data/paired.json) +
  [summary](data/paired-summary.md), [data/paired-gpu.json](data/paired-gpu.json) + summary.

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK (usual chunk-size warning); built twice, 29 files byte-identical; no `__perfP1` in `dist/` |
| Prettier | `src/lib/mapLandmarks.ts` and the new scripts clean |
| Vitest (PowerShell, `C:\`) | 516/517 — the known `police.test.ts` failure (CRLF line endings of `polis-emblem.svg` on disk in this checkout; see P2b) |
| Playwright, full suite (24 tests), twice | **24/24, 24/24** |
| In the running app (dev server) | Kungsängen view: runway, taxiways, centre lines and aprons drawn; map details 77 meshes; no page errors |

## Files

- `src/lib/mapLandmarks.ts` — `merged()` helper; taxiway pavement and centre lines collected and
  merged; `drape()` merges the baked edge lights per material.
- `scripts/perf-p2c/` — `build-variants.mjs`, `details-identity.mjs`, `paired.mjs`, `summarize.mjs`.
- `docs/perf-p2c/data/` — identity, paired runs and summaries.
- `docs/perf-p2c/evidence/` — `01` Kungsängen by day, `02` Bråvalla F13 at night (P2c; the `main`
  screenshots are byte-identical files).
- `.gitignore` — `/work/perf-p2c/`.

No geodata, coordinates or generated data changed; no provenance update needed.

## Reproduce

```
node scripts/perf-p2c/build-variants.mjs work/perf-p2c main,p2c
# preview servers (.claude/launch.json, local only): phase0-backend 8095, p2c-main 5301, p2c-new 5302
node scripts/perf-p2c/details-identity.mjs <out.json> <newShotDir> main=http://127.0.0.1:5301 p2c=http://127.0.0.1:5302 main2=http://127.0.0.1:5301
MAX_BUSY=18 node scripts/perf-p2c/paired.mjs <new.json> 6 main=http://127.0.0.1:5301 p2c=http://127.0.0.1:5302
GPU=1 VIEWS=night/overview,night/airport,night/f13 node scripts/perf-p2c/paired.mjs <new.json> 4 main=… p2c=…
node scripts/perf-p2c/summarize.mjs <run.json> > <summary.md>
```
