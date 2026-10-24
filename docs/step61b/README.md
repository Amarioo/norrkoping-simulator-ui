# Step 6.1b — bus reachability without traffic reversals

- **Step 6.1b:** implemented 2026-10-24 and committed locally on branch `step61b-bus-reachability` in both repositories: UI `650c071`, backend `3da6528`. Not pushed.
- **Review follow-up:** done the same day and committed as the next commit on the same branch in both repositories (see [Git status](#git-status)). Not pushed.
- **Status:** accepted as a bounded routing correction (2026-10-24). This does **not** implement scheduled route 21 service.
- **Starting points:** UI `1cdf45f` and backend `39a9709`, the Step 6.2 commits on `main`.

## Review follow-up (2026-10-24)

| Review finding | Resolution |
|---|---|
| The browser test could pass with no bus at all: it accepted 0 bus crossings ≥ 0 bus entries, and only car crossings ended the test. | The analyzer now tracks **one episode per northbound entry per vehicle**, resolved only by that same vehicle. Acceptance needs at least 1 bus that is observed entering the deck and crossing north of the Bredgatan junction, with no reversal. Window edges are explicit: entries already on the deck in the first frame are `startedBeforeWindow`, and unresolved entries at the end are `openAtWindowEnd`. The test uses a controlled, deterministic scenario (below). Seven analyzer unit tests cover: no bus fails, a valid crossing passes, a reversal fails, another bus can't satisfy an entry, open-at-end, a junction exit, and a truck entry. Against the Step 6.1 baseline backend the browser test now **fails** (`bus crossings 0 < 1`). |
| `Step61bTrafficEvidenceTest` returned success without running, and asserted nothing when it did run. | New **default** test `Step61bTrafficRegressionTest` (about 15–18 s) replays the live service deterministically and asserts every acceptance criterion, with per-vehicle diagnostics. The long run is still opt-in, now reports **skipped** (not passed) by default, and **asserts** the criteria for Step 6.1b. It also asserts the reproduced Step 6.1 regression, proving the checks can fail. |
| Edge sampling was unsound: the old evidence sampled each vehicle's edge once per tick and could skip short edges, about 0.02% of transitions (307–325 per 3,600 s run). | A minimal internal hook, `RoadTraffic.transitionListener`, reports every edge change. Default `null`; no behaviour change. All reversal, policy and episode checks now use exact transitions. |
| "Correctly excluded" was inferred from the simulator's own bus heuristic. | Reclassified on two separate axes: *simulator topology* and *real-world access evidence*. All 96 blocking roads were checked against current OSM tags: the 95 behind the 684 filtered-out edges, plus the 1 that isolates the 2 retained-but-unreachable edges. **None** has an explicit bus prohibition or a dimension or weight limit. The former 643 "correctly excluded" edges now fall under *real-world access unresolved* (682 edges in that evidence category, including the 2 retained-but-unreachable ones) or *graph topology* (4). That includes the seven bus ends. |
| Route 21 corridor described as "verified". | Corrected. The **service** and its **stop sequence** are operator-verified. The **corridor geometry** comes from a 2023 OSM relation and is *not* operator-verified. |
| New defect found during verification: the position-based analyzer flagged a car that exited onto Bredgatan and later returned south as `turnedBack`. | A new `exitedAtJunction` outcome counts as a normal car passage, but not as a northbound crossing. The same fix went into the Kotlin trace. A unit test reproduces the live trace of estate #197. This was **not** a routing defect: the car turned at Bredgatan's mapped road end (node `1030157213`), its legitimate terminal behaviour since Step 6. |

**Production code changed in this follow-up:** only the internal transition hook (two lines in `CityTransport.kt`). It was needed because sampled tracing can't prove "zero artificial reversals". Routing behaviour, access data and the pruning algorithm are unchanged.

## Outcome

- **Skvallertorget** is reachable by bus in both directions, and buses **actually** use the restored corridor:
  - Default backend replay: bus #359 enters Bergsbron northbound at t=670.2 s and continues north at 682.6 s.
  - Live browser run: the same bus enters at about 672 s and crosses at about 684 s, tracked in 7 samples from the deck to beyond the junction.
  - Opt-in 3,600 s run: bus #996 crosses at 2,449.8–2,462.2 s and serves Skvallertorget.
- **Bergsbron's truck fix holds.** Across every traced transition there are 0 truck entries onto the northbound trap, 0 transitions outside a vehicle's policy and 0 artificial reversals of any class.
- **Cars continue normally**, both north on Kungsgatan and onto Bredgatan. Reversals happen only at mapped road ends or turning facilities.
- **Simulator status of the 979 bus edges Step 6.1 removed:**
  - **293 restored and usable.**
  - **684 still filtered out:** 566 dead ends where entering would force a reversal, and 118 islands.
  - **2 retained but unreachable** (the Blåeldsvägen island).
  - So 686 are not usable, but only 684 are filtered out.
- **Real-world access evidence for the same 979 edges** (a separate axis):
  - **8 verified access** (route 21 record).
  - **285 turnaround restorations** (branch ends at a mapped OSM turning facility).
  - **682 unresolved access:** 562 dead ends + 118 islands + 2 retained but unreachable. These are closed or isolated only by the simulator's class heuristic and stay closed for lack of operational evidence.
  - **4 graph topology:** dead ends at the map clip or a one-way terminal.
  - **0 verified restrictions.**
- **Cars and trucks:** their allowed edge sets are identical before and after.

## 1. Root causes

1. **Importer access heuristic.** The importer computes `bus = truck || highway ∈ {tertiary, tertiary_link, unclassified, residential}`. It ignores explicit OSM `bus`/`psv` tags and closes every `living_street` and `service` road to buses. Route 21 passes through four `living_street` Kungsgatan ways between Bergsbron and Skvallertorget (`26154806`, `1050773509`, `444474485`, `1212234765`).
   - In the current OSM data, none of these four ways has a bus, psv or access restriction (`maxspeed=walk`, `hazmat=no`).
   - A Swedish *gångfartsområde* (living street) allows motor vehicles at walking pace.
   - The exclusion is a simulator heuristic, not a legal restriction.
2. **Step 6.1 made the heuristic visible.** Under the old e143535 filter, buses reached Skvallertorget only by entering from the north and making an artificial U-turn at the living-street boundary. Step 6.1 correctly removed such forced reversals. As a result, the Kungsgatan stretch with the Skvallertorget stops became exit-only for buses.
3. **Algorithm gap: turnaround facilities.** `throughRoadEdges` treated a node as a legitimate end only when the full graph had no other target from it. A mapped `highway=turning_circle` with a driveway or `service` road beyond it therefore counted as a policy boundary, and its approach was pruned. This affected 30 turning circles on bus roads, including Platinagatan and the Klockaretorpet streets around the Klockaretorpets centrum stop.

## 2. Skvallertorget diagnosis

| Item | Value |
|---|---|
| Stop positions | OSM `3183225928` (southbound, graph node 17472, E/N 568506.8 / 6495071.2) and `2873168580` (northbound, node 17473, 568502.9 / 6495084.7), both on Kungsgatan way `118180748` (`secondary`, bus-permitted) |
| Southern approach | Bergsbron `26154805` (nodes `286409009` → `286409016`), then the four `living_street` ways to the Bredgatan junction `1108233121` and on to `11231112376` |
| Step 6.1 state | Edges `31449`, `31451`, `39532` and the bridge's northbound edge were pruned for buses. Stop `3183225928` was outside the main bus network (largest strongly connected component); `2873168580` was reachable only by a bus that spawned in that stretch. |
| Step 6.1b | Both stops are in the main bus network (`BusReachabilityTest`). Traced buses serve Skvallertorget in the default replay, the opt-in run and the live browser run. |

## 3. Route 21: what is verified and what is not

- **Verified against operator data:**
  - The service exists and serves, in order: Norrköping Centralstation/Resecentrum, Norr Tull, Bråddgatan, Skvallertorget, Väster Tull, Söder Tull.
  - Sources: [transit.land route 21](https://www.transit.land/routes/r-u67t24-21), checked 2026-10-24, and the [Östgötatrafiken line index](https://www.ostgotatrafiken.se/Tidtabeller/), checked 2026-10-23 in Step 6.2.
- **Not operator-verified: the corridor geometry.**
  - The ways come from OSM relations `14025631` (v3) and `14025630` (v4), last edited 2023-10-01. Their stop sequence matches the current feed, but **that does not prove today's route uses these exact ways.**
  - The access grant on the four `living_street` ways rests on two facts: (a) those ways carry no bus, psv or access restriction; and (b) the 2023 relation evidence of bus use.
  - It is recorded as `verified-service` in [`road-access.json`](../../../norrkoping-simulator-backend/src/main/resources/road-access.json), whose rule text and evidence state exactly this.
  - Remaining uncertainty: a dated GTFS shape would confirm the current geometry.
- **Simulator model:** buses are **generic roaming traffic**. There is no scheduled route 21 vehicle, and none was implemented. The roaming bus that crosses Bergsbron in the tests is a generic bus using a corridor that route 21 also uses.
- **Supported in the graph:** 4 of the 6 stops are graph nodes. All 6 legs between them (3 per direction) are traversable using only the relation's ways. The Skvallertorget ↔ Väster Tull legs had no path under Step 6.1 policy.
- **Missing dependencies (documented, not invented):**
  - *Resecentrum terminal approach:* `297690892` / `286505037`, `access=no` + `bus=yes`.
  - *Söder Tull approach:* five Drottninggatan ways. The importer drops `access=no` ways, and every way named Drottninggatan.
  - The Resecentrum and Söder Tull stop positions are not graph nodes.
  - A test flags these if they ever appear.

## 4. The seven Step 6.2 bus-end approaches (corrected)

Each lost edge ends at a full-graph dead end on a short residential or unclassified stub. Each stub's only links to the rest of the network are `service` roads that the simulator's heuristic closes to buses. Current OSM tags were checked for every connector: none has a bus, psv, access or motor_vehicle restriction, and none has a dimension or weight limit.

| Lost edge / way | Name | End node, E/N (m) | Blocking connector(s) | Simulator status | Real-world access |
|---|---|---|---|---|---|
| 1293 / `4498925` | Navestadsgatan | `1077432785`, 570789.4 / 6492010.1 | service `4498924`, `415363780` | Filtered out (island) | Unresolved |
| 16369 / `89884762` | Blåeldsvägen | `1041816796`, 570165.4 / 6491137.0 | `service=driveway` `1111771303` | Retained (turning circle `1041816752`) but unreachable | Unresolved |
| 17538 / `91258086` | — | `1059358122`, 569103.6 / 6499303.6 | service `91258087` | Filtered out (island) | Unresolved |
| 58562 / `954899965` | — | `8838468150`, 570951.8 / 6498678.9 | service `93320320` | Filtered out (island) | Unresolved |
| 61935 / `1050223617` | — | `9651310537`, 571225.6 / 6491646.1 | service `145173981` | Filtered out (island) | Unresolved |
| 63097 / `1059584521` | — | `9735083202`, 568709.3 / 6496821.8 | service `94953983` | Filtered out (island) | Unresolved |
| 67625 / `1115174620` | — | `10199175827`, 568247.6 / 6501099.5 | service `95557922` | Filtered out (island) | Unresolved |

**Retracted:** the earlier statement "removing them was correct" is not supported. What is established:
- Under the simulator's access policy, these stubs are islands. A roaming bus can only reach them by using a `service` road the policy closes. Before Step 6.1, a bus could be there only by spawning there and then shuttling with artificial U-turns.
- Whether real buses may or do use the connectors is **unknown**. Untagged `service` roads are not evidence of prohibition, nor of bus operation.

Access stays closed, conservatively. A connector should be opened only with operator or route evidence (a `verified-service` record) or an explicit `bus`/`psv` permission tag. The test `the seven Step 6_2 bus-end approaches are unreachable without forbidden roads` documents the topology, not the law.

### Other named boundaries

- **Road 51** (`318001968`, `primary`): 3 of 6 directed edges retained for every policy. This is **graph topology**: a full-graph directed terminal at the map clip. It is road 51, not bus service 51.
- **Gustaf Janzéns gata** (`26734855`): unchanged. Buses and cars keep all 14 edges; trucks keep 7.
- **Platinagatan** (`4384905`): bus edges went from 17 of 34 to 34 of 34, through turning circle `1182562537`.

## 5. Policy model (unchanged in the follow-up)

| Concept | Representation |
|---|---|
| Edge traversal permission | Importer `truck`/`bus` flags, with the bus flag corrected per way by [`road-access.json`](../../../norrkoping-simulator-backend/src/main/resources/road-access.json) (`policyEdges`) |
| Designated public-transport corridor | `verified-service` record. Currently route 21 only: 4 ways. Service verified; geometry from OSM, see section 3. |
| Explicit legal permission | `osm-tag` record: 2 ways, `391478867` (`psv=yes`) and `1313592331` (`bus=designated`). `osm-tag-deny` has 0 cases. |
| Through-route eligibility | `throughRoadEdges`, O(nodes + edges), once per policy at startup |
| Legitimate terminus | Full-graph road end, **or** a mapped `turning_circle`/`turning_loop` node (249 graph nodes) |
| Policy-created dead end | Pruned and propagated back to the junction |
| Invalid immediate reverse | Never retained. The `fillPath` fallback can reverse only at a legitimate terminus; this is verified both by an invariant and by exact runtime traces. |
| Destination access | Roaming vehicles have no destinations. `hgv=destination` stays excluded for roaming trucks. |

Relation-only evidence (13 `service` ways) is listed in `unverifiedRelationWays` and is **not** granted.

## 6. Reachability and corrected classification

"Main" means the largest strongly connected component of the policy's allowed edges.

| Policy | Retained: legacy / 6.1 / **6.1b** | Removed vs legacy | Main-network nodes: 6.1 → 6.1b | Bus-stop nodes in main: legacy / 6.1 / **6.1b** |
|---|---:|---:|---:|---:|
| Compact/estate | 73,142 / 73,131 / **73,131** | 11 → 11 | 37,104 → 37,104 | 260 / 260 / 260 |
| Truck | 5,932 / 5,807 / **5,807** | 125 → 125 | 4,379 → 4,379 | (diagnostic) |
| Bus | 43,813 / 42,834 / **43,157** | 979 → 684 | 22,812 → 23,118 | 251 / 245 / **249** |

**All 979 bus edges removed by Step 6.1, classified per edge** ([full per-region and per-edge audit](evidence/removed-bus-edges.json); the script's retained counts are checked against Kotlin):

| Real-world access evidence | Simulator status (Step 6.1b) | Edges | Regions |
|---|---|---:|---:|
| **Verified legitimate access:** route 21 record | Restored | 8 | 2 |
| **Mapped turnaround facility:** branch ends at an OSM turning circle; roads are importer bus classes with no known restriction; bus operation not verified | Restored | 285 | 27 |
| **Unresolved access:** blocked only by roads without an explicit restriction | Filtered out: dead end (entering forces a reversal) | 562 | 74* |
| Unresolved access | Filtered out: island | 118 | 8 |
| Unresolved access | Retained but unreachable (Blåeldsvägen; **not** filtered out) | 2 | 1 |
| **Graph topology:** full-graph directed terminal, independent of access | Filtered out: dead end | 4 | 2 |
| **Verified real-world bus restriction** | — | **0** | 0 |

\* Some regions contain both restored and filtered-out edges, so regions are counted per category.

**Simulator status totals:**
- Restored and usable: 293.
- Filtered out: 684 (566 dead ends + 118 islands). This matches the bus row's "979 → 684" above.
- Retained but unreachable: 2.
- Total 979.

The audit's `restoredByStep61b: 295` counts every retained edge (293 + 2).

**Evidence totals:** 8 verified access + 285 turnaround restorations + 682 unresolved access + 4 graph topology = 979.

**Definitions:**
- A **seed** is the node where the pruning cascade starts.
- Its **blocking roads** are its outgoing roads that the bus policy doesn't permit.
- A *verified restriction* would need one of:
  - `bus`/`psv` = `no`/`private`;
  - `access`/`motor_vehicle` = `no`/`private` with no bus or psv permission;
  - `maxweight` < 19 t, `maxwidth` < 2.6 m, `maxheight` < 3.4 m or `maxlength` < 12 m.

**Blocking roads: 96 tag-checked, from two sets.**
- **95 seed blocking roads.** These are the bus-closed roads leaving the 86 seed nodes of the 684 filtered-out edges. 84 seeds have blocking roads; the 2 graph-topology seeds have none.
- **1 island boundary road.** This is `service=driveway` `1111771303`, which isolates the 2 retained-but-unreachable Blåeldsvägen edges. It is not a seed road, because those edges are not pruned.
- Union: 96 (`blockingRoads.count` in the audit).
- Classes of the 96: 74 plain `service`, 10 `service=parking_aisle`, 3 `driveway`, 1 `alley`, and 8 `living_street`.
- **0** have an explicit restriction. One `service` way is tagged `access=permissive`, and one `motor_vehicle=yes`.
- `service` subtypes such as `parking_aisle` and `driveway` suggest these roads are not intended for buses, but they are **not legal prohibitions**.

**Uncertain stops:**
- **Slåttergatan B/D:** the onward road is `living_street` `284799165`.
- **S:t Persgatan:** relation ways for 70–75, Campusbussen and 141, with unverified `service` ways beyond.

Both stay inside "unresolved", with region detail in the audit file. The 13 bus-stop nodes outside the main bus network are pinned by `BusReachabilityTest`.

## 7. Bergsbron regression results

- **Static graph tests:**
  - The truck graph excludes the northbound bridge edge and retains the southbound one.
  - No retained edge of any class forces a reversal.
  - Bus and car graphs cross both ways without reversing.
  - Cars still pass through Skvallertorget along the named node chain.
  - The Ståthögavägen underpasses are retained.
- **Runtime:** exact traces with per-entry episodes (section 8). Bus entries must continue north toward Skvallertorget. Car entries must continue north or exit at the Bredgatan junction. Any reversal, turn-back or truck entry fails with the vehicle, edge or node, and the simulation time.

## 8. Traffic evidence

**Controlled scenario.**
- `Reset` builds a fresh `RoadTraffic` with fixed seed 1309, and `CitySimulationService.step` always sub-ticks in 0.05 s steps. Pausing only adds wall-clock gaps.
- So settings plus reset replays deterministically, and the Kotlin `TrafficTrace` mirrors the service's step arithmetic exactly.
- **Confirmation:** the earlier live run's bus (#996 at about 2,450 s) and this follow-up's live episodes (#120, #197, #359, #46) match the replay to within one 2 s snapshot.
- Shared scenario: 150 compact, 50 estate, 100 trucks, 80 buses, speed 20, chosen so a bus crosses early.

**Default backend replay** (`Step61bTrafficRegressionTest`, ends when every positive condition is met, about 1,180 simulated seconds):

| Vehicle | Bergsbron northbound entry | Outcome |
|---|---:|---|
| compact #120 | 133.2 s | continued north, 145.5 s |
| estate #197 | 587.5 s | exited at the junction onto Bredgatan, 599.8 s |
| **bus #359** | 670.2 s | **continued north, 682.6 s**; dwelt at Skvallertorget |
| compact #46 | 1,166.4 s | exited onto Bredgatan, 1,178.7 s |

Asserted invariants, with 0 occurrences of each: artificial reversals, transitions outside a vehicle's policy, truck entries, failed episodes.

**Live browser run** (current branch, Vite dev 5185 → Ktor 8091, Edge; [after](measurements/live-bridge-after.json)):
- **Passed** in 76 s wall time, covering 2–1,196 simulated seconds.
- Episodes: compact #120 crossed north (134 → 148 s); estate #197 exited onto Bredgatan (588 → 600 s); **bus #359 crossed north (672 → 684 s, 7 samples, entry observed inside the window)**; compact #46 exited onto Bredgatan (1,168 → 1,180 s).
- 0 truck entries, 0 reversals, 0 browser errors.

**Same browser test against the Step 6.1 baseline backend** (`39a9709`; [before](measurements/live-bridge-before.json)):
- **Fails** as intended after 1,620 simulated seconds.
- Pending: `bus crossings 0 < 1` and `car crossings north on Kungsgatan 0 < 1`.
- Car spawns differ under Step 6.1 policy; three cars exited onto Bredgatan.

**Opt-in 3,600 s run** (scenario 600/170/150/80 at speed 20; [traffic-evidence.json](measurements/traffic-evidence.json); all assertions passed):

| Measure | Step 6.1 | **Step 6.1b** |
|---|---:|---:|
| Transitions traced (hidden from per-tick sampling) | 1,479,993 (325) | 1,506,756 (307) |
| Artificial reversals, any class | 0 | **0** |
| Reversals at mapped road ends / turning facilities, bus | 1,287 / 0 | 1,478 / 83 |
| Transitions outside vehicle policy | 0 | 0 |
| Truck entries onto the Bergsbron trap | 0 | **0** |
| Bus crossings (episodes) | 0 | **1** (#996, 2,449.8 → 2,462.2 s; a second entry at 3,598 s is open at window end) |
| Bus way entries into the gångfartsområde, north / south | 0 / 0 | 4 / 4 |
| Buses serving Skvallertorget / Klockaretorpets centrum | 0 / 0 | 1 / 1 |
| Car passages (of which north on Kungsgatan) | 14 (7) | 29 (16) |
| Failed Bergsbron episodes | 0 | 0 |

**Superseded evidence:**
- The earlier `traffic-evidence-reversed.json` and `live-traffic-{before,after}.json` were produced by the old sampled tracing and aggregate analyzer. They are kept for history.
- The earlier "10 Skvallertorget dwells" double-counted one bus's repeated stops; the corrected count is **1 bus**.

## 9. Tests: what ran and what didn't

| Suite | Command | Result |
|---|---|---|
| Backend, default | `gradlew test` | **62 tests in 18 suites: 61 passed, 1 skipped, 0 failed.** Executed by default: `Step61bTrafficRegressionTest` (2 tests: live replay about 15–18 s, plus trace attribution), `BusReachabilityTest` (9), `RoadRoutingTest` (6), and all existing suites. |
| Backend, opt-in | `STEP61B_EVIDENCE=<json> STEP61B_SECONDS=3600 gradlew test --tests '*Step61bTrafficEvidenceTest'` | Executed once for this report: passed in 234 s. **Not part of the default run** (reported as skipped). `STEP61B_REVERSE` was not rerun in the follow-up. |
| Analyzer unit tests | `node --test scripts/step61b/analyze-traffic.test.mjs` | 7/7 passed |
| Live browser | `E2E_BASE_URL=http://127.0.0.1:5185 npx playwright test tests/bridge-traffic.spec.ts`, backend on 8091 with `ALLOWED_ORIGIN=http://127.0.0.1:5185` | Passed on this branch; **fails as intended** on the Step 6.1 backend |
| Full Playwright | same, all specs | 4/5. Bridge, both lighting tests and transit pass. `simulation.spec.ts:36` fails (second tab's `.sim-metrics` not found within 5 s). |
| Frontend type check / build | `npm run check`, `npm run build` | 0 errors, 0 warnings; build succeeded |
| Vitest | `npx vitest run` | 209/210 or 207/210 depending on load; failures are 5 s timeouts only (below) |

**Baseline versus regression, with evidence:**
- **`simulation.spec.ts:36`:** fails identically on a **clean baseline**, UI worktree at `1cdf45f` plus backend worktree at `39a9709`, twice. It also failed earlier with the current UI on the baseline backend. **Baseline failure, not a regression.**
- **Vitest timeouts:**
  - Nothing Vitest loads differs from `main`: `git diff main -- src vite.config.ts package.json tsconfig.json` is empty, and the branch's changes are in `scripts/`, `tests/` and `docs/`, which Vitest doesn't include.
  - Alternating full runs on a baseline worktree and on this branch:
    - `infrastructure.test.ts › never draws an at-grade running surface below the terrain` timed out in **every** run on both (baseline 10.3 s, current 6.6–8.8 s, limit 5 s).
    - `step51opt` (Pendeln grades) timed out once on baseline and once on current.
    - `idrottsparken` timed out once on current.
  - All three files pass alone (36/36).
  - Baseline's additional "identical elevation input" failure is an artifact of the worktree's location: it reads `../norrkoping-simulator-backend`.
  - Verdict: load-dependent timeouts present on baseline, not regressions.

## 10. Performance impact

- **Routing:** unchanged since Step 6.1b. Policy computation and `RoadTraffic` construction medians are in the 20–73 ms range and move in both directions between runs:
  - Policy computation: 22.1 / 19.9 in the original run, then 73.0 / 48.7 and 30.2 / 34.7 ms in the follow-up runs.
  - So there is **no systematic startup change**. The work remains O(nodes + edges) once per policy.
- **3,600 s replay wall time:** 117.2 s (6.1) vs 113.0 s (6.1b) in the final run, and 130.0 vs 133.8 s in the first follow-up run. These include trace bookkeeping.
- **The new hook:** one null check per edge change.
- **Default test cost:** the new runtime test adds about 15–18 s to `gradlew test`.
- **Frontend:** no runtime change.

## 11. Remaining uncertainties and blockers

There are **no blocking defects in the bounded Step 6.1b scope.** The following remain open by design:

- **Real-world access unresolved for 682 bus edges:** 680 filtered out (562 dead ends + 118 islands) and 2 retained but unreachable. They are blocked or isolated only by `service`/`living_street` roads with no explicit restriction. Kept closed. Opening any of them needs operator shapes (GTFS) or explicit tags.
- **Route 21 geometry currency** is not operator-verified (2023 OSM relation). A dated GTFS shape check is recommended before calling the corridor geometry verified.
- **Missing bus-only topology:** 65 relation ways with `access=no` + `bus=designated`, or `psv=yes`, are absent from the graph, at Resecentrum, Söder Tull, Drottninggatan and Östra Promenaden. A future re-import is needed; it is out of scope.
- **Uncertain cases:**
  - Slåttergatan stops B/D and S:t Persgatan.
  - 13 relation-only `service` ways for lines 10, 70–75, 129/123, 141, 429, 440, 420 and Flixbus.
- **Approximations:**
  - Turning-circle diameter is not modelled.
  - `maxspeed=walk` in the gångfartsområde falls back to 30 km/h.
- **Existing environment issues:** the `simulation.spec.ts` second-tab timing and the Vitest 5 s geometry timeouts, both present on baseline.

## 12. Files changed

**Committed Step 6.1b (`3da6528` backend, `650c071` UI):** listed in the previous revision of this README via `git show --stat`:
- Backend: `RoadRouting.kt`, `CityTransport.kt`, `road-access.json`, `BusReachabilityTest.kt`, `RoutingGraphs.kt`, `Step61bTrafficEvidenceTest.kt`, `RoadRoutingTest.kt`, `src/test/resources/step61b/route21.json`.
- UI: `docs/step61b/**`, `scripts/step61b/**`, `tests/bridge-traffic.spec.ts`, `docs/claude-progress.md`.

**Review follow-up (the next commit on `step61b-bus-reachability` in each repository):**
- **Backend:**
  - Modified `CityTransport.kt`: the `transitionListener` test hook.
  - Modified `Step61bTrafficEvidenceTest.kt`: uses `TrafficTrace`, asserts, skips when not enabled.
  - Added `TrafficTrace.kt` and `Step61bTrafficRegressionTest.kt`.
- **UI:**
  - Modified `scripts/step61b/analyze-traffic.mjs`: per-episode tracking, acceptance, junction exits.
  - Modified `tests/bridge-traffic.spec.ts`: controlled scenario, tracked bus, optional `BRIDGE_REPORT` export.
  - Modified `scripts/step61b/classify-removed.mjs`: two-axis, seed-based, per-edge audit.
  - Regenerated `docs/step61b/evidence/removed-bus-edges.json` and `osm-access-evidence.json`.
  - Updated `docs/step61b/measurements/traffic-evidence.json` and this README.
  - Added `scripts/step61b/analyze-traffic.test.mjs` and `docs/step61b/measurements/live-bridge-{after,before}.json`.
  - Updated the newest entry in `docs/claude-progress.md`.

**Unchanged:**
- `road-access.json`, the routing algorithm, terrain, road, rail and bridge geometry, coordinate contracts, lighting, and Step 6.2 datasets.
- Shared network, terrain and bridge-profile files are byte-identical to `main`.

## Git status

| Repository | Branch | Commits on top of `main` (= `origin/main`) |
|---|---|---|
| UI | `step61b-bus-reachability` | `1cdf45f` → `650c071` (Step 6.1b) → review follow-up commit (bridge validation, classification, evidence, documentation) |
| Backend | `step61b-bus-reachability` | `39a9709` → `3da6528` (Step 6.1b) → review follow-up commit (deterministic traffic regression, exact transition tracing) |

- The follow-up commit hashes are in `git log`; a commit cannot contain its own hash.
- Nothing is pushed or merged.
- Raw extracts, traces and live reports remain under the ignored `work/step61b/`.
