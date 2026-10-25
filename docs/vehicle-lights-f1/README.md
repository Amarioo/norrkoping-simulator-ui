# Vehicle Lights Phase F1 — headlights and tail lights on cars, trucks and buses

Branch `codex/vehicle-lights-f1` from `main` = `43e1a4d` (L2bc). Approved by the user 2026-10-25;
committed and pushed (`main` fast-forwarded on `origin`). Backend unchanged.

At night every simulated car, truck and bus now shows glowing headlamps in front and red tail lamps
behind, and the vehicles nearest the camera (at most 16) throw a dipped-beam light pool onto the road,
kerbs, walls and other vehicles in front of them. By day nothing changes: the day pictures are
pixel-identical to `main`. **All light values are estimates** (no vehicle photometry exists in the
project); see [data-provenance.md](data-provenance.md).

## How it works

| Part | Where | What |
|---|---|---|
| Lenses | [`transportModels.ts`](../../src/lib/transportModels.ts), [`publicTransport.ts`](../../src/lib/publicTransport.ts) | The existing headlamp / tail-lamp materials get extra glow scaled by the night level (`env.artificial`, the same level that switches the street lighting). They are part of the instanced vehicle meshes, so they follow each vehicle's smoothed pose every frame, also when paused, at any time scale and with the follow camera. Buses got their own copies of the lens materials (same parameters, so the same shader program); tram and train lenses are unchanged (F2). |
| Beam | [`vehicleLights.ts`](../../src/lib/lighting/vehicleLights.ts), [`cityLights.ts`](../../src/lib/lighting/cityLights.ts) | One emitter per vehicle at the middle of its headlamps. The shader adds a dipped-beam cone (±40° wide, dark above ≈ +2°, fading out at 60 m) in the same fixed lighting patch as the street lamps and stadium floodlights: a fixed uniform array of 16 emitters plus a count. No three.js PointLight/SpotLight, no shadow maps, no new shader programs. By day the count is 0 and the shader does no vehicle work. |
| Selection | [`controller.ts`](../../src/lib/lighting/controller.ts) `updateVehicles()` | Every frame, after the vehicles moved: vehicles whose 60 m beam reach lies wholly outside the camera's view are skipped; the rest are ordered by distance to the camera (ties by vehicle id) and the nearest 16 within 600 m get a beam. The last ones fade out as the next vehicle approaches, so beams do not pop. |
| Wiring | [`Scene.svelte`](../../src/lib/Scene.svelte) | After `transport.update` / `transit.update`: lens level, poses, `lighting.updateVehicles()`. DEV/hook builds add `setVehicleBeams(on)`, `setVehicleRange(m)` and `vehiclePoses()` to `__cityLighting`; `describe().vehicleLights` reports the selection. |

The shader program cache key stays `city-lights-v3`: there is only one version of the patch in any
build, so the key does not need to change, and the existing assertion on it stays as it was.

## Results

| Gate (`docs/step62/rollout-plan.md`) | Measured | ✔ |
|---|---|---|
| p95 frame time Δ ≤ 1 ms (night) | realistic traffic, 2 series pooled (6 rounds): −0.0 … **+0.8 ms**; worst case (16 beams always on): −0.5 … +0.6 ms | ✔ |
| Day p95 Δ ≤ 0.5 ms | realistic traffic pooled −0.05 … **+0.5 ms** (city overview). The worst-case series measured **+0.7 ms** in Strömparken by day; by day no beam is active, so that series runs the same code as the realistic one, where the view was +0.05 ms: treated as noise, not proven | ✔ pooled, at the limit; one series over |
| Map-ready Δ ≤ 100 ms | pooled **+30 ms** (rounds −352 … +170); worst-case series +1 ms | ✔ |
| Post-GC heap Δ ≤ 10 MB | **+0.16 MB** (worst case +0.18) | ✔ |
| Draw calls ≤ 40 / triangles ≤ 100 k per view | **+0 / +0** in all 10 captures (no new meshes) | ✔ |
| Shader programs | **20** before and after, day and night, beams on/off | ✔ |
| Street lighting data/index (L0–L2bc, 22 346 fixtures), A1–A3/L2 files | `git diff main` empty for `src/lib/data`, `scripts/data`, earlier `docs/lighting-*`, earlier tests | ✔ |
| Day pictures | **0 changed pixels** in all 5 day captures | ✔ |

Pictures, night (before | after | difference × 4): mean screen brightness of the frame +0.9 … +8.3
(of 255); light only in front of the vehicles. A first measurement round without the view test had
+1.0 ms in one worst-case view (Kungsgatan at night, 16 beams); skipping beams that cannot reach the
view brought that view to 0.0 ms. Raw numbers: [data/traffic-pooled.json](data/traffic-pooled.json),
[data/stress-summary.json](data/stress-summary.json), [data/diff-before-after.json](data/diff-before-after.json).
App chunk +4.0 KB (minified).

### Measurement method

