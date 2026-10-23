# Lighting categories and geographic asset inventory

This includes implemented pilot assets, mapped evidence, named research targets and unknowns. `verified-lit` is a source claim about a place/system, not necessarily a surveyed emitter. `mapped` means OSM/database position. `estimated` means authored reconstruction. Unknown is never converted to `lit=no`, and `lit=yes` is never a pole-coordinate survey.

## A. Streets and roads

The retained city extract has **25 `highway=street_lamp` nodes**, [coordinates/tags/dates](evidence/mapped-lamps.json), versus the pilot's ten mapped and 95 estimated fixtures. All 25 are inventory candidates; pilot overlap must be reconciled by node ID, not added again. There are 2,040 lit and 175 explicitly unlit highway **ways** in the fresh query. Shared/segmented ways are not counted as distinct complete streets.

Priority corridors: Kungsgatan/Bergsbron (existing pilot), Drottninggatan, Norra/Södra/Östra Promenaden, Stockholmsvägen, Linköpingsvägen, Söderleden, Lindövägen, Gamla Övägen, E4 approaches and Ingelsta/Järngatan. Locations come from runtime road geometries; each requires tag/municipal evidence before expansion. Residential streets, pedestrian streets, cycle paths, intersections, roundabouts, interchanges, crossings and public parking are separate inspection classes. Major-road status alone never proves illumination.

Functional subtypes: post-top/bracket poles, suspended luminaires over avenues, facade-mounted heads, bollards, crossing-specific lights, underpass ceiling/wall lighting, internally lit road signs, signal faces. The 116 mapped traffic signals already have scene geometry; their lens state is traffic control, not streetlight activation. Survey signal/road-sign illumination separately. Ståthögavägen underpasses retain routing regressions, but no lighting survey was acquired. Do not light every tunnel/parking polygon automatically.

Activation: solar-night profile only where supported; dimming/time-group unknown. Retain explicit `lit=no` exclusions; missing tags remain unknown. Pilot spacing, mounting heights, colors and photometry are approximations, not a municipal standard.

## B. Bridges, quays and waterfronts

All nine detailed bridge objects already exist; [anchors](evidence/coverage.json) and profile hashes are preserved.

| Asset | Existing geometry | Functional/decorative evidence and action |
|---|---|---|
| Bergsbron | Detailed bridge `1212234767`, road `26154805`, seven pilot deck fixtures | Pilot lamps are mapped/estimated separately. Actual railing/wall/deck mounting still needs current references. No new decorative floodlighting verified. |
| Saltängsbron | `501428827` | Municipal seasonal reference describes lit structure/rail decorations. Model seasonal fixtures separately from traffic lighting; exact fittings unknown. |
| Hamnbron | `501428838` | Seasonal bridge decorations and nearby crane chandelier documented; no continuously active schedule inferred. |
| Gamlebro | `1212608460` | Nearby decorated chestnut is a separate asset, not proof the whole bridge is floodlit. |
| Laxholmsbron | `8237053` | Structure exists; functional/decorative fixture positions unknown. |
| Spången | `1212608461` | 2012 lighting plan illustrates low-mounted lighting; historical evidence, verify current installation. |
| Three laxtrappan footbridges | `275578953`, `350376442`, `350376444` | Geometry exists; individual light/mounting evidence unknown. |

Other mapped road/path bridges, quays, Norra/Södra kaj promenades, locks/dams, harbour yards and industrial waterfronts remain inspection targets. Distinguish maintenance/security lighting from presentation lighting. Proposed water highlights use local additive/analytic highlights on the existing water surface, directional falloff and distance limits; no new reflection render pass. Do not illuminate water independently of an evidenced adjacent source.

## C. Historic landmarks and city identity

Footprints, full SWEREF rings and **bounds-midpoint anchors** are retained in [landmarks.json](evidence/landmarks.json). Anchors are not surveyed towers or spotlights. Actual building heights, roof orientation and changed 2026 details need separate verification.

