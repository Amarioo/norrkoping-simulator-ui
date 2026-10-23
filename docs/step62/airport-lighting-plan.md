# ESSP and moving aircraft lighting plan

## Publication control

Read directly from LFV on **2026-10-23**: [issue index](https://aro.lfv.se/content/eaip/default_offline.html) identifies **AIP AMDT 1/2026, effective 7 August 2026**, as current. Listed 29 October and 26 November editions are future on this research date and were not treated as current. [ESSP AD2](https://aro.lfv.se/content/eaip/AIP%20AMDT%201-2026_2026_08_07/eAIP/ES-AD%202%20ESSP%20NORRK%C3%96PING-KUNGS%C3%84NGEN%201-en-GB.html) §§2.12,2.14,2.15 and [AD1.1](https://aro.lfv.se/content/eaip/AIP%20AMDT%201-2026_2026_08_07/eAIP/ES-AD%201.1-en-GB.html) were independently cross-checked. Web reader could not resolve the encoded ESSP page; direct HTTPS retrieval succeeded and its HTML remained in ignored research scratch.

This establishes published infrastructure, not live operational availability. A complete dated NOTAM/AIP-supplement reconciliation was **not** obtained. A March2026 grass-runway closure NOTAM surfaced in search but expired/was estimated to expire in April; it is not evidence of an October closure. Obtain the applicable dated notices/operator confirmation before operational modeling. No airport chart, protected layout or document image was committed.

## Published runway and ancillary configuration

| System | Current publication evidence | Modeling decision / unresolved points |
|---|---|---|
| RWY09/27 | Paved **2205×45 m**, true bearings 090.86°/270.89°, AD1.1 says lit | Existing runtime geometry maps the runway; preserve geography. Actual fitting survey absent. |
| RWY11/29 | Grass **600×35 m**, AD1.1 says **unlit** | No operational runway lights. Rendered old box rows are not authoritative; replace/suppress them in a later airport task. |
| Approach09 | Calvert CAT I, **540 m**, high intensity | Separate directional approach group west of threshold09, not symmetric copy of27. Individual bars/support heights need chart/operator measurements. |
| Approach27 | Calvert CAT I, **900 m**, high intensity | Separate east-side array; publish actual pattern only after chart interpretation/geometry review. |
| Thresholds | Green; runway-threshold/edge/end systems noted as LED | Directional green toward incoming approach; not omnidirectional green point glows. Exact row counts/positions unknown. |
| Runway edges | Published full runway length, nominal **60 m spacing**, white with yellow caution zones, high intensity | Build from verified runway/threshold geometry; do not claim every emitter position is surveyed or derive exact count by integer division. Resolve caution-zone limits from applicable design/chart evidence. |
| Runway ends | Red | Emit toward runway/approach-relevant sightline with proper housing; do not confuse threshold/end directions. |
| PAPI09 and27 | Left side in each landing direction, **3.00°**, published MEHT56ft | Four-unit system/angle sectors require correct approach-local frame. Left sides lie on opposite physical runway sides. Exact unit offsets/heights not acquired; avoid generic glowing red boxes. |
| Centreline/TDZ/SWY lights | AD2 lighting table lists no systems | Do not invent them. Blank/dash means no published installed system in that table, not a modern full CATIII package. |
| Taxiways | Edge lights **B,C**, LED; centreline absent; runway guard lights LED | Match B/C identifiers to current chart/OSM geometry before placing. Do not light all taxiways. Guard-light fittings require actual layout. |
| Wind/ancillary fittings | Lit windsock ~390 m southeast of THR09; threshold windsocks unlit. Anemometer ~330 m ENE of THR09 lit, one ~370 m WSW of THR27 unlit | Named offsets are published relative descriptions, not surveyed fixture coordinates; resolve chart positions and heights before construction. |
| Beacon | No beacon listed in AD2.15 | Do not add a generic rotating airport beacon by assumption. |
| Apron, terminal, hangars, service yards | Ground geometry exists; no fitting-level lighting data acquired | Unknown pole positions, mounting heights, canopy/entrance lights and operational grouping; obtain operator reference. |
| Obstacles | Current lighting installations/failure status not reconciled | Audit tall structures and published obstacle data with exact datum/date; no blanket red lights on all chimneys. Some obstacles are outside city coverage. |

AIP threshold reference positions (not luminaire locations):

| Threshold | Geographic reference published in AD2.12 | Published elevation |
|---|---|---:|
|09|58°35′10.01″N,16°13′54.08″E|13.3 ft|
|27|58°35′08.92″N,16°16′10.53″E|32.3 ft|
|11|58°35′24.30″N,16°14′11.40″E|6 ft|
|29|58°35′16.00″N,16°14′44.80″E|8 ft|

Convert with the existing independently tested EPSG:3006 functions/PROJ controls before comparing to OSM; record any OSM runway-end/threshold displacement explicitly. Do not treat AIP AMSL feet or its geoid undulations as a fresh RH2000 fixture elevation survey. No new threshold-derived runtime coordinates were created in this phase.

## Existing model and proposed state/renderer

`mapLandmarks.ts` currently loops **all** `cityMap.airways` runways and places paired small boxes along their edges; this includes grass and historic Bråvalla. These are approximate neutral geometry, not AIP-verified lighting. Existing scene has two airport records: active ESSP and historical F13. ESSP includes09/27,11/29; Bråvalla has historical runway geometry and fictional flight use. Scope/identity must be explicit before making any box emissive.

Reuse runway/taxiway/terrain geometry. Define `airportOperationalState` separately from city `solarNight`: selected runway/direction, enabled groups, requested intensity, apron state and equipment availability. Unknown switch state must be explicit; use documented/manual scenarios without inventing auto-activation hours or radio-control rules. Airport/aircraft safety lights can be active in daylight. Apply confirmed weather/visibility scenarios only as simulation inputs; AIP emergency-power timing is not a blink pattern.

Use instanced opaque housings and angle-sensitive emissive quads, batched by optical profile/colour/page; apply distance LOD and bounded glare size. PAPI output derives from observer elevation **in the approach-local frame**, preserving red/white angular transitions and hiding from the reverse approach. Ground-side apron lighting can use the static surface grid when positions are known. Operational runway cues need no dynamic shadow lights; reflect only small water highlights where an actual source/receiver warrants it.

## Aircraft lights, separate from runway systems

[EASA CS25.1385](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-large-aeroplanes-cs-25?jLDwi2Z9uOU=t8Phv&page=44) confirms red left forward, green right forward and white aft position lights. [SERA.3215](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-standardised-european?erules-id=ERULES-1963177438-9807) distinguishes navigation/anti-collision lights, movement-area/engine indications, day use of fitted anti-collision systems and permitted reduction for dazzle. These conventions do not prescribe one real airframe's complete fitting locations or flash waveform.

| Group | Planned visual behavior | State/evidence requirement |
|---|---|---|
| Navigation | Steady red left/green right/white aft, with directional visibility sectors | Aircraft-local sockets and forward axis verified first; applicable type manual for sectors/placement. |
| Anti-collision beacon | Flashing red if fitted to selected model | Engine/operating state; type-specific pattern, period/duty cycle **null** until verified. |
| White strobes | Flashing white if fitted | Type-specific single/double pulse and ground-use policy unknown; no arbitrary universal frequency. |
| Landing lights | Steady forward/down beam visual while enabled | Approach/takeoff phase plus explicit light setting; height/speed threshold is a documented simulator rule if used, not claimed airline SOP. |
| Taxi lights | Steady forward ground-facing visual while enabled | Taxi state, gear/light setting; no automatic airborne taxi beam. |

Existing `AircraftView` provides position, heading, pitch, bank, phase and gear but no certified airframe/lighting/engine switches. Attach local sockets under the **same interpolated aircraft object transform** as the body; do not derive wing positions from unrotated world offsets. Verify handedness using all headings, banking and front/rear views. Seed flash phase by aircraft ID and drive it by simulation time (pause/time-scale consistent); replay deterministically without synchronized fleets.

Use one instanced effect buffer for visible moving lights, no per-aircraft PointLight/SpotLight or shadow map. Keep landing/taxi ground spill bounded to a small selected set or future dynamic receiver pass, independently budgeted; initial implementation may be emissive-only with that limitation explicit. Never inject moving aircraft into a full static-grid rebuild every frame.

Acceptance: correct lit/unlit runway separation, current publication/notice manifest, verified geometry/CRS, directional threshold/end/PAPI behavior from both approaches, daytime operational states, no lights on grass/historic runways by default, deterministic aircraft pulses with documented type evidence, no change in real-time light count, bounded calls/memory and context recovery. None of these unimplemented features was visually validated in Step6.2.
