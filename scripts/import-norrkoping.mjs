import fs from 'node:fs';
import osmtogeojson from 'osmtogeojson';
import pc from 'polygon-clipping';
import { buildTransit } from './import-transit.mjs';
import { waterFootprints, crossesWater, carveTerrain } from './water-terrain.mjs';
import { trenchDepth, trenchRing } from '../src/lib/ingelstaTerrain.js';
import levels from '../src/lib/data/terrain-levels.json' with { type: 'json' };
const bbox = [58.555, 16.065, 58.65, 16.295],
  origin = [58.58981, 16.18747],
  scale = 25;
const query = `[out:json][timeout:180][bbox:${bbox}];(way[building];relation[building];way["building:part"];way[highway];way[railway];way[landuse];relation[landuse];way[leisure];relation[leisure];way[natural=water];relation[natural=water];way[natural=wood];way[natural=coastline];way[waterway];way[aeroway];way["disused:aeroway"];way["abandoned:aeroway"];node[natural=tree];node[highway=traffic_signals];node[aeroway];nwr[amenity=police];);out geom;`;
let raw;
if (process.argv[2]) raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
else {
  const res = await fetch(
    'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query),
    {
      headers: { 'User-Agent': 'NorrkopingSimulator/0.2', Accept: 'application/json' },
      signal: AbortSignal.timeout(220000),
    },
  );
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  raw = await res.json();
}
if (!raw.elements?.length || raw.remark) throw new Error('Incomplete map: ' + raw.remark);
const extra = JSON.parse(
  fs.readFileSync(new URL('./data/norrkoping-transit-source.json', import.meta.url), 'utf8'),
);
const existingWays = new Set(raw.elements.filter((e) => e.type === 'way').map((e) => e.id));
for (const rel of extra.elements.filter((e) => e.type === 'relation'))
  for (const m of rel.members)
    if (m.type === 'way' && !m.role && m.geometry && !existingWays.has(m.ref)) {
      raw.elements.push({
        type: 'way',
        id: m.ref,
        tags: { railway: 'tram' },
        geometry: m.geometry,
      });
      existingWays.add(m.ref);
    }
const round = (n) => Math.round(n * 1000) / 1000;
const project = ([lon, lat]) => [
  round(((lon - origin[1]) * 58010) / scale),
  round(((origin[0] - lat) * 111133) / scale),
];
const nw = project([bbox[1], bbox[2]]),
  se = project([bbox[3], bbox[0]]),
  bounds = [nw[0], nw[1], se[0], se[1]];
const clip = [
  [
    [nw[0], nw[1]],
    [se[0], nw[1]],
    [se[0], se[1]],
    [nw[0], se[1]],
    [nw[0], nw[1]],
  ],
];
const inside = (p) => p[0] >= nw[0] && p[0] <= se[0] && p[1] >= nw[1] && p[1] <= se[1];
const positive = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const buildings = [],
  areas = [],
  roads = [],
  trees = [],
  signals = [],
  airways = [];
const motorTypes = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service',
]);
const major = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
]);
const signalIds = new Set(
  raw.elements
    .filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals')
    .map((e) => e.id),
);
const nodeIndex = new Map(),
  nodes = [],
  edges = [];
