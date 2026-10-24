# Step 6.1b — bus reachability without traffic reversals

2026-10-24. Implemented for review on branch `step61b-bus-reachability` in both repositories. Nothing has been committed or pushed. Starting points: UI `1cdf45f`, backend `39a9709`. These are the Step 6.2 commits on `main`; the Step 6.2 handoff named `bd13495` / `c3d9860`, which were one commit older. Both trees were clean and matched their `origin/main` tracking refs.

## Outcome

- **Skvallertorget is reachable again in both directions.** Route 21's corridor through Skvallertorget and across Bergsbron is traversable along its own mapped ways.
- **Bergsbron's truck fix still holds.** In the live and deterministic traffic runs: 0 truck entries onto the trap, 0 artificial reversals of any vehicle class, cars cross normally.
- **The Step 6.1 removal of 979 bus edges is fully classified.**
  - 293 edges restored and usable: 8 on the verified route 21 corridor, 285 approaching mapped turning circles.
  - 2 edges retained inside an island no bus can reach.
  - 643 correctly excluded: 523 forced-turnaround dead ends and 120 bus-only islands.
  - 22 uncertain, and not granted.
- **The seven "lost bus ends" are islands.** No bus can reach them, or leave them, without using a road closed to buses. Removing them was correct.
- **Cars and trucks are unaffected.** Their allowed edge sets are identical before and after.

## 1. Root causes

1. **Importer access heuristic.** The importer computes `bus = truck || highway ∈ {tertiary, tertiary_link, unclassified, residential}`. It ignores explicit OSM `bus`/`psv` tags and closes every `living_street` and `service` road to buses. Route 21 passes through four `living_street` Kungsgatan ways between Bergsbron and Skvallertorget (`26154806`, `1050773509`, `444474485`, `1212234765`).
   - In the current OSM data, none of these four ways has a bus, psv or access restriction (`maxspeed=walk`, `hazmat=no`).
   - A Swedish *gångfartsområde* (living street) allows motor vehicles at walking pace.
   - The exclusion is a simulator heuristic, not a legal restriction.
2. **Step 6.1 made the heuristic visible.** Under the old e143535 filter, buses reached Skvallertorget only by entering from the north and making an artificial U-turn at the living-street boundary. Step 6.1 correctly removed such forced reversals. As a result, the Kungsgatan stretch with the Skvallertorget stops became exit-only for buses, and the bridge's northbound edge became truck-like for them.
3. **Algorithm gap: turnaround facilities.** `throughRoadEdges` treated a node as a legitimate end only when the full graph had no other target from it. A mapped `highway=turning_circle` with a driveway or `service` road beyond it therefore counted as a policy boundary, and the approach to the circle was pruned. This affected 30 turning circles on bus roads, including Platinagatan and the Klockaretorpet streets around the Klockaretorpets centrum stop.

The pruning itself was correct. Two inputs were wrong: the bus *access* data, and what counts as a legitimate *terminus*.

## 2. Skvallertorget diagnosis

| Item | Value |
|---|---|
| Stop positions | OSM `3183225928` (southbound, graph node 17472, E/N 568506.8 / 6495071.2) and `2873168580` (northbound, node 17473, 568502.9 / 6495084.7), both on Kungsgatan way `118180748` (`secondary`, bus-permitted) |
| Southern approach | Bergsbron `26154805` (nodes `286409009` → `286409016`), then the four `living_street` ways listed above to `11231112376` |
| Step 6.1 state | Edges `31449` (`3183225928→11231112376`), `31451`, `39532` and the bridge's northbound edge were pruned for buses: southbound buses would have had to reverse at the living-street boundary. Stop `3183225928` was outside the main bus network (largest strongly connected component). Stop `2873168580` was reachable only by a bus spawning in that stretch. |
| Step 6.1b | Both stops are in the main bus network. Graph paths run bridge south end → `3183225928` and `2873168580` → bridge south end with no reversal (`BusReachabilityTest`). |

## 3. Route 21: verification and simulator support

