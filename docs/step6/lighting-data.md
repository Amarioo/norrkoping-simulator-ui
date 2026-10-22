# Step 6 street-lighting data: sources, coverage and approximations (2026-10-21)

## Sources checked

| Source | Checked | Result | Licence | Used |
|---|---|---|---|---|
| OpenStreetMap via Overpass API (`https://overpass-api.de/api/interpreter`) | 2026-10-21, OSM base 15:53–15:54 UTC | Whole map area (58.555–58.650 N, 16.065–16.295 E): **25** `highway=street_lamp` nodes (edited 2014–2023), **2 040** ways `lit=yes`, **175** `lit=no` | ODbL 1.0 | Yes: `scripts/data/norrkoping-lighting-source.json` (pilot boxes only) |
| Norrköpings kommun open data | 2026-10-21 | dataportal.se organisation store 215 lists **no** lighting dataset; `norrkoping.se/oppna-data` returns HTTP 404 | — | Not available |
| dataportal.se (national) search "belysning" | 2026-10-21 | Lamp datasets only for Stockholm ("Belysningsmontage") and Huddinge ("Belysningsstolpe"); none for Norrköping | — | Not applicable |
| Lantmäteriet Laserdata NH 2020 | 2026-10-21 | ~1–2 returns/m²: too sparse to detect 8 m poles reliably | CC BY 4.0 | Not used for lamps (used for the stadium) |

Re-fetch with `node scripts/step6/fetch-lighting-sources.mjs` (queries and OSM timestamps are stored in
the file). Normal startup reads only local data.

## Pilot areas (scene units, 1 = 25 m; `scripts/step6/pilots.mjs`)

| Pilot | Bounds x / z | lit=yes / no / untagged ways | Mapped lamps | Estimated fixtures |
|---|---|---|---|---|
| Kungsgatan (Kungsbron – Skvallertorget – Vattengatan) | −25.0…−19.6 / −14.6…3.1 | 47 / 1 / 66 (3.6 km lit) | 1 (node 11231112374) | 41, incl. 7 on the Kungsbron deck |
| Strömparken (footways 92429395, 243821537) | −10.2…−5.8 / −9.3…0.6 | 32 / 0 / 64 (2.5 km lit) | 9 (nodes 11097913749 … 11098661617, mapped 2023-08-08) | 16 |
| Idrottsparken surroundings (Ektorpsgatan, Södra Promenaden, Albrektsvägen) | −39.6…−27.0 / 18.4…32.4 | 41 / 0 / 94 (5.7 km lit) | 0 | 35 street + 3 entrance posts |

Camera presets: `docs/step6/poses.json` (also Utforska → "Kungsgatan", "Strömparken · gångstråket",
"Idrottsparken · planen").

## Placement rules (`scripts/step6/import-streetlights.mjs`)

- **Mapped**: every OSM lamp node in a pilot. The position is *mapped*, not surveyed (uncertainty
  3 m recorded). Type, height, colour temperature and output are *inferred* from the nearest way.
- **Estimated**: only along `lit=yes` ways. `lit=no` gets nothing; untagged ways are *unknown* and get
  nothing, so dark areas stay dark.
  - Main roads (primary–tertiary): 8 m bracket luminaires, 30 m spacing, staggered on both sides when
    the mapped width is ≥ 9 m or on a bridge, else one side, 0.8 m behind the kerb line.
  - Minor roads: 6 m brackets, 27 m spacing, one side.
  - Footways/paths: 4.2 m lanterns, 22 m spacing, 1.2 m beside the path.
  - Separately mapped sidewalks/crossings (and paths running within 10 m of a lit road) are covered by
    the road lighting and get no fixtures of their own.
- **Conflicts**: a station is shifted up to ±4 m along the way, or dropped, when it is inside or
  within 0.6 m of a building, inside a carriageway (half width + 0.4 m), within 1.2 m of a tram/rail
  track, or within 1.5 m of a mapped entrance node.
- **Deduplication**: estimates within the type's suppression radius (9–14 m) of a mapped lamp are
  dropped (mapped coverage wins); estimates closer than 0.55 × spacing to an earlier estimate (parallel
  carriageways, junctions) are dropped. Counts per reason are in the provenance file.
- **Mounting**: ground fixtures stand on the rendered ground; Kungsbron fixtures stand on the drawn
  deck (bridge way profile + road surface) and do not light the water below the deck.
- **Occlusion**: 16 horizontal sectors per fixture, each the shortest distance to a building wall along
  three rays (2D OSM footprints).
- **Stadium entrances** (separate night logic, not the floodlights): a post beside the mapped gate
  "Entre 3, bortastå" and two posts flanking the main entrance plaza on the west side (estimated).

Every fixture has a stable id (`<pilot>:osm-node-<id>` or `<pilot>:est-way-<id>-<station>`).

- **`src/lib/data/streetlights.json`** (bundled, 37 kB): position, mount, type, photometry and occlusion.
- **`src/lib/data/streetlights-provenance.json`** (not bundled): method, OSM element/version/timestamp,
  observed vs inferred characteristics and uncertainty.

## Fixture types (inferred; no Norrköping luminaire data was available)

| Type | Height | Colour temperature | Peak intensity | Range | Distribution |
|---|---|---|---|---|---|
| street-bracket-8m | 8 m, 1.4 m arm | 3 000 K | 1 600 cd (≈ 25 lux under the lamp) | 30 m | full cut-off, max ~65°, none above ~80° |
| street-bracket-6m | 6 m, 0.9 m arm | 3 000 K | 900 cd | 24 m | full cut-off |
| park-lantern-4m | 4.2 m post-top | 2 700 K | 380 cd | 16 m | lantern, some light to ~95° |
| entrance-post-4m | 4 m post-top | 4 000 K | 450 cd | 15 m | lantern |
| Floodlights | masts 52–58 m, roof edges ~14.7 m | 5 700 K (LED, estimated) | 2.55 M cd per mast beam, 0.54 M cd per roof-row beam | — | spots, 20°/36° and 38°/62° |

The floodlight intensities are a calibration, not data: they give **1 200 lux** average on the pitch
with uniformity min/avg **0.58** (CPU reference, 77 points), a plausible top-flight football level.

## Known approximations

- Pole positions of estimated fixtures are uncertain to about half the spacing (recorded per fixture).
- OSM may tag `lit=yes` on ways that are lit only by building or neighbouring lights; this is not
  distinguishable in the data.
- Paved path way 94463450 parallel to Kungsgatan (`lit=yes`, paving stones) receives 14 estimated
  lanterns; the real fixtures there are unknown.