function networkNode(id, pt, y) {
  if (!nodeIndex.has(id)) {
    nodeIndex.set(id, nodes.length);
    nodes.push({ id, x: pt[0], z: pt[1], y, signal: signalIds.has(id) });
  }
  const i = nodeIndex.get(id);
  nodes[i].y = Math.max(nodes[i].y, y);
  return i;
}
const geo = osmtogeojson(raw, { flatProperties: true });
const waterMask = waterFootprints(geo, raw, project, clip);
for (const e of raw.elements) {
  const p = e.tags ?? {};
  if (e.type === 'node') {
    const pt = project([e.lon, e.lat]);
    if (!inside(pt)) continue;
    if (p.natural === 'tree') trees.push(pt);
    if (p.highway === 'traffic_signals') signals.push({ id: e.id, position: pt });
    continue;
  }
  if (e.type !== 'way' || !e.geometry) continue;
  const air = p.aeroway ?? p['disused:aeroway'] ?? p['abandoned:aeroway'];
  if (['runway', 'taxiway'].includes(air))
    airways.push({
      id: e.id,
      kind: air,
      ref: p.ref ?? '',
      name: p.name ?? '',
      width: (positive(p.width) ?? (air === 'runway' ? 35 : 18)) / scale,
      points: e.geometry.map((q) => project([q.lon, q.lat])),
      surface: p.surface ?? 'asphalt',
      historic: !!(p['disused:aeroway'] || p['abandoned:aeroway']),
    });
  if (!p.highway && !p.railway && !p.waterway) continue;
  if (p.area === 'yes' || ['proposed', 'construction', 'abandoned', 'disused'].includes(p.highway))
    continue;
  if (air) continue;
  const kind = p.railway
    ? p.railway === 'tram'
      ? 'tram'
      : 'rail'
    : p.waterway
      ? 'stream'
      : motorTypes.has(p.highway)
        ? 'road'
        : 'path';
  if (p.railway && !['tram', 'rail', 'light_rail'].includes(p.railway)) continue;
  const oneway =
    p.oneway === '-1'
      ? -1
      : ['yes', '1', 'true'].includes(p.oneway) ||
          ((p.junction === 'roundabout' || p.highway === 'motorway') && p.oneway !== 'no')
        ? 1
        : 0;
  const lanes = positive(p.lanes) ?? (oneway ? 1 : 2);
  const width =
    (positive(p.width) ??
      (kind === 'road'
        ? Math.max(p.highway === 'service' ? 4 : 5.5, lanes * 3.3)
        : kind === 'path'
          ? 2
          : kind === 'stream'
            ? 3
            : 1.5)) / scale;
  const bridge = !!p.bridge && p.bridge !== 'no';
  const waterBridge =
    bridge &&
    crossesWater(
      e.geometry.map((q) => project([q.lon, q.lat])),
      waterMask,
    );
  const elevation =
    bridge && !waterBridge && ![536359154, 93304103, 94010853].includes(e.id)
      ? Math.max(1, Number(p.layer) || 1) * 0.24
      : 0;
  const drivable =
    kind === 'road' &&
    !['no', 'private'].includes(p.motorcar ?? p.motor_vehicle ?? p.access) &&
    p.name !== 'Drottninggatan';
  const truck = major.has(p.highway) && !['no', 'destination'].includes(p.hgv);
  const speed =
    (positive(p.maxspeed) ??
      (p.highway?.startsWith('motorway')
        ? 100
        : p.highway?.startsWith('trunk')
          ? 80
          : major.has(p.highway)
            ? 60
            : 30)) /
    3.6 /
    scale;
  for (let i = 1; i < e.geometry.length; i++) {
    const a = project([e.geometry[i - 1].lon, e.geometry[i - 1].lat]),
      b = project([e.geometry[i].lon, e.geometry[i].lat]);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!inside(a) || !inside(b) || length < 0.01) continue;
    const road = {
      a,
      b,
      kind,
      width: round(width),
      name: p.name ?? '',
      ref: p.ref ?? '',
      class: p.highway ?? '',
      lanes,
      oneway,
      bridge,
      tunnel: p.tunnel === 'yes',
      way: e.id,
      yA: levels.road + elevation,
      yB: levels.road + elevation,
    };
    roads.push(road);
    if (drivable) {
      const from = networkNode(e.nodes[i - 1], a, levels.road + elevation),
        to = networkNode(e.nodes[i], b, levels.road + elevation);
      const props = {
        length: round(length),
        speed: round(speed),
        width: round(width),
        truck,
        bus:
          truck || ['tertiary', 'tertiary_link', 'unclassified', 'residential'].includes(p.highway),
        name: p.name ?? p.ref ?? '',
        way: e.id,
        oneway: oneway !== 0,
      };
      if (oneway !== -1) edges.push({ from, to, ...props });
      if (oneway !== 1) edges.push({ from: to, to: from, ...props });
      road.nodeA = from;
      road.nodeB = to;
    }
  }
}
for (const r of roads) {
  if (r.nodeA !== undefined) {
    r.yA = nodes[r.nodeA].y;
    r.yB = nodes[r.nodeB].y;
    delete r.nodeA;
    delete r.nodeB;
  }
}
// Use one signal orientation on the server and renderer, including curved approaches.
for (const signal of signals) {
  const n = nodeIndex.get(signal.id),
    near = roads
      .filter((r) => r.kind === 'road')
      .reduce(
        (best, r) => {
          const d = dist(signal.position, r.a, r.b);
          return d < best.d ? { r, d } : best;
        },
        { r: null, d: Infinity },
      ).r;
  signal.horizontal = near
    ? Math.abs(near.b[0] - near.a[0]) > Math.abs(near.b[1] - near.a[1])
    : true;
  if (n !== undefined) nodes[n].signalHorizontal = signal.horizontal;
}
for (const stop of extra.elements.filter(
  (e) => e.type === 'node' && e.tags?.highway === 'bus_stop',
)) {
  const p = project([stop.lon, stop.lat]);
  let best = -1,
    d = 0.6;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i],
      gap = Math.hypot(n.x - p[0], n.z - p[1]);
    if (gap < d) {
      d = gap;
      best = i;
    }
  }
  if (best >= 0) nodes[best].busStop = stop.tags.name ?? 'Hållplats';
}
// Flat terrain represents underpasses with a raised rail deck and smooth track ramps.
const underpasses = roads.filter((r) => r.kind === 'road' && r.tunnel);
const railBridges = roads.filter((r) => (r.kind === 'rail' || r.kind === 'tram') && r.bridge);
function railHeight(p) {
  let rise = 0;
  for (const r of underpasses) {
    const d = dist(p, r.a, r.b);
    if (d < 2) rise = Math.max(rise, 0.28 * Math.min(1, (2 - d) / 1.2));
  }
  for (const r of railBridges) {
    const d = dist(p, r.a, r.b);
    if (d < 1.5) rise = Math.max(rise, (r.yA - 0.071) * Math.min(1, (1.5 - d) / 0.8));
  }
  return 0.071 + rise - trenchDepth(p);
}
for (const r of roads)
  if (r.kind === 'rail' || r.kind === 'tram') {
    r.yA = railHeight(r.a);
    r.yB = railHeight(r.b);
    r.bridge ||= r.yA > 0.1 || r.yB > 0.1;
  }
