/**
 * Step 5.1: re-measures every refinement candidate (scripts/data/geometry-refinement-targets.json) at its own
 * location with the diagnostics' own rules, for the before/after report (scripts/geo/refinement_report.py).
 *   cross-section   largest |crease| of the way's draped pieces within 5 m of the point (2 m sampling)
 *   steep-grade     largest |10 m grade| of the way's chain within 15 m of the point
 *   grade-break     largest change between consecutive 10 m windows within 15 m
 *   below-terrain   largest depth below the rendered terrain of the way's linear pieces within 15 m
 *   junction-fan    largest fan-strip mismatch of junction fans within 3 m
 *   rail-grade      largest ridden 20 m chord grade (1 m sampling) within 30 m (route pendeln)
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step51-measure.test.ts
 * Env:  OUT=<file.json> (default work/step51/measure.json), SITES=<file with {candidates: [{kind, E, N, way}]}>
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { cityMap, type MapRoad, type Point } from '../../src/lib/mapModel';
import { terrain } from '../../src/lib/terrain';
import { surfaceAt, networkPieces } from '../../src/lib/cityMesh';
import { belowTerrain, junctionFans, wayChains, chainProfile } from '../../src/lib/infraDiagnostics';
import { RouteTrack, trackKindOf } from '../../src/lib/trackProfile';

it('measures the refinement candidates', () => {
  const M = terrain.data.reference.metresPerUnit;
  const targets = JSON.parse(readFileSync(process.env.SITES ?? 'scripts/data/geometry-refinement-targets.json', 'utf8'));
  const byWay = new Map<number | undefined, MapRoad[]>();
  for (const r of cityMap.roads) {
    if (!byWay.has(r.way)) byWay.set(r.way, []);
    byWay.get(r.way)!.push(r);
  }
  const chains = new Map<number | undefined, MapRoad[][]>();
  for (const c of wayChains()) {
    if (!chains.has(c[0].way)) chains.set(c[0].way, []);
    chains.get(c[0].way)!.push(c);
  }
  const fans = junctionFans();
  const pendeln = cityMap.transitRoutes.find((r) => r.id === 'pendeln')!;
  const track = new RouteTrack(pendeln.points, trackKindOf(pendeln.kind));
  const ridden: [number, number, number][] = [];
  for (let d = 0; d < track.length; d += 1 / M) {
    const a = track.position(d - 10 / M),
      b = track.position(d + 10 / M),
      p = track.position(d);
    ridden.push([p[0], p[2], (Math.abs(b[1] - a[1]) / (20 / M)) * 100]); // along the track (infraDiagnostics.railGrades)
  }
  const out: { i: number; kind: string; value: number | null }[] = [];
  targets.candidates.forEach((c: { kind: string; E: number; N: number; way?: number }, i: number) => {
    const [x, z] = terrain.fromSweref(c.E, c.N),
      near = (p: Point, R: number) => Math.hypot(p[0] - x, p[1] - z) * M <= R;
    let value: number | null = null;
    if (c.kind === 'cross-section') {
      value = 0;
      for (const whole of byWay.get(c.way) ?? [])
        for (const r of networkPieces(whole)) {
          if (r.linearProfile || whole.kind !== 'road') continue;
          const dx = r.b[0] - r.a[0],
            dz = r.b[1] - r.a[1],
            len = Math.hypot(dx, dz);
          if (len < 1e-6) continue;
          const n = Math.max(1, Math.ceil((len * M) / 2)),
            half = r.width / 2;
          for (let k = 0; k <= n; k++) {
            const t = k / n,
              q: Point = [r.a[0] + dx * t, r.a[1] + dz * t];
            if (!near(q, 5)) continue;
            const side = (s: number): Point => [q[0] - (dz / len) * half * s, q[1] + (dx / len) * half * s];
            const crease = ((surfaceAt(r, t, side(1), 0) + surfaceAt(r, t, side(-1), 0)) / 2 - surfaceAt(r, t, q, 0)) * M;
            if (Math.abs(crease) > Math.abs(value)) value = crease;
          }
        }
    } else if (c.kind === 'steep-grade' || c.kind === 'grade-break') {
      value = 0;
      for (const chain of chains.get(c.way) ?? []) {
        const { s, h, x: X, z: Z } = chainProfile(chain);
        const g: number[] = [];
        for (let i = 0, j = 0; i < s.length; i++) {
          while (j < s.length && s[j] - s[i] < 10) j++;
          if (j >= s.length) break;
          g[i] = ((h[j] - h[i]) / (s[j] - s[i])) * 100;
        }
        for (let i = 0, k = 0; i < g.length; i++) {
          if (!near([X[i], Z[i]], 15)) continue;
          if (c.kind === 'steep-grade') value = Math.max(value, Math.abs(g[i]));
          else {
            while (k < g.length && s[k] - s[i] < 10) k++;
            if (k < g.length) value = Math.max(value, Math.abs(g[k] - g[i]));
          }
        }
      }
    } else if (c.kind === 'below-terrain') {
      value = 0;
      for (const b of belowTerrain(byWay.get(c.way) ?? [])) if (near([b.x, b.z], 15)) value = Math.max(value, b.value);
    } else if (c.kind === 'junction-fan') {
      value = 0;
      for (const f of fans) if (near([f.x, f.z], 3)) value = Math.max(value, f.value);
    } else if (c.kind === 'rail-grade') {
      value = 0;
      for (const [px, pz, g] of ridden) if (near([px, pz], 30)) value = Math.max(value, g);
    }
    out.push({ i, kind: c.kind, value: value === null ? null : +value.toFixed(3) });
  });
  writeFileSync(process.env.OUT ?? 'work/step51/measure.json', JSON.stringify({ revision: terrain.data.revision, values: out }));
});
