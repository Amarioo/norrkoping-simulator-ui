# Map data attribution and licence

The derived database `src/lib/data/norrkoping-map.json` and `src/lib/data/transport-network.json` (also distributed as the backend resource `transport-network.json`) contain data from **© OpenStreetMap contributors**, obtained through the public Overpass API.

- Source and attribution: https://www.openstreetmap.org/copyright
- Database licence: Open Data Commons Open Database Licence (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/
- Snapshot time, geographic bounds, the SWEREF 99 TM scene reference, scale and extraction query are recorded in the file's `meta` object.
- The derived database is made available under ODbL 1.0. Retain attribution and follow its redistribution/share-alike requirements when sharing this data or further adapted databases.

The importer converts WGS84 coordinates to SWEREF 99 TM (EPSG:3006) and then to a local scene frame (25 ground metres per unit, fixed SWEREF 99 TM origin), clips polygons, assigns land-cover classes and estimates missing building heights/materials. Architectural details and supplemental planting are illustrative additions. The reference screenshot supplied by the user is not used as a map texture or redistributed asset.

This notice covers the map database; it does not change the licence of application code or dependencies.

The supplemental snapshot `scripts/data/norrkoping-transit-source.json` is also © OpenStreetMap contributors, ODbL 1.0. It contains tram route relations, tram stops, railway stations, bus stops and public transport stop positions in the same bounding box. Its `osm3s.timestamp_osm_base` records the source time.

## Additional place geometry and police emblem

`scripts/data/norrkoping-places-source.json` and `src/lib/data/city-places.json` contain platform/pitch/roof geometry from © OpenStreetMap contributors under ODbL 1.0. The source timestamp is retained. Shelter architecture, station/terminal details and the grandstand are illustrative models based on user-supplied reference images; those photographs are not embedded or redistributed.

`public/assets/polisen.svg` is the original artwork retrieved from https://polisen.se/images/Polisen.svg on 2026-10-16. `polis-emblem.svg` retains that artwork with an emblem-only viewBox and explicit dimensions for WebGL rasterization. Credit: Polismyndigheten. Source information: https://polisen.se/om-polisen/om-webbplatsen/bild-och-text-upphovsratt/ . The insignia is used on the depicted police building in this local city simulation, and is not the simulator's branding. No endorsement is implied. This artwork is not covered by the ODbL map licence.

## Bridge references

`scripts/data/norrkoping-bridges-source.json`, `scripts/data/norrkoping-bridge-paths-source.json` and `src/lib/data/city-bridges.json` are derived from © OpenStreetMap contributors under ODbL 1.0. The bridge footprint snapshot was retrieved on 2026-10-16. Lengths/positions use those polygons or mapped crossing lines; railing designs, pier placement, heights and material finishes are approximate visual interpretations.

`scripts/data/norrkoping-railway-tags-source.json` (tags of `railway=rail|tram|light_rail` ways) and `scripts/data/norrkoping-service-roads-source.json` (tags of `highway=service` ways) are tag-only Overpass extracts for the same bounding box, © OpenStreetMap contributors, ODbL 1.0, retrieved 2026-10-18 (`osm3s.timestamp_osm_base`). They decide which rail ways are bridges (scripts/geo/rail-legacy-ramps.mjs) and the widths of untagged service roads (scripts/geo/service-road-widths.mjs); no geometry is taken from them.

Measured bridge-deck heights in `src/lib/data/bridge-profiles.json` (road and path decks) are derived from Lantmäteriet Laserdata NH 2020, class 17 ("bro"), ©Lantmäteriet, CC BY 4.0, processed: per deck node the median of the densest 1 m height band of the returns within 2.5 m. The extracted points stay local under work/geodata/lantmateriet/deck17/ and are not in Git.

Visual reference pages (photographs were inspected, not embedded or redistributed):
- Bergsbron, municipal tourism photograph: https://visit.norrkoping.se/nyheter/nyhetsarkiv/2025-05-23-tavlingstiderna-for-sm-veckan-i-norrkoping-ar-har
- Laxholmsbron railing, Måns Hågberg's photograph: https://www.fotosidan.se/blogs/manshagberg/mitt-i-mitten-i-industrilandskapet.htm
- Saltängsbron, Boberger photographs: https://commons.wikimedia.org/wiki/Category:Salt%C3%A4ngsbron
- Bridge construction and railing photographs: https://skarsfjall.se/fasta-forbindelser/
- Strömparken context: https://visit.norrkoping.se/se-och-gora/temasidor/vinterkoping/historisk-promenad/strommen

The supplied allée photo guides the slimmer crowns and exposed trunks. No Street View image is used as a scene texture.

## Markhöjdmodell för hela kartan

Aktiv källa: Markhöjdmodell Nedladdning ©Lantmäteriet, bearbetad.
Licens: https://creativecommons.org/licenses/by/4.0/deed.sv
Villkor: https://www.lantmateriet.se/globalassets/geodata/geodataprodukter/anvandningsvillkor_for_vardefulla_datamangder.pdf

Bearbetning: mosaik av fyra GeoTIFF-leveranser med 1 m upplösning i SWEREF 99 TM / RH 2000, bilinjär omsampling till simulatorns lokala rutnät med 5 m provavstånd. Ingen höjdöverdrift. Samma bearbetade höjddata distribueras i klient och backend. Råfilerna ligger lokalt under work/geodata/lantmateriet/dtm/ och ingår inte i Git.

Steg 5 (2026-10-19): där ett brodäck klassats som mark (Laserdata NH 2020 klass 2, ingen klass 17) har däcket tagits bort ur det bearbetade rutnätet på samma sätt som DTM tar bort broar (platån ersatt av marken bortom väggarna, linjärt tvärs bron): E4 över Järngatan och en gångbro, se scripts/data/dtm-retained-decks.json och scripts/geo/dtm_corrections.py. Vägytan i fyra prototyprutor (terrain.json mesh.patches) är ett robust lokalt plan av 1 m-DTM:s pixlar inom asfalten. Leveranserna är oförändrade.

Steg 5.1 (2026-10-19): vägytan och spårbädden i de riktade lapparna (terrain.json mesh.patches, scripts/data/geometry-refinement-targets.json) är robusta lokala plan av 1 m-DTM:s pixlar; terrängdetaljpunkter är enskilda DTM-pixlar. Ändpunkter för spårbroar ligger på medianen av 1 m-DTM längs spåret 4–12 m ut. Bilderna i docs/step51/lidar/ är härledda ur Laserdata NH 2020 (intensitet och klass, ©Lantmäteriet, CC BY 4.0) och Markhöjdmodell 1 m (©Lantmäteriet, CC BY 4.0), bearbetade; råpunkterna ligger kvar lokalt och är inte i Git.

## Step 6 (2026-10-21): street lighting and Idrottsparken

`scripts/data/norrkoping-lighting-source.json` (street-lamp nodes, entrance nodes and highway ways with their `lit`/`sidewalk`/`width` tags in the three pilot areas), `src/lib/data/streetlights.json` and `src/lib/data/streetlights-provenance.json` are derived from © OpenStreetMap contributors, ODbL 1.0, retrieved through the Overpass API on 2026-10-21 (queries and `osmBase` timestamps in the files). Mapped lamp positions are OSM positions, not surveys. Estimated fixtures, fixture types and photometry are this project's approximations; see `docs/step6/lighting-data.md`. No Norrköping municipal lighting dataset was found to be published (checked 2026-10-21).

Idrottsparken heights and floodlight-mast positions (`src/lib/stadium/spec.ts`) are derived from Lantmäteriet Laserdata NH 2020 (tile 64925_5675), ©Lantmäteriet, CC BY 4.0, processed with `scripts/geo/stadium_lidar.py`; the footprint is © OpenStreetMap contributors (relation 1440621 and its parts), ODbL 1.0. Wikimedia Commons photographs (Nyaparken.jpg, Nya_Parken.jpg, Football_at_parken.JPG, Peking_fanz.jpg, GAIS efter IFK Norrköping 2025-05-31.jpg, Ove Kindvalls hedersläktare.jpg; CC BY-SA 3.0, CC BY 3.0 and CC0, authors listed in `docs/step6/stadium-references.md`) were inspected as references only; no photograph or texture is embedded or redistributed. The stadium model, its colours and the turf markings are original procedural work.

## Lighting Phase L0 (2026-10-24): citywide lighting map

`scripts/data/lighting-city-source.json` and the files under `docs/lighting-city-l0/` (classification, statistics, capacity and satellite checks, `lighting-map.html`) contain:

- data from **© OpenStreetMap contributors**, ODbL 1.0 (every `highway` way, street-lamp, signal, crossing and place nodes in the map box; Overpass, OSM base 2026-10-24T19:51:21Z). These files are adapted databases under ODbL 1.0.
- **SCB Statistiska tätorter 2023**, CC0 1.0 (SCB open geodata, https://www.scb.se/omscbse). Källa: SCB, bearbetad av detta projekt; the processed result is not SCB's.
- pixel values of **NASA Black Marble 2016** (NASA GIBS, layer `VIIRS_Black_Marble`), no use restriction; courtesy of NASA. Used only as a plausibility check.

Lit/dark decisions "by rule" follow the text of Norrköping's *Riktlinje för belysning* (2023-06-07); the document itself is not redistributed. Lamp positions are estimates (see `docs/lighting-city-l0/data-provenance.md`).

## Lighting Phase L2a (2026-10-25): citywide street lighting

`scripts/data/lighting-l2-source.json`, `src/lib/data/streetlights-l2.json` (runtime, compact format) and `docs/lighting-city-l2/data/streetlights-l2-provenance.json` are derived from **© OpenStreetMap contributors**, ODbL 1.0 (the Lighting Phase L0 snapshot, OSM base 2026-10-24T19:51:21Z) and from the L0 classification (which also uses SCB Statistiska tätorter 2023, CC0, Källa: SCB, bearbetad). They are adapted databases under ODbL 1.0. Every fixture position, type and photometry is this project's estimate; see `docs/lighting-city-l2/data-provenance.md`.

## Lighting Phase L2bc (2026-10-25): paths, squares, junctions and motorways

`scripts/data/lighting-l2bc-source.json`, `src/lib/data/streetlights-l2bc.json` (compact runtime) and `docs/lighting-city-l2bc/data/streetlights-l2bc-provenance.json` are derived from **© OpenStreetMap contributors**, ODbL 1.0 (Lighting Phase L0 snapshot, OSM base 2026-10-24T19:51:21Z) and from the L0 classification (with SCB Statistiska tätorter 2023, CC0, Källa: SCB, bearbetad). Adapted databases under ODbL 1.0. Four fixtures are OSM street-lamp nodes at their mapped positions; all others are this project's estimates (`docs/lighting-city-l2bc/data-provenance.md`).

## Landmark Phase B1 (2026-10-25): Rådhuset and Gull-Olle

The dimensions in `src/lib/landmarks/radhuset/spec.ts` and the measurement file `docs/landmark-b1/data/radhuset-lidar.json` are derived from Lantmäteriet's point cloud (STAC collection `dsm-skoglig-copc`, "Laserdata NH 2020", tile y20c012-64950_5675_25, 2020-02-03), ©Lantmäteriet, CC BY 4.0, processed with `scripts/landmark-b1/radhuset_lidar.py` (the raw points stay local and are not in Git); the footprint is © OpenStreetMap contributors (way/285809156), ODbL 1.0. Tower height (68 m) and sculpture height (4.5 m) are text facts from Norrköpings kommun ("Norrköpings rådhus", norrkoping.se, read 2026-10-25) and sv.wikipedia. The Wikimedia Commons photographs "Norrköpings Rådhus, norra fasaden mot Tyska Torget.jpg" (Måns Hagberg, CC BY-SA 4.0), "Norrköpings rådhus tower 20th of September 2016.jpg" (Xamreb, CC BY-SA 4.0) and "Norrköpings rådhus (hösten 2025).jpg" (OMXSHSB, CC0) were inspected as references only; no photograph or texture is embedded or redistributed. The model, its colours and the clock dial are original procedural work; estimated parts are listed in `docs/landmark-b1/data-provenance.md`.

## Police Signs Phase D1 (2026-10-25): the police emblem on Polishuset

The sign uses the existing `public/assets/polis-emblem.svg` under the notice above (Polismyndigheten; used only on the depicted police building). Its outline `src/lib/landmarks/police/emblem-outline.json` is derived from that artwork by `scripts/police-signs-d1/emblem-outline.mjs` and carries the same restriction. The tower measurements in `docs/police-signs-d1/data/police-tower-lidar.json` and `src/lib/landmarks/police/spec.ts` are derived from Lantmäteriet's point cloud (STAC collection `dsm-skoglig-copc`, "Laserdata NH 2020", tile y20c012-64950_5675_25, 2020-02-03), ©Lantmäteriet, CC BY 4.0, processed with `scripts/police-signs-d1/police_tower_lidar.py` (the raw points stay local and are not in Git). The sign's size and position were measured in Hemsö's property photograph of Stinsen 1 (hemso.se, image 2023-10, read 2026-10-25) and checked against the Wikimedia Commons photographs "Polishuset Norrköping 2008-05-10.jpg" (Sakletare, public domain), "Polishuset Norrköping.jpg" and "Norrköping juni 2018 51.jpg" (Johan Jönsson, CC BY-SA 4.0); all were inspected as references only, no photograph is embedded or redistributed. Facts about the 2026 move of the police reception are from Polisen's notice of 2026-01-19. Estimated parts (night glow, mounting depth) are listed in `docs/police-signs-d1/data-provenance.md`.
