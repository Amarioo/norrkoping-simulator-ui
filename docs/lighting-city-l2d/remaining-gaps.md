# Phase L2d — remaining gaps

| Gap | Effect | Possible next step |
|---|---|---|
| **Whether a site is lit at all** | OSM almost never says (0 of 609 lots carry `lit=*`); every lit lot, yard and site road is an assumption | site owners' data; or detect real masts in Lantmäteriet's laser point cloud (as D1b did for the police tower) and use them as evidence |
| **Open industrial and port yards** (log yards, quays, storage) | dark unless OSM maps a lot or a service road there; most of the 98 bright satellite pixels still without lighting are the Braviken paper mill / Holmen and port land at Marbystrand–Lindö | a rule for open hardstanding (needs paved-surface evidence: aerial imagery classification or LiDAR intensity), or masts found in LiDAR |
| **Schedules** | every site is lit dusk to dawn like the streets; retail lots may switch off or dim after closing, industry often runs all night | per-category switching needs a per-lamp flag in the shader patch (one more uniform, no new program); only worth it with real schedules |
| **Lots < 500 m², courtyards, parking aisles outside mapped lots** (224 small lots, 259 aisles, 1 936 untagged service roads outside site land) | dark; real courtyards often have a few wall or pole lights | wall-mounted lights on buildings (a new type) if review asks for it |
| **Multi-storey roof decks, underground garages** | no fixture (11 lots) | roof decks need building heights per deck; out of scope |
| **Industrial spurs, tram depot yard** | dark (42 spur ways, 42 tram yard/siding ways) | include when reviewing a specific site |
| **Photometry of the two new types** | estimates (≈ 22–24 lx below the head, 4 000 K) | luminaire data or measured illuminance from a site |
| **Lot interior grid** | only lots wide enough for a point ≥ 19.2 m from the outline get one (63 grid poles); mid-size lots rely on the perimeter row | a denser grid or aisle-based placement if review shows dark lot centres |
| **Rendered map vs L2d snapshot** (2026-10-16 vs 2026-10-26) | 4 service roads not in the rendered map, 1 with moved geometry: no fixtures | refresh the rendered map |
| **Lighting map snapshot vs L2d snapshot** (L0 2026-10-24) | a service road newer than L0 is treated as dark by L0 (none found to matter) | refresh L0 together with the map |
| **Weaker hardware** | not measured | measure before claiming support |
