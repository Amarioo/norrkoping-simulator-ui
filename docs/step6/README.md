# Step 6 — lighting pilot and Idrottsparken (2026-10-21)

The three-area pilot is implemented for review: **Kungsgatan/Kungsbron, Strömparken and
Idrottsparken**. The arena is reconstructed in daylight as well as independently floodlit at night.
No city-wide rollout, commit or push was performed. The backend and shared geographic data are unchanged.

## State and recovery

The original session started from clean UI `994b881` and backend `e143535`. This continuation
verified those HEADs again; the frontend was already on `codex/step6-night-lighting` with the
unfinished Step 6 changes. Backend `main` remained clean. Existing implementation, sources,
measurements and the baseline snapshot in `work/step6/before-app/` were preserved.
The unrelated `.vscode/extensions.json` present on resumption was left untouched.

The comparison is baseline `994b881` versus **all Step 6 working-tree changes**, not just the
changes made during recovery. See [file inventory](files.md) and
[measurement state](measurements/source-state.json) for paths and content hashes.

Recovery completed the visual evidence, source cross-checks, resource measurements, reporting and
final verification. It also fixed a real WebGL recovery regression: the earlier memory optimisation
discarded typed vertex arrays after upload, causing repeated `byteLength` errors after context
loss. We retain those arrays and release only the temporary merge buffers. A browser test reproduced
the failure before the fix and passes after it.

## Implementation and sources

- [Architecture](lighting-architecture.md): solar time, smooth sky/fog/exposure, fixed shader
  configuration, receiving surfaces, culling, ownership, compile optimisation and limitations.
- [Lamp data](lighting-data.md): checked sources, timestamps, licences, pilot bounds and uncertainty.
  There are **105 fixtures: 10 mapped OSM positions and 95 estimates**. Estimates are restricted to
  `lit=yes` roads/paths and three explicitly estimated arena entrance posts. Unknown and `lit=no`
  routes are not populated by default. Seven fixtures use the Kungsbron deck.
- [Arena assessment](stadium-references.md): sources, dated photos, LiDAR measurements, discrepancy
  list and actual corrections. Geometry retains the existing pitch anchor, orientation and metre
  conversion. The model is an evidence-based approximation, not a 2026 measured survey.
- [Performance and budgets](performance.md): repeated production measurements, draw calls,
  resource estimates, remaining regressions and unavailable metrics.

The sun uses Norrköping's location, Europe/Stockholm daylight-saving rules and the existing
SWEREF grid-north correction. Controls select date/time and solar presets; Av/Träning/Match is
independent of time. Fixture shading lights actual materials and surfaces using a spatial light
grid, distance falloff and approximate occlusion. The existing three global lights stay fixed in
number; there are **zero fixture PointLights/SpotLights and zero shadow maps**.

## Rendered evidence

All comparison panels below are simulator renders. The [camera poses](poses.json) are absolute
scene coordinates; [capture metadata](evidence/capture-settings.json) records each set's time,
GPU, viewport and solar state. Viewport 1400 × 1000, map panel 1064 × 660, DPR 1, labels off,
Edge headless on NVIDIA RTX 5070 Ti / ANGLE D3D11. No live simulation backend is connected for
captures, so moving vehicles do not compromise comparisons. UI bars are cropped in the montages;
the uncropped source PNGs remain in local `work/step6/ev/`.

Map attribution: © OpenStreetMap contributors (ODbL); terrain © Lantmäteriet, processed under
CC BY 4.0. See [data licences](../../DATA-LICENSE.md). These images contain original simulator
geometry/textures, not redistributed reference photography.

Geometry comparisons use the **same legacy daylight and camera** on both sides. Day/night panels
use 2026-10-21 Stockholm time: noon 12:39, sunset 17:36, twilight 17:52, night 21:30. The night
sun is about −30.5°, so these are genuinely dark-night conditions. Sunrise panels use
07:15 / 07:43 / 08:15. The fixed captures call `settle()`; transition behavior is tested separately.

