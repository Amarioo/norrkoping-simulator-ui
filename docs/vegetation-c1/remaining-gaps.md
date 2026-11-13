# Phase C1 — remaining gaps (pilot tile and the rollout around the northern trail loop)

## Found while measuring (not caused by this phase)

| Finding | Numbers | What it means |
|---|---|---|
| The map's south edge cuts the reserve | 286.2 ha in all; **227.0 ha (79 %) inside the map, 59.2 ha (21 %) south of it**. The reserve reaches N 6 490 600; the map ends at about N 6 491 000–6 491 230 | The southern fifth cannot be drawn without extending the map (terrain, roads, land cover). The laser data already on this machine reaches N 6 490 000, so it covers the whole reserve |
| The map draws little of the reserve as woodland | Of the part inside the map: 32 % woodland, 11 % farmland, 1 % grass, **55 % no land cover at all**. The laser data shows tree canopy over 81 % of it | Most of the forest is bare ground in the app today, with no trees. A possible cause, not checked: the map import asks OSM for `natural=wood` ways but not for relations, which is how large woods are often mapped |
| Reserve size differs between sources | 286.2 ha (this outline), 286.8 ha (its own tag), 277 ha (municipality's page) | The outline is the county board's, via OSM; not checked against Naturvårdsverket's register |

## The measured forest

| Gap | Effect | Possible next step |
|---|---|---|
| 14 tiles around the trail loop | 66 ha of the reserve's 227 ha inside the map. The rest of the reserve is still bare ground, and the measured forest ends in straight tile edges towards it | the remaining tiles (about 160 ha), after level of detail and lazy loading of the data |
| Only inside the reserve | trees just outside the reserve line (gardens, road verges, the wood west of the loop) are not measured | measure other woods with a rule that separates trees from buildings and other objects |
| The trail loop is OSM's | it only chose the tiles; its match with the municipal illuminated loop is not verified | C2: verify the alignment before any lamp is placed |
| The data is part of the app's code file | the measured trees add 0.34 MB (83 kB compressed) to the first download | load the forest data separately, when the map is ready |
| Tree tops, not stems | 8 071 tops; merged crowns count once, trees under the canopy are missing. 596 crowns are at the 8 m size limit (probably groups) | a finer split of large crowns, checked against a field count or an aerial photo |
| Crown base is rough | few pulses reach the lower crown; 634 trees use 0.5 × height | accept, or use the newer, denser *Laserdata Skog* if it covers the area |
| No species | every tree has the same neutral crown; pines, spruces and birches look alike | conifer/deciduous from leaf-off/leaf-on data or from the crown's shape, if a source is found |
| 403 measured tops are not drawn (27 in the pilot tile) | their stem would stand on a path, a road or a pitch; the trail corridors are therefore a little wider than in reality | move such stems to the path's edge instead of leaving them out |
| The forest floor has 5 m steps | blocky edges towards clearings | a smoother outline of the canopy mask |
| The forest floor's look is assumed | the map's woodland green under all canopy | none planned |
| The 2020 scan | storm damage, felling and growth since 2020 are missing | re-measure when a newer scan is published |
| Other tree rows and parks | unchanged: illustrative trees about 13 m tall | the same method works for any area the LiDAR covers |
| No level of detail | every tree is drawn in full at any distance: 68 triangles per tree, 0.56 million for the 14 tiles | needed before the rest of the reserve (about 27 000 trees inside the map in all, an extrapolation) |
| Night | the forest is dark; nothing is lit by this phase | C2 (the illuminated trail) |
| Weaker hardware | not measured | measure before claiming support |
