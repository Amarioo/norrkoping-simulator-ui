// Lighting Phase A3: machine-readable evidence for docs/lighting-phase-a3/data/.
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts reports
//
// Writes (small, deterministic; no raw OSM data beyond IDs and derived positions):
//   manifest.json  pinned inputs (SHA-256 / git blob), generator/policy, output hashes, counts
//   registry.json  one compact line per A3 fixture (identity, zone, group, evidence, type, E/N, rule)
//   coverage.json  zone, per-way evidence status, rendered ways without a lit tag, every rejection
//   capacity.json  occupancy of the A2 state / A3 alone / combined, the cells A3 reaches with their
//                  contributors, cells that gain lamps, density-headroom variants
//   ring.json      road-surface illuminance before/after along the whole Kungstorget ring (travel
//                  order), its approaches' first 30 m, the A2 seam, the Norrtull untagged pieces, area
//                  statistics, bracket gaps along the ring
// Phase A1/A2 evidence (docs/lighting-phase-a1/data, docs/lighting-phase-a2/data) is not touched.
import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { sceneToSweref } from '../../src/lib/geo/sweref99tm.js';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import {
  a2RuntimeLightingRegistry,
  a3LightingRegistry,
  createCityLighting,
  runtimeLightingRegistry,
} from '../../src/lib/lighting/controller';
import { A3_SPEC, generateCorridor } from '../../src/lib/lighting/corridorGenerator';
import { inRing } from '../../src/lib/lighting/corridorA1';
import { A2_ZONES } from '../../src/lib/lighting/corridorA2';
import { A3_ZONES } from '../../src/lib/lighting/corridorA3';
import {
  A3_IDENTITY,
  corridorRegistry,
  mergeRegistries,
} from '../../src/lib/lighting/corridorRegistry';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';
import { lookupLamps } from '../../src/lib/lighting/lightIndex';
import { lampLux } from '../../src/lib/lighting/reference';
import type { LightingRegistry } from '../../src/lib/lighting/registry';
import { A3_INPUT_FILES, A3_OUTPUT_FILES, generateA3, loadA3Inputs, toA3Files } from './inputs';

const OUT = 'docs/lighting-phase-a3/data';
const M = terrain.data.reference.metresPerUnit;
const ref = terrain.data.reference;
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8')) as {
  roads: { way: number; a: number[]; b: number[]; kind: string }[];
};
/** The whole Kungstorget ring in travel order (counter-clockwise from the south), incl. A2's arc. */
export const RING_WAYS = [
  308315550, 286445686, 286445687, 286445685, 300027227, 312490062, 312486752, 286445688, 684962393,
  163928046,
];
/** Approach ways at the ring (rendered; their first 30 m from the ring are profiled). */
export const APPROACHES: { way: number; name: string; ringEnd: 'a' | 'b' }[] = [
  { way: 8174527, name: 'Stockholmsvägen (out)', ringEnd: 'a' },
  { way: 287528316, name: 'Stockholmsvägen (in)', ringEnd: 'b' },
  { way: 4438351, name: 'Norra Promenaden west (out)', ringEnd: 'a' },
  { way: 287527545, name: 'Norra Promenaden west (in)', ringEnd: 'b' },
  { way: 92385203, name: 'Ingelstagatan (out)', ringEnd: 'a' },
  { way: 92385206, name: 'Ingelstagatan (in)', ringEnd: 'b' },
];
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
const toScene = (e: number, n: number) => terrain.fromSweref(e, n) as [number, number];

