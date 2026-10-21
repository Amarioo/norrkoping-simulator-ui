/**
 * Vehicle-to-track alignment for the whole map: src/lib/infraDiagnostics.ts railAlignment() on the
 * real data. Writes a JSON report (deviation statistics per route and the worst locations in SWEREF 99 TM).
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-rail.test.ts
 * Env:  RAIL_OUT=<file.json> (default work/batchA/rail-alignment.json)
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { railAlignment, railGrades } from '../../src/lib/infraDiagnostics';
import { terrain } from '../../src/lib/terrain';

it('measures vehicle-to-rail alignment', () => {
  const out = process.env.RAIL_OUT ?? 'work/batchA/rail-alignment.json';
  const report = railAlignment();
  const grades = railGrades();
  const geo = (x: number, z: number) => terrain.toSweref(x, z).map(Math.round);
  const result = {
    revision: terrain.data.revision,
    routes: report.routes,
    worst: report.worst.map((w) => ({ ...w, EN: geo(w.x, w.z) })),
    grades: grades.routes,
    steepTrack: grades.issues.sort((a, b) => b.value - a.value).map((i) => ({ ...i, EN: geo(i.x, i.z) })),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.table(report.routes);
  console.table(result.worst.slice(0, 15).map((w) => ({ route: w.route, dev: w.deviation.toFixed(2), kind: w.kind, EN: w.EN.join(' '), way: w.way })));
});
