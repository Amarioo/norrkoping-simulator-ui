// Lighting Phase L2d: the OSM source extract for site lighting (parking, rail yards, private land).
//
//   node scripts/lighting-l2d/extract-source.mjs      → scripts/data/lighting-l2d-source.json
//
// Input:  the pinned snapshot work/lighting-city-l2d/raw/osm-sites.json (ignored scratch; its SHA-256
//         must equal scripts/lighting-l2d/sources.json, else nothing is written).
// Output: © OpenStreetMap contributors, ODbL-1.0. Elements sorted by (type, id) with the
//         site-relevant tags, version, timestamp and lat/lon geometry (ways: `geometry`; relations:
//         `outer` / `inner` rings joined from their member ways; nodes: lat/lon):
//   - every amenity=parking way and node (the generator decides which are lit, with a reason);
//   - every landuse=railway|industrial|port|retail|commercial way and multipolygon relation;
//   - every railway way with service=yard|siding|spur;
//   - every highway=service way;
//   - railway=station|halt nodes; man_made=mast / tower:type=lighting / light_source objects are only
//     counted (none is a mapped site luminaire in this snapshot).
import crypto from 'node:crypto';
import fs from 'node:fs';

const SOURCE = JSON.parse(fs.readFileSync('scripts/lighting-l2d/sources.json', 'utf8')).sources.osm;
const OUT = 'scripts/data/lighting-l2d-source.json';
const KEEP =
  /^(amenity|parking|building|covered|location|level|layer|landuse|industrial|railway|service|usage|highway|lit|lit:.*|name|access|surface|oneway|width|est_width|lanes|area|bridge|tunnel|operator|park_ride|supervised|capacity|man_made|tower:type|light_source|electrified|disused|abandoned)$/;
const raw = fs.readFileSync(SOURCE.file);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
if (sha256 !== SOURCE.sha256) throw new Error(`${SOURCE.file}: SHA-256 ${sha256} differs from pinned ${SOURCE.sha256}`);
const osm = JSON.parse(raw.toString('utf8'));
const tags = (t = {}) =>
  Object.fromEntries(
    Object.keys(t)
      .filter((k) => KEEP.test(k))
      .sort()
      .map((k) => [k, t[k]]),
  );
const LANDUSE = /^(railway|industrial|port|retail|commercial)$/;
const ll = (g) => g.map((p) => [p.lat, p.lon]);
/** Joins member way geometries into closed rings (end-to-end), in member order; open chains are dropped. */
function joinRings(members) {
  const segs = members.map((m) => ll(m.geometry));
  const rings = [];
  const key = (p) => `${p[0]},${p[1]}`;
  while (segs.length) {
    let ring = segs.shift();
    let grown = true;
    while (key(ring[0]) !== key(ring.at(-1)) && grown) {
      grown = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (key(s[0]) === key(ring.at(-1))) ring = [...ring, ...s.slice(1)];
        else if (key(s.at(-1)) === key(ring.at(-1))) ring = [...ring, ...[...s].reverse().slice(1)];
        else continue;
        segs.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring.at(-1)) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}
const counted = { masts: 0, lightingTowers: 0, lightSource: 0, streetLampNodes: 0, relationsDroppedOpenRings: 0 };
const elements = [];
for (const e of osm.elements) {
  const t = e.tags ?? {};
  const keep =
    t.amenity === 'parking' ||
    LANDUSE.test(t.landuse ?? '') ||
    (e.type === 'way' && t.railway && /^(yard|siding|spur)$/.test(t.service ?? '')) ||
    (e.type === 'way' && t.highway === 'service') ||
    (e.type === 'node' && /^(station|halt)$/.test(t.railway ?? ''));
  if (t.man_made === 'mast') counted.masts++;
  if (t['tower:type'] === 'lighting') counted.lightingTowers++;
  if (t.light_source) counted.lightSource++;
  if (t.highway === 'street_lamp') counted.streetLampNodes++;
  if (!keep) continue;
  const base = { type: e.type, id: e.id, version: e.version, timestamp: e.timestamp, tags: tags(t) };
  if (e.type === 'node') elements.push({ ...base, lat: e.lat, lon: e.lon });
  else if (e.type === 'way') elements.push({ ...base, nodes: e.nodes, geometry: ll(e.geometry) });
  else {
    const withGeom = (role) => (e.members ?? []).filter((m) => m.type === 'way' && m.role === role && m.geometry?.length);
    const outer = joinRings(withGeom('outer'));
    const inner = joinRings(withGeom('inner'));
    if (!outer.length) {
      counted.relationsDroppedOpenRings++;
      continue;
    }
    elements.push({ ...base, outer, inner });
  }
}
elements.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
const counts = {};
for (const e of elements) counts[e.type] = (counts[e.type] ?? 0) + 1;
const out = {
  meta: {
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    osmBase: osm.osm3s.timestamp_osm_base,
    snapshot: {
      file: SOURCE.file,
      sha256,
      retrievedAt: SOURCE.retrievedAt,
      url: SOURCE.url,
      query: SOURCE.query,
    },
    scope:
      'amenity=parking ways and nodes; landuse=railway|industrial|port|retail|commercial ways and multipolygons; railway ways with service=yard|siding|spur; highway=service ways; railway=station|halt nodes',
    notExtracted: counted,
    counts,
  },
  elements,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(OUT, fs.statSync(OUT).size, crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex'), counts, counted);
