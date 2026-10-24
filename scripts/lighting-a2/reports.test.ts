// Lighting Phase A2: machine-readable evidence for docs/lighting-phase-a2/data/.
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a2/vitest.config.ts reports
//
// Writes (small, deterministic; no raw OSM data beyond IDs and derived positions):
//   manifest.json  pinned inputs (SHA-256 / git blob), generator/policy, output hashes, counts
//   registry.json  one compact line per A2 fixture (identity, zone, group, evidence, type, E/N, rule)
//   coverage.json  zones, per-way evidence status, rendered ways without a lit tag, every rejection
//   capacity.json  occupancy of the A1 state / A2 alone / combined, the busiest cells A2 reaches with
//                  their contributors, cells that gain lamps, density-headroom variants
//   seams.json     road-surface illuminance profiles before/after along Kungsgatan and both Norra
//                  Promenaden carriageways, seam minima, area statistics per zone, seam spacing
// Phase A1 evidence (docs/lighting-phase-a1/data) is not touched.
import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import {
  a1RuntimeLightingRegistry,
  a2LightingRegistry,
  // Phase A3: the controller default includes A3; this harness describes the A2 state (pilot + A1 + A2).
  a2RuntimeLightingRegistry as runtimeLightingRegistry,
  createCityLighting,
} from '../../src/lib/lighting/controller';
import { A2_SPEC, generateCorridor } from '../../src/lib/lighting/corridorGenerator';
import { A1_ZONES, inRing } from '../../src/lib/lighting/corridorA1';
import { A2_ZONES } from '../../src/lib/lighting/corridorA2';
import {
  A2_IDENTITY,
  corridorRegistry,
  mergeRegistries,
} from '../../src/lib/lighting/corridorRegistry';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';
import { lookupLamps } from '../../src/lib/lighting/lightIndex';
import { lampLux } from '../../src/lib/lighting/reference';
import type { LightingRegistry } from '../../src/lib/lighting/registry';
import { PILOTS } from '../step6/pilots.mjs';
import { A2_INPUT_FILES, A2_OUTPUT_FILES, generateA2, loadA2Inputs, toA2Files } from './inputs';

const OUT = 'docs/lighting-phase-a2/data';
const M = terrain.data.reference.metresPerUnit;
const ref = terrain.data.reference;
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8')) as {
  roads: { way: number; a: number[]; b: number[]; kind: string }[];
};
const file = (path: string) => {
  const bytes = fs.readFileSync(path);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  };
};
const sha = (a: Float32Array) =>
  createHash('sha256')
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex');
const write = (name: string, data: unknown) =>
  fs.writeFileSync(`${OUT}/${name}`, JSON.stringify(data, null, 1) + '\n');
const r1 = (v: number) => Math.round(v * 10) / 10;
const prepare = (r: LightingRegistry) =>
  prepareStreetLighting(r, terrain, { maxTextureSize: 2048 });
type Prepared = Extract<ReturnType<typeof prepare>, { ok: true }>;
const statsOf = (r: LightingRegistry) => {
  const p = prepare(r);
  const s = p.ok ? p.index.stats : p.stats;
  return {
    ok: p.ok,
    fixtures: r.fixtures.length,
    maxRawOccupancy: s?.maxRawOccupancy,
    overflowCells: s?.overflowCells,
    nonEmptyCells: s?.nonEmptyCells,
    cellEntries: s?.cellEntries,
    histogram: s?.histogram,
    pages: s?.pages,
    bytes: p.ok
      ? {
          lamp: p.lampPack.data.byteLength,
          payload: s!.payload.bytes,
          directory: s!.directory.bytes,
        }
      : null,
    conflicts: p.ok ? [] : p.conflicts.map((c) => ({ cell: c.cell, raw: c.raw })),
  };
};
const luxAt = (p: Prepared, x: number, z: number) => {
  const y = terrain.groundHeight(x, z);
  let s = 0;
  for (const i of lookupLamps(p.index, x, z)) s += lampLux(p.lamps[i], [x, y, z], [0, 1, 0], M);
  return s;
};

