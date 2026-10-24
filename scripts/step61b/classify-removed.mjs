// Step 6.1b (review follow-up): audit every bus edge Step 6.1 removed (versus the e143535 legacy
// filter) on two separate axes. Read-only; writes docs/step61b/evidence/removed-bus-edges.json.
//
//   Simulator status under the Step 6.1b policy (topology, not law):
//     restored | retainedUnreachable | partlyRestored | excludedDeadEnd (reachable, entering forces a
//     reversal) | excludedIsland (no bus-permitted path to or from the main bus network)
//   Real-world access evidence:
//     verifiedAccess        restored through a provenance-backed access record (route 21 / bus-psv tag)
//     turnaroundRestoration restored because the branch ends at a mapped OSM turning facility; the
//                           branch roads are importer bus classes with no known restriction, but bus
//                           operation there is NOT verified
//     verifiedRestriction   every blocking road has an explicit OSM bus prohibition or a limit below bus
//                           dimensions (bus/psv=no|private, access/motor_vehicle=no|private without
//                           bus/psv permission, maxweight<19 t, maxwidth<2.6 m, maxheight<3.4 m, maxlength<12 m)
//     graphTopology         every seed is a full-graph directed terminal (no exit for any vehicle)
//     unresolvedAccess      blocked only by roads WITHOUT an explicit restriction (closed by the
//                           simulator's class heuristic, e.g. highway=service/living_street). Not evidence
//                           of a legal prohibition; access stays closed for lack of operational evidence.
// A "seed" is the node where the pruning cascade starts; its "blocking roads" are its outgoing roads that
// the bus policy does not permit (see RoadRouting.kt throughRoadEdges).
// Usage: node scripts/step61b/classify-removed.mjs <backend traffic-evidence.json>
import fs from 'node:fs';
import { SCENE_REFERENCE as ref, sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
const root = new URL('../../', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const n = read('src/lib/data/transport-network.json');
const access = JSON.parse(fs.readFileSync(new URL('../norrkoping-simulator-backend/src/main/resources/road-access.json', root), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const osm = read('work/step61b/osm-access.json');
const osmWays = read('work/step61b/osm-ways.json');
const map = read('src/lib/data/norrkoping-map.json');
const classOf = new Map(map.roads.map((r) => [r.way, r.class]));
const tagsOf = new Map([...osm.elements, ...osmWays.elements].filter((e) => e.type === 'way').map((e) => [e.id, e]));
const N = n.nodes.length;
const outgoing = Array.from({ length: N }, () => []);
n.edges.forEach((e, i) => outgoing[e.from].push(i));
const index = new Map(n.nodes.map((x, i) => [x.id, i]));
const record = new Map(access.records.map((r) => [r.way, r]));
const terminals = new Set(access.turnarounds.map((t) => index.get(t.node)).filter((i) => i !== undefined));
const relWays = new Map();
for (const r of osm.elements.filter((e) => e.type === 'relation' && e.tags.route === 'bus'))
  for (const m of r.members)
    if (m.type === 'way' && !m.role) relWays.set(m.ref, [...new Set([...(relWays.get(m.ref) ?? []), r.tags.ref ?? `rel${r.id}`])]);

/** Port of throughRoadEdges; also records the seed node of every pruned edge. */
function through(cands, terms) {
  const alive = new Set(cands), seedOf = new Map(),
    exits = Array.from({ length: N }, () => new Map()),
    incoming = Array.from({ length: N }, () => []);
  for (const i of cands) {
    const e = n.edges[i];
    exits[e.from].set(e.to, (exits[e.from].get(e.to) ?? 0) + 1);
    incoming[e.to].push(i);
  }
  const queue = [];
  const inspect = (v, seed) => {
    const t = exits[v];
    if (t.size > 1) return;
    const only = t.keys().next().value;
    if (only !== undefined && (terms.has(v) || outgoing[v].every((i) => n.edges[i].to === only))) return;
    for (const id of incoming[v]) if (only === undefined || n.edges[id].from === only) queue.push([id, seed ?? v]);
  };
  for (let v = 0; v < N; v++) inspect(v, null);
  for (let q = 0; q < queue.length; q++) {
    const [id, seed] = queue[q];
    if (!alive.delete(id)) continue;
    seedOf.set(id, seed);
    const e = n.edges[id], m = exits[e.from], c = m.get(e.to) - 1;
    if (c === 0) { m.delete(e.to); inspect(e.from, seed); } else m.set(e.to, c);
  }
  return { alive, seedOf };
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
const no = (v) => v === 'no' || v === 'private';
const allows = (t) => ['yes', 'designated', 'permissive'].includes(t.bus) || ['yes', 'designated', 'permissive'].includes(t.psv);
const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : undefined; };
/** Explicit real-world bus restriction on a way, or null. Absence of tags is NOT a restriction. */
function restriction(t) {
  if (!t) return null;
  if (no(t.bus) || (no(t.psv) && !allows(t))) return `bus/psv=${t.bus ?? t.psv}`;
  if ((no(t.access) || no(t.motor_vehicle)) && !allows(t)) return `access=${t.access ?? ''} motor_vehicle=${t.motor_vehicle ?? ''}`;
  for (const [k, limit] of [['maxweight', 19], ['maxwidth', 2.6], ['maxheight', 3.4], ['maxlength', 12]])
    if (num(t[k]) !== undefined && num(t[k]) < limit) return `${k}=${t[k]}`;
  return null;
}

const all = n.edges.map((_, i) => i);
const rawBus = all.filter((i) => n.edges[i].bus);
const newBus = all.filter((i) => (record.get(n.edges[i].way)?.bus ?? n.edges[i].bus));
const newBusSet = new Set(newBus);
const L = legacy(rawBus);
const S61 = through(rawBus, new Set()).alive;
const { alive: S61b, seedOf } = through(newBus, terminals);
if (S61b.size !== evidence.static.after.bus.retained || S61.size !== evidence.static.before.bus.retained)
  throw new Error('Kotlin parity failed');
const main = mainComponent(S61b);
const fromMain = reach(newBus, [...main], true), toMain = reach(newBus, [...main], false);
const removed = [...L].filter((i) => !S61.has(i)).sort((a, b) => a - b);

// Regions: removed edges joined by shared nodes, so each branch is reported once.
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const i of removed) { const e = n.edges[i]; for (const v of [e.from, e.to]) if (!parent.has(v)) parent.set(v, v); parent.set(find(e.from), find(e.to)); }
const groups = new Map();
for (const i of removed) { const r = find(n.edges[i].from); groups.set(r, [...(groups.get(r) ?? []), i]); }

const wayInfo = (w) => {
  const e = tagsOf.get(w);
  return { way: w, class: classOf.get(w) ?? e?.tags?.highway ?? null, osmVersion: e?.version ?? null, osmTimestamp: e?.timestamp ?? null,
    tags: e ? Object.fromEntries(Object.entries(e.tags).filter(([k]) => /^(highway|service|access|motor_vehicle|bus|psv|hgv|oneway|max(weight|width|height|length))$/.test(k))) : null,
    restriction: e ? restriction(e.tags) : 'tags not fetched' };
};
const regions = [...groups.values()].sort((a, b) => a[0] - b[0]).map((edges, id) => {
  const nodes = new Set(edges.flatMap((i) => [n.edges[i].from, n.edges[i].to]));
  const ways = [...new Set(edges.map((i) => n.edges[i].way))];
  const restoredEdges = edges.filter((i) => S61b.has(i));
  const still = edges.filter((i) => !S61b.has(i));
  const reachable = edges.some((i) => fromMain[n.edges[i].from]) && edges.some((i) => toMain[n.edges[i].to]);
  const viaRecord = [...nodes].flatMap((v) => outgoing[v]).map((i) => record.get(n.edges[i].way)).filter((r) => r?.bus);
  const viaTurnaround = [...nodes].filter((v) => terminals.has(v)).map((v) => n.nodes[v].id);
  const seedInfo = new Map();
  const seed = (s) => {
    if (!seedInfo.has(s)) {
      const blocking = [...new Set(outgoing[s].filter((i) => !newBusSet.has(i)).map((i) => n.edges[i].way))];
      seedInfo.set(s, { node: n.nodes[s].id, fullGraphExits: outgoing[s].length, blockingRoads: blocking.map(wayInfo),
        cause: blocking.length ? 'bus policy excludes onward road' : 'full-graph directed terminal' });
    }
    return seedInfo.get(s);
  };
  // Islands that stay unreachable are blocked by the closed roads leaving any of their nodes.
  const islandBlocking = [...new Set([...nodes].flatMap((v) => outgoing[v]).filter((i) => !newBusSet.has(i)).map((i) => n.edges[i].way))].map(wayInfo);
  const evidenceFrom = (blocking, topology) =>
    topology ? 'graphTopology'
      : blocking.length && blocking.every((b) => b.restriction && b.restriction !== 'tags not fetched') ? 'verifiedRestriction'
      : 'unresolvedAccess';
  const perEdge = edges.map((i) => {
    const usable = S61b.has(i) && fromMain[n.edges[i].from] && toMain[n.edges[i].to];
    const sim = S61b.has(i) ? (usable ? 'restored' : 'retainedUnreachable')
      : fromMain[n.edges[i].from] && toMain[n.edges[i].to] ? 'excludedDeadEnd' : 'excludedIsland';
    let ev;
    if (usable) ev = viaRecord.length ? 'verifiedAccess' : 'turnaroundRestoration';
    else if (S61b.has(i)) ev = evidenceFrom(islandBlocking, !islandBlocking.length);
    else { const sd = seed(seedOf.get(i)); ev = evidenceFrom(sd.blockingRoads, sd.cause === 'full-graph directed terminal'); }
    return { edge: i, simulator: sim, evidence: ev };
  });
  const seeds = [...seedInfo.values()];
  const count = (key) => perEdge.reduce((m, e) => ({ ...m, [e[key]]: (m[e[key]] ?? 0) + 1 }), {});
  const simulator = count('simulator'), evidenceClass = count('evidence');
  const p = n.nodes[n.edges[edges[0]].from];
  return {
    id, simulator, evidence: evidenceClass, edges: edges.length, restored: restoredEdges.length, reachable,
    edgeIds: edges, ways, names: [...new Set(edges.map((i) => n.edges[i].name).filter(Boolean))],
    classes: [...new Set(ways.map((w) => classOf.get(w) ?? null))],
    sampleNode: p.id, sweref: sceneToSweref(ref, p.x, p.z).map((v) => Math.round(v * 10) / 10),
    stops: [...nodes].filter((v) => n.nodes[v].busStop).map((v) => ({ node: n.nodes[v].id, name: n.nodes[v].busStop })),
    busRelationWays: ways.filter((w) => relWays.has(w)).map((w) => ({ way: w, services: relWays.get(w) })),
    accessRecords: [...new Set(viaRecord.map((r) => `${r.way}:${r.basis}`))],
    turnaroundFacilities: viaTurnaround,
    seeds,
    islandBlockingRoads: perEdge.some((e) => e.simulator === 'retainedUnreachable') ? islandBlocking : undefined,
    perEdge,
  };
});

const edgeRows = regions.flatMap((r) => r.perEdge.map((e) => ({ ...e, region: r.id })));
const tally = (key) => edgeRows.reduce((m, e) => {
  const c = (m[e[key]] ??= { edges: 0, regions: new Set() });
  c.edges++; c.regions.add(e.region); return m;
}, {});
const flat = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { edges: v.edges, regions: v.regions.size }]));
const cross = edgeRows.reduce((m, e) => { const k = `${e.evidence} / ${e.simulator}`; m[k] = (m[k] ?? 0) + 1; return m; }, {});
const sevenEnds = [1293, 16369, 17538, 58562, 61935, 63097, 67625].map((e) => {
  const E = n.edges[e], end = n.nodes[E.to], region = regions.find((r) => r.edgeIds.includes(e));
  return { edge: e, way: E.way, name: E.name, class: classOf.get(E.way), endNode: end.id,
    sweref: sceneToSweref(ref, end.x, end.z).map((v) => Math.round(v * 10) / 10),
    retainedStep61b: S61b.has(e), reachableFromMainBusNetwork: !!fromMain[E.from], canReturnToMain: !!toMain[E.to],
    region: region.id, ...(({ simulator, evidence }) => ({ simulator, evidence }))(region.perEdge.find((x) => x.edge === e)),
    blockingRoads: S61b.has(e) ? region.islandBlockingRoads : region.seeds.flatMap((s) => s.blockingRoads) };
});
const named = {};
for (const [label, way] of [['road 51', 318001968], ['Gustaf Janzéns gata', 26734855], ['Platinagatan', 4384905]]) {
  const ids = all.filter((i) => n.edges[i].way === way);
  named[label] = { way, class: classOf.get(way), edges: ids.length,
    perPolicy: Object.fromEntries(['compact', 'truck', 'bus'].map((k) => {
      const ok = (i) => (k === 'truck' ? n.edges[i].truck : k === 'bus' ? (record.get(n.edges[i].way)?.bus ?? n.edges[i].bus) : true);
      const rawOk = (i) => (k === 'truck' ? n.edges[i].truck : k === 'bus' ? n.edges[i].bus : true);
      const s61 = through(all.filter(rawOk), new Set()).alive, s61b = through(all.filter(ok), terminals).alive;
      return [k, { candidates: ids.filter(ok).length, step61: ids.filter((i) => s61.has(i)).length, step61b: ids.filter((i) => s61b.has(i)).length }];
    })) };
}
const blockingAll = new Map(regions.flatMap((r) => [...r.seeds.flatMap((s) => s.blockingRoads), ...(r.islandBlockingRoads ?? [])]).map((b) => [b.way, b]));
const report = {
  generated: new Date().toISOString().slice(0, 10),
  definitions: {
    simulator: 'Status under the Step 6.1b simulator policy (graph topology given the bus access flags). Not a statement about law.',
    evidence: {
      verifiedAccess: 'Restored through a provenance-backed access record (road-access.json: verified route 21 service or explicit bus/psv tag).',
      turnaroundRestoration: 'Restored because the branch ends at a mapped OSM turning facility. Branch roads are importer bus classes with no known restriction; bus operation is not verified.',
      verifiedRestriction: 'Every blocking road carries an explicit OSM bus prohibition or a limit below bus dimensions.',
      graphTopology: 'Every seed is a full-graph directed terminal: no vehicle can continue, independent of access.',
      unresolvedAccess: 'Blocked only by roads without explicit restrictions, closed by the simulator class heuristic. Not evidence of a legal prohibition; kept closed for lack of operational evidence.',
    },
    seed: 'Node where the pruning cascade starts; blockingRoads are its outgoing roads the bus policy does not permit.',
  },
  sources: { osmAccessExtract: read('work/step61b/osm-access-request.json'), osmWayLookups: osmWays.source },
  parity: { step61Retained: S61.size, step61bRetained: S61b.size, legacyRetained: L.size },
  removedByStep61: removed.length,
  restoredByStep61b: removed.filter((i) => S61b.has(i)).length,
  newlyAllowedBeyondLegacy: [...S61b].filter((i) => !L.has(i)).length,
  byEvidence: flat(tally('evidence')),
  bySimulator: flat(tally('simulator')),
  edgesByEvidenceAndSimulator: cross,
  blockingRoads: { count: blockingAll.size, withExplicitRestriction: [...blockingAll.values()].filter((b) => b.restriction).length,
    tagCounts: [...blockingAll.values()].reduce((m, b) => { const k = `${b.tags?.highway}${b.tags?.service ? ':' + b.tags.service : ''}`; m[k] = (m[k] ?? 0) + 1; return m; }, {}) },
  sevenMappedBusEnds: sevenEnds,
  namedBoundaries: named,
  regions,
  edges: removed.map((i) => { const e = edgeRows.find((x) => x.edge === i); return [i, n.edges[i].way, e.region, e.simulator, e.evidence]; }),
  edgesColumns: ['edge', 'way', 'region', 'simulator', 'evidence'],
};
if (report.edges.length !== 979 || regions.reduce((s, r) => s + r.edges, 0) !== removed.length) throw new Error('edge accounting');
fs.mkdirSync(new URL('docs/step61b/evidence/', root), { recursive: true });
// Summaries pretty-printed; one line per region and per edge row so all 979 edges stay reviewable.
const { regions: regionRows, edges: edgeRowsOut, ...summary } = report;
const body = JSON.stringify(summary, null, 1).replace(/\n}$/, '');
const lines = (key, rows) => `,\n "${key}": [\n${rows.map((r) => '  ' + JSON.stringify(r)).join(',\n')}\n ]`;
fs.writeFileSync(new URL('docs/step61b/evidence/removed-bus-edges.json', root),
  body + lines('regions', regionRows) + lines('edges', edgeRowsOut) + '\n}\n');
console.log(JSON.stringify({ parity: report.parity, removed: report.removedByStep61, restored: report.restoredByStep61b,
  byEvidence: report.byEvidence, bySimulator: report.bySimulator, cross, blocking: report.blockingRoads,
  sevenEnds: sevenEnds.map((e) => `${e.way} ${e.simulator} ${e.evidence} via ${(e.blockingRoads ?? []).map((b) => b.way + ':' + b.class + (b.tags?.service ? '/' + b.tags.service : '') + (b.restriction ? '!' + b.restriction : '')).join(',')}`) }, null, 1));