test('write the A3 evidence data', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const input = loadA3Inputs();
  const out = generateA3(input);
  const files = toA3Files(out, input);
  expect(fs.readFileSync(A3_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  const before = a2RuntimeLightingRegistry(terrain),
    a3 = a3LightingRegistry(terrain),
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
    a3.fixtures.map((r) => {
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
      Object.entries(A3_ZONES).map(([k, z]) => [
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
  const a3Ids = new Set(a3.fixtures.map((r) => r.id));
  const recordOf = new Map(pB.records.map((r) => [r.id, r]));
  type Cell = {
    cell: number[];
    centreEN: number[];
    count: number;
    before: number;
    byRollout: Record<string, number>;
    mapped: number;
    estimated: number;
    ids: string[];
  };
  const cellsTouched: Cell[] = [];
  const near: Cell[] = [];
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
        if (ids.some((id) => a3Ids.has(id))) cellsTouched.push(entry);
      }
  const byCount = (a: { count: number; cell: number[] }, b: { count: number; cell: number[] }) =>
    b.count - a.count || a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1];
  near.sort(byCount);
  cellsTouched.sort(byCount);
  const a3MaxIn = (p: Prepared) => {
    let max = 0;
    for (let cx = -36; cx <= -20; cx++)
      for (let cz = -30; cz <= -14; cz++) {
        const ids = lookupLamps(p.index, cx + 0.5, cz + 0.5).map((i) => p.index.order[i]);
        if (ids.some((id) => id.startsWith('estimate:lighting-a3')))
          max = Math.max(max, ids.length);
      }
    return max;
  };
  const variants = [1, 0.85, 0.75, 0.6, 0.5].map((f) => {
    const types = Object.fromEntries(
      Object.entries(input.types).map(([k, t]) => [k, { ...t, spacingM: t.spacingM * f }]),
    );
    const o = generateCorridor({ ...input, types }, A3_SPEC);
    const reg = corridorRegistry(JSON.parse(toA3Files(o, input).runtime), ref, A3_IDENTITY);
    const s = statsOf(mergeRegistries(before, reg));
    const p = prepare(mergeRegistries(before, reg));
    return {
      spacingFactor: f,
      a3Fixtures: o.counts.fixtures,
      ok: s.ok,
      maxRawOccupancy: s.maxRawOccupancy,
      maxInCellsA3Reaches: p.ok ? a3MaxIn(p) : null,
      overflowCells: s.overflowCells,
      conflictCount: s.conflicts.length,
      conflicts: s.conflicts.slice(0, 5),
    };
  });
  write('capacity.json', {
    capacity: pB.index.capacity,
    cellMetres: pB.index.stats.cellMetres,
    chunkCells: pB.index.chunkCells,
    a2State: { ...statsOf(before), conflicts: undefined },
    a3Only: { ...statsOf(a3), conflicts: undefined },
    combined: { ...statsOf(runtime), conflicts: undefined },
    nearCapacityCells: near,
    cellsReachedByA3: {
      count: cellsTouched.length,
      maxCount: cellsTouched[0]?.count ?? 0,
      histogram: cellsTouched.reduce<Record<number, number>>(
        (a, c) => ((a[c.count] = (a[c.count] ?? 0) + 1), a),
        {},
      ),
      gainedFromBefore: cellsTouched.filter((c) => c.before > 0).length,
      newCells: cellsTouched.filter((c) => c.before === 0).length,
      busiest: cellsTouched.slice(0, 12),
      /** Cells that held earlier lamps before and now also receive A3 lamps (the A2 seam). */
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

  // ring.json — illuminance on the road surface (horizontal, CPU reference of the shader).
  type Row = [number, number, number, number, number, number];
  const columns = ['chainageM', 'E', 'N', 'way', 'luxBefore', 'luxAfter'];
  const sample = (segs: { a: number[]; b: number[]; way: number }[], stepM = 2.5) => {
    const rows: Row[] = [];
    let ch = 0;
    for (const r of segs) {
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M;
      for (let s = 0; s < L; s += stepM) {
        const x = r.a[0] + (r.b[0] - r.a[0]) * (s / L),
          z = r.a[1] + (r.b[1] - r.a[1]) * (s / L);
        const [e, n] = sceneToSweref(ref as never, x, z);
        rows.push([r1(ch + s), r1(e), r1(n), r.way, r1(luxAt(pA, x, z)), r1(luxAt(pB, x, z))]);
      }
      ch += L;
    }
    return rows;
  };
  const segsOf = (w: number) => map.roads.filter((r) => r.way === w).map((r) => ({ ...r, way: w }));
  const ring = sample(RING_WAYS.flatMap(segsOf));
  // First 30 m of each approach, measured from its ring end.
  const approach = (a: (typeof APPROACHES)[number]) => {
    let segs = segsOf(a.way);
    if (a.ringEnd === 'b') segs = [...segs].reverse().map((r) => ({ ...r, a: r.b, b: r.a }));
    return sample(segs, 2.5).filter((r) => r[0] <= 30);
  };
  const approaches = Object.fromEntries(
    APPROACHES.map((a) => [a.way, { name: a.name, rows: approach(a) }]),
  );
  const untagged = [286445696, 300186798, 1050773512];
  const norrtull = sample(untagged.flatMap(segsOf));
  const stat = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return {
      samples: s.length,
      min: s[0],
      p50: s[Math.floor(s.length / 2)],
      max: s[s.length - 1],
      belowOneLux: s.filter((x) => x < 1).length,
    };
  };
  const inF = (r: Row) => inRing([r[1], r[2]], A3_ZONES.F.ring);
  const a3Ring = ring.filter((r) => inF(r));
  const a2Ring = ring.filter((r) => inRing([r[1], r[2]], A2_ZONES.D.ring));
  // Within ± 20 m (along the ring) of the two places where the ring crosses the A2/A3 seam.
  const crossings = ring
    .map((r, i) => (i && inF(r) !== inF(ring[i - 1]) ? r[0] : null))
    .filter((c): c is number => c !== null);
  const seam = ring.filter((r) => crossings.some((c) => Math.abs(r[0] - c) <= 20));
  // Darkest stretch of the A3 ring part (longest run of consecutive samples below 3 lux, after).
  let run = 0,
    longest = { lengthM: 0, fromM: 0, toM: 0 };
  ring.forEach((r, i) => {
    if (inF(r) && r[5] < 3) {
      run++;
      if (run * 2.5 > longest.lengthM)
        longest = { lengthM: run * 2.5, fromM: ring[i - run + 1][0], toM: r[0] };
    } else run = 0;
  });
  // Area statistics: 1 m grid of horizontal illuminance on the rendered ground inside a zone.
  const areaStats = (ringEN: number[][], p: Prepared) => {
    const xs = ringEN.map((q) => q[0]),
      ys = ringEN.map((q) => q[1]);
    const v: number[] = [];
    for (let e = Math.min(...xs); e <= Math.max(...xs); e += 1)
      for (let n = Math.min(...ys); n <= Math.max(...ys); n += 1) {
        if (!inRing([e, n], ringEN)) continue;
        const [x, z] = toScene(e, n);
        v.push(luxAt(p, x, z));
      }
    v.sort((a, b) => a - b);
    const q = (f: number) => r1(v[Math.min(v.length - 1, Math.floor(v.length * f))]);
    return { samples: v.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: r1(v[v.length - 1]) };
  };
  // Bracket gaps along the ring: straight-line distance between consecutive ring brackets (angle order).
  const ringIds = pB.records.filter((r) => RING_WAYS.some((w) => r.source.element === `way/${w}`));
  const cx = ringIds.reduce((s, r) => s + r.position.e, 0) / ringIds.length,
    cy = ringIds.reduce((s, r) => s + r.position.n, 0) / ringIds.length;
  const byAngle = [...ringIds].sort(
    (a, b) =>
      Math.atan2(a.position.n - cy, a.position.e - cx) -
      Math.atan2(b.position.n - cy, b.position.e - cx),
  );
  const gaps = byAngle.map((r, i) => {
    const q = byAngle[(i + 1) % byAngle.length];
    return {
      from: r.id,
      to: q.id,
      distanceM: r1(Math.hypot(r.position.e - q.position.e, r.position.n - q.position.n)),
    };
  });
  write('ring.json', {
    note: 'Horizontal illuminance (lux) on the rendered ground from the CPU reference of the shader (reference.ts), before = pilot + A1 + A2, after = pilot + A1 + A2 + A3. Not a photometric survey; type-table photometry. Ring centreline in travel order from the south (way 308315550), 2.5 m steps.',
    summary: {
      a3RingCentreline: {
        before: stat(a3Ring.map((r) => r[4])),
        after: stat(a3Ring.map((r) => r[5])),
      },
      a2RingCentreline: {
        before: stat(a2Ring.map((r) => r[4])),
        after: stat(a2Ring.map((r) => r[5])),
      },
      a2SeamWithin20m: { crossingsAtChainageM: crossings, after: stat(seam.map((r) => r[5])) },
      darkestA3RingStretchBelow3Lux: longest,
      norrtullUntaggedPieces: {
        before: stat(norrtull.map((r) => r[4])),
        after: stat(norrtull.map((r) => r[5])),
        identical: norrtull.every((r) => r[4] === r[5]),
      },
      approachesFirst30m: Object.fromEntries(
        Object.entries(approaches).map(([w, a]) => [
          w,
          {
            name: a.name,
            before: stat(a.rows.map((r) => r[4])),
            after: stat(a.rows.map((r) => r[5])),
          },
        ]),
      ),
    },
    areas: {
      zoneF: areaStats(A3_ZONES.F.ring, pB),
      zoneFBefore: areaStats(A3_ZONES.F.ring, pA),
      a2ZoneD: areaStats(A2_ZONES.D.ring, pB),
      a2ZoneDBefore: areaStats(A2_ZONES.D.ring, pA),
    },
    bracketGaps: gaps,
    columns,
    ring,
    approaches,
    norrtull,
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
    note: 'Lighting Phase A3 manifest. Inputs pinned by SHA-256 and git blob ID; outputs are the combined (pilot + A1 + A2 + A3) runtime arrays. Regenerate deliberately (scripts/lighting-a3/reports.test.ts).',
    generator: A3_SPEC.generator,
    policy: A3_SPEC.policy,
    inputs: [
      ...Object.values(A3_INPUT_FILES),
      'src/lib/data/terrain.json',
      'src/lib/data/bridge-profiles.json',
      'src/lib/geo/sweref99tm.js',
      'scripts/lighting-a1/inputs.ts',
      'scripts/lighting-a3/inputs.ts',
      'scripts/lighting-a1/extract-source.mjs',
    ].map(file),
    outputs: {
      files: [A3_OUTPUT_FILES.runtime, A3_OUTPUT_FILES.provenance].map(file),
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