const transitRoutes = buildTransit(raw, extra, project, railHeight);
for (const f of geo.features) {
  const p = f.properties,
    g = f.geometry;
  if (!g || !['Polygon', 'MultiPolygon'].includes(g.type)) continue;
  if (p.natural === 'coastline') continue;
  for (const polygon of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    const parts = pc.intersection(
      polygon.map((r) => r.map(project)),
      clip,
    );
    for (const part of parts) {
      const rings = part.map((r) => r.map((pt) => pt.map(round))),
        xs = rings[0].map((p) => p[0]),
        zs = rings[0].map((p) => p[1]),
        x = (Math.min(...xs) + Math.max(...xs)) / 2,
        z = (Math.min(...zs) + Math.max(...zs)) / 2;
      const common = { id: f.id, ...(p.name ? { name: p.name } : {}), rings };
      if (p.building && p.building !== 'no') {
        if (
          x > -39 &&
          x < -29 &&
          z > 20 &&
          z < 29 &&
          (p.building === 'roof' || p.leisure === 'stadium')
        )
          continue;
        const levels = positive(p['building:levels']),
          fallback = /house|detached|terrace/.test(p.building)
            ? 7
            : /garage|shed|hut/.test(p.building)
              ? 3
              : /industrial|warehouse|retail/.test(p.building)
                ? 8
                : 13;
        const industrial = x < -10 && x > -30 && z > -12 && z < 8,
          police = f.id === 'relation/1356564';
        const h = police
          ? 7
          : p.name === 'Strykjärnet'
            ? 22
            : p.name === 'Rådhuset'
              ? 20
              : p.name === 'Sankt Olai kyrka'
                ? 18
                : (positive(p.height) ?? (levels ? levels * 3.1 : fallback));
        buildings.push({
          ...common,
          ...(police ? { name: 'Polishuset' } : {}),
          height: round(Math.min(h, 120) / scale),
          minHeight: round(Math.min(positive(p.min_height) ?? 0, h - 0.2) / scale),
          heightSource: positive(p.height) ? 'height' : levels ? 'levels' : 'estimated',
          wall: police
            ? '#b7b9b5'
            : (p['building:colour']?.replaceAll('_', '') ??
              (p.name === 'Strykjärnet'
                ? '#d6b559'
                : industrial
                  ? '#a86f4e'
                  : ['#c4b59e', '#d8cdb6', '#b9a18d', '#d4bd90', '#c1b7a8'][
                      Number(f.id.split('/')[1]) % 5
                    ])),
          roof: police
            ? '#929b9c'
            : (p['roof:colour']?.replaceAll('_', '') ??
              (industrial
                ? '#674c43'
                : ['#68625d', '#776252', '#9a6248', '#62686a'][Number(f.id.split('/')[1]) % 4])),
          roofShape: police ? 'flat' : (p['roof:shape'] ?? (fallback === 3 ? 'flat' : 'hipped')),
          kind: p.building,
        });
      } else {
        const air = p.aeroway ?? p['disused:aeroway'];
        const kind =
          p.natural === 'water' || p.waterway === 'riverbank'
            ? 'water'
            : air === 'apron'
              ? 'apron'
              : air === 'aerodrome'
                ? 'grass'
                : p.leisure === 'pitch'
                  ? 'pitch'
                  : p.landuse === 'cemetery'
                    ? 'cemetery'
                    : p.natural === 'wood' || p.landuse === 'forest'
                      ? 'wood'
                      : p.landuse === 'farmland' || p.landuse === 'farmyard'
                        ? 'farmland'
                        : ['grass', 'meadow', 'recreation_ground', 'village_green'].includes(
                              p.landuse,
                            ) ||
                            ['park', 'garden', 'playground', 'recreation_ground'].includes(
                              p.leisure,
                            )
                          ? 'grass'
                          : ['industrial', 'commercial', 'retail', 'construction'].includes(
                                p.landuse,
                              )
                            ? 'industrial'
                            : p.landuse === 'residential'
                              ? 'residential'
                              : p.highway === 'pedestrian'
                                ? 'square'
                                : null;
        if (kind) areas.push({ ...common, kind });
      }
    }
  }
}
// Assemble the three mainland shoreline sections. Their outer endpoints are
// east of this regional map; close offshore, then subtract mapped islands.
const coast = raw.elements.filter((e) => e.type === 'way' && e.tags?.natural === 'coastline');
const open = coast.filter((e) => e.nodes[0] !== e.nodes.at(-1));
let chain = open.find((e) => !open.some((o) => o.nodes.at(-1) === e.nodes[0]));
if (!chain) throw new Error('Cannot assemble mainland coastline');
let shore = [...chain.geometry],
  last = chain.nodes.at(-1),
  used = new Set([chain.id]);
