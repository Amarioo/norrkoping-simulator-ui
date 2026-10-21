/** Probe: every network segment ending at the node nearest a SWEREF point (PROBE_E, PROBE_N), to a file. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { surfaceAt } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';
it('probes a node', () => {
  const M = terrain.data.reference.metresPerUnit;
  const [x, z] = terrain.fromSweref(Number(process.env.PROBE_E), Number(process.env.PROBE_N));
  let best = cityMap.roads[0].a, d = Infinity;
  for (const r of cityMap.roads) for (const p of [r.a, r.b]) { const e = Math.hypot(p[0] - x, p[1] - z); if (e < d) [d, best] = [e, p]; }
  const out = [`node ${best} ground ${(terrain.groundHeight(best[0], best[1]) * M).toFixed(2)}`];
  for (const r of cityMap.roads)
    for (const [p, t, y] of [[r.a, 0, r.yA], [r.b, 1, r.yB]] as const)
      if (p[0] === best[0] && p[1] === best[1])
        out.push(`${r.kind} ${r.class} way ${r.way} bridge ${!!r.bridge} linear ${!!r.linearProfile} spans ${JSON.stringify(r.spans?.map((s) => [+s.t0.toFixed(2), +s.t1.toFixed(2)]))} end ${t} ref ${(y * M).toFixed(2)} drawn ${(surfaceAt(r, t, p, 0) * M).toFixed(2)}`);
  writeFileSync('work/batchC/probe-node.log', out.join('\n'));
});