| Landmark | Runtime state | Illumination / prerequisite |
|---|---|---|
| Rådhuset, `way/285809156` | Footprint plus approximate clock tower/spire | Dedicated facade/tower/clock illumination **unknown**. Preserve dark clock until evidence. Post-renovation appearance not settled by conflicting completion notices. |
| Gull-Olle / Sankt Olof | No statue mesh above tower | **Statue atop Rådhuset**, not another building. Municipal reference: tower 68 m, gilded sculpture 4.5 m. Precise datum, orientation/base and night lighting unresolved. |
| Sankt Olai, Matteus, S:t Johannes | Footprints and stylized towers | Current floodlighting unknown; need roof/tower fits, actual mounts and dated night views. |
| Hedvigs kyrka | Footprint, no equivalent bespoke tower in the inspected landmark loop | Current illumination and architectural adequacy unknown. |
| Gamla vattentornet, `way/97673884` | Named footprint (OSM height 45 m) plus cylindrical approximation | Detail/mounting/lighting unknown; do not confuse local stylized height with measured RH2000. |
| Other water tower, `way/91569016` | Mapped tower at E567480.061 / N6492137.325 | Identity/current treatment and specialized geometry need checking. Avoid applying old-tower geometry to it. |
| Strykjärnet / Industrilandskapet | Footprints/extrusions; no surveyed facade projectors | Selected facade/waterfall targets require current photos/layout. Dedicated illumination on each building remains unknown unless separately sourced. |
| Värmekyrkan | Footprint and **two** modeled chimney additions | Municipal seasonal installation uses four chimneys; verify complete building components before effects. |
| Public monuments / prominent chimneys | OSM query finds Femte skorstenen; other sculptures may lack query tags | Do not turn every monument into a floodlit asset. Expand `artwork`, chimney/tower/sign query in a later targeted import. |

