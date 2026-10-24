// Step 6.1b: classify every bus edge removed by Step 6.1 (versus the e143535 legacy filter), and its
// state under the Step 6.1b policy. Port of RoadRouting.kt; retained counts are checked against the
// Kotlin evidence report. Read-only; writes docs/step61b/evidence/removed-bus-edges.json.
// Usage: node scripts/step61b/classify-removed.mjs <backend traffic-evidence.json>
import fs from 'node:fs';
import { SCENE_REFERENCE as ref, sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const n = read('src/lib/data/transport-network.json');
const access = JSON.parse(fs.readFileSync(new URL('../norrkoping-simulator-backend/src/main/resources/road-access.json', root), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const osm = read('work/step61b/osm-access.json');
const map = read('src/lib/data/norrkoping-map.json');
const classOf = new Map(map.roads.map((r) => [r.way, r.class]));
const N = n.nodes.length;
const outgoing = Array.from({ length: N }, () => []);
n.edges.forEach((e, i) => outgoing[e.from].push(i));
const index = new Map(n.nodes.map((x, i) => [x.id, i]));
const record = new Map(access.records.map((r) => [r.way, r.bus]));
const terminals = new Set(access.turnarounds.map((t) => index.get(t.node)).filter((i) => i !== undefined));
const relWays = new Map();
for (const r of osm.elements.filter((e) => e.type === 'relation' && e.tags.route === 'bus'))
  for (const m of r.members)
    if (m.type === 'way' && !m.role) relWays.set(m.ref, [...new Set([...(relWays.get(m.ref) ?? []), r.tags.ref ?? `rel${r.id}`])]);

function through(cands, terms) {
  const alive = new Set(cands),
    exits = Array.from({ length: N }, () => new Map()),
    incoming = Array.from({ length: N }, () => []);
  for (const i of cands) {
    const e = n.edges[i];
    exits[e.from].set(e.to, (exits[e.from].get(e.to) ?? 0) + 1);
    incoming[e.to].push(i);
  }
  const queue = [];
  const inspect = (v) => {
    const t = exits[v];
    if (t.size > 1) return;
    const only = t.keys().next().value;
    if (only !== undefined && (terms.has(v) || outgoing[v].every((i) => n.edges[i].to === only))) return;
    for (const id of incoming[v]) if (only === undefined || n.edges[id].from === only) queue.push(id);
  };
  for (let v = 0; v < N; v++) inspect(v);
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    if (!alive.delete(id)) continue;
    const e = n.edges[id], m = exits[e.from], c = m.get(e.to) - 1;
    if (c === 0) { m.delete(e.to); inspect(e.from); } else m.set(e.to, c);
  }
  return alive;
}
function legacy(cands) {
  const alive = new Set(cands);
  for (;;) {
    const from = new Set([...alive].map((i) => n.edges[i].from));
    let removed = false;
    for (const i of [...alive]) if (!from.has(n.edges[i].to)) { alive.delete(i); removed = true; }
    if (!removed) return alive;
  }
}
function mainComponent(edges) {
  const adj = Array.from({ length: N }, () => []), radj = Array.from({ length: N }, () => []);
  for (const i of edges) { const e = n.edges[i]; adj[e.from].push(e.to); radj[e.to].push(e.from); }
  const seen = new Uint8Array(N), order = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !adj[s].length) continue;
    const st = [[s, 0]]; seen[s] = 1;
    while (st.length) {
      const t = st[st.length - 1];
      if (t[1] < adj[t[0]].length) { const v = adj[t[0]][t[1]++]; if (!seen[v]) { seen[v] = 1; st.push([v, 0]); } }
      else { order.push(t[0]); st.pop(); }
    }
  }
  const comp = new Int32Array(N).fill(-1), sizes = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const s = order[k]; if (comp[s] >= 0) continue;
    const id = sizes.length; let c = 0; const st = [s]; comp[s] = id;
    while (st.length) { const u = st.pop(); c++; for (const v of radj[u]) if (comp[v] < 0) { comp[v] = id; st.push(v); } }
    sizes.push(c);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  return new Set([...Array(N).keys()].filter((i) => comp[i] === main));
}
function reach(edges, starts, forward) {
  const adj = Array.from({ length: N }, () => []);
  for (const i of edges) { const e = n.edges[i]; forward ? adj[e.from].push(e.to) : adj[e.to].push(e.from); }
  const seen = new Uint8Array(N), q = [...starts];
  q.forEach((v) => (seen[v] = 1));
  for (let k = 0; k < q.length; k++) for (const v of adj[q[k]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
  return seen;
}

const all = n.edges.map((_, i) => i);
const rawBus = all.filter((i) => n.edges[i].bus);
const newBus = all.filter((i) => record.get(n.edges[i].way) ?? n.edges[i].bus);
const newBusSet = new Set(newBus);
const L = legacy(rawBus), S61 = through(rawBus, new Set()), S61b = through(newBus, terminals);
if (S61b.size !== evidence.static.after.bus.retained || S61.size !== evidence.static.before.bus.retained)
  throw new Error('Kotlin parity failed');
const main = mainComponent(S61b);
const fromMain = reach(newBus, [...main], true), toMain = reach(newBus, [...main], false);
const removed = [...L].filter((i) => !S61.has(i));

// Regions of removed edges (undirected), so each causal branch is classified once.
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const i of removed) { const e = n.edges[i]; for (const v of [e.from, e.to]) if (!parent.has(v)) parent.set(v, v); parent.set(find(e.from), find(e.to)); }
const regions = new Map();
for (const i of removed) { const r = find(n.edges[i].from); regions.set(r, [...(regions.get(r) ?? []), i]); }

const categories = {};
const add = (cat, region) => {
  const c = (categories[cat] ??= { regions: 0, edges: 0, restoredEdges: 0, examples: [] });
  c.regions++; c.edges += region.edges.length; c.restoredEdges += region.restored;
  if (c.examples.length < 12) c.examples.push(region.summary);
};
for (const edges of regions.values()) {
  const nodes = new Set(edges.flatMap((i) => [n.edges[i].from, n.edges[i].to]));
  const ways = [...new Set(edges.map((i) => n.edges[i].way))];
  const restored = edges.filter((i) => S61b.has(i)).length;
  const verified = ways.some((w) => record.get(w)) || [...nodes].some((v) => outgoing[v].some((i) => access.records.some((r) => r.way === n.edges[i].way && r.bus)));
  const usesTurnaround = [...nodes].some((v) => terminals.has(v));
  const island = !edges.some((i) => fromMain[n.edges[i].from]) || !edges.some((i) => toMain[n.edges[i].to]);
  const stops = [...nodes].filter((v) => n.nodes[v].busStop).map((v) => ({ node: n.nodes[v].id, name: n.nodes[v].busStop }));
  const relations = ways.filter((w) => relWays.has(w)).map((w) => ({ way: w, services: relWays.get(w) }));
  const boundary = [...new Set([...nodes].flatMap((v) => outgoing[v].filter((i) => !newBusSet.has(i)).map((i) => n.edges[i].way)))];
  const p = n.nodes[n.edges[edges[0]].from];
  const summary = {
    edges: edges.length, restored, ways: ways.slice(0, 8), names: [...new Set(edges.map((i) => n.edges[i].name).filter(Boolean))],
    classes: [...new Set(ways.map((w) => classOf.get(w)))], node: p.id,
    sweref: sceneToSweref(ref, p.x, p.z).map((v) => Math.round(v * 10) / 10),
    stops, relations, boundaryWays: boundary.slice(0, 8).map((w) => ({ way: w, class: classOf.get(w) ?? null })),
  };
  const region = { edges, restored, summary };
  let cat;
  if (verified && restored) cat = 'legitimate public-transport access (restored: verified route 21 corridor)';
  else if (island) {
    cat = 'correctly excluded (bus island: reachable only through roads closed to buses)';
    if (restored) summary.retainedButUnreachable = restored; // e.g. a turning circle inside the island
  } else if (usesTurnaround && restored) cat = 'incorrectly excluded by the algorithm (restored: mapped turnaround facility)';
  else if (stops.length || relations.length) cat = 'uncertain (mapped stop or unverified relation; onward road closed to buses)';
  else cat = 'correctly excluded (dead end for buses: entering forces an artificial turnaround; cause is a bus-closed onward road or one-way topology, see boundaryWays)';
  if (restored && restored < edges.length) summary.partiallyRestored = true;
  add(cat, region);
}

const named = {};
for (const [label, way] of [['road 51', 318001968], ['Gustaf Janzéns gata', 26734855], ['Platinagatan', 4384905]]) {
  const ids = all.filter((i) => n.edges[i].way === way);
  named[label] = { way, class: classOf.get(way), edges: ids.length,
    perPolicy: Object.fromEntries(['compact', 'truck', 'bus'].map((k) => {
      const ok = (i) => (k === 'truck' ? n.edges[i].truck : k === 'bus' ? (record.get(n.edges[i].way) ?? n.edges[i].bus) : true);
      const rawOk = (i) => (k === 'truck' ? n.edges[i].truck : k === 'bus' ? n.edges[i].bus : true);
      const s61 = through(all.filter(rawOk), new Set()), s61b = through(all.filter(ok), terminals);
      return [k, { candidates: ids.filter(ok).length, step61: ids.filter((i) => s61.has(i)).length, step61b: ids.filter((i) => s61b.has(i)).length }];
    })) };
}
const sevenEnds = [1293, 16369, 17538, 58562, 61935, 63097, 67625].map((e) => {
  const E = n.edges[e], end = n.nodes[E.to];
  return { edge: e, way: E.way, name: E.name, class: classOf.get(E.way), endNode: end.id,
    sweref: sceneToSweref(ref, end.x, end.z).map((v) => Math.round(v * 10) / 10),
    retainedStep61b: S61b.has(e), reachableFromMainBusNetwork: !!fromMain[E.from], canReturnToMain: !!toMain[E.to] };
});
const report = {
  generated: new Date().toISOString().slice(0, 10),
  parity: { step61Retained: S61.size, step61bRetained: S61b.size, legacyRetained: L.size },
  removedByStep61: removed.length,
  restoredByStep61b: removed.filter((i) => S61b.has(i)).length,
  newlyAllowedBeyondLegacy: [...S61b].filter((i) => !L.has(i)).length,
  categories,
  sevenMappedBusEnds: sevenEnds,
  namedBoundaries: named,
};
fs.mkdirSync(new URL('docs/step61b/evidence/', root), { recursive: true });
fs.writeFileSync(new URL('docs/step61b/evidence/removed-bus-edges.json', root), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ parity: report.parity, removed: report.removedByStep61, restored: report.restoredByStep61b, beyond: report.newlyAllowedBeyondLegacy,
  categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, { regions: v.regions, edges: v.edges, restored: v.restoredEdges }])) }, null, 1));
console.log(JSON.stringify(named));
