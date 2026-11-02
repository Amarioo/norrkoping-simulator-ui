# Airfield overlap fix — clean runway ends where taxiways join (2026-11-02)

Worked directly on local `main` (= `origin/main` `a2240e5`, P2c), as agreed with the user on
2026-11-02: tested locally by the user, **committed and pushed to `origin/main`** (2026-11-02). Backend unchanged.
Found by the user while testing P2c (P2c remaining gap 5): blotchy, hatched taxiway pavement and dark
blobs on the runway thresholds at Kungsängen and Bråvalla F13. The bug existed before P2c (proven
there with 16 identical close-ups); this is its fix.

## Cause

1. **Runway and taxiway asphalt shared one depth rank.** Both are laid exactly on the terrain
   (`groundRectangle`) and both used `layeredSurface(…, LAYER_RANK.asphalt)`. Where OSM taxiways run
   onto the runway, the two surfaces are coplanar and equally ranked, so the GPU picks either one
   pixel by pixel (z-fighting: the hatched patterns over the white threshold bars).
2. **Taxiway joins were flat cylinders.** Every taxiway node had a round cap: a 12-sided cylinder,
   0.025 units (0.6 m) high, its top at the ground height of the node's centre. On sloping ground
   half of it stood above the runway surface (the dark blobs, and floating slabs in oblique views),
   and its side walls showed as a comb along curves.

## Fix (`src/lib/mapLandmarks.ts`, `src/lib/placeBuilder.ts`)

- The runway surface is one rank above taxiway asphalt (`LAYER_RANK.asphalt + 1`, polygon offset
  −48 instead of −44 units). The runway and its painted markings always win where they overlap.
  Rank 12 is also the footpath rank of the worker layers; paths never cross a runway.
- The joins are flat discs laid on the terrain like the pavement (new `groundDisc()`, same radius =
  half the widest taxiway at the node, 12 sides), merged into the taxiway pavement mesh. No more
  walls or tops above the ground.
- Taxiway centre lines (rank `marking`) still continue onto the runway, as mapped and as is common
  on real airfields (decided with the user: keep).

## Result

- **All 8 runway ends, 16 close-ups (top and oblique):** before (`main`) left, after right:
  [01](evidence/01-runway-end2-top-before-left-after-right.png),
  [02](evidence/02-runway-end5-top-before-left-after-right.png),
  [03](evidence/03-runway-end2-oblique-before-left-after-right.png),
  [04](evidence/04-runway-end5-oblique-before-left-after-right.png). The threshold bars, numbers and
  edge stripes are clean; no blobs or floating slabs remain. Ends without joining taxiways are
  unchanged. (The "before" shots are from `main` before P2c, which P2c proved pixel-identical.)
- **Nothing else changed.** Reading every map-details mesh in the running app
  ([data/details-identity.json](data/details-identity.json)): 27 of 29 material looks are identical
  to `origin/main`; only the taxiway asphalt (caps → discs: 2 meshes → 1, 18 971 → 10 564 triangles,
  the cylinders' walls and bottoms are gone) and the runway surfaces (same 456 triangles, offset −44 →
  −48) changed. Pixel differences in 7 fullscreen views are at the two airfields only (Kungsängen,
  Bråvalla F13, and a distant taxiway at the top edge of the Innerstaden view): airport day 1 827,
  F13 day 414, overview day 95, Innerstaden day 27 pixels over 8/255; night views ≤ 398.
- **Draw calls:** one fewer (the instanced caps are part of the pavement mesh now).

## Checks

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; built twice, 29 files byte-identical; no `__perfP1` in `dist/` |
| Prettier | changed files clean |
| Vitest (PowerShell, `C:\`) | 516/517 — the known `police.test.ts` CRLF failure (see P2b) |
| Playwright, full suite, twice | **24/24, 24/24** |

## Reproduce

```
# dev server of the working tree on 5194 (phase0-e2e), main as a dev server from a worktree (p2c-main-dev, 5303)
node scripts/perf-p2c/airfield-closeups.mjs <newDir> after=http://127.0.0.1:5194
node scripts/perf-p2c/build-variants.mjs work/perf-p2c/fix main,p2c
# preview servers: runwayfix-main 5304 (dist-main), runwayfix-new 5305 (dist-p2c)
SHOTS=day/overview,night/overview,day/city,night/city,day/airport,night/airport,day/f13 \
  node scripts/perf-p2c/details-identity.mjs <out.json> <newShotDir> main=http://127.0.0.1:5304 fix=http://127.0.0.1:5305
```
