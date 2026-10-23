# Scale review of the existing hybrid lighting

No redesign was implemented. Findings come from `lighting/cityLights.ts`, `controller.ts`, `fixtures.ts`, `mapLandmarks.ts`, existing measurements and new bounded stress tests.

## Current behavior and risks

| System | Actual implementation | Citywide consequence |
|---|---|---|
| Surface lighting | Fixed material patch; shader lamps in RGBA32F texture; 8 texels/row, **128 bytes/lamp** | Thousands of emitters need not become thousands of real-time lights. But `height=lampCount` must stay below queried `MAX_TEXTURE_SIZE`; atlas/paging needed beyond device capacity. |
| Grid | Dense rectangle spanning **all lamp ranges**, 1 scene unit (~25 m) cell | Memory scales with bounding area even when most cells are empty. ~546×436 full-map cells with 30 m margins means ~**15.24 MB** float data, versus pilot115,200 bytes. Also incurs CPU arrays/number objects and transfer/upload cost; not just GPU bytes. |
| Cell payload | 16 float indices/cell = **64 bytes/cell**; shader stops at first negative sentinel | Work bounded by local retained occupancy, not total fixtures. Thousands on dense commercial/interchange overlaps can exceed capacity. |
| Overflow | `buildLightGrid` keeps nearest-to-centre16, increments `overflow`; equal distances have no stable asset-ID tie-break | **Not silent inside the builder**, but controller only exposes it in `describe()` and does not reject rollout. Crowding loses sources with no acceptance failure. Reordering equidistant inputs changes retained IDs. Distance alone ignores intensity/category/receiver importance. |
| Pole/lens/halo visuals | Instanced by pilot/type; detail distance from pilot group centre; halos grouped by pilot | Whole-city or giant-district groups give weak culling/LOD. Distant large groups can retain irrelevant instances/overdraw or lose nearby fittings due to centre distance. |
| Material patch | Lit material types patched once through WeakSet; previous compile callback/cache key chained; uniforms shared | Keep a small variant/material set. Duplicating per-fixture materials or shader defines destroys batching/compile gains. Material reuse across controller lifetimes must not retain old uniforms. |
| Stadium | Fixed ≤16 emitters/≤8 roofs, 14/4 used; independent state | Preserve; do not replicate array uniforms for dozens of venues in every material. New sports sites need bounded local groups/culling or separate static contributions. |
| Dynamic vehicles | Existing material patch can receive static light; aircraft pose includes bank/pitch; no dedicated moving lamps in pilot | Vehicle emissive sockets can be cheap. Never rebuild static grids for every moving headlight, and do not expand global dynamic light arrays per vehicle. |
| Daytime | Fragment loop disabled by `cityLampLevel`; lenses/halos reduced/hidden; pole geometry retained | **Not zero cost**: shader variants, CPU grid build, textures and visual update traversal still exist. Citywide streaming and a daytime “no night-page uploads/builds” gate are needed. Daylight operational airport/aircraft and explicit event lights remain independent. |
| Recovery/disposal | Typed vertex arrays retained after prior real context-loss failure; textures/owned geometry disposed; uniform groups shared | Retain/recreate all page CPU data, instance buffers and uniforms. Do not resurrect upload-time deletion. Test repeated load/dispose, streaming cancellation and context restoration. |

The full-city memory figure is a **rectangle estimate**, not allocation measured in a citywide renderer. At10,000 fixtures lamp data alone would be1.28MB; grid density, geometry, overdraw and existing ~1.13GB worker buffers are more consequential. Dense-grid extent is problematic even for just two far-apart lamps. Sorting overcrowded cell lists adds roughly `Σ k log k` work after candidate insertion; the introductory O(N) intuition is insufficient when range/overlap grows.

## Proposed incremental architecture

First retain the existing shader/material contract and prove observability. Stable-ID sort input, reject duplicate IDs, report raw occupancy/histogram/dropped candidates and **fail development/CI at any unapproved overflow**. At runtime show a development warning/diagnostic without crashing a release unexpectedly. This small hardening slice precedes any geographic expansion; it must not change the105 pilot render at normal occupancy.

Then introduce a worker-built **sparse tiled index**, proposed 250m chunks containing10×10 25m cells. Give source fixtures canonical SWEREF chunk ownership. Bin each light's influence into every touched cell, including neighbouring chunk margins; store unique lamp data once in a stable atlas. Keep page metadata and compact payload arrays; no `number[][]` for every empty city cell. Resident pages are selected by camera frustum plus maximum influence/LOD margin and hysteresis; empty pages have an explicit sentinel.

