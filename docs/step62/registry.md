# Registry and geographical QA contract

[JSON Schema draft-07](registry.schema.json) is the proposed contract; [sample records](inventory.sample.json) are research examples, not runtime lights. Geometry may remain a source reference. Nulls are intentional. Horizontal coordinates are **E,N metres in EPSG:3006**, vertical values only RH2000. This is a custom registry, not an RFC7946 GeoJSON file mislabeled with projected coordinates.

## Meaning and evidence

Keep four independent concepts: object/site existence, geographic representation, actual illumination, and activation. A site anchor or route is not an emitter. Geometry may be absent while illumination is documented; a detailed model may exist with unknown lighting. Every evidence item lists which facts it supports. Confidence describes the record's supported claim, never elevates all null fields to facts.

Azimuth is clockwise from **grid north** in degrees; null is unknown. Real fixture aim needs tilt and photometry extensions before rendering; do not overload azimuth with the existing bracket-arm radians. Mounting height is above its actual support surface, not absolute RH2000. DTM sampled ground height must be tagged derived with dataset/revision and cannot silently become surveyed pole elevation. AIP elevations in feet/AMSL are not automatically RH2000.

Stable IDs: municipal owner+asset ID; OSM `osm:node/<id>` etc; estimates `estimate:<generator-version>:<source-way>:<direction>:<chainage-key>`; missing subcomponents `component:<parent>:<name>`. IDs must survive reorder/refresh. Parent-child geometry records (Gull-Olle → Rådhuset) must not create another building. A hypothetical operator-listed fuel site with no point retains null position and does not enter geometric fixture generation.

Future full registry should add per-field confidence/validity, intensity units, tilt/IES references, source geometry hash, algorithm seed/version, support surface reference and operating-group IDs. The sample deliberately does not default unknown CCT, flux, height, orientation or business schedules.

## Deterministic import and duplicate control

1. Freeze exact query, extraction bbox, OSM base, element ID/version/edit date, source URL and SHA-256; pin input fixtures and code revisions. Live Overpass reruns are intentional **new snapshots**, not byte-identical reproducibility. Existing runtime files never change merely because research was refreshed.
2. Normalize each input CRS/unit/datum explicitly; verify with independent PROJ/reference controls before storing. Clip to true polygon, while retaining outside-coverage relation dependencies separately. Keep component references stable when clipping creates fragments.
3. Deduplicate same source ID first. Reconcile municipal ↔ OSM IDs through a crosswalk; use distance, mount side, height/type and photos as candidates for review, never an automatic proximity merge across opposite sides of a road.
4. Municipal confirmed fixtures supersede estimated render instances only through a recorded match. Preserve both source claims and decisions. Suppress/replace estimates in a bounded radius along the same evidenced segment/support; never delete a distinct real adjacent luminaire because it is close.
5. Sort output by stable ID; sort source references/crosswalks; use fixed metre rounding and deterministic seeds. Byte-identical generation from pinned inputs is a future importer acceptance check. Reject duplicate IDs, orphaned parents, unsupported survey labels, invalid CRS/finite numbers and explicit-unlit estimates. Keep a rejected-record report.
6. ODbL-derived data and restricted reference-only municipal/operator material retain distinct provenance and permissions. References with unresolved permission are allowed in the research registry but **not licensed source geometry** in a distributable runtime build. Database share-alike obligations require review when combining datasets; separation of files alone is not a legal exemption.

Fuel candidates at 42.1 m and 58.5 m separation are flagged in evidence; neither pair was automatically merged. Fuel/EV nodes or independent operators on one industrial site can legitimately be adjacent. A geometry midpoint is labelled derived even if the source polygon is accurately mapped.

## Development-only inspection mode (planned)

Implement a lazy `DEV && ?lightingInventory=1` inspector after Phase 0. Reuse the current scene/frame. Select layers with shape **and** color: surveyed fixtures (green square), OSM mapped (blue circle), estimates (amber diamond), unknown illumination (gray hollow symbol), explicit unlit (cross), missing geometry (magenta outline). Add source-coverage polygons, outside-data hatching, canonical IDs and separate implemented/planned switches. Do not represent every planned site as an already installed bulb.

Click shows E/N, RH2000 or “unknown”, position meaning, field provenance, source/observation dates, licence status, confidence, support surface, generator/version, unresolved items and runtime-instance match. Unknown geometry appears in a side list, not at (0,0). Filter date/asset/source/category and export a deterministic filtered review list.

Add grid heatmap with **raw** candidate occupancy, retained count, dropped IDs/energy estimate, page residency/borders and per-cell capacity failures. Perf overlay: visible instances/chunks, GPU/CPU estimated bytes, program count, frame p50/p95, worker/upload latency and draw calls. Hotspots are measured, not inferred solely from fixture count. Retain true grid north and metre scale; overlay active support surfaces at bridges.

An immediate dependency-free preview is [inventory-map.html](inventory-map.html). It shows retained mapped lamp/fuel/site anchors, the 105 actual pilot fixtures with mapped/estimated distinctions and map bounds; click for E/N and provenance, zoom/pan, filter classes. It has no municipal basemap, no production hook and no photometric/visual validation claim. It does not show source-coverage polygons or heatmaps, which remain planned. Source geometry coordinates remain linked in the JSON evidence.
