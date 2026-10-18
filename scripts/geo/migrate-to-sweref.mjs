// One-time migration of stored scene coordinates from the legacy equirectangular frame
// (origin 58.58981 N 16.18747 E, 58 010 / 111 133 m per degree, 25 m/unit) to the SWEREF 99 TM
// scene frame in src/lib/geo/sweref99tm.js. Heights (y, yA, yB, deck values, RH2000 metres) are never
// changed. Refuses to run on already-migrated data.
//
// Usage: node scripts/geo/migrate-to-sweref.mjs [--backend ../norrkoping-simulator-backend]
import fs from 'node:fs';
import path from 'node:path';
import { SCENE_REFERENCE as REF } from '../../src/lib/geo/sweref99tm.js';

const DATA = 'src/lib/data';
const backendArg = process.argv.indexOf('--backend');
const BACKEND = path.join(
  backendArg > 0 ? process.argv[backendArg + 1] : '../norrkoping-simulator-backend',
  'src/main/resources',
);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (file, value, pretty = false) =>
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : undefined) + (pretty ? '\n' : ''));

const { point, exact, heading, scaleAt, round3: round } = await import('./legacy-frame.mjs');

const map = read(`${DATA}/norrkoping-map.json`);
if (map.meta.reference?.crs === 'EPSG:3006') {
  console.error('Data is already in the SWEREF 99 TM scene frame; nothing to do.');
  process.exit(1);
}
const counts = {};
const count = (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
const rings = (polys, name) => {
  for (const p of polys) {
    p.rings = p.rings.map((r) => r.map(point));
    count(name);
  }
};

// ---- Transit polylines: points move, stop/destination distances are re-measured along the path.
function migrateRoute(route) {
  const oldPts = route.points.map((p) => [p[0], p[2]]);
  const newPts = oldPts.map(point);
  const cum = (pts) => {
    const c = [0];
    for (let i = 1; i < pts.length; i++)
      c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return c;
  };
  const oc = cum(oldPts),
    nc = cum(newPts);
  const remap = (d) => {
    let i = 1;
    while (i < oc.length - 1 && oc[i] < d) i++;
    const len = oc[i] - oc[i - 1],
      t = len > 0 ? (d - oc[i - 1]) / len : 0;
    return nc[i - 1] + t * (nc[i] - nc[i - 1]);
  };
  route.stops = route.stops.map((s) => ({ ...s, distance: remap(s.distance) }));
  route.destinations = (route.destinations ?? []).map((s) => ({ ...s, distance: remap(s.distance) }));
  route.points = route.points.map((p, i) => [newPts[i][0], p[1], newPts[i][1]]);
  count('transitPoints', route.points.length);
}

// ---- Map
const oldBounds = map.meta.bounds;
const corners = [
  [oldBounds[0], oldBounds[1]],
  [oldBounds[2], oldBounds[1]],
  [oldBounds[2], oldBounds[3]],
  [oldBounds[0], oldBounds[3]],
].map(point);
rings(map.buildings, 'buildings');
rings(map.ground, 'ground');
rings(map.areas, 'areas');
for (const r of map.roads) {
  r.a = point(r.a);
  r.b = point(r.b);
  count('roadSegments');
}
map.trees = map.trees.map(point);
count('trees', map.trees.length);
for (const s of map.signals) s.position = point(s.position);
for (const a of map.airways) a.points = a.points.map(point);
for (const a of map.airports) {
  a.start = point(a.start);
  a.end = point(a.end);
}
map.transitRoutes.forEach(migrateRoute);
// Signal orientation is derived from the nearest road's axis; re-derive it in the new frame.
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const drivable = map.roads.filter((r) => r.kind === 'road');
let flipped = 0;
for (const s of map.signals) {
  const near = drivable.reduce(
    (best, r) => {
      const d = segmentDistance(s.position, r.a, r.b);
      return d < best.d ? { r, d } : best;
    },
    { r: null, d: Infinity },
  ).r;
  const horizontal = near
    ? Math.abs(near.b[0] - near.a[0]) > Math.abs(near.b[1] - near.a[1])
    : true;
  if (horizontal !== s.horizontal) flipped++;
  s.horizontal = horizontal;
}
counts.signalOrientationFlipped = flipped;
let minX = Infinity,
  minZ = Infinity,
  maxX = -Infinity,
  maxZ = -Infinity;
const extend = ([x, z]) => {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
};
corners.forEach(extend);
for (const p of [...map.ground, ...map.areas, ...map.buildings]) p.rings.flat().forEach(extend);
for (const r of map.roads) [r.a, r.b].forEach(extend);
map.meta = {
  ...Object.fromEntries(Object.entries(map.meta).filter(([k]) => k !== 'origin')),
  bounds: [minX, minZ, maxX, maxZ].map(round),
  clip: [...corners, corners[0]],
  reference: { ...REF },
  projection:
    'Scene = (SWEREF 99 TM − origin) / (metresPerUnit · gridScaleFactor); x east, z south. ' +
    'Migrated 2026-10-18 from the legacy equirectangular frame (scripts/geo/migrate-to-sweref.mjs).',
};
write(`${DATA}/norrkoping-map.json`, map);

// ---- Transport network (client and backend share one file)
const network = read(`${DATA}/transport-network.json`);
for (const n of network.nodes) [n.x, n.z] = point([n.x, n.z]);
for (const e of network.edges) {
  const a = network.nodes[e.from],
    b = network.nodes[e.to];
  e.length = round(Math.hypot(b.x - a.x, b.z - a.z));
}
const signalById = new Map(map.signals.map((s) => [s.id, s.horizontal]));
for (const n of network.nodes)
  if ('signalHorizontal' in n && signalById.has(n.id)) n.signalHorizontal = signalById.get(n.id);
network.airports = map.airports;
network.airways = map.airways;
network.transitRoutes = map.transitRoutes;
network.meta = map.meta;
count('networkNodes', network.nodes.length);
write(`${DATA}/transport-network.json`, network);
if (fs.existsSync(BACKEND)) write(`${BACKEND}/transport-network.json`, network);

// ---- Bridge profiles: keys follow the moved road endpoints; heights are unchanged.
const profiles = read(`${DATA}/bridge-profiles.json`);
const points = {};
for (const [key, value] of Object.entries(profiles.points)) {
  const [x, z, y] = key.split(',').map(Number);
  const [nx, nz] = point([x, z]);
  const k = `${nx.toFixed(3)},${nz.toFixed(3)},${y.toFixed(3)}`;
  if (k in points && points[k] !== value) throw new Error(`Profile key collision ${k}`);
  points[k] = value;
}
if (Object.keys(points).length !== Object.keys(profiles.points).length)
  throw new Error('Bridge profile keys merged during migration');
profiles.points = points;
const profileContent = JSON.stringify(profiles) + '\n';
fs.writeFileSync(`${DATA}/bridge-profiles.json`, profileContent);
if (fs.existsSync(BACKEND)) fs.writeFileSync(`${BACKEND}/bridge-profiles.json`, profileContent);
count('bridgeProfileKeys', Object.keys(points).length);

// ---- Hand-fitted geometry
const pitch = read(`${DATA}/training-pitch.json`);
const [px, pz] = pitch.center,
  ps = scaleAt(px, pz);
pitch.heading = heading(px, pz, pitch.heading);
pitch.center = exact(px, pz);
pitch.width *= ps;
pitch.length *= ps;
write(`${DATA}/training-pitch.json`, pitch, true);
const ingelsta = read(`${DATA}/ingelsta-bridge.json`);
ingelsta.a = point(ingelsta.a);
ingelsta.b = point(ingelsta.b);
fs.writeFileSync(`${DATA}/ingelsta-bridge.json`, JSON.stringify(ingelsta, null, 2) + '\n');

console.log(JSON.stringify({ counts, bounds: map.meta.bounds, oldBounds }, null, 1));
