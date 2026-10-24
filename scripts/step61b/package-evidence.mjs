// Step 6.1b: copy the small, cited subset of the dated OSM extracts into docs/step61b/evidence (ODbL).
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const access = read('work/step61b/osm-access.json');
const ways = read('work/step61b/osm-ways.json');
const all = new Map([...access.elements, ...ways.elements].filter((e) => e.type === 'way').map((e) => [e.id, e]));
const cited = [
  // route 21 corridor and explicit-tag grants
  26154805, 26154806, 1050773509, 444474485, 1212234765, 118180748, 391478867, 1313592331,
  // route 21 terminal approaches absent from the graph
  286505037, 297690892, 1050773511, 287129554, 287143362, 760535027, 287098415, 1050773510,
  // seven Step 6.2 bus-end approaches and their only connectors
  4498925, 449064412, 415363780, 4498924, 89884762, 1111771303, 91258086, 91258087, 954899965, 93320320,
  1050223617, 145173981, 1059584521, 94953983, 1115174620, 95557922,
  // uncertain cases and named boundaries
  284799165, 284799167, 995916787, 995916788, 99952393, 315670216, 90929693, 4384905, 26734855, 318001968,
  // unverified relation-only service ways
  139689593, 139828354, 139919979, 287611485, 287611487, 372856736, 391478868, 410282222, 410282224, 712374013,
  851404088, 1050810163, 1087780574,
];
const missing = cited.filter((id) => !all.has(id));
if (missing.length) throw new Error('Not in extracts: ' + missing);
const relations = access.elements.filter((e) => e.type === 'relation' && e.tags?.route === 'bus')
  .map((r) => ({ id: r.id, version: r.version, timestamp: r.timestamp, ref: r.tags.ref ?? null, name: r.tags.name ?? null, network: r.tags.network ?? null }));
const out = {
  license: '© OpenStreetMap contributors, ODbL-1.0',
  requests: { access: read('work/step61b/osm-access-request.json'), turning: read('work/step61b/osm-turning-request.json'),
    ways: 'https://api.openstreetmap.org/api/0.6/ways.json (retrievedAt per way)' },
  ways: cited.map((id) => { const w = all.get(id); return { id, version: w.version, timestamp: w.timestamp, retrievedAt: w.retrievedAt ?? null, tags: w.tags }; }),
  busRelations: relations,
};
fs.writeFileSync(new URL('docs/step61b/evidence/osm-access-evidence.json', root), JSON.stringify(out, null, 1) + '\n');
console.log(out.ways.length, 'ways,', relations.length, 'relations');
