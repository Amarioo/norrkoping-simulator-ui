# Step 6 lighting architecture (2026-10-21)

## Starting point (UI `994b881`, backend `e143535`, both clean)

- Renderer: Threlte 8 `Canvas` (WebGLRenderer, AgX tone mapping, sRGB output, `dpr=1`, shadows off).
- Lights: one fixed `DirectionalLight` (#fff3de, 2.1, from (−150, 260, 120): elevation 53.6°,
  a midsummer-afternoon sun), `HemisphereLight` (#d9efff/#8b9575, 1.1), `AmbientLight` (#f3f1e7, 0.75);
  flat background and `Fog` #bacbd3 700–1700 units.
- Materials: almost all `MeshStandardMaterial`. The worker-built ground layers use `layeredGround`
  (a depth-rank vertex patch). Self-lit `MeshBasicMaterial` was used for traffic-signal lamps
  (correct: emitters), landmark signs (stadium signs, Rådhuset clock faces, police emblem) and the
  label sprites (UI).
- Static city geometry: built in three Web Workers (`cityMesh.worker.ts`), arriving as merged chunks.

## Strategy

| Element | Technique | Budget |
|---|---|---|
| Sun, sky light, ambient | the existing three real-time lights, retuned every frame from the solar state | 3, fixed (no recompiles) |
| Shadows | none (as before) | 0 shadow maps |
| Street/park/entrance fixtures | **shader lights**: a patch on every lit material evaluates the lamps listed in the fragment's 25 m world-grid cell | ≤ 16 lamps per pixel (max 8 in the pilots), any number of fixtures |
| Stadium floodlights | shader spot emitters in the arena frame, only inside the stadium volume, with analytic roof occluders | ≤ 16 emitters (14 used), ≤ 8 roofs (4 used) |
| Fixture geometry | InstancedMesh per pilot and type (housing, lens) + one halo InstancedMesh per pilot | 4–7 draw calls per pilot |
| Floodlight projectors | 2 InstancedMeshes (housing, lens) for all 181 projectors (4 × 30 on the masts, 61 under the roof edges) | 2 draw calls |
| Sky | one dome (ShaderMaterial) with the same colours as fog and hemisphere light | 1 draw call |

No `PointLight`/`SpotLight` is created, so the three.js light count never changes and programs are
compiled once. Time of day, floodlight state and lamp level are uniforms, light colours/intensities
and `toneMappingExposure`. The lighting patch has one fixed program variant per material type
(cache key `…|city-lights-v1`, chained after `layered-ground`).

### Why shader lights instead of a few dynamic lights near the camera

A small set of real PointLights chosen around the camera would change every frame (popping, unstable
selection) and every light costs every lit fragment. The world grid gives each pixel only the lamps
that can reach it, so the cost is bounded per pixel, independent of the camera and of the total number
of fixtures. This scales to city-wide coverage by adding rows to the lamp texture. Lamps also light
distant surfaces correctly, so no distance popping occurs. The light model is evaluated per pixel
in metres:
- inverse square of the distance in metres, with a smooth range window;
- a luminaire distribution (full cut-off street luminaires do not light façades above lamp height, and
  there are no visible cones in clear air);
- 16 occlusion sectors from building footprints (no light behind façades or through buildings);
- bridge-deck clipping.

Shading uses each material's own diffuse colour (metalness-aware for standard materials), its
normal, and a normalised Blinn specular lobe from its roughness. The fixture contributions are
accumulated in world space and added to the material's direct diffuse and specular light once.
This covers roads, kerbs, markings, pavements, land cover, terrain, façades, roofs, bridges,
vehicles, trees and stadium surfaces.

### Shader compile cost (measured and fixed)

The first version called three.js' full `RE_Direct` BRDF for every light inside constant-bound
loops. ANGLE's D3D compiler unrolls such loops, so every lit program grew several times larger.
Startup paid for it: **map ready +1.4 s** and a 1.38 s longest frame (`work/step6/perf/iteration1/`).
A CPU profile showed the time in the program link check, i.e. shader compilation. Bisecting with the
fragment code removed brought startup back to the baseline.

| Profile (main thread, ms) | Program-link wait | Map ready from navigation |
|---|---|---|
| Baseline 994b881 | 1 470 | 4 326 |
| First version | 2 696 | 5 613 |
| Uniform loop bounds, single call site | 2 556 | 5 408 |
| Lean shading instead of `RE_Direct` | 2 572 | 5 441 |
| Branch-free light functions, world-space lighting | 2 101–2 262 | 5 012–5 179 |
| **+ parallel compilation** (`renderer.compileAsync`, KHR_parallel_shader_compile) | **968–1 005** | **4 517–4 823** |

The final form uses:
- one dynamic loop with uniform bounds (floodlights first, then the cell's lamp slots until the first
  empty slot);
- straight-line light functions;
- world-space shading (one normal transform per fragment).

`Scene.svelte` starts all programs compiling at once:
- after mount (so the real lights decide the program variants);
- again when the worker-built layers arrive, before their first frame.

Without the extension, this falls back to the usual synchronous compile.

### Surfaces and limitations

| Surface | Street lamps | Floodlights |
|---|---|---|
| Ground layers (terrain, land cover, roads, kerbs, markings, banks), walls, roofs, cornices | yes | yes (inside the stadium volume) |
| Landmarks, bridges, riverfront, places, trees, vehicles, trams, trains, signals | yes | yes |
| Water | yes (specular from the existing water material) | yes |
| Unlit materials (label sprites, signal lamp heads, lenses, halos, sky) | no, by design | no |

Limitations:
- No shadow maps. Occlusion is approximate:
  - street lamps: 2D footprint sectors only, so a low building (kiosk) between lamp and street does not
    cast a shadow on its far side within the same sector, and trees cast no shadows;
  - floodlights: blocked only by the four stand roofs (horizontal planes at 15.2–15.0 m). Stand bodies
    and halls do not block floodlight; the stadium mask keeps the light inside the arena.
- No indirect bounce from lit surfaces.
- No volumetric fog or light cones. The halo quads are a camera glare impression around lenses,
  fog-attenuated, with no bloom pass.
- Bloom is not used. AgX tone mapping with HDR lens colours and halos reads as bright light without
  a post-processing pass (no extra render targets or fill-rate cost).
- Windows do not light up at night (optional follow-up; not started).

## Time, date and the sun (`lighting/solar.ts`, `lighting/environment.ts`)

- **Time zone:** the simulated clock is Europe/Stockholm wall time, converted with Intl (IANA rules).
  A non-existent spring-forward time moves forward by the gap; an ambiguous autumn time takes the
  first (summer-time) occurrence.
- **Sun position:** NOAA/Meeus solar position at the scene origin (58.5898 N, 16.1875 E from
  `terrain.unproject(0, 0)`), with refraction.
- **Scene direction:** true azimuth is rotated into the SWEREF 99 TM grid frame with
  `terrain.trueNorth` (true north 1.0135° west of grid north); no second coordinate system.
- **Driven by elevation:** everything follows the apparent solar elevation, so seasons follow
  automatically. This covers sun colour and intensity, sky, hemisphere and ambient light, fog, exposure
  and the street-lighting level (photocell ramp +2° → −3°).
  - Above 30° the state equals the pre-Step-6 daylight values exactly (tested).
- **Night:**
  - a moonless urban sky glow (hemisphere 0.2, ambient 0.07, exposure 1.25), so silhouettes remain
    navigable;
  - no dark overlay;
  - the fog, sky dome and hemisphere light use the same colours.
- **Presets** (computed per date, not fixed clock times):
  - sunrise/sunset at −0.833°;
  - twilight at −3°;
  - "night" at solar midnight, labelled by its depth. A midsummer night (−7.9°) is "Ljus natt
    (nautisk skymning)", not dark night.
- **Verification date:** 2026-10-21 (CEST):
  - sunrise 07:43, true noon 12:39 (20.7°), sunset 17:36, −3° at 17:52;
  - night captures at 21:30 (−30.5°).
- **Smoothing:**
  - jumps over 20 simulated minutes (presets, date) blend over 1.2 s;
  - floodlights ramp over 1.5 s;
  - `settle()` ends both (used by the capture scripts).
- **URL parameters:** `?date=YYYY-MM-DD&time=HH:MM&stadium=off|training|event&play=<sim s per s>&sun=legacy`.
  `sun=legacy` is an evidence mode: the pre-Step-6 sun and daylight, for like-for-like geometry
  comparisons.

## Calibration (perceptual, not photometric)

- **Street lamps:** illuminance is computed in lux from candela and distance in metres, then scaled to
  display irradiance:
  - `STREET_LUX_SCALE` 0.035 → 20 lux ≈ 0.7;
  - colours are white-balanced to 4 100 K (3 000 K reads warm white, as an adapted eye or camera sees it).
- **Floodlights:** `STADIUM_LUX_SCALE` 0.0009 → 1 200 lux ≈ 1.1.
  - The physical pitch:street ratio (~60:1) is compressed to ~4:1, so the city stays visible at the
    same exposure.
- These factors are documented constants in `lighting/cityLights.ts`. A CPU reference of the shader
  (`lighting/reference.ts`) is used by the tests.

## Resource ownership

- `lighting/controller.ts` owns the lamp/grid textures, lights, sky, fog and fixture visuals.
- `stadium/idrottsparken.ts` owns its geometry, materials, turf texture and projector instances.
- Scene creation patches the materials; `Scene.svelte` `onDestroy` disposes the lighting and the city.
- A unit test creates and disposes the stadium and lighting five times and checks that every
  geometry, material and texture received `dispose`.
- Temporary stadium merge buffers (`number[]`) are cleared after conversion into typed vertex
  arrays. The typed arrays stay available for WebGL context restoration. An earlier optimisation
  cleared them on GPU upload; a real browser context-loss test reproduced repeated `byteLength`
  errors, so that optimisation was removed. The context-loss regression now lives in
  `tests/lighting.spec.ts`.
