/**
 * Step 5.1 probe: steep thin patch triangles (folds) in a SWEREF box, with slope, width and their vertices.
 * Env: BOX=E0,N0,E1,N1; OUT (default work/step51opt/facets.json)
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';
it('lists steep thin facets', () => {
  const M = terrain.data.reference.metresPerUnit, O = terrain.data.reference.verticalOriginMetres;
  const [e0, n0, e1, n1] = (process.env.BOX ?? '568540,6493230,568600,6493280').split(',').map(Number);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = (terrain.surface as any).patches;
  const out: unknown[] = [];
  for (let t = 0; t < P.count; t++) {
    const v = [0, 1, 2].map((k) => P.tris[t * 3 + k]);
    const pts = v.map((i: number) => { const p = P.point(i); const sw = terrain.toSweref(p[0], p[1]); return [sw[0], sw[1], P.vy[i] * M + O]; });
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    if (cx < e0 || cx > e1 || cy < n0 || cy > n1) continue;
    const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
    const vx = pts[2][0] - pts[0][0], vy = pts[2][1] - pts[0][1], vz = pts[2][2] - pts[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const slope = Math.hypot(nx, ny) / Math.abs(nz || 1e-12);
    const area = Math.abs(nz) / 2, longest = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy), Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]));
    if (slope > 0.6) out.push({ t, slope: +slope.toFixed(2), width: +(2 * area / longest).toFixed(3), cls: P.classes?.[t] ?? null, pts: pts.map((p) => p.map((q) => +q.toFixed(2))) });
  }
  writeFileSync(process.env.OUT ?? 'work/step51opt/facets.json', JSON.stringify(out, null, 1));
});
