/** Probe: a transit route's track profile near a SWEREF point (PROBE_ROUTE, PROBE_E, PROBE_N, PROBE_R m). */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cityMap } from '../../src/lib/mapModel';
import { terrain } from '../../src/lib/terrain';
import { RouteTrack, trackKindOf } from '../../src/lib/trackProfile';
it('probes a route', () => {
  const M = terrain.data.reference.metresPerUnit;
  const route = cityMap.transitRoutes.find((r) => r.id === (process.env.PROBE_ROUTE ?? 'pendeln'))!;
  const [x0, z0] = terrain.fromSweref(Number(process.env.PROBE_E), Number(process.env.PROBE_N));
  const R = Number(process.env.PROBE_R ?? 80) / M;
  const track = new RouteTrack(route.points, trackKindOf(route.kind));
  const lines: string[] = [];
  for (let i = 0; i + 1 < route.points.length; i++) {
    const a = route.points[i], b = route.points[i + 1];
    if (Math.hypot(a[0] - x0, a[2] - z0) > R) continue;
    const span = terrain.spans([a[0], a[2]], [b[0], b[2]]);
    const way = cityMap.roads.find((r) => (r.kind === 'rail') && ((r.a[0] === a[0] && r.a[1] === a[2] && r.b[0] === b[0] && r.b[1] === b[2]) || (r.b[0] === a[0] && r.b[1] === a[2] && r.a[0] === b[0] && r.a[1] === b[2])))?.way;
    const [E, N] = terrain.toSweref(a[0], a[2]).map(Math.round);
    lines.push(`${(track.cumulative[i] * M).toFixed(0).padStart(6)} ${E} ${N} way ${way} y ${a[1].toFixed(3)} key ${terrain.bridgeHeight(a[0], a[2], a[1]) !== undefined ? 'P' : '-'} ground ${(terrain.groundHeight(a[0], a[2]) * M).toFixed(2)} rail ${(track.position(track.cumulative[i])[1] * M).toFixed(2)} span ${span ? JSON.stringify(span.map((s) => [s.t0.toFixed(2), s.t1.toFixed(2)])) : '-'}`);
  }
  writeFileSync(process.env.PROBE_OUT ?? 'work/batchC/probe.log', lines.join('\n'));
});
