// Lighting Phase L2: the OSM source extract for the citywide street rollout (L2a).
//
//   node scripts/lighting-l2/extract-source.mjs
//
// Input:  the pinned L0 snapshot work/lighting-city-l0/raw/osm-city.json (ignored scratch; SHA-256
//         must equal scripts/lighting-city/sources.json, else nothing is written) and the committed L0
//         classification docs/lighting-city-l0/data/city-lighting-l0.json.
// Output: scripts/data/lighting-l2-source.json — © OpenStreetMap contributors, ODbL-1.0. The
//         corridor-generator format (scripts/lighting-a1/extract-source.mjs): elements sorted by
//         (type, id), lighting-relevant tags, version, timestamp, lat/lon geometry.
//   - every highway way of a car-road class (trunk … tertiary, links, residential, unclassified,
//     living_street, pedestrian, service) that L0 classified as wholly LIT (status 'lit'), plus every
//     one-way way of those classes with the same name as one of them (dual-carriageway partners);
//   - every highway=street_lamp node whose nearest highway way (any class, L0 extract) is one of the
//     car-road classes above (lamps nearest to a path belong to Phase L2b).
import crypto from 'node:crypto';
import fs from 'node:fs';

const SOURCES = JSON.parse(fs.readFileSync('scripts/lighting-city/sources.json', 'utf8')).sources;
const L0 = 'docs/lighting-city-l0/data/city-lighting-l0.json';
const L0_SOURCE = 'scripts/data/lighting-city-source.json';
const OUT = 'scripts/data/lighting-l2-source.json';
const CAR = new Set([
  'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary',
  'tertiary_link', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service',
]);
const KEEP =
  /^(highway|lit|lit:.*|name|oneway|junction|sidewalk.*|footway|width|est_width|lanes|bridge|layer|tunnel|area|embedded_rails|railway|access|foot|bicycle|motor_vehicle|surface|light_source|lamp_.*|support|man_made|operator|start_date|check_date|segregated|service)$/;

const raw = fs.readFileSync(SOURCES.osm.file);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
if (sha256 !== SOURCES.osm.sha256) throw new Error(`${SOURCES.osm.file}: SHA-256 ${sha256} differs from pinned`);
const osm = JSON.parse(raw.toString('utf8'));
const l0Text = fs.readFileSync(L0);
const l0 = JSON.parse(l0Text.toString('utf8'));
const statusOf = new Map(l0.ways.map((w) => [w[0], l0.meta.formats.statuses[w[1]]]));

const tags = (t = {}) =>
  Object.fromEntries(
    Object.keys(t)
      .filter((k) => KEEP.test(k))
      .sort()
      .map((k) => [k, t[k]]),
  );
const ways = osm.elements.filter((e) => e.type === 'way' && e.tags?.highway && e.geometry?.length >= 2);
const lit = ways.filter((e) => CAR.has(e.tags.highway) && statusOf.get(e.id) === 'lit');
const litNames = new Set(lit.filter((e) => e.tags.oneway === 'yes' && e.tags.name).map((e) => e.tags.name));
const keep = new Set(lit.map((e) => e.id));
for (const e of ways)
  if (CAR.has(e.tags.highway) && e.tags.oneway === 'yes' && litNames.has(e.tags.name)) keep.add(e.id);

// Nearest way of a lamp node, in the L0 extract (EPSG:3006), any class.
const src = JSON.parse(fs.readFileSync(L0_SOURCE, 'utf8'));
const nodeEN = new Map();
for (const e of osm.elements) if (e.type === 'node' && e.tags?.highway === 'street_lamp') nodeEN.set(e.id, e);
const { geodeticToSweref } = await import('../../src/lib/geo/sweref99tm.js');
const nearestClass = (lat, lon) => {
  const [x, y] = geodeticToSweref(lat, lon);
  let best = Infinity,
    cls = null;
  for (const [, t, , , g] of src.ways)
    for (let i = 2; i < g.length; i += 2) {
      const ax = g[i - 2], ay = g[i - 1], dx = g[i] - ax, dy = g[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - ax - u * dx, y - ay - u * dy);
      if (d < best) {
        best = d;
        cls = t.highway;
      }
    }
  return cls;
};
const elements = [];
for (const e of ways)
  if (keep.has(e.id))
    elements.push({
      type: 'way',
      id: e.id,
      version: e.version,
      timestamp: e.timestamp,
      tags: tags(e.tags),
      nodes: e.nodes,
      geometry: e.geometry.map((p) => [p.lat, p.lon]),
    });
const lampsSkipped = [];
for (const n of nodeEN.values()) {
  const cls = nearestClass(n.lat, n.lon);
  if (!CAR.has(cls)) {
    lampsSkipped.push({ node: n.id, nearestClass: cls });
    continue;
  }
  elements.push({
    type: 'node',
    id: n.id,
    version: n.version,
    timestamp: n.timestamp,
    tags: tags(n.tags),
    lat: n.lat,
    lon: n.lon,
  });
}
elements.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
lampsSkipped.sort((a, b) => a.node - b.node);
const out = {
  meta: {
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    osmBase: osm.osm3s.timestamp_osm_base,
    snapshot: {
      file: SOURCES.osm.file,
      sha256,
      retrievedAt: SOURCES.osm.retrievedAt,
      url: SOURCES.osm.url,
      query: SOURCES.osm.query,
      note: 'Lighting Phase L0 snapshot (scripts/lighting-city/sources.json); not re-fetched.',
    },
    classification: {
      file: L0,
      sha256: crypto.createHash('sha256').update(l0Text).digest('hex'),
      rule: l0.meta.rule.version,
    },
    scope: 'car-road ways classified wholly lit by L0, their same-name one-way partners, and street_lamp nodes nearest to a car road',
    lampsLeftForL2b: lampsSkipped,
    counts: {
      ways: elements.filter((e) => e.type === 'way').length,
      litWays: lit.length,
      lamps: elements.filter((e) => e.type === 'node').length,
    },
  },
  elements,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
const b = fs.readFileSync(OUT);
console.log(OUT, out.meta.counts, b.length, crypto.createHash('sha256').update(b).digest('hex'));
