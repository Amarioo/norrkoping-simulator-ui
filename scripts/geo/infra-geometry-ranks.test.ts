/**
 * Step 5.1 optimisation: network/markings triangles by layer rank (uv.x: kerb 10, asphalt 11, path 12, ballast 13,
 * rail 14, marking 15) and by whether they lie on a breakline patch (centroid), with their area.
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-geometry-ranks.test.ts
 * Env:  OUT=<file.json> (default work/step51opt/ranks.json)
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LAYER_BUILDERS } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';

it('counts network triangles by rank and patch', () => {
  const M = terrain.data.reference.metresPerUnit;
  const out: Record<string, Record<string, { triangles: number; areaM2: number }>> = {};
  for (const name of ['buildNetwork', 'buildMarkings', 'buildTerrain'] as const) {
    const layers = (LAYER_BUILDERS as Record<string, () => Record<string, { getAttribute(n: string): { array: ArrayLike<number>; count: number } }[]>>)[name]();
    for (const [layer, geometries] of Object.entries(layers)) {
      const acc: Record<string, { triangles: number; areaM2: number }> = {};
      for (const g of geometries) {
        const p = g.getAttribute('position').array,
          uv = g.getAttribute('uv')?.array,
          n = g.getAttribute('position').count;
        for (let t = 0; t + 2 < n; t += 3) {
          const i = t * 3;
          const cx = (p[i] + p[i + 3] + p[i + 6]) / 3,
            cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
          const area = Math.abs((p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]) - (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i])) / 2 * M * M;
          const rank = uv ? Math.round(uv[t * 2]) : -1;
          const key = `${rank}|${terrain.surface?.patchedAt(cx, cz) ? 'patch' : 'rtin'}`;
          const a = (acc[key] ??= { triangles: 0, areaM2: 0 });
          a.triangles++;
          a.areaM2 += area;
        }
      }
      out[layer] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { triangles: v.triangles, areaM2: Math.round(v.areaM2) }]));
    }
  }
  const file = process.env.OUT ?? 'work/step51opt/ranks.json';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ revision: terrain.data.revision, layers: out }, null, 1));
});
