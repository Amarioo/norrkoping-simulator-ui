# Step 6.1 — night polish and Kungsgatan routing

2026-10-22. Implemented for review; no commit or push. Baseline is the preserved, uncommitted Step 6 working tree (UI HEAD `994b881`), not the older committed UI. Backend baseline is `e143535`. Existing geometry and Step 6 work remain intact.

## Visual changes

- **Kungsgatan:** street-light distribution follows each fixture's heading, favors the road's longitudinal direction and reduces house-side spill. Smaller halos (1.1 → 0.65 m) and a warmer night adaptation white point (4100 → 3500 K) make fixtures less prominent. Positions and spacing are unchanged; no global exposure/ambient increase.
- **Strömparken:** lantern falloff uses a softer range window, reducing flat peripheral spill while keeping the path readable and outer lawns dark. Lantern distribution remains radial.
- **Idrottsparken:** reviewed OFF/TRAINING/MATCH from pitch and elevated cameras. Existing pitch emitters, intensities and geometry are retained; surrounding pilot fixtures receive the same polish. OFF remains deliberately dark.

The fixed light grid, texture dimensions, light counts (105 fixtures), stadium emitters and shadow-free hybrid architecture are unchanged. No city-wide rollout.

### Image index

Each night panel places Step 6 before Step 6.1; time panels show day, sunset, twilight and night. Floodlight panels compare OFF/TRAINING/MATCH before and after. All use fixed poses, 1400×1000, DPR 1, Europe/Stockholm on 2026-10-21. The seven poses include the six original pilot views and a bridge-end close view. Metadata preserves camera and renderer diagnostics. Panels only crop UI, resize and add labels.

| Area | Night comparison | Time of day | Floodlights |
|---|---|---|---|
| Kungsgatan street | [Night](evidence/kungsgatan-street-night.jpg) | [Times](evidence/kungsgatan-street-times.jpg) | |
| Kungsgatan elevated | [Night](evidence/kungsgatan-elevated-night.jpg) | [Times](evidence/kungsgatan-elevated-times.jpg) | |
| Bridge north end | [Night](evidence/bergsbron-north-end-night.jpg) | [Times](evidence/bergsbron-north-end-times.jpg) | |
| Strömparken path | [Night](evidence/stromparken-path-night.jpg) | [Times](evidence/stromparken-path-times.jpg) | |
| Strömparken elevated | [Night](evidence/stromparken-elevated-night.jpg) | [Times](evidence/stromparken-elevated-times.jpg) | |
| Stadium pitch | [Night](evidence/stadium-pitch-north-night.jpg) | [Times](evidence/stadium-pitch-north-times.jpg) | [Modes](evidence/stadium-pitch-north-floodlights.jpg) |
| Stadium elevated | [Night](evidence/stadium-elevated-se-night.jpg) | [Times](evidence/stadium-elevated-se-times.jpg) | [Modes](evidence/stadium-elevated-se-floodlights.jpg) |

## Bridge diagnosis

The pictured Kungsgatan bridge is **Bergsbron** in the bundled data (called Kungsbron in the task). Rendered detail way `1212234767` overlays road way `26154805`. Inspection covered importer road classification/one-way flags, transport edges, bridge profiles, rendered road positions, RoadTraffic route generation/views, frontend interpolation and pilot overrides. There is no geometry/network disconnection, bridge snapping error or special pilot routing override.

| Location | OSM node | Network index | SWEREF 99 TM E / N (m) |
|---|---|---|---|
| South bridge end | 286409009 | 4902 | 568480.912625 / 6494919.123877 |
| North bridge end | 286409016 | 4903 | 568512.876703 / 6495020.614197 |
| Bredgatan junction | 1108233121 | 27944 | 568514.651097 / 6495045.155811 |

Northbound bridge edge `8175` connects 4902 → 4903; reverse edge is `8176`. Onward edge `8177`, way `26154806`, connects to OSM node `120452` (index 4904). It is a `living_street`, excluded by the existing truck/bus simulation policy, whereas the bridge admits those classes. This is the simulator's policy, not a claim about legal access on today's street.

The old allowed-edge pruning removed only nodes without any directed exit. A pair of reciprocal bridge edges therefore looked usable even when a vehicle class could only reverse at its far end. Runtime `fillPath` then used its reverse fallback. Actual baseline traces identified **trucks**, while ordinary cars already continued north. Changing steering or inventing another bridge connection would not fix this cause.

