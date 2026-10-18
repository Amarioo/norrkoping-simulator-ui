import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('scripts/data/norrkoping-places-source.json'));
const extra = JSON.parse(fs.readFileSync('scripts/data/norrkoping-transit-source.json'));
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json'));
import { SCENE_REFERENCE, geodeticToScene } from '../src/lib/geo/sweref99tm.js';
// OSM WGS84 coordinates → SWEREF 99 TM scene frame (see src/lib/geo/sweref99tm.js).
const project = (p) => geodeticToScene(SCENE_REFERENCE, p.lat, p.lon);
function frame(ring) {
  let a = ring[0],
    b = ring[1],
    long = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    if (d > long) {
      long = d;
      a = ring[i - 1];
      b = ring[i];
    }
  }
  let heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
  let s = Math.sin(heading),
    c = Math.cos(heading);
  const u = ring.map((p) => p[0] * c - p[1] * s),
    v = ring.map((p) => p[0] * s + p[1] * c);
  if (Math.max(...u) - Math.min(...u) > Math.max(...v) - Math.min(...v)) {
    heading += Math.PI / 2;
    s = Math.sin(heading);
    c = Math.cos(heading);
  }
  const xs = ring.map((p) => p[0] * c - p[1] * s),
    zs = ring.map((p) => p[0] * s + p[1] * c);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2,
    z = (Math.min(...zs) + Math.max(...zs)) / 2;
  return {
    center: [x * c + z * s, -x * s + z * c],
    heading,
    width: Math.max(...xs) - Math.min(...xs),
    length: Math.max(...zs) - Math.min(...zs),
  };
}
const tramStops = extra.elements
  .filter((e) => e.tags?.railway === 'tram_stop' && e.lat)
  .map((e) => ({ ...e, point: project(e) }));
const platforms = [];
for (const e of raw.elements.filter(
  (e) => e.geometry && (e.tags?.railway === 'platform' || e.tags?.tram === 'yes'),
)) {
  const ring = e.geometry.map(project),
    f = frame(ring);
  const near = tramStops
    .map((n) => ({ n, d: Math.hypot(n.point[0] - f.center[0], n.point[1] - f.center[1]) }))
    .sort((a, b) => a.d - b.d)[0];
  const station =
    e.bounds.minlat > 58.5956 &&
    e.bounds.maxlat < 58.5979 &&
    e.bounds.minlon > 16.175 &&
    e.bounds.maxlon < 16.19 &&
    e.tags.railway === 'platform' &&
    f.length > 3;
  if (!station && (!near || near.d > 1.7)) continue;
  if (f.width < 0.015) {
    f.width = 0.12;
    const c = Math.cos(f.heading),
      s = Math.sin(f.heading);
    f.center[0] -= c * 0.1;
    f.center[1] += s * 0.1;
  }
  platforms.push({
    id: e.id,
    name: station ? 'Norrköping C' : near.n.tags.name,
    kind: station ? 'rail' : 'tram',
    ring,
    polygon: e.tags.area === 'yes',
    ...f,
    shelter: e.tags.shelter !== 'no',
    bench: e.tags.bench !== 'no',
    ref: e.tags.ref ?? '',
    mapped: true,
  });
}
// Keep stops whose platforms are not mapped as explicitly estimated, aligned to their nearest track.
for (const stop of tramStops) {
  if (
    platforms.some(
      (p) =>
        p.kind === 'tram' &&
        Math.hypot(p.center[0] - stop.point[0], p.center[1] - stop.point[1]) < 1.7,
    )
  )
    continue;
  const roads = map.roads.filter((r) => r.kind === 'tram');
  let best;
  for (const r of roads) {
    const dx = r.b[0] - r.a[0],
      dz = r.b[1] - r.a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((stop.point[0] - r.a[0]) * dx + (stop.point[1] - r.a[1]) * dz) / (dx * dx + dz * dz),
        ),
      ),
      p = [r.a[0] + t * dx, r.a[1] + t * dz],
      d = Math.hypot(p[0] - stop.point[0], p[1] - stop.point[1]);
    if (!best || d < best.d) best = { d, heading: Math.atan2(dx, dz) };
  }
  if (!best || best.d > 0.4) continue;
  const h = best.heading,
    center = [stop.point[0] - Math.cos(h) * 0.15, stop.point[1] + Math.sin(h) * 0.15];
  platforms.push({
    id: stop.id,
    name: stop.tags.name,
    kind: 'tram',
    ring: [],
    polygon: false,
    center,
    heading: h,
    width: 0.12,
    length: 1.3,
    shelter: true,
    bench: true,
    ref: stop.tags.ref ?? '',
    mapped: false,
  });
}
const pitches = raw.elements
  .filter((e) => e.tags?.leisure === 'pitch' && [91854396, 327232731, 91860497].includes(e.id))
  .map((e) => ({
    id: e.id,
    sport: e.tags.sport,
    ring: e.geometry.map(project),
    ...frame(e.geometry.map(project)),
  }));
const roofs = raw.elements
  .filter(
    (e) =>
      e.tags?.building === 'roof' &&
      e.bounds.minlat > 58.595 &&
      e.bounds.maxlat < 58.599 &&
      e.bounds.minlon > 16.174 &&
      e.bounds.maxlon < 16.194,
  )
  .map((e) => ({ id: e.id, ring: e.geometry.map(project), ...frame(e.geometry.map(project)) }));
const buildings = [102030313, 101513457].map((id) => {
  const b = map.buildings.find((b) => b.id === 'way/' + id);
  return { id, ...frame(b.rings[0]) };
});
fs.writeFileSync(
  'src/lib/data/city-places.json',
  JSON.stringify({
    source: '© OpenStreetMap contributors, ODbL 1.0',
    timestamp: raw.osm3s?.timestamp_osm_base,
    platforms,
    pitches,
    roofs,
    buildings,
  }),
);
console.log({
  platforms: platforms.length,
  tram: platforms.filter((p) => p.kind === 'tram').length,
  mapped: platforms.filter((p) => p.mapped).length,
  pitches,
  buildings,
});