As the earlier lighting phases: production builds served by `vite preview` (before = `main` exported
with `git archive` to `work/vehicle-lights-f1/before-app` with a `node_modules` junction; after = this
branch), uncapped Edge, 1280×900, DPR 1, fresh browser per run, before/after alternating, 3 rounds per
series, RTX 5070 Ti / ANGLE D3D11. **Difference to earlier phases:** traffic is on. Both previews proxy
`/api` to the isolated backend copy (`phase0-backend`, port 8095); before each series the default
traffic (100 / 60 / 20 / 12 buses / 8 trams / 2 trains, flights) is reset and **paused**, so before and
after see the same frozen 202 vehicles. Views: Kungsgatan, Strömparken, city overview and *follow*
(camera following the lowest-id car), each by day and at night. The worst-case series uses
`VITE_LIGHTING_HOOK=1` builds of both sides and `setVehicleRange(Infinity)`, so 16 beams stay active
in the night views wherever the camera is (3–16 inside the view after the view test).

```powershell
node scripts/vehicle-lights-f1/measure.mjs work/vehicle-lights-f1/perf/traffic.json 3 5221 5222
$env:STRESS='1'; node scripts/vehicle-lights-f1/measure.mjs work/vehicle-lights-f1/perf/stress.json 3 5223 5224
node scripts/vehicle-lights-f1/summarize.mjs work/vehicle-lights-f1/perf/traffic.json
node scripts/vehicle-lights-f1/capture.mjs work/vehicle-lights-f1/captures/after http://127.0.0.1:5194/
node scripts/vehicle-lights-f1/compare.mjs <before> <after> <out>
```

Servers (`.claude/launch.json`, local only): `f1-before-dev` 5220, `f1-before-preview` 5221,
`f1-preview` 5222, `f1-before-hook-preview` 5223, `f1-hook-preview` 5224 (all with `API_TARGET` →
8095). Do not run the before and after DEV servers at the same time: they share `node_modules/.vite`
through the junction and break each other's dependency cache.

## Screenshots ([evidence/](evidence/))

01 car from behind · 02 car coming towards the camera · 03 car from the side · 04 bus coming towards the
camera · 05 bus from behind (all night) · 06 day (identical). Each: `main` | F1 | difference × 4.

## Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK |
| `npm test` (PowerShell, `C:\`) | first run **423/423** (411 + 12 new in `vehicleLights.test.ts`); two later runs 422/423: `infrastructure.test.ts` "never draws an at-grade running surface" hit the 5 s timeout; it passes alone, and `main` hits the same timeout in a full run on this machine today |
| `npm run test:e2e` (backend copy 8095, dev 5194) | 4 full runs: 10/11, 9/11, 10/11, 9/11. **New F1 test passed every time** (also alone). Failures only in known flaky tests (see below) |
| New Playwright test [`tests/vehicle-lights.spec.ts`](../../tests/vehicle-lights.spec.ts) | night, followed car: road 12 m ahead brightness 56.5 with beams vs 37.3 without; followed car is the nearest beam; programs 20 with beams on, off and by day; day = 0 beams; after WebGL context loss/restore the same brightness (56.5) and ≤ 20 programs |

**Known flaky tests, also on `main`:** the A2/A3 "unchanged picture" checks in `lighting.spec.ts`
(4 pixels at one lamp post flip by 1 brightness level of 255 between two states after a set swap,
recreation or context restore; reproduced on `main` in 7 of 10 runs of the A3 test) and
`simulation.spec.ts` / `transit.spec.ts` (vehicle counts from the backend; `main`'s full run failed
both). Earlier phases recorded the same failures (`docs/claude-progress.md`, A3 and L0 entries).

Unit tests (`vehicleLights.test.ts`): nearest selection (16 of 40, input order, ties by id, distance
limit, fade), view test (vehicles behind the camera skipped), emitter position along the heading for
three headings, beam only in front (nothing behind, beside, above the cut-off or beyond 60 m), day =
no beams, shader declares a fixed array of 16, no PointLight/SpotLight in the lighting group, model
poses = drawn poses (also when the snapshot does not change), trams/trains excluded, lens glow
unchanged by day and brighter at night.

## Files

New: `src/lib/lighting/vehicleLights.ts`, `src/lib/lighting/vehicleLights.test.ts`,
`tests/vehicle-lights.spec.ts`, `scripts/vehicle-lights-f1/{measure,summarize,capture,compare}.mjs`,
`docs/vehicle-lights-f1/**`. Changed: `cityLights.ts` (vehicle uniforms + GLSL), `controller.ts`
(selection, diagnostics), `Scene.svelte` (wiring, hooks), `transportModels.ts`, `publicTransport.ts`
(lens glow, poses), `.gitignore` (`/work/vehicle-lights-f1/`), `docs/claude-progress.md`,
`docs/roadmap.md`. Local only: `.claude/launch.json` (+5 `f1-*` entries; original saved in
`work/vehicle-lights-f1/launch.json.before`).

Data and estimates: [data-provenance.md](data-provenance.md),
[vehicle-lights-provenance.json](vehicle-lights-provenance.json). Gaps: [remaining-gaps.md](remaining-gaps.md).