test('write the A2 evidence data', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const input = loadA2Inputs();
  const out = generateA2(input);
  const files = toA2Files(out, input);
  expect(fs.readFileSync(A2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  const before = a1RuntimeLightingRegistry(terrain),
    a2 = a2LightingRegistry(terrain),
    runtime = runtimeLightingRegistry(terrain);
  const prov = new Map(out.provenance.map((p) => [p.id, p]));
  const pA = prepare(before),
    pB = prepare(runtime);
  expect(pA.ok && pB.ok).toBe(true);
  if (!pA.ok || !pB.ok) return;
  const rolloutById = new Map(pB.records.map((r) => [r.id, r.generator.version]));
  const rolloutOf = (id: string) => rolloutById.get(id)!;

  // registry.json
  write(
    'registry.json',
    a2.fixtures.map((r) => {
      const p = prov.get(r.id)!;
      return [
        r.id,
        (r as typeof r & { zone: string }).zone,
        r.group,
        r.placement,
        r.photometry.fixtureType,
        r.support.kind,
        Number(r.position.e.toFixed(2)),
        Number(r.position.n.toFixed(2)),
        r.orientation.gridAzimuthDeg === null
          ? null
          : Number(r.orientation.gridAzimuthDeg.toFixed(1)),
        p.source.element,
        p.rule,
        `${p.station!.side}${p.station!.sideFallback ? '*' : ''} ${p.station!.offsetM} m, shift ${p.station!.shiftM} m, spacing ${p.station!.spacingM} m`,
      ];
    }),
  );

  // coverage.json
  const reasons: Record<string, number> = {};
  for (const r of out.rejected) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const area = (ring: number[][]) =>
    Math.abs(
      ring.reduce(
        (s, p, i) =>
          s + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1],
        0,
      ) / 2,
    );
  write('coverage.json', {
    zones: Object.fromEntries(
      Object.entries(A2_ZONES).map(([k, z]) => [
        k,
        {
          name: z.name,
          ringEN: z.ring,
          areaM2: Math.round(area(z.ring)),
          fixtures: out.counts[`zone${k}`],
        },
      ]),
    ),
    counts: out.counts,
    rejectedByReason: reasons,
    rejected: out.rejected,
    ways: out.ways,
    unknownWays: out.unknownWays,
  });

  // capacity.json
  const a2Ids = new Set(a2.fixtures.map((r) => r.id));
  const recordOf = new Map(pB.records.map((r) => [r.id, r]));
  const cellsTouched: {
    cell: number[];
    centreEN: number[];
    count: number;
    before: number;
    byRollout: Record<string, number>;
    mapped: number;
    estimated: number;
    ids: string[];
  }[] = [];
  const near: typeof cellsTouched = [];
  const seen = new Set<string>();
  for (const l of pB.lamps)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const cx = Math.floor(l.x) + dx,
          cz = Math.floor(l.z) + dz;
        const key = `${cx},${cz}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = lookupLamps(pB.index, cx + 0.5, cz + 0.5).map((i) => pB.index.order[i]);
        if (!ids.length) continue;
        const was = lookupLamps(pA.index, cx + 0.5, cz + 0.5).length;
        const rs = ids.map((id) => recordOf.get(id)!);
        const [e, n] = terrain.toSweref(cx + 0.5, cz + 0.5);
        const entry = {
          cell: [cx, cz],
          centreEN: [r1(e), r1(n)],
          count: ids.length,
          before: was,
          byRollout: ids.reduce<Record<string, number>>(
            (a, id) => ((a[rolloutOf(id)] = (a[rolloutOf(id)] ?? 0) + 1), a),
            {},
          ),
          mapped: rs.filter((r) => r.placement === 'mapped').length,
          estimated: rs.filter((r) => r.placement === 'estimated').length,
          ids,
        };
        if (ids.length >= 13) near.push(entry);
        if (ids.some((id) => a2Ids.has(id))) cellsTouched.push(entry);
      }
  const byCount = (a: { count: number; cell: number[] }, b: { count: number; cell: number[] }) =>
    b.count - a.count || a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1];
  near.sort(byCount);
  cellsTouched.sort(byCount);
  const variants = [1, 0.85, 0.75, 0.6].map((f) => {
    const types = Object.fromEntries(
      Object.entries(input.types).map(([k, t]) => [k, { ...t, spacingM: t.spacingM * f }]),
    );
    const o = generateCorridor({ ...input, types }, A2_SPEC);
    const reg = corridorRegistry(JSON.parse(toA2Files(o, input).runtime), ref, A2_IDENTITY);
    const s = statsOf(mergeRegistries(before, reg));
    const p = prepare(mergeRegistries(before, reg));
    let a2Max = 0;
    if (p.ok)
      for (let cx = -32; cx <= -14; cx++)
        for (let cz = -30; cz <= -10; cz++) {
          const ids = lookupLamps(p.index, cx + 0.5, cz + 0.5).map((i) => p.index.order[i]);
          if (ids.some((id) => id.startsWith('estimate:lighting-a2')))
            a2Max = Math.max(a2Max, ids.length);
        }
    return {
      spacingFactor: f,
      a2Fixtures: o.counts.fixtures,
      ok: s.ok,
      maxRawOccupancy: s.maxRawOccupancy,
      maxInCellsA2Reaches: p.ok ? a2Max : null,
      overflowCells: s.overflowCells,
      conflictCount: s.conflicts.length,
      conflicts: s.conflicts.slice(0, 5),
    };
  });
  write('capacity.json', {
    capacity: pB.index.capacity,
    cellMetres: pB.index.stats.cellMetres,
    chunkCells: pB.index.chunkCells,
    a1State: { ...statsOf(before), conflicts: undefined },
    a2Only: { ...statsOf(a2), conflicts: undefined },
    combined: { ...statsOf(runtime), conflicts: undefined },
    nearCapacityCells: near,
    cellsReachedByA2: {
      count: cellsTouched.length,
      maxCount: cellsTouched[0]?.count ?? 0,
      histogram: cellsTouched.reduce<Record<number, number>>(
        (a, c) => ((a[c.count] = (a[c.count] ?? 0) + 1), a),
        {},
      ),
      gainedFromBefore: cellsTouched.filter((c) => c.before > 0).length,
      newCells: cellsTouched.filter((c) => c.before === 0).length,
      busiest: cellsTouched.slice(0, 12),
      /** Cells that held pilot/A1 lamps before and now also receive A2 lamps (the seams). */
      seamCells: cellsTouched
        .filter((c) => c.before > 0)
        .map(({ cell, centreEN, count, before, byRollout, mapped, estimated }) => ({
          cell,
          centreEN,
          count,
          before,
          byRollout,
          mapped,
          estimated,
        })),
    },
    densityHeadroom: variants,
  });

  // seams.json — illuminance on the road surface (horizontal, CPU reference of the shader).
  const line = (ways: number[]) => {
    const pts: number[][] = [];
    const tags: number[] = [];
    for (const w of ways)
      for (const r of map.roads.filter((r) => r.way === w)) {
        if (!pts.length) (pts.push(r.a), tags.push(w));
        pts.push(r.b);
        tags.push(w);
      }
    return { pts, tags };
  };
  const profile = (ways: number[], stepM = 2.5) => {
    const { pts, tags } = line(ways);
    const rows: [number, number, number, number, number, number][] = [];
    let ch = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * M;
      for (let s = 0; s < L; s += stepM) {
        const x = pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * s) / L,
          z = pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * s) / L;
        const [e, n] = sceneToSweref(ref as never, x, z);
        rows.push([r1(ch + s), r1(e), r1(n), tags[i], r1(luxAt(pA, x, z)), r1(luxAt(pB, x, z))]);
      }
      ch += L;
    }
    return rows;
  };
  const profiles = {
    columns: ['chainageM', 'E', 'N', 'way', 'luxBefore', 'luxAfter'],
    kungsgatan: profile([297613952, 444474488, 297613947, 297613948, 92385198, 444474486]),
    westbound: profile([4384887, 286445690, 286445696, 300186798, 300186799]),
    eastbound: profile([4384888, 1050773512, 286445689, 286445695]),
  };
  type Row = (typeof profiles.kungsgatan)[number];
  const stat = (rows: Row[]) => {
    const v = rows.map((r) => r[5]).sort((a, b) => a - b);
    return { samples: v.length, min: v[0], p50: v[Math.floor(v.length / 2)], max: v[v.length - 1] };
  };
  const untagged = [286445696, 300186798, 1050773512];
  const pilotNorth = PILOTS.find((p: { id: string }) => p.id === 'kungsgatan')!.bounds.z0;
  const sceneOf = (r: Row) => [(r[1] - 569030) / M, (6494989 - r[2]) / M];
  const pilotSeam = profiles.kungsgatan.filter(
    (r) => Math.abs(sceneOf(r)[1] - pilotNorth) * M <= 20,
  );
  const pilotInside = profiles.kungsgatan.filter((r) => sceneOf(r)[1] > pilotNorth + 20 / M);
  const a1Edge = A1_ZONES.A.ring[0][0];
  const a1Seam = [...profiles.westbound, ...profiles.eastbound].filter(
    (r) => Math.abs(r[1] - a1Edge) <= 20,
  );
  const insideA1 = [...profiles.westbound, ...profiles.eastbound].filter((r) =>
    inRing([r[1], r[2]], A1_ZONES.A.ring),
  );
  const a2Lit = [...profiles.kungsgatan, ...profiles.westbound, ...profiles.eastbound].filter(
    (r) =>
      Object.values(A2_ZONES).some((z) => inRing([r[1], r[2]], z.ring)) && !untagged.includes(r[3]),
  );
  const gap = [...profiles.westbound, ...profiles.eastbound].filter((r) => untagged.includes(r[3]));
  // Area statistics: 1 m grid of horizontal illuminance on the rendered ground inside each zone.
  const areaStats = (ringEN: number[][], p: Prepared) => {
    const xs = ringEN.map((q) => q[0]),
      ys = ringEN.map((q) => q[1]);
    const v: number[] = [];
    for (let e = Math.min(...xs); e <= Math.max(...xs); e += 1)
      for (let n = Math.min(...ys); n <= Math.max(...ys); n += 1) {
        if (!inRing([e, n], ringEN)) continue;
        v.push(luxAt(p, (e - 569030) / M, (6494989 - n) / M));
      }
    v.sort((a, b) => a - b);
    const q = (f: number) => r1(v[Math.min(v.length - 1, Math.floor(v.length * f))]);
    return { samples: v.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: r1(v[v.length - 1]) };
  };
  const pilotRingEN = (() => {
    const b = PILOTS.find((p: { id: string }) => p.id === 'kungsgatan')!.bounds;
    return [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x1, b.z1],
      [b.x0, b.z1],
    ].map(([x, z]) => sceneToSweref(ref as never, x, z));
  })();
  // Spacing across the seams: same-class nearest neighbour of each A2 fixture in an earlier rollout.
  const seamSpacing = out.fixtures
    .map((f) => {
      let best: { id: string; d: number } | null = null;
      for (const e of input.existing) {
        if (e.type !== f.type) continue;
        const d = Math.hypot(e.x - f.x, e.z - f.z) * M;
        if (!best || d < best.d) best = { id: e.id, d };
      }
      return best && best.d < 45
        ? { id: f.id, nearestEarlier: best.id, distanceM: r1(best.d) }
        : null;
    })
    .filter(Boolean);
  write('seams.json', {
    note: 'Horizontal illuminance (lux) on the rendered ground from the CPU reference of the shader (reference.ts), before = pilot + A1, after = pilot + A1 + A2. Not a photometric survey; type-table photometry.',
    summary: {
      kungsgatanInsidePilot: stat(pilotInside),
      pilotSeamWithin20m: stat(pilotSeam),
      a1SeamWithin20m: stat(a1Seam),
      norraPromenadenInsideA1: stat(insideA1),
      a2LitCarriageways: stat(a2Lit),
      norrtullUntaggedPieces: stat(gap),
      beforeA2AlongA2Carriageways: (() => {
        const v = a2Lit.map((r) => r[4]);
        return { samples: v.length, belowHalfLux: v.filter((x) => x < 0.5).length };
      })(),
    },
    areas: {
      zoneD: areaStats(A2_ZONES.D.ring, pB),
      zoneE: areaStats(A2_ZONES.E.ring, pB),
      a1ZoneA: areaStats(A1_ZONES.A.ring, pB),
      a1ZoneB: areaStats(A1_ZONES.B.ring, pB),
      kungsgatanPilotBox: areaStats(pilotRingEN, pB),
      kungsgatanPilotBoxBeforeA2: areaStats(pilotRingEN, pA),
    },
    seamSpacing,
    profiles,
  });

  // manifest.json
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    renderer: { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer,
    scene: new Scene(),
    registry: runtime,
  });
  const u = lighting.uniforms;
  write('manifest.json', {
    note: 'Lighting Phase A2 manifest. Inputs pinned by SHA-256 and git blob ID; outputs are the combined (pilot + A1 + A2) runtime arrays. Regenerate deliberately (scripts/lighting-a2/reports.test.ts).',
    generator: A2_SPEC.generator,
    policy: A2_SPEC.policy,
    inputs: [
      ...Object.values(A2_INPUT_FILES),
      'src/lib/data/terrain.json',
      'src/lib/data/bridge-profiles.json',
      'src/lib/geo/sweref99tm.js',
      'scripts/lighting-a1/inputs.ts',
      'scripts/lighting-a2/inputs.ts',
      'scripts/lighting-a1/extract-source.mjs',
    ].map(file),
    outputs: {
      files: [A2_OUTPUT_FILES.runtime, A2_OUTPUT_FILES.provenance].map(file),
      combinedHashes: {
        lampTexture: sha(u.cityLampTex.value.image.data as Float32Array),
        pagePayload: sha(u.cityGridTex.value.image.data as Float32Array),
        pageDirectory: sha(u.cityPageTex.value.image.data as Float32Array),
        canonicalOrder: createHash('sha256').update(lighting.index!.order.join('\n')).digest('hex'),
      },
      counts: lighting.describe().streetLighting.rollouts,
      rollouts: [...new Set(rolloutById.values())].sort(),
    },
  });
  lighting.dispose();
  stadium.dispose();
});
