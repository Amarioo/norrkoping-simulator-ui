/**
 * Step 5.1 probe: the breakline patch triangle under SWEREF points (PROBE_PTS="E,N;E,N"): its vertices
 * (SWEREF, RH2000 m) and the height there. Run with vitest.infra.config.ts; writes OUT (work/step51/patchtri.json).
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';

it('probes patch triangles', () => {
  const M = terrain.data.reference.metresPerUnit,
    O = terrain.data.reference.verticalOriginMetres;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = (terrain.surface as any).patches;
  const out: string[] = [];
  for (const s of (process.env.PROBE_PTS ?? '').split(';').filter(Boolean)) {
    const [E, N] = s.split(',').map(Number),
      [x, z] = terrain.fromSweref(E, N);
    for (let t = 0; t < P.count; t++) {
      if (x < P.box[t * 4] || z < P.box[t * 4 + 1] || x > P.box[t * 4 + 2] || z > P.box[t * 4 + 3]) continue;
      const v = [0, 1, 2].map((k) => P.tris[t * 3 + k]);
      const pts = v.map((i: number) => P.point(i));
      const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const s1 = cross(pts[0], pts[1], [x, z]),
        s2 = cross(pts[1], pts[2], [x, z]),
        s3 = cross(pts[2], pts[0], [x, z]);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))
        out.push(
          JSON.stringify({
            E,
            N,
            height: +(terrain.surfaceHeight(x, z) * M + O).toFixed(3),
            triangle: v.map((i: number, k: number) => ({ at: terrain.toSweref(...(pts[k] as [number, number])).map((q) => +q.toFixed(2)), h: +(P.vy[i] * M + O).toFixed(3) })),
          }),
        );
    }
  }
  writeFileSync(process.env.OUT ?? 'work/step51/patchtri.json', '[' + out.join(',\n') + ']');
});
