/** Step 5: continuity of the road breakline patches: every patch triangle edge midpoint from both sides. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { terrain } from '../../src/lib/terrain';
it('checks patch continuity', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = terrain.surface as any, P = m.patches;
  const M = terrain.data.reference.metresPerUnit;
  const rows: string[] = [];
  let worst = 0, n = 0;
  for (let t = 0; t < P.count; t++)
    for (let e = 0; e < 3; e++) {
      const a = P.point(P.tris[t * 3 + e]), b = P.point(P.tris[t * 3 + ((e + 1) % 3)]);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      const nx = (-dz / L) * 1e-7, nz = (dx / L) * 1e-7;
      const step = Math.abs(m.height(mx + nx, mz + nz) - m.height(mx - nx, mz - nz)) * M;
      n++;
      if (step > worst) worst = step;
      if (step > 1e-3 && rows.length < 40) rows.push(`${terrain.toSweref(mx, mz).map((v: number) => v.toFixed(2))} step ${step.toFixed(4)} tri ${t} edge ${e}`);
    }
  writeFileSync('work/step5/patch-continuity.txt', [`edges ${n} worst ${worst}`, ...rows].join('\n'));
});
