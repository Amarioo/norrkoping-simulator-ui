/** Probe: drawn reference profile of the map segments of a way (PROBE_WAY) every 2 m, to a file. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { surfaceAt, networkPieces } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';
it('probes a way', () => {
  const M = terrain.data.reference.metresPerUnit, out: string[] = [];
  for (const whole of cityMap.roads.filter((r) => r.way === Number(process.env.PROBE_WAY)))
    for (const r of networkPieces(whole)) {
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M, n = Math.max(1, Math.ceil(L / 2));
      out.push(`piece ${L.toFixed(1)} m linear ${!!r.linearProfile} yA ${(r.yA * M).toFixed(2)} yB ${(r.yB * M).toFixed(2)}`);
      for (let k = 0; k <= n; k++) {
        const t = k / n, p: [number, number] = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
        out.push(`  ${(t * L).toFixed(1)} ground ${(terrain.groundHeight(...p) * M).toFixed(2)} drawn ${(surfaceAt(r, t, p, 0) * M).toFixed(2)}`);
      }
    }
  writeFileSync('work/batchC/probe-seg.log', out.join('\n'));
});
