// Batch A (railway alignment): transit route points carry the network reference of their track node.
//
// Before: scripts/import-transit.mjs stored every route point at railHeight(p) + 0.018, i.e. the map
// node's legacy level plus a baked-in "vehicle above rail" lift. Bridge deck profiles
// (bridge-profiles.json `points`) are keyed by (x, z, legacy level of the map node), so no route point
// ever matched a deck key and trains/trams on bridges fell back to "ground + legacy layer lift"
// (up to 7 m off the drawn deck). The vehicle lift now lives in the rail-vehicle contract
// (src/lib/trackProfile.ts RAIL_HEAD, mirrored in RailTraffic.kt), not in the infrastructure data.
//
// This rewrites the route point heights of the existing data in place (same transform as the updated
// import-transit.mjs): a point on a drawn track node takes that node's legacy level exactly; any other
// point (e.g. a terminus reversing move without a drawn track) drops the old +0.018. Idempotent:
// meta.transitPointReference records that the data has been converted.
// Usage: node scripts/geo/transit-reference.mjs
import fs from 'node:fs';

const UI = 'src/lib/data/norrkoping-map.json',
  NETWORK = 'src/lib/data/transport-network.json',
  BACKEND = '../norrkoping-simulator-backend/src/main/resources/transport-network.json';
const MARK = 'track-node-legacy-level (Batch A, 2026-10-18)';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const map = read(UI);
const key = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
const node = new Map();
for (const r of map.roads)
  if (r.kind === 'rail' || r.kind === 'tram') {
    node.set(key(...r.a), r.yA);
    node.set(key(...r.b), r.yB);
  }
let converted = null;
function convert(routes) {
  let onNode = 0,
    off = 0;
  const out = routes.map((r) => ({
    ...r,
    points: r.points.map(([x, y, z]) => {
      const level = node.get(key(x, z));
      if (level !== undefined) {
        if (Math.abs(level + 0.018 - y) > 1e-9) throw new Error(`Unexpected route level at ${x},${z}: ${y} vs node ${level}`);
        onNode++;
        return [x, level, z];
      }
      off++;
      return [x, Math.round((y - 0.018) * 1e12) / 1e12, z];
    }),
  }));
  converted ??= { onNode, off };
  return out;
}
const original = JSON.stringify(map.transitRoutes);
const routes = map.meta?.transitPointReference === MARK ? map.transitRoutes : convert(map.transitRoutes);
for (const file of [UI, NETWORK, BACKEND]) {
  const data = file === UI ? map : read(file);
  if (data.meta?.transitPointReference === MARK) {
    if (JSON.stringify(data.transitRoutes) !== JSON.stringify(routes)) throw new Error(`${file}: converted routes differ`);
    console.log(file, 'already converted');
    continue;
  }
  if (JSON.stringify(data.transitRoutes) !== original) throw new Error(`${file}: transit routes differ from ${UI}`);
  data.transitRoutes = routes;
  data.meta = { ...data.meta, transitPointReference: MARK };
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(file, 'converted');
}
console.log('route points on track nodes', converted?.onNode, 'off the drawn track', converted?.off);
