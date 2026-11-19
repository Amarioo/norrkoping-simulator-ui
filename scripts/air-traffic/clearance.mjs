// Air traffic: how close the aircraft's ground paths come to the mapped buildings.
//   node scripts/air-traffic/clearance.mjs [out.json] [geometry.json] [half span in metres]
// Reads docs/air-traffic/data/geometry.json (written by the backend's TestWriteAirTrafficGeometry: the
// ground path of each runway, from the end of the landing roll round the taxiway loop to the threshold)
// and the buildings of src/lib/data/norrkoping-map.json, both in scene units (1 unit = 25 m). Prints, and
// with an argument writes, per airport: the nearest buildings to the path and the room left beside a wing
// tip. Exits with an error if a path runs through a building or a wing would touch one.
import fs from 'node:fs';

// Without the last two arguments: the geometry of the first air traffic phase and the turboprop's wing
// (transportModels.ts: wing(11.5, …)). The air routes phase passes its own geometry and the widest
// type's half span, 17.96 m.
const HALF_SPAN = Number(process.argv[4] ?? 11.5) / 25; // in scene units
const geometry = JSON.parse(
  fs.readFileSync(process.argv[3] ?? 'docs/air-traffic/data/geometry.json', 'utf8'),
);
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));

const toSegment = (p, a, b) => {
  const vx = b[0] - a[0],
    vz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz || 1)),
  );
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t);
};
const inside = (p, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    if (
      ring[i][1] > p[1] !== ring[j][1] > p[1] &&
      p[0] <
        ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]
    )
      c = !c;
  return c;
};

const report = {
  halfSpanUnits: +HALF_SPAN.toFixed(3),
  unitMetres: geometry.unitMetres,
  airports: [],
};
let failed = false;
for (const strip of geometry.strips) {
  // The path, sampled every 0.05 units (1.25 m).
  const samples = [];
  for (let i = 1; i < strip.Path.length; i++) {
    const [a, b] = [strip.Path[i - 1], strip.Path[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 0; k <= n; k++)
      samples.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const box = [0, 1].map((k) => [
    Math.min(...samples.map((p) => p[k])) - 3,
    Math.max(...samples.map((p) => p[k])) + 3,
  ]);
  const near = [];
  for (const building of map.buildings) {
    const ring = building.rings[0];
    if (
      !ring.some(
        (p) => p[0] > box[0][0] && p[0] < box[0][1] && p[1] > box[1][0] && p[1] < box[1][1],
      )
    )
      continue;
    let distance = Infinity,
      through = false;
    for (const p of samples) {
      if (inside(p, ring)) through = true;
      for (let q = 1; q < ring.length; q++)
        distance = Math.min(distance, toSegment(p, ring[q - 1], ring[q]));
    }
    near.push({
      id: building.id,
      kind: building.kind,
      through,
      distanceUnits: +distance.toFixed(3),
    });
  }
  near.sort((a, b) => a.distanceUnits - b.distanceUnits);
  const nearest = near[0];
  const airport = {
    id: strip.ID,
    name: strip.Name,
    taxiways: strip.Taxiways,
    pathUnits: strip.PathEnd,
    buildingsWithin3Units: near.filter((b) => b.distanceUnits < 3).length,
    nearest: near.slice(0, 4),
    wingTipClearanceMetres: nearest
      ? +((nearest.distanceUnits - HALF_SPAN) * geometry.unitMetres).toFixed(1)
      : null,
  };
  report.airports.push(airport);
  if (near.some((b) => b.through) || (nearest && nearest.distanceUnits <= HALF_SPAN)) failed = true;
}
const text = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2]) fs.writeFileSync(process.argv[2], text);
process.stdout.write(text);
if (failed) {
  console.error('a ground path touches a building');
  process.exit(1);
}
