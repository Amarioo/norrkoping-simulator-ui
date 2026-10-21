/** Batch B probe: draped network segments whose end offsets put them below the rendered terrain. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { networkPieces } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';
it('lists negative draped offsets', () => {
  const M = terrain.data.reference.metresPerUnit;
  const rows: Record<string, unknown>[] = [];
  let n = 0;
  for (const whole of cityMap.roads)
    for (const r of networkPieces(whole)) {
      if (r.linearProfile || r.kind === 'stream' || r.tunnel) continue;
      n++;
      const oa = (r.yA + 0.006 - terrain.groundHeight(...r.a)) * M,
        ob = (r.yB + 0.006 - terrain.groundHeight(...r.b)) * M;
      const lo = Math.min(oa, ob), hi = Math.max(oa, ob);
      if (lo < -0.05 || hi > 0.05)
        rows.push({ kind: r.kind, way: r.way, name: r.name, oa: +oa.toFixed(2), ob: +ob.toFixed(2), bridge: !!r.bridge, EN: terrain.toSweref(...r.a).map(Math.round) });
    }
  writeFileSync('work/batchB/offsets.json', JSON.stringify({ draped: n, rows }, null, 1));
});
