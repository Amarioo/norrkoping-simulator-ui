import { cityMap, centerOf, pointInRing, type MapPolygon, type Point } from './mapModel';

export const insidePolygon = (p: Point, polygon: MapPolygon) =>
  pointInRing(p, polygon.rings[0]) && !polygon.rings.slice(1).some((r) => pointInRing(p, r));
const bounds = (p: MapPolygon) => {
  const xs = p.rings[0].map((p) => p[0]),
    zs = p.rings[0].map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
};
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Supplemental, illustrative park planting, never presented as surveyed tree positions. */
export function createParkTrees(): Point[] {
  const cells = new Map<string, ((p: Point) => boolean)[]>();
  const key = (x: number, z: number) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
  function block(box: number[], test: (p: Point) => boolean) {
    for (let x = Math.floor(box[0] / 2); x <= Math.floor(box[2] / 2); x++)
      for (let z = Math.floor(box[1] / 2); z <= Math.floor(box[3] / 2); z++) {
        const k = `${x},${z}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k)!.push(test);
      }
  }
  for (const p of [
    ...cityMap.buildings,
    ...cityMap.areas.filter((a) => a.kind === 'water' || a.kind === 'pitch' || a.kind === 'square'),
  ])
    block(bounds(p), (q) => insidePolygon(q, p));
  for (const r of cityMap.roads) {
    const gap = r.name === 'Kungsgatan' ? 0.65 : r.width / 2 + 0.22;
    block(
      [
        Math.min(r.a[0], r.b[0]) - gap,
        Math.min(r.a[1], r.b[1]) - gap,
        Math.max(r.a[0], r.b[0]) + gap,
        Math.max(r.a[1], r.b[1]) + gap,
      ],
      (q) => distanceToSegment(q, r.a, r.b) < gap,
    );
  }
  function reserve([x, z]: Point) {
    block([x - 0.42, z - 0.42, x + 0.42, z + 0.42], (q) => Math.hypot(x - q[0], z - q[1]) < 0.42);
  }
  cityMap.trees.forEach(reserve);
  const parks = new Set(['Ljuraparken', 'Folkparken', 'Vasaparken']);
  const anchors = cityMap.areas.filter((a) => parks.has(a.name ?? '')).map(centerOf);
  const result: Point[] = [];
  for (const area of cityMap.areas.filter(
    (a) =>
      a.kind === 'wood' ||
      (a.kind === 'grass' &&
        (parks.has(a.name ?? '') ||
          anchors.some((p) => Math.hypot(p[0] - centerOf(a)[0], p[1] - centerOf(a)[1]) < 9))),
  )) {
    const [x0, z0, x1, z1] = bounds(area);
    const step = Math.hypot(...centerOf(area)) > 90 ? 2.8 : 0.8;
    for (let x = Math.floor(x0 / step); x * step < x1; x++)
      for (let z = Math.floor(z0 / step); z * step < z1; z++) {
        const hash = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0;
        if (hash % 100 > (area.kind === 'wood' ? 88 : 48)) continue;
        const p: Point = [x * step + (hash % 31) / 100, z * step + ((hash >>> 8) % 31) / 100];
        if (!insidePolygon(p, area) || cells.get(key(...p))?.some((test) => test(p))) continue;
        if (result.length >= 15000) return result;
        result.push(p);
        reserve(p);
      }
  }
  return result;
}
