/** Step 5: worst vehicle grades per route with location (RouteTrack, 20 m chord, every 5 m). */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { terrain } from '../../src/lib/terrain';
import { RouteTrack, trackKindOf } from '../../src/lib/trackProfile';
it('locates worst rail grades', () => {
  const M = terrain.data.reference.metresPerUnit, out: string[] = [];
  for (const route of cityMap.transitRoutes) {
    const track = new RouteTrack(route.points, trackKindOf(route.kind)), w = 20 / M, rows: [number, number, number][] = [];
    for (let d = 0; d < track.length; d += 5 / M) {
      const a = track.position(d - w / 2), b = track.position(d + w / 2), p = track.position(d);
      rows.push([(Math.abs(b[1] - a[1]) / Math.hypot(b[0] - a[0], b[2] - a[2])) * 100, p[0], p[2]]);
    }
    rows.sort((p, q) => q[0] - p[0]);
    out.push(route.id + ' ' + rows.slice(0, 6).map(([g, x, z]) => `${g.toFixed(2)}@${terrain.toSweref(x, z).map(Math.round)}`).join('  '));
  }
  writeFileSync(process.env.OUT ?? 'work/step5/rail-grades.txt', out.join('\n'));
});
