/** Step 5 probe: the rendered mesh triangle (vertices, leg length, node heights) under SWEREF points (PROBE_PTS="E,N;E,N"). */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';
export function meshTriangle(x: number, z: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = terrain.surface as any;
  const gx = (x - m.x) / m.step, gz = (z - m.z) / m.step, R = m.root;
  const ri = Math.min(Math.max(Math.floor(gx / R), 0), m.rootsX - 1), rj = Math.min(Math.max(Math.floor(gz / R), 0), m.rootsZ - 1);
  const i0 = ri * R, j0 = rj * R, u = gx - i0, v = gz - j0;
  let rx, rz, ax, az, bx, bz;
  if ((ri + rj) % 2 === 0) {
    if (u >= v) [rx, rz, ax, az, bx, bz] = [i0 + R, j0, i0, j0, i0 + R, j0 + R];
    else [rx, rz, ax, az, bx, bz] = [i0, j0 + R, i0 + R, j0 + R, i0, j0];
  } else if (u + v <= R) [rx, rz, ax, az, bx, bz] = [i0, j0, i0 + R, j0, i0, j0 + R];
  else [rx, rz, ax, az, bx, bz] = [i0 + R, j0 + R, i0, j0 + R, i0 + R, j0];
  for (;;) {
    const sx = ax + bx, sz = az + bz;
    if (sx & 1 || sz & 1) break;
    const mx = sx >> 1, mz = sz >> 1;
    if (!m.active(mx, mz)) break;
    const side = (mx - rx) * (gz - rz) - (mz - rz) * (gx - rx), sideA = (mx - rx) * (az - rz) - (mz - rz) * (ax - rx);
    if (side >= 0 === sideA >= 0) { bx = ax; bz = az; ax = rx; az = rz; } else { ax = bx; az = bz; bx = rx; bz = rz; }
    rx = mx; rz = mz;
  }
  const M = terrain.data.reference.metresPerUnit;
  const pt = (i: number, j: number) => ({ at: terrain.toSweref(m.x + i * m.step, m.z + j * m.step).map(Math.round), h: +(m.node(i, j) * M).toFixed(2) });
  return { legM: Math.hypot(ax - rx, az - rz) * m.step * M, R: pt(rx, rz), A: pt(ax, az), B: pt(bx, bz) };
}
it('reports mesh triangles', () => {
  const out = (process.env.PROBE_PTS ?? '').split(';').filter(Boolean).map((s) => {
    const [E, N] = s.split(',').map(Number), [x, z] = terrain.fromSweref(E, N);
    return { E, N, mesh: +(terrain.surfaceHeight(x, z) * terrain.data.reference.metresPerUnit).toFixed(2), tri: meshTriangle(x, z) };
  });
  writeFileSync('work/step5/tri.json', JSON.stringify(out, null, 1));
});
