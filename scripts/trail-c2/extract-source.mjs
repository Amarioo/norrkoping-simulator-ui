// Phase C2 (Vrinnevi illuminated trail): the OSM source extract for the trail loop.
//
//   node scripts/trail-c2/extract-source.mjs      → scripts/data/trail-c2-source.json
//
// Inputs:
//   - the pinned Lighting Phase L0 snapshot work/lighting-city-l0/raw/osm-city.json (ignored scratch;
//     its SHA-256 must equal scripts/lighting-city/sources.json, else nothing is written): the ways,
//     with version, timestamp, tags, node IDs and lat/lon geometry. The same snapshot that L0, L2a and
//     L2bc were generated from, so the trail's ways are exactly the ways those phases saw;
//   - scripts/vegetation-c1/trail-osm.json (Phase C1, Overpass 2026-11-13): the route relation
//     5703856 (route=running), which says WHICH ways form the loop.
// Output: © OpenStreetMap contributors, ODbL-1.0. The loop's ways sorted by ID. No timestamps of this
// run and no machine paths.
import crypto from 'node:crypto';
import fs from 'node:fs';

const PIN = JSON.parse(fs.readFileSync('scripts/lighting-city/sources.json', 'utf8'));
const pinned = (PIN.sources ?? PIN).osm;
const RAW = pinned.file ?? 'work/lighting-city-l0/raw/osm-city.json';
const RELATION = 'scripts/vegetation-c1/trail-osm.json';
const OUT = 'scripts/data/trail-c2-source.json';
const KEEP = /^(highway|lit|lit:.*|surface|tracktype|motor_vehicle|name|access|foot|bicycle|width|bridge|tunnel)$/;

const raw = fs.readFileSync(RAW);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
if (sha256 !== pinned.sha256) throw new Error(`${RAW}: SHA-256 ${sha256} differs from pinned ${pinned.sha256}`);
const osm = JSON.parse(raw.toString('utf8'));
const relationFile = fs.readFileSync(RELATION);
const trail = JSON.parse(relationFile.toString('utf8'));
const relation = trail.elements.find((e) => e.type === 'relation');
const members = relation.members.filter((m) => m.type === 'way').map((m) => m.ref);
const byId = new Map(osm.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
const missing = members.filter((id) => !byId.has(id));
if (missing.length) throw new Error(`relation members missing from the snapshot: ${missing.join(', ')}`);
const elements = [...members]
  .sort((a, b) => a - b)
  .map((id) => {
    const e = byId.get(id);
    return {
      type: 'way',
      id,
      version: e.version,
      timestamp: e.timestamp,
      tags: Object.fromEntries(
        Object.keys(e.tags ?? {})
          .filter((k) => KEEP.test(k))
          .sort()
          .map((k) => [k, e.tags[k]]),
      ),
      nodes: e.nodes,
      geometry: e.geometry.map((p) => [p.lat, p.lon]),
    };
  });
const out = {
  meta: {
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    osmBase: osm.osm3s.timestamp_osm_base,
    snapshot: { file: RAW, sha256, retrievedAt: pinned.retrievedAt ?? null },
    relation: {
      element: `relation/${relation.id}`,
      version: relation.version,
      timestamp: relation.timestamp,
      tags: relation.tags,
      file: RELATION,
      sha256: crypto.createHash('sha256').update(relationFile).digest('hex'),
      osmBase: trail.osm3s.timestamp_osm_base,
      /** Member ways in the relation's own order. */
      members,
    },
    note: 'Phase C2: the ways of the Vrinnevi illuminated trail loop (route relation 5703856), taken from the pinned Lighting Phase L0 snapshot.',
  },
  elements,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`${OUT}: ${elements.length} ways, osmBase ${out.meta.osmBase}`);
for (const e of elements) console.log(' ', e.id, `v${e.version}`, e.timestamp, JSON.stringify(e.tags), e.nodes[0], '→', e.nodes.at(-1));
