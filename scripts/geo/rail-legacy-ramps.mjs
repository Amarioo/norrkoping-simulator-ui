// Batch C: remove flat-scene rail ramps from track that is not a bridge.
//
// import-norrkoping.mjs railHeight() raised every rail/tram point within 2 units (50 m) of a road tunnel
// by up to 0.28 units (7 m), and near rail bridges by the bridge level, then flagged the raised
// segments as bridges (`bridge ||= y > 0.1`). That was how the flat pre-DTM scene drew underpasses. On
// the DTM the embankment is in the ground model and the opening is an engineered span
// (prepare-bridge-profiles.py), so these lifts became invented decks: 112 of 145 rail/tram "bridge"
// segments are not bridges in OpenStreetMap, e.g. all of Södra stambanan over Ståthögavägen (vehicle
// grade 14.7 %, 7 m humps).
//
// For every rail/tram segment whose OSM way is not bridge=* (scripts/data/norrkoping-railway-tags-source.json,
// Overpass 2026-10-18, © OpenStreetMap contributors, ODbL): a raised node level goes back to the
// network level 0.071, except at a node shared with a real bridge way, which keeps that bridge's level
// (the deck-end key, so the approach still meets its deck); the derived bridge flag is cleared. Transit
// route points take their node's new level (route point = track node, Batch A). Idempotent
// (meta.railLegacyRamps). Run prepare-bridge-profiles.py afterwards (new keys and spans).
// Usage: node scripts/geo/rail-legacy-ramps.mjs
import fs from 'node:fs';

const MARK = 'rail-legacy-ramps v1 (Batch C, 2026-10-18)';
const ROAD = 0.071;
const UI = 'src/lib/data/norrkoping-map.json',
  NETWORK = 'src/lib/data/transport-network.json',
  BACKEND = '../norrkoping-simulator-backend/src/main/resources/transport-network.json';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tags = new Map(read('scripts/data/norrkoping-railway-tags-source.json').elements.map((e) => [e.id, e.tags]));
const isBridge = (way) => {
  const b = tags.get(way)?.bridge;
  return !!b && b !== 'no';
};
const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
const map = read(UI);
if (map.meta.railLegacyRamps === MARK) {
  console.log('already converted');
  process.exit(0);
}
const track = map.roads.filter((r) => r.kind === 'rail' || r.kind === 'tram');
// Levels of real bridge ways at their nodes.
const bridgeLevel = new Map();
for (const r of track)
  if (isBridge(r.way))
    for (const [p, y] of [
      [r.a, r.yA],
      [r.b, r.yB],
    ])
      bridgeLevel.set(key(p), Math.max(bridgeLevel.get(key(p)) ?? -Infinity, y));
const moved = new Map(); // node key -> [old level, new level]
let unflagged = 0,
  lowered = 0;
for (const r of track) {
  if (isBridge(r.way)) continue;
  if (r.bridge) {
    r.bridge = false;
    unflagged++;
  }
  for (const end of ['A', 'B']) {
    const p = end === 'A' ? r.a : r.b,
      y = r['y' + end];
    if (y <= ROAD + 1e-9) continue;
    const next = bridgeLevel.get(key(p)) ?? ROAD;
    if (Math.abs(next - y) < 1e-12) continue;
    r['y' + end] = next;
    moved.set(key(p) + '@' + y, next);
    lowered++;
  }
}
// Route points: same node, same old level -> new level.
const relevel = (routes) =>
  routes.map((route) => ({
    ...route,
    points: route.points.map(([x, y, z]) => {
      const next = moved.get(key([x, z]) + '@' + y);
      return next === undefined ? [x, y, z] : [x, next, z];
    }),
  }));
const original = JSON.stringify(map.transitRoutes);
map.transitRoutes = relevel(map.transitRoutes);
map.meta.railLegacyRamps = MARK;
fs.writeFileSync(UI, JSON.stringify(map));
for (const file of [NETWORK, BACKEND]) {
  const net = read(file);
  if (JSON.stringify(net.transitRoutes) !== original) throw new Error(`${file}: routes differ from the map`);
  net.transitRoutes = map.transitRoutes;
  net.meta.railLegacyRamps = MARK;
  fs.writeFileSync(file, JSON.stringify(net));
}
const before = JSON.parse(original).flatMap((r) => r.points);
const routePoints = map.transitRoutes.flatMap((r) => r.points).filter((p, i) => p[1] !== before[i][1]).length;
console.log({ unflagged, lowered, realBridgeSegments: track.filter((r) => isBridge(r.way)).length, routePointsMoved: routePoints });