Municipal [Stad i ljus](https://norrkoping.se/se-och-gora/kultur-och-noje/stad-i-ljus) identifies waterfall equipment with a seasonal show, Värmekyrkan facade projections/advent effects, Holmbrogränd chandeliers, Hamngatan trees and selected bridge decorations. These are explicitly seasonal/event assets; exact projectors/coordinates remain unknown. Its photos are references, not simulator textures.

## D. Resecentrum and public transport

Station footprint `way/88701127`, 97 platform records and three platform roofs exist, together with approximate shelters/terminal details. Audit station entrances, rail platforms, bus-terminal waiting areas, tram/bus shelters, information boards, destination signs, canopy downlights and interior spill as separate mounts. Functional illumination is an expected requirement, but exact installation and switching are **unverified**, so no fabricated per-platform pole points.

Scope is the **present station**, not the future Ostlänken central-station design. Proposed redevelopment documents are not evidence of built 2026 fixtures. Tram/train paths and bus-stop nodes already support future moving lights; tram interiors, destination displays, bus lamps and train headlights need vehicle-local emissive anchors and schedules/states. Use no per-vehicle shadow lights. Correct bus reachability first; see checkpoint report.

## E. Police, emergency and public facilities

Stockholmsvägen 4–6/Stinsen 1: mapped police complex `relation/1356564` and POI `node/304107779`, approximate tower, facade fins/solar arrays and official crest already exist. Crest plane is approximately 6.25 × 7.5 m in current code, at local tower `(0,1.55,1.37)`, with tower rotation 0.2775 rad. **Those are model dimensions, not real sign measurements.** `MeshStandardMaterial` has no dedicated emissive illumination. No matching POLIS lettering/sign installation was found in the inspected code.

Reception is now Luntgatan 32; the exact entrance footprint, facade bearing, real sign size/mounting, logo/letter arrangement and nighttime appearance require a dated reference. Do not assume the old tower crest depicts the new reception sign, or move the old complex wholesale. Polisen confirms some services remain at the old address. Sign illumination is unknown at both locations until observed.

Mapped fire facilities: Station Centrum (`93481365`), Räddningsstation Kvillinge (`253115545`), training facility (`447836634`), Räddningsstation Ljura (`1516252692`). Hospital: Vrinnevisjukhuset (`relation/20618484`). [Facility anchors/tags](evidence/facilities.json) separate these from ordinary municipal buildings. Match current dated operator references, entrance geometry, aprons, rescue-bay signs and functional light states; no decorative floodlights assumed. New mapped Ljura feature must be compared to the older runtime snapshot before claiming representation.

## F. Fuel and commercial lighting

The complete **32-feature OSM extraction** and per-feature E/N, geometry reference, edit/version date, raw hours/shop tags, nearby/containing runtime footprints and unknown geometry/lighting fields are in [fuel-stations.json](evidence/fuel-stations.json). [Fuel review table](fuel-stations.md) enumerates every feature and corroboration status. It includes LPG/fleet/industrial candidates and three unnamed nodes; it is not a claim of 32 active branded petrol stations.

Site lighting components: canopy soffit luminaires, pump islands, building entrances, illuminated price/logo signs, car-wash/parking and entry lights, EV cabinets/bays and logistics yards. None has surveyed fixture locations here. A nearby `building=roof` is only a canopy **candidate**, and a node outside a building is normal for a forecourt. Staffing remains unknown except where an operator explicitly identifies an automatic/attended site; `shop=no` is an OSM clue, not proof. Do not apply identical branding/canopies, or equate 24-hour fuel availability with all-night storefront lighting.

Commercial targets: Ingelsta retail/parking, Mirum Galleria, Domino/Linden, grocery stores, Ankaret/P-ankaret garages, hotels, PostNord/Ostkustterminalen and harbour/industrial yards. Footprints exist to varying detail; signs, canopy arrangements, parking lights and business-state evidence mostly do not. Fresh EV POIs are retained in `facilities.json`; they indicate chargers, not illuminated-site certainty. Operator lists reveal five reconciliation candidates: INGO Ingelsta Koppargatan, Circle K Truck Zinkgatan, OKQ8 Malmgatan41, St1 Truck Maskingatan and the likely colocated IDS Klinga truck facility. Do not silently omit or double-count them; exact map matches remain unresolved.

## G–H. Parks, squares, green areas and Vrinneviskogen

Strömparken pilot exists; Vasaparken, Folkparken, Ljuraparken, Karl Johans park, Hörsalsparken, squares and waterfront promenades have mapped land cover. Treat lit corridors, entrances, play/exercise areas and selected decorative objects individually; do not make entire park polygons light emitters. The historical 2012 municipal plan notes deliberately darker Strömparken waterside behavior, a reason to verify the pilot's current `lit=yes` interpretation rather than extrapolate uniform lamps. Unknown turf/woodland stays dark in rollout proposals, while its **evidence state remains unknown**, not `lit=no`.

Vrinnevi: named illuminated loop and current reserve access reference confirmed; pole types/positions, operation times and 2026 canopy are not. [Dedicated plan](vrinneviskogen-plan.md) distinguishes seven running-route candidates, the short historical lit loop, unlit/unknown longer routes, exclusions, elevations and instancing. No forest generation in this phase.

## I–J. ESSP and aircraft

Current LFV: lit paved 09/27, **unlit grass 11/29**; approach lengths differ by direction; PAPI on the left in each approach; taxiway B/C edge lights and runway guards documented. [Dedicated airport/aircraft plan](airport-lighting-plan.md) covers threshold/end colours, apron/terminal/hangars, obstacles, transform anchors and independent operational states. Apron pole points and operating schedules remain unknown. Historical Bråvalla/F13 is not an active ESSP lighting extension.

## K. Sports and recreation

Preserve Idrottsparken's existing 14 emitters, four roof occluders and OFF/TRAINING/MATCH controls. Other mapped facilities include Himmelstalund sports cluster/Stadium Arena, Borgsmo IP, PreZero Arena, City Gross Arena, Loddby IP, Racketstadion, tennis/training grounds and outdoor gyms. The runtime has **161 pitch land-cover fragments**, not 161 separately surveyed floodlit venues. Indoor sports-centre tags also occur in the extract; light only evidenced outdoor activity/entrances.

Define per-site OFF/TRAINING/EVENT where appropriate, defaulting unknown events off. Existing masts, aim points and curfews must come from facility records or dated references. Do not clone the arena's light arrays onto every pitch. Use grouped area lighting/limited analytic emitters and batched visible projectors, not hundreds of dynamic shadows.

## L. Additional permanent and temporary assets

Selected windows, hotel/commercial signs, public art, industrial security lights, parking structures, festive trees and temporary events need separate evidence and ownership. Permanent infrastructure may carry a seasonal effect; model the installed object, effect program and activation validity separately. Seeded windows can eventually be estimates tied to floor/window geometry and business state, never a surveyed room-occupancy claim. Unknown temporary installations are excluded from the permanent-2026 layer.
