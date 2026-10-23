# Step 6.2 — citywide lighting inventory and rollout foundation

Research date: **23 October 2026**, Europe/Stockholm. This is an inventory and design checkpoint. No runtime lights, trees, geometry, routes or shaders were changed. No commit or push was performed in this session.

## Decisions for review

1. **Resolve the bus-policy checkpoint before expansion.** The Bergsbron truck correction works under its existing policy, but bus reachability at Skvallertorget is lost. Seven genuine mapped bus-end edges also disappear. The current operator lists service 21 via Skvallertorget. Passing the earlier tests did not establish preservation of legitimate transit. See [checkpoint readiness](checkpoint-readiness.md).
2. The handoff is stale: both repositories initially had clean `main` worktrees. UI `bd13495` and backend `c3d9860` already contain Step 6/6.1, and read-only `ls-remote` confirmed those exact remote `main` heads. Preserve them; do not recreate the old uncommitted state.
3. The supported map is approximately 13.55 × 10.81 km in SWEREF 99 TM bounding extent, **not the whole municipality**. The actual clip is a quadrilateral. Terrain covers that envelope; OSM completeness, vegetation density and architectural accuracy do not follow from terrain coverage.
4. A fresh bounded OSM query, base **2026-10-23T09:05:06Z**, finds **25 street-lamp nodes, 2,040 `lit=yes` ways, 175 `lit=no` ways and 32 fuel features**. These are feature counts, not a surveyed fixture total or 32 independently confirmed operating forecourts. The existing pilot remains 105 fixtures: 10 mapped and 95 estimated.
5. Current municipal fixture coordinates/licence remain an acquisition gap. Obtain the asset register before treating street/path estimates as real lamps. Retain unknown illumination and explicit darkness.
6. Vrinnevi's named 2.4 km loop is distinct from longer routes. OSM relation `5703856` is a plausible ~2.36 km candidate, supported by historical brochure topology. A current licensed municipal vector alignment and fixture register are still needed; neither a 2012 brochure nor route length proves a 2026 survey.
7. Current-effective LFV publications confirm **09/27 lit and 11/29 unlit**. Airport state must be independent of city dusk. Runway boxes already exist on every rendered runway, including grass/historic surfaces; these are approximate geometry, not validated operational lighting.
8. Police reception moved to **Luntgatan 32 on 26 January 2026**; some services remain at Stockholmsvägen 4–6. Existing police tower/emblem geometry must be audited, not declared absent. [Polisen's dated notice](https://polisen.se/aktuellt/nyheter/ost/2026/januari/polisens-reception-i-norrkoping-byter-adress/).
9. The dense grid allocates across empty space and caps each cell at 16 lights. Overflow is counted but not rejected by the controller, and ties depend on input order. Introduce deterministic capacity validation and sparse paging before adding fixtures across the map.

## Deliverables

| Document | Review purpose |
|---|---|
| [Lighting inventory](lighting-inventory.md) | All requested categories, named assets, operational uncertainty, complete extracted fuel list |
| [Data sources](data-sources.md) | URLs, editions, retrieval dates, licences, acquisition requests and gaps |
| [Coverage audit](coverage-audit.md) | Actual CRS/boundaries, terrain, roads, buildings, vegetation, airport and out-of-bounds dependencies |
| [Missing assets](missing-assets.md) | Existing models versus prerequisites, location anchors, uncertainty and costs |
| [Vrinneviskogen plan](vrinneviskogen-plan.md) | Trail identity, historical map review, canopy/height acquisition, deterministic forest design |
| [Airport/aircraft plan](airport-lighting-plan.md) | Current LFV evidence, runway/taxiway distinctions and transform/state design |
| [Architecture](lighting-architecture.md) | Current grid audit, proposed sparse implementation, deterministic overflow and tests |
| [Rollout and budgets](rollout-plan.md) | Scope gates, hardware acceptance targets, effort and definitions of done |
| [Checkpoint readiness](checkpoint-readiness.md) | Both Git states, fresh regressions, route 51 and transit findings |
| [Registry contract](registry.md) | Schema, provenance, duplicate handling, reproducibility and geographical QA |

Small retained data are under [evidence/](evidence/) and [inventory.sample.json](inventory.sample.json). OSM-derived extracts are © OpenStreetMap contributors, **ODbL-1.0**, including adapted coordinates and footprints. Preserve attribution/share-alike obligations when distributing the database. These are research inputs; they are not imported into the simulator. No raw city extract, photographs, brochure artwork, LiDAR or orthophoto was added to Git.

## Verification and limits

[Verification](verification.md) records commands, results and failures encountered. Existing Step 6.1 performance was extracted, not remeasured. New source categories have not been visually validated in the simulator. No lower-end GPU claim is made. Unknown schedules, dimensions, heights and legal redistribution permissions remain explicit.

**Exact next implementation task:** Step 6.1b, a bounded correction/acceptance task for bus policy and genuine mapped termini: preserve the Bergsbron truck result, restore verified service-21/Skvallertorget reachability with a separate designated-route/terminal policy, investigate all seven removed bus-end cases and road 51, and add positive destination tests. No citywide lighting in that task. Then execute Phase 0 lighting registry/grid hardening before Phase A.