| Comparison | What to inspect / supporting arena discrepancy numbers |
|---|---|
| [Arena elevated SE, before/after](evidence/before-after/stadium-elevated-se.jpg) | Lower roofs, restored runoff, roofed NE corner, south terrace and corrected masts (#1–7, LiDAR/OSM/photos) |
| [Arena elevated NW, before/after](evidence/before-after/stadium-elevated-nw.jpg) | Stand separation, open SE corner, halls and low tennis-hall roof (#8–14) |
| [West exterior, before/after](evidence/before-after/stadium-exterior-west.jpg) | West footprint, glazing and entrance projection (#8); mast lattice (#5) |
| [NE exterior, before/after](evidence/before-after/stadium-exterior-ne.jpg) | Enclosed roofed corner, roof silhouette, front supports (#1–3, #10) |
| [SE exterior, before/after](evidence/before-after/stadium-exterior-se.jpg) | Open corner and terrain integration (#6–7) |
| [Pitch facing north, before/after](evidence/before-after/stadium-pitch-north.jpg) | Terrace identity, rake, roof overhang, seats and markings (#1–4, #8–11) |
| [Pitch facing west, before/after](evidence/before-after/stadium-pitch-west.jpg) | Main stand tiers, loge glazing, roof and floodlight rows (#8, #11) |
| [Kungsgatan local](evidence/time-of-day/kungsgatan-street.jpg), [elevated](evidence/time-of-day/kungsgatan-elevated.jpg) | Day, sunset, twilight, night; street and pavement surface response |
| [Strömparken local](evidence/time-of-day/stromparken-path.jpg), [elevated](evidence/time-of-day/stromparken-elevated.jpg) | Lit walking route and nearby facade, dark areas between fixtures |
| [Arena local](evidence/time-of-day/stadium-pitch-north.jpg), [elevated](evidence/time-of-day/stadium-elevated-se.jpg) | Day, sunset, twilight, night with floodlights off |
| [Floodlights: pitch](evidence/floodlights/stadium-pitch-north.jpg), [west-facing pitch](evidence/floodlights/stadium-pitch-west.jpg), [elevated](evidence/floodlights/stadium-elevated-se.jpg) | Identical camera/time, off → training → event; pitch markings remain visible, city stays dark |
| [Floodlights: west exterior](evidence/floodlights/stadium-exterior-west.jpg), [NE exterior](evidence/floodlights/stadium-exterior-ne.jpg) | Exterior spill and bright fixture heads |
| [Sunrise: street](evidence/sunrise/kungsgatan-street.jpg), [park](evidence/sunrise/stromparken-path.jpg), [arena](evidence/sunrise/stadium-elevated-se.jpg) | Sky, surface readability and lamp fading through dawn |

Reproduce with the baseline and current dev servers using `scripts/step6/capture-evidence.sh`, then
`python scripts/step6/montage.py work/step6/ev docs/step6/evidence`. See the scripts' headers for
ports and environment variables. Performance uses production preview servers instead.

Visual inspection confirms visible street/path/facade response, a much larger pitch response when
event lighting is enabled, dark surroundings, and readable turf/markings without white clipping.
The daytime arena comparisons show the roof height/overhang and mast-position corrections directly.
There is a **pre-existing road-surface overlap/depth artifact at Kungsgatan**, visible as pale jagged
patches in both the [baseline](evidence/kungsgatan-baseline.png) and
[same-sun Step 6 view](evidence/kungsgatan-legacy.png). It was not introduced by the lamps and has
not been concealed or fixed by changing the verified road geometry. It remains a visual limitation
of this pilot. Still images cannot prove absence of flicker on all navigation paths.

## Verification

| Command / check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | 208 tests, 22 files passed |
| `npx vitest run src/lib/stadium src/lib/lighting` after recovery fix | 43 passed |
| `npm run build` | Passed; existing large-chunk warning remains |
| `E2E_BASE_URL=http://127.0.0.1:5185 npx playwright test` | All 4 passed against Ktor on :8091 |
| `npx vitest run -c scripts/step6/vitest.config.ts scripts/step6/resources.test.ts` | Resource report generated |
| Existing geometry measurement harness, baseline and current | Identical worker geometry counts and bytes |
| SHA-256 of terrain, bridge profiles, transport network | Exact match between both repositories; revision unchanged |

E2E covers solar presets, midnight rollover, independent floodlights, stable program count while
scrubbing/toggling, WebGL context restoration, traffic commands/SSE, camera following and public
transport. Unit tests cover DST, solar orientation, fixture provenance/deduplication, mounting,
occlusion and illumination, geographic frame, roofs/masts/terrain clearance and repeated disposal.

The first concurrent browser verification timed out in one control click and one screenshot; the
serial rerun passed all four E2E tests. The context-loss test initially failed on the genuine bug
described above, then passed after the fix. These failures are not counted as successful runs.
Backend tests were not rerun because neither backend behavior nor shared runtime data changed.

## Limits and next steps

1. The geometry combines the 2020 LiDAR, OSM snapshot and compatible post-2009 photographs. Exact
   2026 mast/projector arrangements, row counts, materials and fixture photometry remain uncertain.
   The official 2026 Ektorpsgatan facade lettering is documented but not modelled.
2. Lighting has no shadow maps or bounce. Street occlusion uses footprint sectors; stadium occlusion
   uses roof planes and a volume mask. Trees and full stand/hall bodies do not cast accurate shadows.
   Lux-to-display conversion is perceptual, not a photometric certification.
3. Turf follows the existing nearly level DTM; rigid stands retain their shapes, with local raised
   rows over Berget. Surrounding low-resolution terrain facets remain visible.
   The pre-existing Kungsgatan road-depth artifact above also remains.
4. Before extending coverage, obtain current municipal fixture positions/types and validate mapped
   routes on site; then use sparse/chunked light grids and profile lower-end GPUs. The current grid
   has a fixed per-cell capacity and must not silently overflow.
5. Keep current cold-start and shader-compile measurements visible when increasing the material or
   light budget. Vehicle lights, interiors and lit windows remain outside this pilot.
