/**
 * Step 5.1: the rail vehicle profile as ridden (RouteTrack rail tops) every 2 m, with the map segment under
 * it, for scripts/geo/rail_grade_evidence.py (native DTM / LiDAR comparison of every grade peak).
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step51-railprofile.test.ts
 * Env:  ROUTES=pendeln (comma list), OUT=<file.json> (default work/step51/rail-profile.json), STEP=<m> (2),
 *       NEAR=E,N,R (only samples within R m of SWEREF E,N)
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cityMap, type MapRoad } from '../../src/lib/mapModel';
import { terrain, spanHeight } from '../../src/lib/terrain';
import { RouteTrack, trackKindOf, RAIL_HEAD_METRES } from '../../src/lib/trackProfile';

it('dumps the rail vehicle profiles', () => {
  const M = terrain.data.reference.metresPerUnit,
    O = terrain.data.reference.verticalOriginMetres;
  const key = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const index = new Map<string, { r: MapRoad; reversed: boolean }>();
  for (const r of cityMap.roads) {
    if (r.kind !== 'rail' && r.kind !== 'tram') continue;
    index.set(key(r.a) + '|' + key(r.b), { r, reversed: false });
    if (!index.has(key(r.b) + '|' + key(r.a))) index.set(key(r.b) + '|' + key(r.a), { r, reversed: true });
  }
  const wanted = new Set((process.env.ROUTES ?? 'pendeln').split(','));
  const out: Record<string, unknown> = { revision: terrain.data.revision, routes: {} };
  for (const route of cityMap.transitRoutes) {
    if (!wanted.has(route.id)) continue;
    const kind = trackKindOf(route.kind),
      track = new RouteTrack(route.points, kind),
      rows: (number | string | null)[][] = [];
    const near = process.env.NEAR?.split(',').map(Number);
    for (let d = 0; d < track.length; d += Number(process.env.STEP ?? 2) / M) {
      const [i, t] = track.locate(d),
        p = track.position(d),
        [E, N] = terrain.toSweref(p[0], p[2]);
      if (near && Math.hypot(E - near[0], N - near[1]) > near[2]) continue;
      const hit = index.get(key([route.points[i][0], route.points[i][2]]) + '|' + key([route.points[i + 1][0], route.points[i + 1][2]]));
      const tr = hit ? (hit.reversed ? 1 - t : t) : 0;
      const segKind = !hit ? 'no-track' : spanHeight(hit.r.spans, tr) !== undefined ? 'span' : hit.r.linearProfile ? 'deck' : 'ground';
      rows.push([
        +(d * M).toFixed(2),
        +E.toFixed(2),
        +N.toFixed(2),
        // rail top and running surface (rail top - rail head), RH2000 m
        +(p[1] * M + O).toFixed(3),
        +(p[1] * M + O - RAIL_HEAD_METRES[kind]).toFixed(3),
        +(terrain.surfaceHeight(p[0], p[2]) * M + O).toFixed(3),
        segKind,
        hit?.r.way ?? null,
        hit?.r.bridge ? 1 : 0,
        terrain.surface.patchedAt(p[0], p[2]) ? 1 : 0,
      ]);
    }
    (out.routes as Record<string, unknown>)[route.id] = {
      columns: ['s', 'E', 'N', 'railTop', 'running', 'terrain', 'segment', 'way', 'bridge', 'patched'],
      rows,
    };
  }
  const file = process.env.OUT ?? 'work/step51/rail-profile.json';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out));
});
