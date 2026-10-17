/** Clip a source triangle to a common, fixed diagonal grid. Adjacent layers share planes. */
type Point = [number, number];
const EPS = 1e-10;
function clip(poly: Point[], axis: 0 | 1, value: number, greater: boolean): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = (a[axis] - value) * (greater ? 1 : -1),
      db = (b[axis] - value) * (greater ? 1 : -1);
    if (da >= -EPS) out.push(a);
    if (da >= -EPS !== db >= -EPS) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function diagonal(poly: Point[], x: number, z: number, step: number, lower: boolean): Point[] {
  const out: Point[] = [];
  const d = (p: Point) => (p[0] - x + p[1] - z - step) * (lower ? -1 : 1);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = d(a),
      db = d(b);
    if (da >= -EPS) out.push(a);
    if (da >= -EPS !== db >= -EPS) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
export function gridTriangles(
  a: Point,
  b: Point,
  c: Point,
  step: number,
  emit: (a: Point, b: Point, c: Point) => void,
) {
  const z0 = Math.floor(Math.min(a[1], b[1], c[1]) / step),
    z1 = Math.floor(Math.max(a[1], b[1], c[1]) / step);
  for (let row = z0; row <= z1; row++) {
    const z = row * step;
    const band = clip(clip([a, b, c], 1, z, true), 1, z + step, false);
    if (band.length < 3) continue;
    const x0 = Math.floor(Math.min(...band.map((p) => p[0])) / step),
      x1 = Math.floor(Math.max(...band.map((p) => p[0])) / step);
    for (let col = x0; col <= x1; col++) {
      const x = col * step,
        cell = clip(clip(band, 0, x, true), 0, x + step, false);
      if (cell.length < 3) continue;
      // 10 m central city, 40 m outer region. Both grids share the same diagonal.
      if (step > 0.5 && x >= -64 && x + step <= 64.000001 && z >= -64 && z + step <= 64.000001) {
        for (let i = 1; i + 1 < cell.length; i++)
          gridTriangles(cell[0], cell[i], cell[i + 1], step / 4, emit);
        continue;
      }
      for (const lower of [true, false]) {
        const poly = diagonal(cell, x, z, step, lower);
        for (let i = 1; i + 1 < poly.length; i++) {
          const p = poly[0],
            q = poly[i],
            r = poly[i + 1];
          if (Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) > EPS)
            emit(p, q, r);
        }
      }
    }
  }
}
