# Step 6/6.1 checkpoint readiness

Inspected 2026-10-23. No reset, stash, revert, overwrite of prior work, commit or push. The old handoff's uncommitted/branch descriptions are historical.

## Actual state

| Repository | Initial branch/worktree | HEAD | Verified remote `main` |
|---|---|---|---|
| Frontend | `main`, clean | `bd13495ab680f79ce5b595c82139820cc6d0df14` — “A lot of changes” | same SHA |
| Backend | `main`, clean | `c3d9860637572795f49a20f599ea67eb6a07fca5` — routing correction | same SHA |

`994b881` / `e143535` are the preceding geometry checkpoints, not the current code. The old lighting branch is not the checked-out branch. `git branch -vv` initially listed only `main` in each checkout. `git ls-remote --heads origin main` was read-only; remote state is verified for this inspection, not guaranteed indefinitely.

UI's existing commit already groups Steps 6/6.1. Backend's existing commit isolates the routing correction. Do not rewrite that history to manufacture preferred commit boundaries. The Step 6/6.1 README files remain historical reports; the new progress entry supersedes their Git-state assertions.

## Bounded review and new evidence

Read `CityTransport.kt`, `RoadRouting.kt`, `RailTraffic.kt`, importer access policies, the old `e143535` filter and both prior reports. Roaming buses use `RoadTraffic.allowed`; they do **not** follow real bus lines or destinations. Designated bundled paths are `tram-2`, `tram-3`, `pendeln`, independent of road pruning. Their destination/dwell/motion tests pass; there is no bundled bus-route implementation to certify.

Fresh audit uses the production `throughRoadEdges`, a mathematically equivalent iterative version of the old zero-outdegree pruning, and multi-source directed reachability from **all eligible spawn edges**. This establishes eligibility/reachability, not a probability of random roaming service or pairwise connectivity from every depot.

| Policy | Old retained → current | Additional removed | Reachable nodes before → after | Bus-stop nodes before → after | Genuine mapped end edges before → retained |
|---|---:|---:|---:|---:|---:|
| Compact/estate policy | 73,142 → 73,131 | 11 | 38,045 → 38,042 | 261 → 261 | 2,548 → 2,547 |
| Truck | 5,932 → 5,807 | 125 | 4,862 → 4,825 | 75 → 74 | 6 → 5 |
| Bus | 43,813 → 42,834 | 979 | 24,177 → 24,039 | 251 → 250 | 612 → 605 |

Estate shares compact candidates; not rerun as an independent policy. The 11/125/979 reported removals reproduce exactly. **Skvallertorget**, OSM stop node `3183225928`, becomes unreachable for the bus policy. Truck stop counts are only graph diagnostics; trucks do not offer passenger service.

The initial extra assertion that *all* genuine mapped end edges survived failed. The audit now reports those cases rather than hiding them behind a successful structural test. A mapped end means the full bundled directed graph has no target other than the arrival node; it does not prove a physical real-world cul-de-sac. Removed bus-end ways are `4498925`, `89884762`, `91258086`, `954899965`, `1050223617`, `1059584521`, `1115174620`. The compact case is way `104245496`; truck case `100877188`. The retained-edge invariant still passes: every retained arrival has a non-reversing exit or an actual end in the bundled graph. This invariant says nothing about destinations deleted with a branch.

### Bergsbron and transit

The existing six routing regressions still prove compact continuation across the bridge and exclusion of trucks/buses from the policy trap. That is a correct roaming-truck result under the current access policy, **not a legal prohibition on real buses**. The importer's broad bus exclusion on `living_street` is a simulation heuristic.

Fresh OSM relation comparison finds 15 route relations intersecting newly removed bus **ways**. The highest-priority pair is `14025630` / `14025631` (service 21), both including Bergsbron way `26154805` and Skvallertorget approaches. Their OSM edit date is 2023-10-01, so they alone cannot prove today's service. However, the [current operator line index](https://www.ostgotatrafiken.se/Tidtabeller/) independently lists Norrköping service 21 via Resecentrum–Skvallertorget–Väster tull–Söder Tull (checked 2026-10-23). This is a real transit dependency deserving a positive regression.

Other flagged services: 70/71/72/74/75, Campusbussen and 141 intersect ways `315670216` / `99952393`. These are conservative **way-level flags**, not proof every direction was removed or every listed service remains current. Many intercity members extend outside the map; `unmappedInRuntime` includes outside coverage, snapshot differences and missing roads. Obtain dated operator/GTFS shapes before implementing them. [Detailed comparison](evidence/coverage.json).

### Road 51 is not bus service 51

`318001968` is rendered `class=primary`, `ref=51`, near the northwest map edge. All six directed edges are initially permitted for every audited policy; three survive and three are pruned for **all** policies. Immediate neighbouring ways `318001974` / `318001966` are also truck/bus-permitted. A [causal trace](evidence/routing-causes.json), independently ported and checked against the Kotlin retained counts, follows the removed direction to full-graph directed terminal **node3243534579**, about **23.2m from the map clip**. This supports a boundary/clipped-network explanation, not a bus-only access policy at road51. Outside-map continuity is not verified. Do not label this a surveyed physical cul-de-sac or access ban. No fresh OSM bus relation in this extraction names this way; absence is not proof no bus ever uses road51.

For the seven deleted mapped bus-end approaches, all causal seeds include an original bus-policy exclusion, unlike road51. Six seeds lie hundreds/thousands of metres inside the extent; one is ~9m from its edge. Therefore the end approaches are real bundled end geometry lost through **policy propagation**, not seven newly discovered physical dead ends. Their continuation/return/terminal legitimacy needs individual acceptance. The deleted compact-end case instead traces to a full-graph directed terminal ~3.47km inside the extent, so clipping must not be used as a blanket explanation for every loss. See the report for exact edge/way/seed IDs and causal chains.

## Readiness decision

**Frontend:** existing pilot checkpoint is already committed/pushed. No new runtime regression found by the bounded lighting review; earlier visual/performance limitations remain. New Step 6.2 documentation, extracts, validators and stress tests can form a separate reviewable commit after approval. Do not claim citywide readiness from the 105-fixture pilot.

**Backend:** existing routing checkpoint is already committed/pushed, but **not accepted as transit-preserving**. Flag the lost stop and mapped termini before any next release/expansion. Do not silently weaken the anti-truck-turnaround rule or globally allow buses on all minor roads. Recommended next boundary: a small Step 6.1b correction with verified designated routes/terminal access and regression evidence, separately approved for commit/push. This audit adds one test/report generator, not a routing fix.

Final intended diff: UI `docs/step62/**`, `scripts/step62/**`, newest `docs/claude-progress.md` entry and a specific `/work/step62/` ignore rule; backend `Step62RoutingAuditTest.kt`. No runtime/shared-data changes. New test output stays under ignored backend `build/step62/`; curated output is retained here.