- **Operator data:** [transit.land route 21](https://www.transit.land/routes/r-u67t24-21), checked 2026-10-24. Stops: Norrköping Centralstation, Norr Tull, Bråddgatan, Skvallertorget, Väster Tull, Söder Tull. Step 6.2 also checked the [Östgötatrafiken line index](https://www.ostgotatrafiken.se/Tidtabeller/) on 2026-10-23.
- **OSM relations:** `14025631` (Resecentrum → Söder Tull, v3) and `14025630` (reverse, v4), both edited 2023-10-01. Their stop names and order match the current feed. Ordered members are in [route21.json](evidence/route21.json).
- **Simulator model:** buses are **generic roaming traffic** in `RoadTraffic`. There is no scheduled bus service; the only designated paths are tram 2/3 and Pendeln. This step does not invent a route-21 vehicle. It only makes the corridor's roads and stops available to buses.
- **Supported:** 4 of the 6 stops (Norr Tull, Bråddgatan, Skvallertorget, Väster Tull) are graph nodes. All 6 legs between them (3 per direction) are traversable **using only the relation's own ways**. The Skvallertorget ↔ Väster Tull legs cross Bergsbron and the gångfartsområde. With Step 6.1 policy those legs had no path.
- **Missing dependencies (documented, not invented):**
  - *Resecentrum terminal approach:* ways `297690892` / `286505037` are `access=no` + `bus=yes` service ways on tram track. The importer drops `access=no` ways, so they aren't in the graph.
  - *Söder Tull terminal approach:* five Drottninggatan `residential` ways. The importer excludes every way named Drottninggatan.
  - The Resecentrum and Söder Tull stop positions are not graph nodes (nearest network nodes 12–30 m away).
  - A test fails if any of these ways later appears in the graph, as a reminder to extend coverage.

## 4. The seven Step 6.2 bus-end approaches

Each lost edge ends at a full-graph dead end on a short residential/unclassified stub. Every stub's only links to the rest of the network are `service` roads closed to buses. None of these connectors has a bus/psv tag (one is `service=driveway`), none is a bus-relation member, and none of the stubs has a bus stop. Seed and causal-chain IDs from Step 6.2 are in its [routing-causes.json](../step62/evidence/routing-causes.json).

| Lost edge / way | Name | End node, E/N (m) | Connector(s) | Classification |
|---|---|---|---|---|
| 1293 / `4498925` | Navestadsgatan | `1077432785`, 570789.4 / 6492010.1 | service `449064412`, `415363780`, `4498924` | Correctly excluded: bus island (24 edges) |
| 16369 / `89884762` | Blåeldsvägen | `1041816796`, 570165.4 / 6491137.0 | driveway `1111771303` | Bus island; now retained because it ends at turning circle `1041816752`, but unreachable from the main bus network and too short to spawn on |
| 17538 / `91258086` | (unnamed residential) | `1059358122`, 569103.6 / 6499303.6 | service `91258087` | Correctly excluded: bus island (48 edges) |
| 58562 / `954899965` | (unclassified bridge) | `8838468150`, 570951.8 / 6498678.9 | service `93320320` | Correctly excluded: bus island |
| 61935 / `1050223617` | (unnamed residential) | `9651310537`, 571225.6 / 6491646.1 | service `145173981` | Correctly excluded: bus island |
| 63097 / `1059584521` | (unclassified) | `9735083202`, 568709.3 / 6496821.8 | service `94953983` | Correctly excluded: bus island |
| 67625 / `1115174620` | (unclassified) | `10199175827`, 568247.6 / 6501099.5 | service `95557922` | Correctly excluded: bus island |

- **Verdict:** buses should not reach these ends under the access evidence available. Before Step 6.1, a bus could only be there by spawning there, then shuttling back and forth with artificial U-turns at the service-road boundary.
- **Smallest correct restoration:** none, unless operator evidence shows a service using a connector. In that case, add a `verified-service` record for the connector.
- **Regression test:** `the seven Step 6_2 bus-end approaches are unreachable without forbidden roads`.

### Other named boundaries

- **Road 51** (`318001968`, `primary`): 3 of 6 directed edges retained for every policy, unchanged. The cause is the map-clip terminal about 23 m from the edge of the map (Step 6.2). This is road 51, not bus service 51.
- **Gustaf Janzéns gata** (`26734855`, `secondary`): all 14 edges kept for buses and cars. Trucks keep 7 of 14 (a truck-policy stub), unchanged.
- **Platinagatan** (`4384905`): bus edges went from 17 of 34 (Step 6.1) to 34 of 34. It ends at turning circle `1182562537`, with service road `102405077` beyond it.

## 5. Policy model

| Concept | Representation |
|---|---|
| Edge traversal permission | Importer `truck` / `bus` flags, with the bus flag corrected per way by [`road-access.json`](../../../norrkoping-simulator-backend/src/main/resources/road-access.json) (`policyEdges`) |
| Restricted vehicle class | Unchanged truck rule (major roads, not `hgv=no`/`destination`). The record contains no truck or car entries. |
| Designated public-transport corridor | `verified-service` record: a member of an OSM bus relation for a service verified against current operator data, with tags that don't prohibit buses. Today this is route 21 only (4 ways). |
| Explicit legal permission | `osm-tag` record: `bus`/`psv` = `yes`/`designated`/`permissive` (2 ways: `391478867` `psv=yes`, `1313592331` `bus=designated`). `osm-tag-deny` supports `bus=no`; 0 such ways exist in the graph. |
| Through-route eligibility | `throughRoadEdges`, unchanged algorithm, O(nodes + edges), once per policy at startup |
| Legitimate terminus / turnaround facility | Full-graph road end, **or** a mapped `turning_circle`/`turning_loop` node (249 graph nodes, from a dated OSM extract) |
| Policy-created dead end | Still pruned and propagated back to the junction |
| Invalid immediate reverse | Never retained. `fillPath`'s existing fallback can reverse only at a legitimate terminus; the invariant test enforces this for all four classes. |
| Destination access | Roaming vehicles have no destinations. Bus stops are dwell points on retained edges. `hgv=destination` stays excluded for roaming trucks. |

- **Generation:** the record is produced by [`build-road-access.mjs`](../../scripts/step61b/build-road-access.mjs) from dated Overpass extracts (OSM base 2026-10-24T08:51:51Z for access, 09:02:06Z for turning facilities).
- **Provenance per record:** OSM version, timestamp, relevant tags, relation IDs and the operator evidence.
- **Unverified ways:** 13 ways whose only evidence is relation membership are listed under `unverifiedRelationWays` and are **not** granted.
- **No site-specific exceptions:** no OSM IDs are hardcoded in routing code. Changing the granted set needs new evidence; a test pins it.

## 6. Network reachability, before and after

- "Main" means the largest strongly connected component: nodes a vehicle can both reach and leave.
- "Legacy" means the e143535 filter, which still permitted policy U-turns.

| Policy | Candidates | Retained: legacy / 6.1 / **6.1b** | Removed vs legacy | Main-network nodes: 6.1 → 6.1b | Bus-stop nodes in main: legacy / 6.1 / **6.1b** |
|---|---:|---:|---:|---:|---:|
| Compact/estate | 73,332 | 73,142 / 73,131 / **73,131** | 11 → 11 | 37,104 → 37,104 | 260 / 260 / **260** |
| Truck | 6,424 | 5,932 / 5,807 / **5,807** | 125 → 125 | 4,379 → 4,379 | (diagnostic only) |
| Bus | 43,987 → **44,017** | 43,813 / 42,834 / **43,157** | 979 → **684** | 22,812 → **23,118** | 251 / 245 / **249** |

Of the 262 stop nodes, the 13 outside the main bus network after 6.1b are pinned by a test:

- **Slåttergatan stop positions B and D** (`2920494853`, `13228582396`): the onward road is `living_street` `284799165` / `service` roads, and no relation or operator evidence covers it. These were in the legacy main network only via artificial U-turns.
- **11 stops with no bus-permitted road at all.** These are relation-only `service` ways or bus-only ways missing from the graph: Söder Tull (2), Resecentrum, Loddbyvägen (2), Skälvs gård (2), Brandtorp, Norrledens vändplats, Löts vägkors, Norrköpings flygplats.

**Classification of the 979 bus edges Step 6.1 removed** ([full report](evidence/removed-bus-edges.json); the script's parity with the Kotlin retained counts is checked):

| Classification | Regions | Edges | Restored | Examples |
|---|---:|---:|---:|---|
| Legitimate public-transport access (route 21) | 2 | 8 | 8 | Kungsgatan bridge approach; Skvallertorget stretch |
| Incorrectly excluded by the algorithm (turnaround facility) | 27 | 306 | 285 | Platinagatan, Klingagatan, Axel Swartlings gata, Klockaretorpet (Emil Hedelius / Moa Martinsons / Hjalmar Lundgrens / Mathilda Jungstedts gata, 60/64), Kantorsgatan |
| Correctly excluded: forced-turnaround dead end | 69 | 523 | 0 | Mässingsgatan, Laxholmsbron/Källvindsgatan, Bryggaregatan, Tunnbindaregatan, Rälsgatan (onward roads are bus-closed `service`/`living_street`, or one-way topology) |
| Correctly excluded: bus island | 9 | 120 | 2* | The seven ends above, plus two unnamed fragments |
| Uncertain | 2 | 22 | 0 | Slåttergatan (stops B/D); S:t Persgatan (ways `99952393`/`315670216` in relations for 70–75, Campusbussen and 141; onward `service` ways unverified) |

\* Blåeldsvägen: retained but unreachable.

Twenty-eight retained edges were not in the legacy set. All come from the 30 newly permitted edges on the 4 route 21 `living_street` ways and the 2 explicit-tag ways. The 979 → 684 total also includes 21 edges in partially restored turnaround regions that remain pruned.

## 7. Bergsbron regression results

- **Truck graph:** the northbound bridge edge is a physical candidate but excluded from the through set. The southbound edge is retained. No retained truck edge forces a reversal.
- **Bus and car graphs:** both bridge directions are retained. A non-reversing path runs from the bridge south end to Skvallertorget and back.
- **Cars:** the existing Step 6.1 test still passes: cars go north through Skvallertorget along the named node chain.
- **Underpasses:** the Ståthögavägen underpass ways (`39445117`, `89615815`) still carry cars.
- **Synthetic tests:** parallel-way, one-way and turnaround-facility fixtures pass.

## 8. Live traffic evidence

**Deterministic in-process run.** `Step61bTrafficEvidenceTest`: 1,000 vehicles (600 compact, 170 estate, 150 truck, 80 bus), seed 1309, 3,600 simulated seconds, every edge transition traced. Both orders give identical behaviour counts ([run](measurements/traffic-evidence.json), [reversed order](measurements/traffic-evidence-reversed.json)).

| Measure | Step 6.1 | **Step 6.1b** |
|---|---:|---:|
| Artificial reversals (any class) | 0 | **0** |
| Reversals at mapped road ends / turning facilities (bus) | 1,235 / – | 1,311 / 55 |
| Transitions onto edges outside the policy | 0 | 0 |
| Truck entries onto the Bergsbron trap | 0 | **0** |
| Car northbound bridge entries | 27 | 20 |
| Bus bridge entries, northbound / southbound | 0 / 0 | **3 / 1** |
| Bus trips through the gångfartsområde, north / south | 0 / 0 | **12 / 4** |
| Skvallertorget dwells | 0 | **10** |
| Klockaretorpets centrum dwells | 0 | **6** |
| Bus dwell episodes / distinct stop names | 1,176 / 121 | 1,256 / 123 |
| Distinct edges visited (bus / truck) | 32,614 / 5,490 | 33,401 / 5,490 |

**Browser run.** Real Ktor server through Vite dev on 5185, SSE, `scripts/step61/traffic.mjs`, same mix, speed 20, 150 s wall time (about 12–3,050 simulated seconds). Analysed with the policy-aware [`analyze-traffic.mjs`](../../scripts/step61b/analyze-traffic.mjs). Before = committed `main` backend; after = this branch. ([before](measurements/live-traffic-before.json), [after](measurements/live-traffic-after.json))

| Measure | Before | After |
|---|---:|---:|
| Bergsbron on-deck reversals | 0 | 0 |
| Truck northbound entries | 0 | 0 |
| Bus northbound entries → bus crossings | 0 → 0 | **1 → 1** |
| Car crossings beyond the north junction | 10 | 18 |
| Browser exceptions | 0 | 0 |

Different allowed sets change random spawns, so counts are behaviour evidence, not paired throughput. The positive bus results come from buses actually using the corridor, not from buses staying away from it.

## 9. Test results

- **Backend:** 60 tests in 17 suites, all passing (`gradlew test`). The Step 6.2 baseline was 50 tests. New this step:
  - 9 geographic and synthetic `BusReachabilityTest` cases: access-record pinning, Skvallertorget, route 21 legs, Bergsbron, the all-class reversal invariant, turning circles, the seven islands, documented stop coverage, and the turnaround fixture.
  - The opt-in traffic-evidence test.
  - `RoadRoutingTest`'s Bergsbron test now covers trucks only; buses are covered in the new suite.
  - `Step62RoutingAuditTest` is unchanged and passing; it audits raw importer flags.
- **Frontend:**
  - `svelte-check`: 0 errors / 0 warnings. Production build passed.
  - Vitest: 209 of 210 in the full parallel run. `infrastructure.test.ts › never draws an at-grade running surface below the terrain` timed out (7.8–9.5 s against a 5 s limit) twice. That file passes alone (16/16). This step changed no `src/` code and no unit tests, so it is load-dependent timing, not a regression.
- **Playwright** (dev server 5185 with a backend on 8091 and `ALLOWED_ORIGIN=http://127.0.0.1:5185`): 4 of 5 pass.
  - Passing: the updated Bergsbron live test, both lighting tests, and transit.
  - Failing: `simulation.spec.ts` at line 36. The second tab's `.sim-metrics` was not found within 5 s. **It fails identically against the committed baseline backend**, so it is unrelated to routing.
  - Against `vite preview`, the lighting tests also fail, because they rely on dev-only hooks.
- **Shared data:** `transport-network.json` (UI and backend), `terrain.json` and `bridge-profiles.json` are byte-identical to `HEAD` (transport-network SHA-256 `faf6c04c…`).

## 10. Performance impact

Measured with JDK 25, in-process, alternating order with warm-up. Medians of 7 rounds after 2 warm-up rounds.

| Measure | Run 1: before / after | Run 2 (reversed): before / after |
|---|---:|---:|
| Policy computation, all classes (ms) | 22.1 / 19.9 | 24.0 / 32.6 |
| `RoadTraffic` construction (ms) | 23.5 / 18.4 | 42.1 / 30.5 |
| Tick, 1,000 vehicles, after warm-up (ms) | 1.109 / 1.227 | 1.365 / 1.398 |

- **Startup:** no systematic change. Differences flip sign between runs and fall within machine noise. The work is still O(nodes + edges) once per policy at startup, plus a one-time parse of a 44 KB resource (6 records, 249 turnaround nodes).
- **Tick cost:** the per-tick lookup is unchanged (`HashSet` membership). The +0.03 to +0.12 ms tick differences come with different traffic states (more stops served, more dwells), not added routing work.
- **Memory:** the bus allowed set grows by 323 edge IDs.
- **Frontend:** no runtime code or data changed, so startup, frame time and network memory are unaffected.

## 11. Remaining uncertainties

- **Other bus services:** 70–75, Campusbussen, 141, 10, 129/123, 429, 440, 420 and Flixbus use 13 graph `service` ways that are evidenced only by OSM relations. They are not granted. Resolution: obtain dated Östgötatrafiken GTFS shapes (Trafiklab) and add `verified-service` records.
- **Bus-only ways missing from the graph (65 relation ways):**
  - Which: `access=no` + `bus=designated`/`yes`, and `psv=yes` with `motor_vehicle=no`, at Resecentrum, Söder Tull, Drottninggatan, Östra Promenaden and the Nygatan bus gate.
  - Why missing: the importer drops them, and Drottninggatan is excluded by name.
  - Fix: a future re-import should emit them as bus-only edges. That is a graph topology change and out of scope here.
- **Slåttergatan B/D and S:t Persgatan:** need operator shapes to decide.
- **Turning-circle geometry:** mapped turning circles are treated as legitimate turnarounds without modelling their diameter. Roaming buses already reversed at ordinary mapped road ends in Step 6.1.
- **Speed in the gångfartsområde:** `maxspeed=walk` does not parse in the importer, so the living street uses the 30 km/h default. Speed and geometry were deliberately not changed.
- **Latent importer coupling:** bus access is derived from the truck flag, so `hgv=no` on a major road would also block buses. There are 0 instances in this snapshot.
- **Data dates:** the access and turning extracts are dated 2026-10-24; the graph snapshot is 2026-10-16. Recorded way versions allow the record to be re-checked.
- **Route 21 currency:** the OSM relation was last edited in 2023. Its stop sequence matches today's feed, but the exact current shape has not been verified against GTFS.

## 12. Files changed

**Backend** (branch `step61b-bus-reachability`, uncommitted):
- Modified:
  - `src/main/kotlin/com/norrkoping/simulator/RoadRouting.kt`: `AccessRecord`, `Turnaround`, `RoadAccess`, `policyEdges`, the `terminals` parameter of `throughRoadEdges`, `roadPolicies`.
  - `src/main/kotlin/com/norrkoping/simulator/CityTransport.kt`: `RoadTraffic` takes `access` (default bundled), uses `roadPolicies`, and gains internal diagnostics `allowedEdges` / `edgeStates`.
  - `src/test/kotlin/com/norrkoping/simulator/RoadRoutingTest.kt`: the Bergsbron test is now truck-only.
- Added:
  - `src/main/resources/road-access.json`
  - `src/test/kotlin/com/norrkoping/simulator/BusReachabilityTest.kt`
  - `src/test/kotlin/com/norrkoping/simulator/Step61bTrafficEvidenceTest.kt`
  - `src/test/kotlin/com/norrkoping/simulator/RoutingGraphs.kt`
  - `src/test/resources/step61b/route21.json`

**UI** (branch `step61b-bus-reachability`, uncommitted):
- Modified: `tests/bridge-traffic.spec.ts` (policy-aware analyzer: trucks forbidden; buses allowed but must leave north).
- Added scripts under `scripts/step61b/`:
  - `fetch-osm-access.mjs`, `fetch-osm-turning.mjs`, `fetch-osm-ways.mjs` (read-only, dated)
  - `build-road-access.mjs`, `export-route21.mjs`, `classify-removed.mjs`, `package-evidence.mjs`, `analyze-traffic.mjs`
- Added docs: `docs/step61b/**`; the newest entry in `docs/claude-progress.md`.
- Raw extracts and traces stay under ignored `work/step61b/`.

**Not changed:** terrain, road, rail and bridge geometry; Lantmäteriet data; SWEREF 99 TM / RH2000 contracts; lighting; stadium modes; the Step 6.2 datasets; the frontend `src/`.

### Reproduce

```text
node scripts/step61b/fetch-osm-access.mjs; node scripts/step61b/fetch-osm-turning.mjs
node scripts/step61b/fetch-osm-ways.mjs <ids from build/evidence>   # optional tag spot checks
node scripts/step61b/build-road-access.mjs; node scripts/step61b/export-route21.mjs
backend: gradlew test        (STEP61B_EVIDENCE=<json> [STEP61B_SECONDS, STEP61B_REVERSE] for the traffic evidence)
node scripts/step61b/classify-removed.mjs docs/step61b/measurements/traffic-evidence.json
```