Keep light lookup in world/grid coordinates so camera movement does not alter fixture positions or create selection popping. Camera culling must cover **receivers illuminated by offscreen emitters**, not just emitter visibility. Use a compact resident-page atlas/lookup texture with bounds checked against device capabilities. A 10×10 cell payload is6,400bytes/chunk before lookup metadata and halo overlap. A hypothetical100 resident chunks is0.64MB payload; that is arithmetic, **not a residency target justified by camera tests**. Preallocate bounded buffers, version uploads and swap complete page sets atomically. Reuse pages/buffers; avoid frame-time allocations and uniform/material replacement.

Fixture visuals use the same chunk IDs, with shared housing/lens/halo geometry per type. Group each chunk's bounds including arms/glare; use near/mid/far detail with hysteresis and no per-frame object construction. Count actual visible chunks×types in draw-call budgets; a separate mesh for every street or lamp is unacceptable. Alpha additive halos must have distance/size/overdraw limits. Decorative/window/sign systems use shared atlases or instance attributes, not thousands of new shader materials.

The static grid owns persistent sources; moving lights stay in an inexpensive instanced visual buffer. If real headlight spill is later required, prototype a small bounded selection/pass independently with measured receivers and deterministic priority. No unbounded per-vehicle real-time lights or shadow maps.

## Deterministic capacity policy

**Default:** no dropped source at an accepted city slice. A cell with >16 contributing sources fails import/CI and produces a reviewable conflict report. Do not label this a production implementation: it is the next-task requirement.

For an explicitly approved crowded zone, retain fixed16 shader slots using a pinned configuration, not camera order. Candidate rank:

1. Explicit owner-reviewed priority class for functional safety/route tasks; keep aircraft/runway visual systems outside this street-grid competition where their optics differ.
2. Descending conservative contribution score over the **cell's receiver volume**, derived from intensity, minimum emitter/receiver distance, distribution/occlusion bounds and valid heights. A point at the centre alone can miss a strong edge contribution. If receiver height is unknown, flag low certainty rather than invent it.
3. Stable canonical asset ID as final tie-break; never array index or insertion order.

Record **all** raw/retained/dropped IDs and score parameters, approximation error assumptions, footprint of any dropped light and an estimate of omitted energy over sampled receivers. Acceptance requires an owner-reviewed error threshold and fixed-camera images; otherwise subdivide/retile, reduce source influence only with photometric justification, or use a separately budgeted overflow pass. Smaller cells can reduce incidental overlap but cannot resolve17 co-located real emitters. Do not increase a global shader loop cap or omit “dim” poles without review just to pass.

## Required tests for implementation

New Step6.2 tests deliberately document **current behavior**:17 co-located lights flag overflow/cap16; reversing equidistant input changes selected assets; far-separated lights allocate a mostly empty rectangle with exact64byte/cell payload. They do not claim the proposed policy is implemented.

Next implementation tests must prove:

-16/17/large crowded sets, co-located priorities, tie order independence, unknown photometry and full conflict reporting; no accepted fixture silently dropped.
- Existing pilot coverage/visuals unchanged at zero overflow. Light range across negative coordinates, all chunk edges/corners and map boundaries gives no seams, duplicate influence or missed receivers.
- Pinned input reorder and worker order yield identical sorted bytes/IDs; municipal/OSM/generated crosswalks suppress only verified duplicates.
- Texture dimensions/precision/format/slot count fit actual device limits; invalid/nonfinite inputs and excessive ranges are rejected before allocation. Multirow lamp atlas indices and sentinels remain exact.
- Camera teleport/fast movement loads bounded pages atomically without stale async swaps; culling retains offscreen emitters that affect visible surfaces; LOD has hysteresis.
- Day/night/event toggles and motion add no programs after warmup; daytime inactive sources do no night-only grid generation/upload. Manual airport/event lights still work.
- Repeated creation/disposal/navigation, cancelled worker builds and WebGL context loss/restore maintain geometry/texture ownership and memory plateaus. Test shared-material rebinding to a fresh controller.

## Baseline and instrumentation

Use [rollout budgets](rollout-plan.md) and preserved Step6.1 measurements. Shader compile is a major known startup risk: the previous full-BRDF shader added ~1.4s map-ready before simplification/parallel compilation. Do not infer compile time from shader length. Instrument raw page occupancy, retained count, data bytes, worker build/upload time, material/program counts, renderer calls/triangles, ArrayBuffer bytes and post-GC heap separately. Heap excludes much backing-store/GPU residency. Quantify GPU work with supported timer queries if available; browser frame intervals are not isolated GPU time.
