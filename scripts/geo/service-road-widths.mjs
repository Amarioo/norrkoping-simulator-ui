// Batch B: widths of OSM service roads without width/lanes tags.
//
// import-norrkoping.mjs computed width = max(4, lanes × 3.3) with lanes defaulting to 2 for two-way
// ways, so every untagged two-way highway=service became 6.6 m (11 730 segments) and the intended 4 m
// minimum never applied. Driveways and alleys drawn 6.6 m wide spill over kerbs, walls and slopes beside
// the real carriageway: overlapping asphalt at junctions and twisted cross-sections (the strip edges
// drape onto the terrain beside the road).
//
// Rule (only when OSM has neither width nor lanes): service=driveway 3.0 m; alley / drive-through
// 3.5 m; parking_aisle unchanged (two-way aisles for 90° parking are 6.5–7 m); other two-way service
// roads 4.5 m (narrow two-way access road); one-way service roads keep 4.0 m. Tags come from
// scripts/data/norrkoping-service-roads-source.json (Overpass, highway=service in the map bbox, tags only,
// 2026-10-18; © OpenStreetMap contributors, ODbL). Idempotent (meta.serviceRoadWidths).
// Usage: node scripts/geo/service-road-widths.mjs
import fs from 'node:fs';

export const SERVICE_WIDTH_METRES = { driveway: 3.0, alley: 3.5, 'drive-through': 3.5, other: 4.5 };
const MARK = 'service-road-widths v1 (Batch B, 2026-10-18)';
const UI = 'src/lib/data/norrkoping-map.json',
  NETWORK = 'src/lib/data/transport-network.json',
  BACKEND = '../norrkoping-simulator-backend/src/main/resources/transport-network.json';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tags = new Map(read('scripts/data/norrkoping-service-roads-source.json').elements.map((e) => [e.id, e.tags]));
const scale = 25;
const approx = (a, b) => Math.abs(a - b) < 1e-9;
/** New width (scene units) for a service segment, or undefined to keep it. */
function width(way, current, oneway) {
  const t = tags.get(way);
  if (!t || t.width || t.lanes || oneway) return undefined;
  if (!approx(current, Math.round((6.6 / scale) * 1000) / 1000)) return undefined; // only the defaulted 6.6 m
  if (t.service === 'parking_aisle') return undefined;
  const m = SERVICE_WIDTH_METRES[t.service] ?? SERVICE_WIDTH_METRES.other;
  return Math.round((m / scale) * 1000) / 1000;
}
let changed = { roads: 0, edges: 0 };
const map = read(UI);
if (map.meta.serviceRoadWidths === MARK) console.log(UI, 'already converted');
else {
  for (const r of map.roads)
    if (r.class === 'service' && r.kind === 'road') {
      const w = width(r.way, r.width, r.oneway !== 0);
      if (w !== undefined) {
        r.width = w;
        changed.roads++;
      }
    }
  map.meta.serviceRoadWidths = MARK;
  fs.writeFileSync(UI, JSON.stringify(map));
}
// Transport edges carry the same width (lane offsets of the cars). Service ways are identified by way id.
const serviceWays = new Set(map.roads.filter((r) => r.class === 'service').map((r) => r.way));
for (const file of [NETWORK, BACKEND]) {
  const net = read(file);
  if (net.meta.serviceRoadWidths === MARK) {
    console.log(file, 'already converted');
    continue;
  }
  for (const e of net.edges)
    if (serviceWays.has(e.way)) {
      const w = width(e.way, e.width, e.oneway);
      if (w !== undefined) {
        e.width = w;
        if (file === NETWORK) changed.edges++;
      }
    }
  net.meta.serviceRoadWidths = MARK;
  fs.writeFileSync(file, JSON.stringify(net));
}
console.log(changed);
