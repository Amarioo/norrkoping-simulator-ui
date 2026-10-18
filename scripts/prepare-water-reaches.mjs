// Water reaches, pass 2 of 2 (Step 3.5): cuts the OSM water polygons into reach surfaces.
//
// Input: work/water-reaches/raw.json from scripts/prepare-water-reaches.py (reach levels and, for
// polygons spanning several reaches, raster regions labelled by the hydro-flattened DTM).
// Output: src/lib/data/water-reaches.json, read by cityMesh.ts (flat water per reach, quay/bank
// faces along the OSM shoreline, fall faces where two reaches meet).
//
// The OSM shoreline is kept exactly: each region is intersected with the OSM polygon. Regions are
// carved smallest first, so the pieces of a polygon never overlap and leave no gaps.
// Usage: node scripts/prepare-water-reaches.mjs
import fs from 'node:fs';
import polygonClipping from 'polygon-clipping';

const raw = JSON.parse(fs.readFileSync('work/water-reaches/raw.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const areas = new Map(map.areas.filter((a) => a.kind === 'water').map((a) => [a.id, a]));
const reaches = new Map(raw.reaches.map((r) => [r.id, r]));
const round = (v) => Math.round(v * 1e5) / 1e5;
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[(i + 1) % ring.length];
    s += ax * bz - bx * az;
  }
  return s / 2;
};
const polyArea = (multi) =>
  multi.reduce((s, poly) => s + Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0);
const closed = (ring) => {
  const r = ring.map((p) => [p[0], p[1]]);
  const [a, b] = [r[0], r.at(-1)];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
};
const open = (ring) => {
  const r = ring.map((p) => [round(p[0]), round(p[1])]);
  const [a, b] = [r[0], r.at(-1)];
  if (a[0] === b[0] && a[1] === b[1]) r.pop();
  return r;
};

