import fs from 'node:fs';
const source = JSON.parse(fs.readFileSync('scripts/data/norrkoping-bridges-source.json'));
const paths = JSON.parse(fs.readFileSync('scripts/data/norrkoping-bridge-paths-source.json'));
const project = ({ lat, lon }) => [
  ((lon - 16.18747) * 58010) / 25,
  ((58.58981 - lat) * 111133) / 25,
];
function fit(ring) {
  let longest = 0,
    angle = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      c = ring[i],
      d = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (d > longest) {
      longest = d;
      angle = Math.atan2(c[1] - a[1], c[0] - a[0]);
    }
  }
  const cs = Math.cos(angle),
    sn = Math.sin(angle),
    ps = ring.map(([x, z]) => [x * cs + z * sn, -x * sn + z * cs]);
  const x0 = Math.min(...ps.map((p) => p[0])),
    x1 = Math.max(...ps.map((p) => p[0])),
    z0 = Math.min(...ps.map((p) => p[1])),
    z1 = Math.max(...ps.map((p) => p[1]));
  const x = (x0 + x1) / 2,
    z = (z0 + z1) / 2;
  return {
    center: [x * cs - z * sn, x * sn + z * cs],
    rotation: -angle,
    length: x1 - x0,
    width: z1 - z0,
  };
}
const styles = {
  Bergsbron: 'stone',
  Saltängsbron: 'city',
  Hamnbron: 'concrete',
  Gamlebro: 'iron',
  Spången: 'wood',
};
const bridges = source.elements
  .filter((e) => styles[e.tags.name])
  .map((e) => ({
    id: e.id,
    name: e.tags.name,
    style: styles[e.tags.name],
    ring: e.geometry.map(project),
    ...fit(e.geometry.map(project)),
    deckY: 0.311,
  }));
for (const e of paths.elements) {
  if (e.id === 26154766) continue; // Spången has a surveyed footprint above.
  const pts = e.geometry.map(project),
    a = pts[0],
    c = pts.at(-1),
    dx = c[0] - a[0],
    dz = c[1] - a[1],
    length = Math.hypot(dx, dz),
    width = e.id === 8237053 ? 0.39 : 0.1;
  const ox = ((-dz / length) * width) / 2,
    oz = ((dx / length) * width) / 2;
  bridges.push({
    id: e.id,
    name: e.id === 8237053 ? 'Laxholmsbron' : 'Gångbro vid laxtrappan',
    style: e.id === 8237053 ? 'circle' : 'wood',
    ring: [
      [a[0] + ox, a[1] + oz],
      [c[0] + ox, c[1] + oz],
      [c[0] - ox, c[1] - oz],
      [a[0] - ox, a[1] - oz],
      [a[0] + ox, a[1] + oz],
    ],
    center: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2],
    rotation: -Math.atan2(dz, dx),
    length,
    width,
    deckY: 0.311,
  });
}
fs.writeFileSync(
  'src/lib/data/city-bridges.json',
  JSON.stringify(
    {
      source:
        'OpenStreetMap contributors; photographed details approximated, not surveyed elevations',
      bridges,
    },
    null,
    2,
  ),
);
console.log(bridges.map((b) => ({ name: b.name, length: b.length, width: b.width })));
