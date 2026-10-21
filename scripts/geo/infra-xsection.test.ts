/**
 * Cross-section study (Batch B): how the drawn network surface varies across its width today.
 * For every ground-level (draped) road/path/rail/tram segment, every 2 m: the drawn height at the centre
 * and both edges, the cross slope (left − right) / width and the crease (edge mean − centre).
 * Run:  npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-xsection.test.ts
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cityMap, type Point } from '../../src/lib/mapModel';
import { networkPieces, surfaceAt } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';

it('measures network cross-sections', () => {
  const M = terrain.data.reference.metresPerUnit;
  const q = (v: number[], f: number) => {
    const s = [...v].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))];
  };
  const by: Record<string, { slope: number[]; crease: number[]; width: number[] }> = {};
  // Candidate rule R1: a plane through the centreline profile with the least-squares cross slope of the
  // drawn terrain across the width (9 samples). poke = terrain above that plane, float = plane above it.
  const poke: number[] = [],
    float: number[] = [];
  const worst: { kind: string; crease: number; x: number; z: number; way?: number; name?: string; width: number }[] = [];
  for (const whole of cityMap.roads) {
    if (!['road', 'path', 'rail', 'tram'].includes(whole.kind) || whole.tunnel) continue;
    for (const r of networkPieces(whole)) {
      if (r.linearProfile) continue;
      const dx = r.b[0] - r.a[0],
        dz = r.b[1] - r.a[1],
        len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const half = r.kind === 'rail' || r.kind === 'tram' ? 0.75 / M : Math.max(r.width, 0.06) / 2;
      const n = Math.max(1, Math.ceil((len * M) / 2));
      const k = (by[r.kind === 'road' ? `road ${r.width >= 0.3 ? 'wide' : 'narrow'}` : r.kind] ??= { slope: [], crease: [], width: [] });
      for (let i = 0; i <= n; i++) {
        const t = i / n,
          c: Point = [r.a[0] + dx * t, r.a[1] + dz * t],
          L: Point = [c[0] - (dz / len) * half, c[1] + (dx / len) * half],
          R: Point = [c[0] + (dz / len) * half, c[1] - (dx / len) * half];
        const hc = surfaceAt(r, t, c, 0),
          hl = surfaceAt(r, t, L, 0),
          hr = surfaceAt(r, t, R, 0);
        k.slope.push((Math.abs(hl - hr) / (2 * half)) * 100);
        if (r.kind === 'road') {
          const ls: number[] = [],
            hs: number[] = [];
          for (let j = -4; j <= 4; j++) {
            const l = (j / 4) * half;
            ls.push(l);
            hs.push(surfaceAt(r, t, [c[0] - (dz / len) * l, c[1] + (dx / len) * l], 0));
          }
          const sl = ls.reduce((a, l, j) => a + l * (hs[j] - hc), 0) / ls.reduce((a, l) => a + l * l, 0);
          let up = 0,
            down = 0;
          for (let j = 0; j < ls.length; j++) {
            const d = hs[j] - (hc + sl * ls[j]);
            up = Math.max(up, d);
            down = Math.max(down, -d);
          }
          poke.push(up * M);
          float.push(down * M);
        }
        const crease = ((hl + hr) / 2 - hc) * M;
        k.crease.push(crease);
        if (Math.abs(crease) > 0.25 && r.kind === 'road') worst.push({ kind: r.kind, crease, x: c[0], z: c[1], way: r.way, name: r.name, width: r.width * M });
        k.width.push(2 * half * M);
      }
    }
  }
  const rows = Object.entries(by).map(([kind, v]) => {
    const ac = v.crease.map(Math.abs);
    return {
      kind,
      n: v.slope.length,
      slopeP50: +q(v.slope, 0.5).toFixed(2),
      slopeP95: +q(v.slope, 0.95).toFixed(2),
      slopeOver4: +(v.slope.filter((s) => s > 4).length / v.slope.length).toFixed(3),
      slopeOver8: +(v.slope.filter((s) => s > 8).length / v.slope.length).toFixed(3),
      creaseP95: +q(ac, 0.95).toFixed(3),
      creaseP99: +q(ac, 0.99).toFixed(3),
      creaseMax: +q(ac, 1).toFixed(3),
      creaseOver5cm: +(ac.filter((s) => s > 0.05).length / ac.length).toFixed(3),
    };
  });
  mkdirSync('work/batchB', { recursive: true });
  const share = (v: number[], x: number) => +(v.filter((d) => d > x).length / v.length).toFixed(4);
  rows.push({ kind: 'R1 road plane', n: poke.length, pokeP95: +q(poke, 0.95).toFixed(3), pokeP99: +q(poke, 0.99).toFixed(3), pokeOver5cm: share(poke, 0.05), pokeOver15cm: share(poke, 0.15), floatP95: +q(float, 0.95).toFixed(3), floatOver15cm: share(float, 0.15) } as never);
  const clusters: typeof worst = [];
  for (const w of worst.sort((a, b) => Math.abs(b.crease) - Math.abs(a.crease)))
    if (!clusters.some((c) => Math.hypot(c.x - w.x, c.z - w.z) * M < 60) && clusters.length < 40) clusters.push(w);
  const out = process.env.XSECTION_OUT ?? 'work/batchB/xsection-before.json';
  writeFileSync(out, JSON.stringify({ rows, worst: clusters.map((c) => ({ ...c, EN: terrain.toSweref(c.x, c.z).map(Math.round) })) }, null, 1));
});
