// Step 6.1b: export OSM route 21 relations (ordered member ways and stop positions) as a backend test
// fixture with provenance. Usage: node scripts/step61b/export-route21.mjs [backendTestResourcesDir]
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const osm = read('work/step61b/osm-access.json');
const request = read('work/step61b/osm-access-request.json');
const out = process.argv[2] ?? '../norrkoping-simulator-backend/src/test/resources';
const research = read('work/step62/osm-research.json'); // stop names (out geom) from Step 6.2 extract
const transit = read('scripts/data/norrkoping-transit-source.json');
const names = new Map(transit.elements.filter((e) => e.type === 'node').map((e) => [e.id, e.tags?.name]));
const relations = [14025631, 14025630].map((id) => {
  const r = osm.elements.find((e) => e.type === 'relation' && e.id === id);
  if (!r) throw new Error(`Relation ${id} missing from extract`);
  const old = research.elements.find((e) => e.id === id);
  if (old?.version !== r.version) throw new Error(`Relation ${id} changed since Step 6.2 extract`);
  return {
    id, version: r.version, timestamp: r.timestamp, name: r.tags.name, from: r.tags.from, to: r.tags.to,
    stops: r.members.filter((m) => m.type === 'node' && m.role === 'stop').map((m) => ({ node: m.ref, name: names.get(m.ref) ?? null })),
    ways: r.members.filter((m) => m.type === 'way' && !m.role).map((m) => m.ref),
  };
});
const doc = {
  source: 'OpenStreetMap route relations for Östgötatrafiken service 21, © OpenStreetMap contributors, ODbL-1.0',
  osmBase: request.osmBase,
  operatorCheck: 'https://www.transit.land/routes/r-u67t24-21 checked 2026-10-24: Norrköping Centralstation, Norr Tull, Bråddgatan, Skvallertorget, Väster Tull, Söder Tull',
  relations,
};
fs.mkdirSync(`${out}/step61b`, { recursive: true });
fs.writeFileSync(`${out}/step61b/route21.json`, JSON.stringify(doc, null, 1) + '\n');
console.log(relations.map((r) => `${r.id}: ${r.stops.map((s) => s.name).join(' > ')} (${r.ways.length} ways)`).join('\n'));
