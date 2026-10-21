/**
 * Infrastructure diagnostics for the whole map (Step 3.5): src/lib/infraDiagnostics.ts on the real data.
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-diagnose.test.ts
 * Env:  INFRA_OUT=<file.json> (default work/step35/diagnose.json)
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { diagnoseInfrastructure, drawnWater, type InfraIssue } from '../../src/lib/infraDiagnostics';
import { terrain } from '../../src/lib/terrain';

const q = (v: number[], f: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))] : NaN;
};
it('diagnoses the infrastructure', () => {
  const started = performance.now();
  const { issues, grades, shoreGaps, railRoutes, railGrades } = diagnoseInfrastructure();
  const byKind: Record<string, InfraIssue[]> = {};
  for (const i of issues) (byKind[i.kind] ??= []).push(i);
  const geo = (i: InfraIssue) => {
    const [e, n] = terrain.toSweref(i.x, i.z);
    return { ...i, value: +i.value.toFixed(3), x: +i.x.toFixed(3), z: +i.z.toFixed(3), E: Math.round(e), N: Math.round(n) };
  };
  const report = {
    revision: terrain.data.revision,
    seconds: (performance.now() - started) / 1000,
    counts: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
    bySeverity: Object.fromEntries(
      Object.entries(byKind).map(([k, v]) => [
        k,
        {
          error: v.filter((i) => i.severity === 'error' && !i.exception).length,
          warning: v.filter((i) => i.severity === 'warning' && !i.exception).length,
          exception: v.filter((i) => i.exception).length,
        },
      ]),
    ),
    /** Every issue, machine-readable: SWEREF 99 TM E/N, kind, value (m or %), severity, exception. */
    issues: issues.map(geo),
    worst: Object.fromEntries(
      // Smaller is worse for clearances.
      Object.entries(byKind).map(([k, v]) => [
        k,
        [...v].sort((a, b) => (k === 'deck-near-water' ? a.value - b.value : b.value - a.value)).slice(0, 15).map(geo),
      ]),
    ),
    railAlignment: railRoutes,
    railGrades,
    grades: Object.fromEntries(
      Object.entries(grades).map(([k, v]) => [k, { n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), p99: q(v, 0.99), max: q(v, 1) }]),
    ),
    shoreline: {
      n: shoreGaps.length,
      landMinusWater: { p01: q(shoreGaps, 0.01), p05: q(shoreGaps, 0.05), p50: q(shoreGaps, 0.5), p95: q(shoreGaps, 0.95) },
    },
  };
  // Drawn water vs the measured reach level (water-reaches.json of the Step 3.5 app), every 10 m.
  const reaches = JSON.parse(readFileSync(process.env.REACHES ?? 'src/lib/data/water-reaches.json', 'utf8'));
  // River and lake reaches against their measured level; the sea (drawn at the 2021-2025 mean by
  // decision) against its scan-day level, reported separately.
  type Reach = { id: string; levelMetres: number; scanDayMetres?: number };
  const reachOf = new Map<string, Reach>(reaches.reaches.map((r: Reach) => [r.id, r]));
  const dev: number[] = [],
    sea: number[] = [];
  const M = terrain.data.reference.metresPerUnit, step = 10 / M;
  for (const s of reaches.surfaces as { reach: string; rings: number[][][] }[]) {
    const ring = s.rings[0], xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
        let inside = false;
        for (const r of s.rings)
          for (let i = 0, j = r.length - 1; i < r.length; j = i++)
            if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
        if (!inside) continue;
        const y = drawnWater(x, z);
        if (y === null) continue;
        const r = reachOf.get(s.reach)!,
          drawnMetres = y * M + terrain.data.reference.verticalOriginMetres;
        if (r.scanDayMetres !== undefined) sea.push(drawnMetres - r.scanDayMetres);
        else dev.push(drawnMetres - r.levelMetres);
      }
  }
  const abs = dev.map(Math.abs);
  (report as Record<string, unknown>).waterVsMeasuredLevel = {
    n: dev.length,
    mean: dev.reduce((a, b) => a + b, 0) / dev.length,
    rmse: Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length),
    p95: q(abs, 0.95),
    max: q(abs, 1),
    over025: abs.filter((v) => v > 0.25).length / abs.length,
  };
  (report as Record<string, unknown>).seaVsScanDay = {
    n: sea.length,
    mean: sea.reduce((a, b) => a + b, 0) / sea.length,
    rmse: Math.sqrt(sea.reduce((a, b) => a + b * b, 0) / sea.length),
  };
  writeFileSync(process.env.INFRA_OUT ?? 'work/step35/diagnose.json', JSON.stringify(report, null, 1));
});
