/**
 * Step 5 probe: dumps every network segment around a SWEREF point (PROBE_E, PROBE_N, PROBE_R metres)
 * with its reference heights, ground, offsets, profile/span flags and incident nodes, plus the transit
 * route's rail-top profile through the point. Output: work/step5/probe-<PROBE_NAME>.json.
 * Run: $env:PROBE_E=…; $env:PROBE_N=…; npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step5-probe.test.ts
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cityMap, type Point } from '../../src/lib/mapModel';
import { surfaceAt } from '../../src/lib/cityMesh';
import { terrain, ROAD_SURFACE } from '../../src/lib/terrain';
import { RouteTrack, trackKindOf } from '../../src/lib/trackProfile';
import bridgeProfiles from '../../src/lib/data/bridge-profiles.json';

it('probes a site', () => {
  const M = terrain.data.reference.metresPerUnit;
  const scene = process.env.PROBE_X ? terrain.toSweref(Number(process.env.PROBE_X), Number(process.env.PROBE_Z)) : null;
  const E = scene ? scene[0] : Number(process.env.PROBE_E),
    N = scene ? scene[1] : Number(process.env.PROBE_N),
    R = Number(process.env.PROBE_R ?? 80) / M,
    name = process.env.PROBE_NAME ?? 'site';
  const [x, z] = terrain.fromSweref(E, N);
  const sw = (p: Point) => terrain.toSweref(p[0], p[1]).map((v) => Math.round(v * 10) / 10);
  const dtm = (p: Point) => terrain.sample(p[0], p[1])?.metresRH2000 ?? null;
  const near = (p: Point) => Math.hypot(p[0] - x, p[1] - z) < R;
  const segs = cityMap.roads
    .filter((r) => r.kind !== 'stream' && (near(r.a) || near(r.b) || near([(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2])))
    .map((r) => ({
      kind: r.kind,
      class: r.class,
      name: r.name,
      way: r.way,
      bridge: r.bridge,
      tunnel: r.tunnel,
      width: +(r.width * M).toFixed(2),
      linear: !!r.linearProfile,
      spans: r.spans?.map((s) => [s.t0, s.t1, +(s.y0 * M).toFixed(2), +(s.y1 * M).toFixed(2)]),
      a: sw(r.a),
      b: sw(r.b),
      aScene: r.a,
      bScene: r.b,
      lengthM: +(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M).toFixed(1),
      refA: +((r.yA + ROAD_SURFACE) * M).toFixed(2),
      refB: +((r.yB + ROAD_SURFACE) * M).toFixed(2),
      groundA: +(terrain.groundHeight(...r.a) * M).toFixed(2),
      groundB: +(terrain.groundHeight(...r.b) * M).toFixed(2),
      dtmA: dtm(r.a),
      dtmB: dtm(r.b),
      drawn: Array.from({ length: 5 }, (_, i) => {
        const t = i / 4,
          c: Point = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
        return +(surfaceAt(r, t, c, ROAD_SURFACE) * M).toFixed(2);
      }),
    }));
  // Transit route rail-top profiles through the site.
  const routes = cityMap.transitRoutes.map((route) => {
    const track = new RouteTrack(route.points, trackKindOf(route.kind));
    let best = 0,
      bd = Infinity;
    for (let d = 0; d < track.length; d += 2 / M) {
      const p = track.position(d),
        e = Math.hypot(p[0] - x, p[2] - z);
      if (e < bd) [bd, best] = [e, d];
    }
    if (bd > R) return { route: route.id, distance: bd * M };
    const rows = [];
    for (let d = Math.max(0, best - 400 / M); d <= Math.min(track.length, best + 400 / M); d += 5 / M) {
      const p = track.position(d);
      rows.push({
        s: +((d - best) * M).toFixed(0),
        E: sw([p[0], p[2]])[0],
        N: sw([p[0], p[2]])[1],
        rail: +(p[1] * M).toFixed(2),
        ground: +(terrain.groundHeight(p[0], p[2]) * M).toFixed(2),
        dtm: dtm([p[0], p[2]]),
      });
    }
    return { route: route.id, distance: bd * M, rows };
  });
  const profilePoints = Object.entries(bridgeProfiles.points as Record<string, number>)
    .map(([k, v]) => {
      const [px, pz, py] = k.split(',').map(Number);
      return { p: [px, pz] as Point, legacy: py, ref: (v + ROAD_SURFACE) * M };
    })
    .filter((q) => near(q.p))
    .map((q) => ({ at: sw(q.p), scene: q.p, legacy: q.legacy, ref: +q.ref.toFixed(2), ground: +(terrain.groundHeight(...q.p) * M).toFixed(2) }));
  mkdirSync('work/step5', { recursive: true });
  writeFileSync(
    `work/step5/probe-${name}.json`,
    JSON.stringify({ E, N, scene: [x, z], groundHere: terrain.groundHeight(x, z) * M, segs, profilePoints, routes, pieces: segs.length }, null, 1),
  );
});
