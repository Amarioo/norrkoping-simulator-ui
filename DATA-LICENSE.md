# Map data attribution and licence

The derived database `src/lib/data/norrkoping-map.json` and `src/lib/data/transport-network.json` (also distributed as the backend resource `transport-network.json`) contain data from **© OpenStreetMap contributors**, obtained through the public Overpass API.

- Source and attribution: https://www.openstreetmap.org/copyright
- Database licence: Open Data Commons Open Database Licence (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/
- Snapshot time, geographic bounds, origin, scale and extraction query are recorded in the file's `meta` object.
- The derived database is made available under ODbL 1.0. Retain attribution and follow its redistribution/share-alike requirements when sharing this data or further adapted databases.

The importer converts coordinates to a local 1:25 scene, clips polygons, assigns land-cover classes and estimates missing building heights/materials. Architectural details and supplemental planting are illustrative additions. The reference screenshot supplied by the user is not used as a map texture or redistributed asset.

This notice covers the map database; it does not change the licence of application code or dependencies.

The supplemental snapshot `scripts/data/norrkoping-transit-source.json` is also © OpenStreetMap contributors, ODbL 1.0. It contains tram route relations, tram stops, railway stations, bus stops and public transport stop positions in the same bounding box. Its `osm3s.timestamp_osm_base` records the source time.

## Additional place geometry and police emblem

`scripts/data/norrkoping-places-source.json` and `src/lib/data/city-places.json` contain platform/pitch/roof geometry from © OpenStreetMap contributors under ODbL 1.0. The source timestamp is retained. Shelter architecture, station/terminal details and the grandstand are illustrative models based on user-supplied reference images; those photographs are not embedded or redistributed.

`public/assets/polisen.svg` is the original artwork retrieved from https://polisen.se/images/Polisen.svg on 2026-10-16. `polis-emblem.svg` retains that artwork with an emblem-only viewBox and explicit dimensions for WebGL rasterization. Credit: Polismyndigheten. Source information: https://polisen.se/om-polisen/om-webbplatsen/bild-och-text-upphovsratt/ . The insignia is used on the depicted police building in this local city simulation, and is not the simulator's branding. No endorsement is implied. This artwork is not covered by the ODbL map licence.

## Bridge references

`scripts/data/norrkoping-bridges-source.json`, `scripts/data/norrkoping-bridge-paths-source.json` and `src/lib/data/city-bridges.json` are derived from © OpenStreetMap contributors under ODbL 1.0. The bridge footprint snapshot was retrieved on 2026-10-16. Lengths/positions use those polygons or mapped crossing lines; railing designs, pier placement, heights and material finishes are approximate visual interpretations.

Visual reference pages (photographs were inspected, not embedded or redistributed):
- Bergsbron, municipal tourism photograph: https://visit.norrkoping.se/nyheter/nyhetsarkiv/2025-05-23-tavlingstiderna-for-sm-veckan-i-norrkoping-ar-har
- Laxholmsbron railing, Måns Hågberg's photograph: https://www.fotosidan.se/blogs/manshagberg/mitt-i-mitten-i-industrilandskapet.htm
- Saltängsbron, Boberger photographs: https://commons.wikimedia.org/wiki/Category:Salt%C3%A4ngsbron
- Bridge construction and railing photographs: https://skarsfjall.se/fasta-forbindelser/
- Strömparken context: https://visit.norrkoping.se/se-och-gora/temasidor/vinterkoping/historisk-promenad/strommen

The supplied allée photo guides the slimmer crowns and exposed trunks. No Street View image is used as a scene texture.