const surfaces = [];
const draped = [];
const dry = [];
const falls = [];
const unmeasured = [];
const levels = new Map();
let carvedLoss = 0;
for (const p of raw.polygons) {
  const area = areas.get(p.area);
  if (!area) throw new Error(`Unknown water area ${p.area}`);
  if (p.mode === 'unmeasured') {
    unmeasured.push(p.area);
    continue;
  }
  if (p.mode === 'own') {
    const id = `own-${p.area}`;
    reaches.set(id, {
      id,
      levelMetres: p.levelMetres,
      source: p.source,
      class9Cells: p.class9Cells,
      dtmSpreadMetres: p.dtmSpreadMetres,
    });
    surfaces.push({ reach: id, area: p.area, rings: area.rings.map(open) });
    continue;
  }
  if (p.mode === 'single') {
    surfaces.push({ reach: p.reach, area: p.area, rings: area.rings.map(open) });
    continue;
  }
  // Split: carve the regions out of the OSM polygon, smallest region first.
  let rest = [area.rings.map(closed)];
  const total = polyArea(rest);
  const regions = p.pieces
    .map((piece) => ({ reach: piece.reach, poly: piece.rings.map((r) => [closed(r)]) }))
    .map((r) => ({ ...r, size: polyArea(r.poly) }))
    .sort((a, b) => a.size - b.size);
  const pieces = [];
  for (const region of regions) {
    if (!region.poly.length) continue;
    const cut = polygonClipping.intersection(rest, region.poly);
    rest = polygonClipping.difference(rest, region.poly);
    for (const poly of cut) pieces.push({ reach: region.reach, poly });
  }
  // Slivers left between simplified region outlines join the neighbouring piece they touch most closely.
  for (const sliver of rest) {
    const probe = sliver[0];
    let best = null,
      bestD = Infinity;
    for (const piece of pieces)
      for (const ring of piece.poly)
        for (const v of ring)
          for (const q of probe) {
            const d = Math.hypot(v[0] - q[0], v[1] - q[1]);
            if (d < bestD) [best, bestD] = [piece, d];
          }
    if (!best) continue;
    const merged = polygonClipping.union([best.poly], [sliver]);
    best.poly = merged[0];
    for (const extra of merged.slice(1)) pieces.push({ reach: best.reach, poly: extra });
  }
  carvedLoss += polyArea(rest);
  for (const piece of pieces)
    (piece.reach === 'draped' ? draped : piece.reach === 'dry' ? dry : surfaces).push({
      reach: piece.reach,
      area: p.area,
      rings: piece.poly.map(open),
    });
  // Fall edges: piece edges that are not on the OSM outline, oriented with the higher reach first.
  const outline = area.rings.map(open);
  const onOutline = (a, b) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const ring of outline)
      for (let i = 0; i < ring.length; i++) {
        const p0 = ring[i],
          p1 = ring[(i + 1) % ring.length],
          dx = p1[0] - p0[0],
          dz = p1[1] - p0[1],
          l2 = dx * dx + dz * dz;
        const t = l2 ? Math.max(0, Math.min(1, ((m[0] - p0[0]) * dx + (m[1] - p0[1]) * dz) / l2)) : 0;
        if (Math.hypot(m[0] - p0[0] - dx * t, m[1] - p0[1] - dz * t) < 2e-4) return true;
      }
    return false;
  };
  const inside = (pt, poly) => {
    let ok = false;
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) ok = !ok;
      }
    return ok;
  };
  for (const piece of pieces) {
    if (piece.reach === 'draped' || piece.reach === 'dry') continue;
    const level = reaches.get(piece.reach).levelMetres;
    for (const ring of piece.poly.map(open))
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6 || onOutline(a, b)) continue;
        const nx = -(b[1] - a[1]) / len,
          nz = (b[0] - a[0]) / len,
          m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let other = null;
        for (const s of [1e-3, -1e-3]) {
          const probe = [m[0] + nx * s, m[1] + nz * s];
          if (inside(probe, piece.poly.map(open))) continue;
          other = pieces.find((q) => q !== piece && inside(probe, q.poly.map(open)));
          if (other) break;
        }
        if (!other || other.reach === 'draped' || other.reach === 'dry') continue;
        const otherLevel = reaches.get(other.reach).levelMetres;
        if (level - otherLevel > 0.05) falls.push({ a, b, upperMetres: level, lowerMetres: otherLevel });
      }
  }
}
for (const s of surfaces) levels.set(s.reach, reaches.get(s.reach).levelMetres);
const used = [...reaches.values()].filter((r) => levels.has(r.id));
const out = {
  method:
    'Flat water surfaces per reach. Extent: hydro-flattened water surfaces of the Lantmäteriet 1 m DTM ' +
    '(steps at dams and falls), cut from the OSM water polygons. Level: median LiDAR class 9 return ' +
    '(flight 2020) where at least 25 cells exist, otherwise the flattened DTM level; the sea and the ' +
    'tidal river use the SMHI 2021-2025 mean sea level. Generated by scripts/prepare-water-reaches.py ' +
    'and scripts/prepare-water-reaches.mjs. Levels are a snapshot (regulated reaches vary).',
  sources: raw.sources,
  parameters: raw.parameters,
  reaches: used,
  surfaces,
  falls,
  unmeasured,
  // Parts of measured polygons without a level (sloping side channels, cascades): follow the terrain.
  draped: draped.map(({ area, rings }) => ({ area, rings })),
  // Dry banks inside OSM water polygons (DTM above the reach): drawn as land.
  dry: dry.map(({ area, rings }) => ({ area, rings })),
};
fs.writeFileSync('src/lib/data/water-reaches.json', JSON.stringify(out) + '\n');
const vertices = surfaces.reduce((s, x) => s + x.rings.reduce((t, r) => t + r.length, 0), 0);
console.log(
  JSON.stringify({
    reaches: used.length,
    surfaces: surfaces.length,
    vertices,
    falls: falls.length,
    draped: draped.length,
    dry: dry.length,
    unmeasured: unmeasured.length,
    sliversMergedSceneArea: carvedLoss,
    bytes: fs.statSync('src/lib/data/water-reaches.json').size,
  }),
);