while (true) {
  const next = open.find((e) => e.nodes[0] === last && !used.has(e.id));
  if (!next) break;
  shore.push(...next.geometry.slice(1));
  last = next.nodes.at(-1);
  used.add(next.id);
}
shore = shore.map((p) => project([p.lon, p.lat]));
if (shore[0][0] <= se[0] || shore.at(-1)[0] <= se[0])
  throw new Error('Review regional coastline closure');
let sea = pc.intersection([[...shore, shore[0]]], clip);
const islands = coast
  .filter((e) => e.nodes[0] === e.nodes.at(-1))
  .map((e) => [e.geometry.map((p) => project([p.lon, p.lat]))]);
sea = pc.difference(sea, ...islands);
for (const rings of sea)
  areas.push({
    id: 'coastline/region',
    name: 'Motala ström / Bråviken',
    kind: 'water',
    rings: rings.map((r) => r.map((p) => p.map(round))),
  });
// User-verified correction: no tree avenue on Kungsgatan towards the police complex.
const kungsgatan = roads.filter((r) => r.name === 'Kungsgatan' && r.a[1] < 2 && r.a[1] > -34);
function dist(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const correctedTrees = trees.filter((p) => !kungsgatan.some((r) => dist(p, r.a, r.b) < 0.6));
const airport = (id, name, way, reverse = false) => {
  const r = airways.find((a) => a.id === way);
  if (!r) throw new Error('Missing runway ' + way);
  const pts = reverse ? [...r.points].reverse() : r.points;
  return {
    id,
    name,
    runway: r.ref,
    start: pts[0],
    end: pts.at(-1),
    width: r.width,
    historic: r.historic,
  };
};
const airports = [
  airport('ESSP', 'Norrköpings flygplats', 7840051),
  airport('F13', 'Bråvalla F13', 26750466),
];
const meta = {
  source: 'OpenStreetMap contributors',
  license: 'ODbL-1.0',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  timestamp: raw.osm3s?.timestamp_osm_base,
  bbox,
  bounds,
  origin,
  metresPerUnit: scale,
  query,
  note: 'Mapped footprints, roads, runways and signal locations. Building heights and architectural details may be estimated. F13 flights are fictional.',
};
const terrain = carveTerrain(areas, waterMask, clip);
terrain.ground = terrain.ground.flatMap((a) =>
  pc.difference(a.rings, [trenchRing]).map((rings) => ({ ...a, rings })),
);
terrain.surfaces = terrain.surfaces.flatMap((a) =>
  a.kind === 'water' ? [a] : pc.difference(a.rings, [trenchRing]).map((rings) => ({ ...a, rings })),
);
const result = {
  meta,
  buildings,
  ground: terrain.ground,
  areas: terrain.surfaces,
  roads,
  trees: correctedTrees,
  signals,
  airways,
  airports,
  transitRoutes,
};
fs.writeFileSync(
  new URL('../src/lib/data/norrkoping-map.json', import.meta.url),
  JSON.stringify(result),
);
const network = { meta, nodes, edges, airports, airways, transitRoutes };
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(network));
fs.writeFileSync(
  new URL('../src/lib/data/transport-network.json', import.meta.url),
  JSON.stringify(network),
);
console.log({
  buildings: buildings.length,
  areas: areas.length,
  roads: roads.length,
  trees: correctedTrees.length,
  signals: signals.length,
  nodes: nodes.length,
  edges: edges.length,
  airways: airways.length,
  bounds,
  airports,
});