**Fix:** `throughRoadEdges` precomputes permitted edges per vehicle policy. It prunes policy-cut branches whose only remaining destination is the arrival node, propagating unavailable exits upstream. Destination counts handle parallel ways correctly. Genuine mapped cul-de-sacs keep their existing turnarounds; closed tiny networks retain the existing fallback. The algorithm is O(nodes + edges), with no new graph traversal during ticks. No OSM IDs or geographic exceptions are hardcoded.

This also affects other policy boundaries. Compared with the old filter it removes another 11 compact-car, 125 truck and 979 bus edges. Examples include route 51 way `318001968`, Gustaf Janzéns gata way `26734855` and Platinagatan way `4384905`. Mapwide regression coverage checks onward connectivity or a genuine mapped road end, and preserves Ståthögavägen underpass edges. Shared network, terrain and bridge-profile files remain byte-identical; [network diagnostics and hashes](measurements/network.json).

## Live traffic evidence

Real browser SSE runs used 1000 vehicles (600 compact, 170 estate, 150 trucks, 80 buses), speed 20, without injecting routes or vehicles. The trace analyzer separates an immediate on-deck reversal from a later return after leaving the bridge. Counts are unique vehicle IDs, not comparable throughput rates; the changed allowed edges alter random spawning/routes and observation durations differ.

| Observation | Before | Final fix |
|---|---:|---:|
| Simulated time interval (s) | 8–2316 | 6–2452 |
| Artificial bridge-end reversals | 13 trucks | 0 |
| Cars observed continuing beyond north junction | 15 | 9 |
| Restricted-class northbound entries | 14 | 0 |

[Before trace summary](measurements/traffic-before.json) and [after trace summary](measurements/traffic-after.json) include positions, headings and timestamps. [Before browser capture](evidence/traffic-before.png) and [after browser capture](evidence/traffic-after.png) accompany them. Screenshots illustrate the scene; the timed traces establish motion. Both runs recorded no browser exceptions. Trucks are kept off the branch they cannot exit; cars continue through the connected street network.

## Validation and limitations

- Frontend: **210 tests**, type check **0 errors / 0 warnings**, production build passed. Existing large-chunk build warning remains.
- Backend: **49 tests across 14 suites**, including six new routing regressions, passed on the final routing implementation.
- Browser: **five E2E tests** passed against the final backend, including live bridge continuation, lighting controls, WebGL restoration, road traffic commands/following and transit. Both lighting/WebGL tests passed again after the final shader simplification; all 32 final captures completed without browser exceptions. Six daylight views are pixel-identical; the seventh has a negligible mean channel difference of 0.0000057/255.
- [Performance measurements](performance.md) compare the preserved Step 6 baseline with this pass, including earlier measurements rather than hiding them.

Approximate surface photometry/occlusion and the existing pale jagged Kungsgatan road-depth overlap remain. This pass deliberately does not alter terrain, road/rail geometry, geographic frame, stadium geometry or import access policies. Browser timing is a local measurement, not a guarantee across devices. Full-resolution captures and complete raw SSE traces remain under ignored `work/step61`; portable panels and extracted traces are included here.

## Exact Step 6.1 file inventory

UI production/test edits relative to saved Step 6: `src/lib/lighting/cityLights.ts`, `fixtures.ts`, `reference.ts`, `lighting.test.ts` (all in that lighting directory). New browser regression: `tests/bridge-traffic.spec.ts`. New evidence utilities: `scripts/step61/{capture.mjs,measure.mjs,traffic.mjs,analyze-traffic.mjs,package-evidence.py,benchmark-traffic.ps1,TrafficBenchmark.kt}`. Reports: `docs/step61/**`, plus the newest entry in `docs/claude-progress.md`. Other existing modified/untracked Step 6 files and `.vscode/` predate this pass.

Backend: modified `src/main/kotlin/com/norrkoping/simulator/CityTransport.kt`; added `src/main/kotlin/com/norrkoping/simulator/RoadRouting.kt` and `src/test/kotlin/com/norrkoping/simulator/RoadRoutingTest.kt`.

Reproduction: run the normal frontend check/test/build and backend Gradle tests. Start the backend on 8091 and frontend on 5185 with its API proxy, then run `E2E_BASE_URL=http://127.0.0.1:5185 npx playwright test` (set the environment variable using the local shell). Capture and traffic scripts take an output directory. Performance uses production previews on 5186 (saved Step 6) and 5187 (final build); benchmark PowerShell generates temporary sources only under backend `build/`.
