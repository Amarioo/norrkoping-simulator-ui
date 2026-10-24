// Step 6.1b: build the backend's data-driven bus access record (road-access.json) with provenance.
//
// The importer's bus flag is a class heuristic (major/tertiary/unclassified/residential). It ignores
// explicit OSM bus/psv tags and closes every living_street/service road to buses, including corridors
// that verified bus services actually use. This script records corrections; it never edits the shared
// transport graph, road geometry or terrain.
//
// Rules (applied only to ways that already have edges in the bundled transport graph):
//   osm-tag            bus/psv = yes|designated|permissive on a way the heuristic closes to buses
//   osm-tag-deny       bus = no|private (or psv = no without bus = yes) on a way the heuristic opens
//   verified-service   member (no role) of an OSM route=bus relation for a service that is verified
//                      against current operator data (VERIFIED below), and whose tags do not prohibit
//                      buses (bus/psv/access/motor_vehicle = no|private)
// Relation membership alone is NOT enough: unverified services are reported, not granted.
//
// Turnaround facilities: graph nodes mapped as highway=turning_circle|turning_loop. A vehicle that
// can only reverse there makes a lawful turning movement, so the routing filter treats them like a
// mapped road end instead of a policy-created dead end (a driveway beyond the circle does not change that).
//
// Inputs: work/step61b/osm-access.json (fetch-osm-access.mjs), work/step61b/osm-turning.json
// (fetch-osm-turning.mjs), both dated Overpass extracts, and the bundled graph.
// Usage: node scripts/step61b/build-road-access.mjs [backendResourcesDir]
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const network = read('src/lib/data/transport-network.json');
const osm = read('work/step61b/osm-access.json');
const request = read('work/step61b/osm-access-request.json');
const turning = read('work/step61b/osm-turning.json');
const turningRequest = read('work/step61b/osm-turning-request.json');
const map = read('src/lib/data/norrkoping-map.json');
const out = process.argv[2] ?? '../norrkoping-simulator-backend/src/main/resources';

// Services checked against current operator data. Only these can open a road through membership.
const VERIFIED = [
  {
    service: '21',
    operator: 'Östgötatrafiken',
    relations: [14025630, 14025631],
    checked: '2026-10-24',
    evidence: [
      'https://www.transit.land/routes/r-u67t24-21 (current feed; stops Norrköping Centralstation, Norr Tull, Bråddgatan, Skvallertorget, Väster Tull, Söder Tull)',
      'https://www.ostgotatrafiken.se/Tidtabeller/ (line index lists 21 via Resecentrum–Skvallertorget–Väster Tull–Söder Tull, checked 2026-10-23 in Step 6.2)',
    ],
    note: 'OSM relation stop sequence (2023-10-01) matches the current feed stop names and order.',
  },
];

const yes = (v) => ['yes', 'designated', 'permissive'].includes(v);
const no = (v) => ['no', 'private'].includes(v);
const ways = new Map(osm.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
const relations = osm.elements.filter((e) => e.type === 'relation' && e.tags?.route === 'bus');
const classOf = new Map(map.roads.map((r) => [r.way, r.class]));
const graph = new Map();
for (const e of network.edges) {
  const g = graph.get(e.way) ?? { bus: e.bus, mixed: false, name: e.name, edges: 0 };
  if (g.bus !== e.bus) g.mixed = true;
  g.edges++;
  graph.set(e.way, g);
}
const members = new Map();
for (const r of relations)
  for (const m of r.members)
    if (m.type === 'way' && !m.role) members.set(m.ref, [...(members.get(m.ref) ?? []), r]);

const keep = ['highway', 'name', 'access', 'motor_vehicle', 'bus', 'psv', 'hgv', 'oneway', 'maxspeed'];
const tagSubset = (t) => Object.fromEntries(keep.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
const records = [],
  unverified = [];
for (const [way, g] of [...graph].sort((a, b) => a[0] - b[0])) {
  if (g.mixed) throw new Error(`Way ${way} has mixed bus flags; rules assume one flag per way`);
  const w = ways.get(way),
    t = w?.tags;
  const osmInfo = w && { version: w.version, timestamp: w.timestamp, tags: tagSubset(t) };
  const base = { way, name: g.name, class: classOf.get(way) ?? null, edges: g.edges };
  if (!g.bus && t && (yes(t.bus) || (yes(t.psv) && !no(t.bus)))) {
    records.push({ ...base, bus: true, basis: 'osm-tag', osm: osmInfo });
    continue;
  }
  if (g.bus && t && (no(t.bus) || (no(t.psv) && !yes(t.bus)))) {
    records.push({ ...base, bus: false, basis: 'osm-tag-deny', osm: osmInfo });
    continue;
  }
  if (g.bus || !members.has(way)) continue;
  const rels = members.get(way);
  const prohibited = t && [t.bus, t.psv, t.access, t.motor_vehicle].some(no);
  const services = VERIFIED.filter((s) => rels.some((r) => s.relations.includes(r.id)));
  const relInfo = rels.map((r) => ({ id: r.id, ref: r.tags.ref ?? null, version: r.version, timestamp: r.timestamp }));
  if (services.length && !prohibited)
    records.push({
      ...base,
      bus: true,
      basis: 'verified-service',
      services: services.map((s) => s.service),
      relations: relInfo.filter((r) => services.some((s) => s.relations.includes(r.id))),
      osm: osmInfo,
    });
  else unverified.push({ ...base, prohibited: !!prohibited, relations: relInfo, osm: osmInfo });
}

const graphNodes = new Set(network.nodes.map((x) => x.id));
const turnarounds = turning.elements
  .filter((e) => e.type === 'node' && graphNodes.has(e.id))
  .sort((a, b) => a.id - b.id)
  .map((e) => ({ node: e.id, highway: e.tags.highway, version: e.version, timestamp: e.timestamp }));

const document = {
  meta: {
    purpose:
      'Bus access corrections to the class heuristic in the bundled transport graph (Step 6.1b). Way IDs refer to that graph snapshot.',
    graphSnapshot: network.meta?.timestamp ?? null,
    osmExtract: { osmBase: request.osmBase, retrievedAt: request.retrievedAt, url: request.url },
    turningExtract: { osmBase: turningRequest.osmBase, retrievedAt: turningRequest.retrievedAt, url: turningRequest.url },
    license: 'Derived from © OpenStreetMap contributors, ODbL-1.0',
    rules: {
      'osm-tag': 'bus/psv = yes|designated|permissive on a way the importer closes to buses',
      'osm-tag-deny': 'bus = no|private, or psv = no without bus = yes, on a way the importer opens to buses',
      'verified-service':
        'member of an OSM route=bus relation for a service verified against current operator data; tags do not prohibit buses',
      turnarounds: 'graph nodes mapped highway=turning_circle|turning_loop; reversing there is a lawful turning movement',
    },
    verifiedServices: VERIFIED,
    generator: 'norrkoping-simulator-ui/scripts/step61b/build-road-access.mjs',
  },
  records,
  turnarounds,
  unverifiedRelationWays: unverified,
};
fs.writeFileSync(`${out}/road-access.json`, JSON.stringify(document, null, 1) + '\n');
console.log(
  JSON.stringify({
    records: records.length,
    byBasis: Object.fromEntries(['osm-tag', 'osm-tag-deny', 'verified-service'].map((b) => [b, records.filter((r) => r.basis === b).length])),
    unverified: unverified.length,
    turnarounds: turnarounds.length,
  }),
);
