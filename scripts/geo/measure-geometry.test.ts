/**
 * Static city geometry size and build time per layer (Step 3 before/after comparison).
 *
 * Builds the real worker layers (cityMesh.ts) in Node: triangles, vertex-buffer bytes (what the GPU
 * receives) and the time of each builder (median of RUNS, after one warm-up).
 * Run:  npx vitest run -c scripts/geo/vitest.geometry.config.ts
 * Env:  GEOMETRY_OUT=<file.json> (default work/terrain-step3/geometry.json), RUNS (default 3)
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as cityMesh from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';

it('measures the static city geometry', () => {
  const runs = Number(process.env.RUNS ?? 3);
  const builders = cityMesh.LAYER_BUILDERS as Record<string, () => cityMesh.CityLayers>;
  const times: Record<string, number[]> = {};
  let layers: cityMesh.CityLayers = {};
  for (let run = 0; run <= runs; run++)
    for (const [name, build] of Object.entries(builders)) {
      const started = performance.now();
      const result = build();
      const ms = performance.now() - started;
      if (run > 0) (times[name] ??= []).push(ms);
      if (run === runs) Object.assign(layers, result);
    }
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const perLayer: Record<string, { geometries: number; triangles: number; bytes: number }> = {};
  for (const [name, geometries] of Object.entries(layers)) {
    let triangles = 0,
      bytes = 0;
    for (const g of geometries ?? []) {
      triangles += g.getAttribute('position').count / 3;
      for (const attribute of Object.values(g.attributes)) bytes += attribute.array.byteLength;
    }
    perLayer[name] = { geometries: geometries?.length ?? 0, triangles, bytes };
  }
  const total = Object.values(perLayer).reduce(
    (s, l) => ({
      geometries: s.geometries + l.geometries,
      triangles: s.triangles + l.triangles,
      bytes: s.bytes + l.bytes,
    }),
    { geometries: 0, triangles: 0, bytes: 0 },
  );
  const report = {
    revision: terrain.data.revision,
    meshTriangles: (terrain.data as { mesh?: { triangles: number } }).mesh?.triangles ?? null,
    builderMs: Object.fromEntries(
      Object.entries(times).map(([k, v]) => [k, Math.round(median(v))]),
    ),
    layers: perLayer,
    total,
  };
  const out = process.env.GEOMETRY_OUT ?? 'work/terrain-step3/geometry.json';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report));
});
