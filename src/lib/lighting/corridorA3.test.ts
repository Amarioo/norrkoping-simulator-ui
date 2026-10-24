/**
 * Lighting Phase A3 (the rest of the Kungstorget ring): reproducible generation, the zone boundary and
 * its seam with A2 zone D, cross-phase identity and duplicate prevention, parity of the 267 earlier
 * fixtures inside the combined set, capacity, cross-corridor influence, ring illumination, the
 * unchanged Norrtull evidence gap, supports and occlusion, grouping/LOD, rejection and lifecycle.
 * The accepted A2 state is tested in corridorA2.test.ts, the A1 state in corridor.test.ts.
 */
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Scene, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import { geodeticToSweref, sceneToSweref, swerefToScene } from '../geo/sweref99tm.js';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { LAMP_TEXELS, MAX_PER_CELL } from './cityLights';
import { STEP6_MAX_PER_CELL, toStep6SlotPayload } from './legacyGrid';
import {
  a1LightingRegistry,
  a2LightingRegistry,
  a2RuntimeLightingRegistry,
  a3LightingRegistry,
  createCityLighting,
  pilotLightingRegistry,
  runtimeLightingRegistry,
} from './controller';
import { A1_ZONES, groupKey, inRing } from './corridorA1';
import { A2_ZONES } from './corridorA2';
import {
  A3_D_WEST_EDGE,
  A3_GENERATOR,
  A3_RING_OFFSET_M,
  A3_ZONE_ORDER,
  A3_ZONES,
} from './corridorA3';
import { A3_POLICY, A3_SPEC, generateCorridor, type GeneratorInput } from './corridorGenerator';
import { FIXTURE_TYPES, POLE_DETAIL, emitterPosition, type FixtureRecord } from './fixtures';
import { lookupLamps } from './lightIndex';
import { lampLux } from './reference';
import { validateRegistry, type LightingRegistry, type RegistryFixture } from './registry';
import baseline from './testdata/pilot-baseline.json';
import { byGeometry, frozenByGeometry, gatheredTransforms, shownAt } from './testVisuals';

const PILOT_GROUPS = new Set(['kungsgatan', 'stromparken', 'idrottsparken']);
import {
  A3_OUTPUT_FILES,
  existingBeforeA3,
  generateA3,
  loadA3Inputs,
  toA3Files,
} from '../../../scripts/lighting-a3/inputs';
import { PILOTS } from '../../../scripts/step6/pilots.mjs';

const M = terrain.data.reference.metresPerUnit;
const ref = terrain.data.reference;
const input = loadA3Inputs();
const output = generateA3(input);
const fakeRenderer = () =>
  ({ toneMappingExposure: 1, info: { programs: [] } }) as unknown as WebGLRenderer;
const make = (registry: LightingRegistry = runtimeLightingRegistry(terrain)) => {
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    renderer: fakeRenderer(),
    scene: new Scene(),
    registry,
    strict: true,
  });
  return {
    lighting,
    dispose() {
      lighting.dispose();
      stadium.dispose();
    },
  };
};
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = <T>(a: readonly T[], seed: number) => {
  const r = rng(seed),
    out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const sha = (a: ArrayBufferView) =>
  createHash('sha256')
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex');
const segDist = (p: readonly number[], a: readonly number[], b: readonly number[]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const inF = (e: number, n: number) => inRing([e, n], A3_ZONES.F.ring);
const inA1 = (e: number, n: number) => Object.values(A1_ZONES).some((z) => inRing([e, n], z.ring));
const inA2 = (e: number, n: number) => Object.values(A2_ZONES).some((z) => inRing([e, n], z.ring));
const inPilot = (x: number, z: number) =>
  PILOTS.some(
    (p: { bounds: { x0: number; x1: number; z0: number; z1: number } }) =>
      x >= p.bounds.x0 && x <= p.bounds.x1 && z >= p.bounds.z0 && z <= p.bounds.z1,
  );
/** Proper intersection of two segments (shared end points and collinear touching excluded). */
const crosses = (a: number[], b: number[], c: number[], d: number[]) => {
  const o = (p: number[], q: number[], r: number[]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a),
    d2 = o(c, d, b),
    d3 = o(a, b, c),
    d4 = o(a, b, d);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
};
const edges = (ring: number[][]) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);
const area = (ring: number[][]) =>
  Math.abs(
    ring.reduce(
      (s, p, i) =>
        s + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1],
      0,
    ) / 2,
  );
/** The seven ring ways A3 covers, in travel order; A2 owns 286445685 and 286445687. */
const A3_RING = [312490062, 312486752, 286445688, 684962393, 163928046, 308315550, 286445686];
const A2_RING = [286445687, 286445685];
const NORRTULL_UNTAGGED = [286445696, 300186798, 1050773512];
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8')) as {
  roads: { way: number; a: number[]; b: number[]; kind: string }[];
};
const along = (ways: number[], f: (x: number, z: number, way: number) => void, stepM = 2) => {
  for (const w of ways)
    for (const r of map.roads.filter((r) => r.way === w)) {
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M;
      for (let s = 0; s <= L; s += stepM)
        f(r.a[0] + ((r.b[0] - r.a[0]) * s) / L, r.a[1] + ((r.b[1] - r.a[1]) * s) / L, w);
    }
};

describe('A3 generation is reproducible, pinned and order-independent', () => {
  test('committed runtime and provenance files equal a fresh generation, byte for byte', () => {
    const files = toA3Files(output, input);
    expect(fs.readFileSync(A3_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(A3_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  });
  test('the A3 extract is clipped from the pinned Step 6.2 snapshot (base and SHA-256); it has no mapped lamp', () => {
    const meta = input.source.meta as unknown as {
      osmBase: string;
      snapshot: { sha256: string };
      clip: { corridor: string; marginM: number };
    };
    const manifest = JSON.parse(
      fs.readFileSync('docs/step62/evidence/source-manifest.json', 'utf8'),
    );
    expect(meta.osmBase).toBe('2026-10-23T09:05:06Z');
    expect(meta.snapshot.sha256).toBe(
      manifest.files.find(
        (f: { localPath: string }) => f.localPath === 'work/step62/osm-research.json',
      ).sha256,
    );
    expect(meta.clip).toEqual({
      corridor: 'src/lib/lighting/corridorA3.ts (A3_ZONES)',
      marginM: 60,
    });
    expect(input.source.elements.filter((e) => e.type === 'node')).toEqual([]);
  });
  test('shuffling every input list (source, roads, buildings, areas, bridges, platforms, existing, occluders) changes nothing', () => {
    const reference = JSON.stringify(output);
    for (const seed of [1, 2, 3]) {
      const s: GeneratorInput = {
        ...input,
        source: { ...input.source, elements: shuffled(input.source.elements, seed) },
        map: {
          roads: shuffled(input.map.roads, seed + 10),
          buildings: shuffled(input.map.buildings, seed + 20),
          areas: shuffled(input.map.areas, seed + 30),
        },
        bridges: shuffled(input.bridges, seed + 40),
        platforms: shuffled(input.platforms, seed + 50),
        existing: shuffled(input.existing, seed + 60),
        deckOccluders: shuffled(input.deckOccluders ?? [], seed + 70),
      };
      expect(JSON.stringify(generateCorridor(s, A3_SPEC))).toBe(reference);
    }
  });
  test('counts: 6 estimated 8 m ring brackets (no mapped lamp exists), all in zone F, no rejection', () => {
    expect(output.counts).toMatchObject({
      fixtures: 6,
      mapped: 0,
      estimated: 6,
      candidates: 6,
      rejected: 0,
      zoneF: 6,
      deck: 0,
    });
    expect(output.fixtures.map((f) => f.id)).toEqual([
      'estimate:lighting-a3-v1:way/163928046:s0',
      'estimate:lighting-a3-v1:way/286445686:s0',
      'estimate:lighting-a3-v1:way/286445688:s0',
      'estimate:lighting-a3-v1:way/286445688:s1',
      'estimate:lighting-a3-v1:way/308315550:s0',
      'estimate:lighting-a3-v1:way/312490062:s0',
    ]);
    for (const f of output.fixtures) expect(f.type).toBe('street-bracket-8m');
    for (const p of output.provenance) expect(p.rule).toBe('lit-way-roundabout-outer');
    expect(output.provenance.map((p) => p.id)).toEqual(output.fixtures.map((f) => f.id));
  });
  test('stable identity: an ID and its record do not depend on the earlier rollouts', () => {
    const alone = generateCorridor({ ...input, existing: [] }, A3_SPEC);
    const byId = new Map(alone.fixtures.map((f) => [f.id, f]));
    for (const f of output.fixtures) expect(byId.get(f.id), f.id).toEqual(f);
    for (const p of output.provenance) {
      const s = p.station!;
      expect(s.chainageM, p.id).toBeCloseTo(((s.index + 0.5) * s.wayLengthM) / s.of, 1);
      expect(p.id).toBe(`estimate:lighting-a3-v1:${p.source.element}:s${s.index}`);
      expect(s.side, p.id).toBe('outer');
      expect(s.sideFallback, p.id).toBe(false);
    }
  });
  test('every record keeps its provenance: source way and snapshot, generator version, method, estimated status and licence; unknowns stay unknown', () => {
    const a3 = a3LightingRegistry(terrain);
    const ways = new Map(input.source.elements.map((e) => [`way/${e.id}`, e]));
    for (const r of a3.fixtures) {
      expect(r.source).toMatchObject({
        dataset: 'osm-lighting-a3-snapshot',
        snapshot: '2026-10-23T09:05:06Z',
        licence: 'ODbL-1.0 © OpenStreetMap contributors',
      });
      const way = ways.get(r.source.element!);
      expect(way?.tags).toMatchObject({ lit: 'yes', junction: 'circular', name: 'Kungstorget' });
      expect(r.generator).toMatchObject({
        script: A3_GENERATOR.script,
        version: 'lighting-a3-v1',
        seed: null,
        method: 'lit-way-station',
      });
      expect(r.placement).toBe('estimated');
      expect(r.illumination).toBe('estimated');
      expect(r.position.status).toBe('estimated');
      expect(r.position.heightRh2000M).toBeNull();
      expect(r.photometry.status).toBe('estimated');
      expect(r.mountingHeightM.status).toBe('estimated');
      expect(r.activation).toEqual({ mode: 'solar-night', schedule: null, status: 'estimated' });
      expect(r.support).toEqual({ kind: 'ground', surface: 'rendered-ground', status: 'derived' });
    }
    for (const p of output.provenance) {
      expect(p.observed).toEqual(['the way is lit (lit=yes)']);
      expect(p.inferred).toEqual(expect.arrayContaining(['pole position', 'light output']));
    }
  });
});

describe('A3 boundary and the seam with A2', () => {
  const F = A3_ZONES.F.ring as number[][];
  test('the east edge reuses A2 zone D vertices 4–9 exactly (no gap, no overlap at the seam)', () => {
    expect(A3_D_WEST_EDGE).toEqual(A2_ZONES.D.ring.slice(3, 9));
    expect(F[0]).toEqual(A2_ZONES.D.ring[3]);
    expect(F.slice(-5)).toEqual([...A2_ZONES.D.ring.slice(4, 9)].reverse());
  });
  test('the outer edge re-derives from the pinned extract: ring vertices moved 8 m outwards from the ring centre, inside-D vertices dropped', () => {
    const ways = new Map(
      input.source.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]),
    );
    const ring = [...ways.values()].filter(
      (e) => e.tags.junction === 'circular' && e.tags.name === 'Kungstorget',
    );
    expect(ring.map((e) => e.id).sort()).toEqual([...A3_RING, ...A2_RING].sort());
    const en = (id: number) =>
      ways.get(id)!.geometry!.map(([la, lo]) => geodeticToSweref(la, lo) as [number, number]);
    let sx = 0,
      sy = 0,
      n = 0;
    for (const e of ring)
      for (const p of en(e.id)) {
        sx += p[0];
        sy += p[1];
        n++;
      }
    const C = [sx / n, sy / n];
    expect(C[0]).toBeCloseTo(568321.7, 1);
    expect(C[1]).toBeCloseTo(6495541.1, 1);
    const pts: [number, number][] = [];
    for (const id of A3_RING) pts.push(...(pts.length ? en(id).slice(1) : en(id)));
    const derived = pts
      .map(([e, nn]) => {
        const d = Math.hypot(e - C[0], nn - C[1]);
        return [
          Number((e + ((e - C[0]) / d) * A3_RING_OFFSET_M).toFixed(1)),
          Number((nn + ((nn - C[1]) / d) * A3_RING_OFFSET_M).toFixed(1)),
        ];
      })
      .filter((p) => !inRing(p, A2_ZONES.D.ring));
    expect(F.slice(1, F.length - 5)).toEqual(derived);
  });
  test('zone F is a simple polygon of ≈ 0.007 km²', () => {
    const es = edges(F);
    for (let i = 0; i < es.length; i++)
      for (let j = i + 2; j < es.length; j++) {
        if (i === 0 && j === es.length - 1) continue;
        expect(crosses(es[i][0], es[i][1], es[j][0], es[j][1]), `self-intersection ${i}/${j}`).toBe(
          false,
        );
      }
    expect(area(F)).toBeGreaterThan(6500);
    expect(area(F)).toBeLessThan(7500);
  });
  test('no overlap with A2, A1 or a pilot area: no edge crossings, interior samples in F only', () => {
    const others = [
      ...Object.values(A1_ZONES).map((z) => z.ring as number[][]),
      ...Object.values(A2_ZONES).map((z) => z.ring as number[][]),
    ];
    for (const other of others)
      for (const [a, b] of edges(F))
        for (const [c, d] of edges(other)) expect(crosses(a, b, c, d), 'edges cross').toBe(false);
    const xs = F.map((p) => p[0]),
      ys = F.map((p) => p[1]);
    let inside = 0;
    for (let e = Math.min(...xs); e <= Math.max(...xs); e += 1)
      for (let n = Math.min(...ys); n <= Math.max(...ys); n += 1) {
        if (!inF(e, n)) continue;
        inside++;
        expect(inA2(e, n), `${e},${n}`).toBe(false);
        expect(inA1(e, n)).toBe(false);
        const [x, z] = swerefToScene(ref as never, e, n);
        expect(inPilot(x, z)).toBe(false);
      }
    expect(inside).toBeGreaterThan(6500);
  });
  test('every A3 fixture lies in F; none in A1, A2 or a pilot area; no earlier fixture lies in F', () => {
    for (const f of output.fixtures) {
      const [e, n] = sceneToSweref(ref as never, f.x, f.z);
      expect(inF(e, n), f.id).toBe(true);
      expect(f.zone).toBe('F');
      expect(inA1(e, n) || inA2(e, n), f.id).toBe(false);
      expect(inPilot(f.x, f.z), f.id).toBe(false);
    }
    expect(A3_ZONE_ORDER).toEqual(['F']);
    for (const r of a2RuntimeLightingRegistry(terrain).fixtures)
      expect(inF(r.position.e, r.position.n), r.id).toBe(false);
  });
  test('scope: only ring ways get fixtures; approaches, untagged ways and A2-owned ring ways get none', () => {
    const used = new Set(output.provenance.map((p) => p.source.element));
    expect([...used].sort()).toEqual(
      [163928046, 286445686, 286445688, 308315550, 312490062].map((w) => `way/${w}`).sort(),
    );
    // Approach mouths inside F (Stockholmsvägen, Norra Promenaden west, Ingelstagatan): no station.
    const approaches = output.ways.filter((w) => w.name !== 'Kungstorget');
    expect(approaches.map((w) => w.way).sort((a, b) => a - b)).toEqual([
      4438351, 8174527, 92385203, 92385206, 287527545, 287528316,
    ]);
    for (const w of approaches) expect(w.fixtures, `way/${w.way}`).toBe(0);
    // The two short ring ways are below half the class spacing (existing rule, no fixture).
    for (const w of [312486752, 684962393])
      expect(output.ways.find((x) => x.way === w)!.status).toMatch(/^shorter than half/);
    for (const u of output.unknownWays) expect(used.has(`way/${u.way}`)).toBe(false);
    for (const w of [...A2_RING, ...NORRTULL_UNTAGGED, 300027227])
      expect(used.has(`way/${w}`), `way/${w}`).toBe(false);
    expect(output.ways.filter((w) => w.lit === 'no')).toEqual([]);
  });
});

describe('placement, supports and occlusion', () => {
  test('no fixture inside a building, on a platform, in water or under a deck; tram, rail and carriageway clearance kept', () => {
    for (const f of output.fixtures) {
      const p = [f.x, f.z];
      for (const b of input.map.buildings.filter((b) =>
        b.rings[0]?.some((q) => Math.abs(q[0] - f.x) < 2 && Math.abs(q[1] - f.z) < 2),
      ))
        expect(inRing(p, b.rings[0]) && !b.rings.slice(1).some((r) => inRing(p, r))).toBe(false);
      for (const pl of input.platforms) expect(inRing(p, pl.ring), `${f.id} platform`).toBe(false);
      for (const a of input.map.areas.filter((a) => a.kind === 'water'))
        expect(inRing(p, a.rings[0]), `${f.id} water`).toBe(false);
      for (const b of input.bridges) expect(inRing(p, b.ring), `${f.id} ${b.name}`).toBe(false);
      for (const r of input.map.roads) {
        if (segDist(p, r.a, r.b) > 3) continue;
        const d = segDist(p, r.a, r.b) * M;
        if (r.kind === 'tram')
          expect(d, `${f.id} tram`).toBeGreaterThanOrEqual(A3_POLICY.tramClearanceM);
        if (r.kind === 'rail')
          expect(d, `${f.id} rail`).toBeGreaterThanOrEqual(A3_POLICY.railClearanceM);
        if (r.kind === 'road')
          expect(d, `${f.id} way/${r.way}`).toBeGreaterThanOrEqual(
            (r.width * M) / 2 + A3_POLICY.carriagewayClearanceM - 1e-9,
          );
      }
    }
  });
  test('every bracket stands on the outer kerb: farther from the ring centre than its own way', () => {
    const C = [568321.7, 6495541.1];
    for (const f of output.fixtures) {
      const [e, n] = sceneToSweref(ref as never, f.x, f.z);
      const way = Number(/way\/(\d+)/.exec(f.id)![1]);
      let best = { d: Infinity, q: [0, 0] };
      for (const r of map.roads.filter((r) => r.way === way)) {
        const d = segDist([f.x, f.z], r.a, r.b);
        if (d < best.d)
          best = {
            d,
            q: sceneToSweref(ref as never, (r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2),
          };
      }
      expect(Math.hypot(e - C[0], n - C[1]), f.id).toBeGreaterThan(
        Math.hypot(best.q[0] - C[0], best.q[1] - C[1]),
      );
      expect(best.d * M, f.id).toBeLessThanOrEqual(6.2);
    }
  });
  test('supports: every base on the rendered ground at the terrain height, mounting heights from the type table', () => {
    const { lighting, dispose } = make(a3LightingRegistry(terrain));
    lighting.fixtures.forEach((f, i) => {
      const l = lighting.lamps[i];
      expect(f.mount.kind).toBe('ground');
      expect(l.baseY).toBe(terrain.groundHeight(f.x, f.z));
      expect(l.clipBelow).toBe(false);
      expect(l.y - l.baseY).toBeCloseTo(emitterPosition(f, 0, M)[1], 12);
      expect(f.heightM).toBe(input.types[f.type].heightM);
    });
    dispose();
  });
  test('no A3 lamp can reach a bridge deck (nearest outline beyond the lamp range)', () => {
    for (const f of output.fixtures)
      for (const b of input.bridges)
        for (const [a, c] of edges(b.ring))
          expect(segDist([f.x, f.z], a, c) * M, `${f.id} ${b.name}`).toBeGreaterThan(f.rangeM);
  });
  test('occlusion sectors are measured from the emitter (independent recomputation)', () => {
    const walls: number[][][] = [];
    for (const b of input.map.buildings)
      for (const ring of b.rings)
        for (let i = 0; i < ring.length - 1; i++) walls.push([ring[i], ring[i + 1]]);
    for (const o of input.deckOccluders ?? []) walls.push([o.a, o.b]);
    const hit = (o: number[], dir: number[], max: number, local: number[][][]) => {
      let best = max;
      for (const [a, b] of local) {
        const ex = b[0] - a[0],
          ez = b[1] - a[1];
        const den = dir[0] * ez - dir[1] * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
        const u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
        if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t;
      }
      return best;
    };
    const sectors = (p: number[], rangeM: number) => {
      const local = walls.filter(([a, b]) => segDist(p, a, b) <= rangeM / M + 1e-9);
      return Array.from({ length: 16 }, (_, s) => {
        let m = rangeM;
        for (const f of [-1 / 3, 0, 1 / 3]) {
          const a = ((s + 0.5 + f) / 16) * Math.PI * 2 - Math.PI;
          m = Math.min(m, hit(p, [Math.cos(a), Math.sin(a)], rangeM / M, local) * M);
        }
        return Number(m.toFixed(2));
      });
    };
    let occluded = 0;
    for (const f of output.fixtures) {
      const [ex, , ez] = emitterPosition(f as unknown as FixtureRecord, 0, M);
      const dev = (a: number[]) => Math.max(...a.map((v, k) => Math.abs(v - f.occlusionM[k])));
      expect(dev(sectors([ex, ez], f.rangeM)), f.id).toBeLessThanOrEqual(0.02);
      if (f.occlusionM.some((v) => v < f.rangeM)) occluded++;
    }
    expect(occluded).toBeGreaterThan(0); // buildings around the ring cut some sectors
  });
});

describe('cross-phase identity and duplicate prevention', () => {
  const earlier = a2RuntimeLightingRegistry(terrain);
  const earlierIds = new Set(earlier.fixtures.map((r) => r.id));
  test('A3 identities are disjoint from the pilot, A1 and A2 (canonical and runtime IDs)', () => {
    for (const r of a3LightingRegistry(terrain).fixtures) {
      expect(earlierIds.has(r.id)).toBe(false);
      expect(earlier.fixtures.some((e) => e.runtimeId === r.runtimeId)).toBe(false);
    }
  });
  test('no new estimate doubles an earlier one; nothing was suppressed by an earlier rollout', () => {
    for (const f of output.fixtures)
      for (const e of input.existing) {
        const d = Math.hypot(f.x - e.x, f.z - e.z) * M;
        expect(d, `${f.id} vs ${e.id}`).toBeGreaterThanOrEqual(
          A3_POLICY.estimateSeparationFactor * input.types[f.type].spacingM,
        );
      }
    expect(output.rejected).toEqual([]);
    // No station slot of A1 or A2 exists twice.
    const slots = new Set([...earlierIds].map((id) => id.split(':').slice(2).join(':')));
    expect(output.fixtures.filter((f) => slots.has(f.id.split(':').slice(2).join(':')))).toEqual(
      [],
    );
  });
  test('identity guard covers A2 slots: a station slot already rendered by A2 is never imported again', () => {
    const victim = output.fixtures.find((f) => f.id.includes('way/286445688:s0'))!;
    const out = generateCorridor(
      {
        ...input,
        existing: [
          ...input.existing,
          {
            id: 'estimate:lighting-a2-v1:way/286445688:s0',
            x: 999,
            z: 999,
            type: victim.type,
            placement: 'estimated' as const,
            element: 'way/286445688',
          },
        ],
      },
      A3_SPEC,
    );
    expect(out.fixtures.map((f) => f.id)).not.toContain(victim.id);
    expect(out.rejected).toContainEqual(
      expect.objectContaining({ candidate: victim.id, reason: 'identity-in-existing-set' }),
    );
  });
  test('the earlier records are inputs only: the generator never changes them', () => {
    const before = JSON.stringify(existingBeforeA3(ref));
    generateA3(input);
    expect(JSON.stringify(existingBeforeA3(ref))).toBe(before);
    expect(JSON.stringify(input.existing)).toBe(before);
    expect(input.existing).toHaveLength(267);
  });
  test('the committed earlier data files are untouched (pilot, A1, A2 runtime and provenance)', () => {
    const hash = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    expect({
      pilot: hash('src/lib/data/streetlights.json'),
      a1: hash('src/lib/data/streetlights-a1.json'),
      a1Provenance: hash('src/lib/data/streetlights-a1-provenance.json'),
      a2: hash('src/lib/data/streetlights-a2.json'),
      a2Provenance: hash('src/lib/data/streetlights-a2-provenance.json'),
    }).toEqual({
      pilot: '3c90719f166b3ff38443d0e38848e158fdf0d373730a122015dfccd2d18a36f7',
      a1: '7ea8da79d87b05637e3e2d566605ca0a5b685b3e2bca336f280e864863bd62dc',
      a1Provenance: 'b22630de4089da6b2a990c3e7275a3266bfb60fcff159dd5cb255aa0528b2b26',
      a2: '8bb5986f9becdd5bba30976aa9a00a29c24083d45c2ab14b014763612f1ede0e',
      a2Provenance: '0e3fe051ca1dbde40971451802bd0d13dfc9d74832ee894c06190f7a13698251',
    });
  });
});

describe('combined runtime set (pilot + A1 + A2 + A3)', () => {
  const runtime = runtimeLightingRegistry(terrain);
  const before = a2RuntimeLightingRegistry(terrain);
  test('validates as one set: 273 fixtures (20 mapped, 253 estimated), unique IDs, four rollouts', () => {
    const v = validateRegistry(runtime, { reference: ref, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    expect(v.counts).toMatchObject({ fixtures: 273, mapped: 20, estimated: 253 });
    expect(new Set(runtime.fixtures.map((r) => r.runtimeId)).size).toBe(273);
  });
  test('the 267 earlier records are unchanged by the merge (deep-equal, same order)', () => {
    expect(runtime.fixtures.slice(0, 267)).toEqual(before.fixtures);
    expect(runtime.fixtures.slice(0, 105)).toEqual(pilotLightingRegistry(terrain).fixtures);
    expect(runtime.fixtures.slice(105, 232)).toEqual(a1LightingRegistry(terrain).fixtures);
    expect(runtime.fixtures.slice(232, 267)).toEqual(a2LightingRegistry(terrain).fixtures);
    expect(runtime.fixtures.slice(267)).toEqual(a3LightingRegistry(terrain).fixtures);
  });
  const { lighting } = make();
  const prior = make(before);
  const ids = lighting.fixtures.map((f) => f.id);
  const a3Ids = new Set(a3LightingRegistry(terrain).fixtures.map((r) => r.id));
  const row = (l: typeof lighting, i: number) => {
    const rows = l.uniforms.cityLampRows.value;
    const block = Math.floor(i / rows);
    const width = l.uniforms.cityLampTex.value.image.width;
    const o = ((i - block * rows) * width + block * LAMP_TEXELS) * 4;
    return Array.from(
      (l.uniforms.cityLampTex.value.image.data as Float32Array).subarray(o, o + LAMP_TEXELS * 4),
    );
  };
  const lux = (l: typeof lighting, x: number, z: number) => {
    const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
    return lookupLamps(l.index!, x, z).reduce(
      (s, i) => s + lampLux(l.lamps[i], p, [0, 1, 0], M),
      0,
    );
  };
  test('every one of the 267 earlier lamp rows is bit-identical inside the combined set (and the 105 pilot rows equal the frozen baseline)', () => {
    const priorIds = prior.lighting.fixtures.map((f) => f.id);
    const frozen = baseline.lampRows as Record<string, number[]>;
    let n = 0,
      pilot = 0;
    priorIds.forEach((id, i) => {
      const j = ids.indexOf(id);
      expect(row(lighting, j), id).toEqual(row(prior.lighting, i));
      if (frozen[id]) (expect(row(lighting, j), id).toEqual(frozen[id]), pilot++);
      n++;
    });
    expect([n, pilot]).toEqual([267, 105]);
  });
  test('every cell of the A2 state keeps all its lamps; cells that gain lamps gain only A3 lamps', () => {
    const priorIds = prior.lighting.index!.order;
    let gained = 0,
      cells = 0;
    for (let cx = -40; cx <= 40; cx++)
      for (let cz = -40; cz <= 40; cz++) {
        const was = lookupLamps(prior.lighting.index!, cx + 0.5, cz + 0.5).map((i) => priorIds[i]);
        const now = lookupLamps(lighting.index!, cx + 0.5, cz + 0.5).map(
          (i) => lighting.index!.order[i],
        );
        if (!was.length && !now.length) continue;
        cells++;
        expect(now.filter((id) => !a3Ids.has(id)).sort(), `${cx},${cz}`).toEqual([...was].sort());
        if (now.length > was.length) gained++;
      }
    expect(cells).toBeGreaterThan(550);
    expect(gained).toBe(35);
  });
  test('capacity: accepted, ≤ 16 per cell, no overflow; every cell an A3 lamp reaches holds ≤ 8', () => {
    const stats = lighting.index!.stats;
    expect(lighting.describe().streetLighting.status).toBe('ok');
    expect(stats.overflowCells).toBe(0);
    expect(stats.maxRawOccupancy).toBe(15); // unchanged: A1's square with 8 mapped lamps
    expect(stats.histogram.slice(STEP6_MAX_PER_CELL + 1).every((n) => n === 0)).toBe(true);
    let max = 0;
    for (let cx = -36; cx <= -20; cx++)
      for (let cz = -30; cz <= -14; cz++) {
        const here = lookupLamps(lighting.index!, cx + 0.5, cz + 0.5).map((i) => ids[i]);
        if (here.some((id) => a3Ids.has(id))) max = Math.max(max, here.length);
      }
    expect(max).toBe(8);
  });
  test('pilot visuals keep the frozen instance transforms; every earlier housing keeps its transform', () => {
    // Phase L1: visuals are gathered per fixture (testVisuals.ts). The pilot's housings, lenses and
    // halos must reproduce the frozen transforms per geometry, and every earlier fixture's
    // full-detail housing must keep the transform it has in the earlier set, bit for bit.
    const now = gatheredTransforms(lighting);
    const pilotIds = new Set(
      lighting.fixtures.filter((f) => PILOT_GROUPS.has(f.pilot)).map((f) => f.id),
    );
    expect(pilotIds.size).toBe(105);
    expect(byGeometry(now, pilotIds)).toEqual(frozenByGeometry(baseline.visuals));
    const was = gatheredTransforms(prior.lighting).near;
    expect(was.size).toBe(267);
    for (const [id, t] of was) expect(now.near.get(id)?.matrix, id).toBe(t.matrix);
  });
  test('pinned combined output matches the A3 manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync('docs/lighting-phase-a3/data/manifest.json', 'utf8'),
    );
    const u = lighting.uniforms;
    expect({
      lampTexture: sha(u.cityLampTex.value.image.data as Float32Array),
      // Phase L1 stores cell headers + a lamp list; rebuilt into the 16-slot atlas of this
      // phase, the bytes must equal the pinned hash (same lamps, same order, every cell).
      pagePayload: sha(
        toStep6SlotPayload(
          lighting.index!,
          lighting.describe().streetLighting.textures.maxTextureSize,
        ),
      ),
      pageDirectory: sha(u.cityPageTex.value.image.data as Float32Array),
      canonicalOrder: createHash('sha256').update(lighting.index!.order.join('\n')).digest('hex'),
    }).toEqual(manifest.outputs.combinedHashes);
  });
  test('shuffled combined registry gives byte-identical textures and order', () => {
    const hash = (r: LightingRegistry) => {
      const { lighting: l, dispose } = make(r);
      const out = [
        sha(l.uniforms.cityLampTex.value.image.data as Float32Array),
        sha(l.uniforms.cityGridTex.value.image.data as Float32Array),
        sha(l.uniforms.cityPageTex.value.image.data as Float32Array),
        l.index!.order.join('\n'),
      ];
      dispose();
      return out;
    };
    const reference = hash(runtime);
    for (const seed of [1, 2])
      expect(hash({ ...runtime, fixtures: shuffled(runtime.fixtures, seed) })).toEqual(reference);
  });
  test('A3 records join the fixed 800 m chunk group chunk:-1,-1; no new group', () => {
    for (const r of a3LightingRegistry(terrain).fixtures) {
      expect(r.group).toBe(groupKey(r.position.scene.x, r.position.scene.z));
      expect(r.group).toBe('chunk:-1,-1');
    }
    expect([...new Set(runtime.fixtures.map((r) => r.group))].sort()).toEqual(
      [...new Set(before.fixtures.map((r) => r.group))].sort(),
    );
  });
  test('grouping never hides a nearby lamp around the ring and the A2 seam', () => {
    const r = rng(11);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const position = new Vector3(-33 + r() * 10, 0.2 + r() * 3, -27 + r() * 10);
      const shown = shownAt(lighting, position);
      lighting.fixtures.forEach((f, i) => {
        // Phase L1 decides per fixture by the 3D distance to its base (housing to POLE_DETAIL).
        const d = position.distanceTo(new Vector3(f.x, lighting.lamps[i].baseY, f.z));
        if (d >= POLE_DETAIL * 0.98) return;
        expect(shown.near.has(f.id) || shown.lod.has(f.id), f.id).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(10000);
  });
  test('cross-corridor influence: indexed lookup equals brute force; A3 lamps light receivers in A2 zone D', () => {
    let intoD = 0,
      samples = 0;
    for (let x = -31; x <= -26; x += 0.1)
      for (let z = -25; z <= -19.5; z += 0.1) {
        const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
        const indexed = lookupLamps(lighting.index!, x, z);
        let a = 0,
          b = 0;
        for (const i of indexed) a += lampLux(lighting.lamps[i], p, [0, 1, 0], M);
        lighting.lamps.forEach((l) => (b += lampLux(l, p, [0, 1, 0], M)));
        expect(a).toBeCloseTo(b, 9);
        samples++;
        const [e, n] = sceneToSweref(ref as never, x, z);
        if (inRing([e, n], A2_ZONES.D.ring))
          for (const i of indexed)
            if (a3Ids.has(ids[i]) && lampLux(lighting.lamps[i], p, [0, 1, 0], M) > 0) intoD++;
      }
    expect(samples).toBeGreaterThan(2500);
    expect(intoD).toBeGreaterThan(20);
  });
  test('ring illumination: the A3 ring was dark and is now lit; the A2 seam is continuous; the two dim stretches are where short ring ways get no station (documented)', () => {
    let samples = 0,
      darkBefore = 0;
    const after: number[] = [];
    const belowOne = new Set<number>(),
      belowThree = new Set<number>();
    let minWest = Infinity;
    along(A3_RING, (x, z, way) => {
      const [e, n] = sceneToSweref(ref as never, x, z);
      if (!inF(e, n)) return;
      samples++;
      if (lux(prior.lighting, x, z) < 1) darkBefore++;
      const v = lux(lighting, x, z);
      after.push(v);
      if (v < 1) belowOne.add(way);
      if (v < 3) belowThree.add(way);
      if (way === 684962393 || way === 163928046) minWest = Math.min(minWest, v);
    });
    after.sort((a, b) => a - b);
    expect(samples).toBeGreaterThan(90);
    expect(darkBefore / samples).toBeGreaterThan(0.9);
    expect(after[Math.floor(after.length / 2)]).toBeGreaterThan(10);
    expect(after[0]).toBeGreaterThan(0.3);
    expect(after.filter((v) => v < 1).length).toBeLessThanOrEqual(4);
    // Below 1 lux only on the north arc (312490062 → 312486752: 49.7 m between brackets); below
    // 3 lux additionally only around the 10.7 m west link 684962393 (41.4 m between brackets).
    expect([...belowOne].sort()).toEqual([312486752, 312490062]);
    for (const w of belowThree) expect([312490062, 312486752, 684962393, 163928046]).toContain(w);
    expect(minWest).toBeGreaterThan(2);
    // A2's ring arc (286445685, 286445687) keeps ≥ 3 lux everywhere with A3 in place.
    let minA2 = Infinity;
    along(A2_RING, (x, z) => (minA2 = Math.min(minA2, lux(lighting, x, z))));
    expect(minA2).toBeGreaterThan(3);
  });
  test('Norrtull evidence gap unchanged: the untagged pieces get exactly the same light as before A3', () => {
    let n = 0,
      gap = 0;
    along(NORRTULL_UNTAGGED, (x, z) => {
      const a = lux(prior.lighting, x, z),
        b = lux(lighting, x, z);
      expect(b).toBe(a);
      if (b < 1) gap++;
      n++;
    });
    expect(n).toBeGreaterThan(40);
    expect(gap).toBeGreaterThan(10);
    // No A3 lamp is within its range of these pieces.
    const segs = map.roads.filter((r) => NORRTULL_UNTAGGED.includes(r.way));
    for (const f of output.fixtures)
      for (const r of segs)
        expect(segDist([f.x, f.z], r.a, r.b) * M, f.id).toBeGreaterThan(f.rangeM);
  });
});

describe('rejection keeps the last valid set; lifecycle', () => {
  const runtime = runtimeLightingRegistry(terrain);
  const a3Fixture = runtime.fixtures.find((r) => r.id.startsWith('estimate:lighting-a3-v1'))!;
  const variant = (r: RegistryFixture, k: number): RegistryFixture => ({
    ...r,
    id: `estimate:lighting-a3-v1:test/${k}`,
    runtimeId: `estimate:lighting-a3-v1:test/${k}`,
  });
  test('MAX_PER_CELL + 1 (33) lamps crowding one A3 cell are rejected as a capacity conflict; the 273-fixture set stays rendered', () => {
    const { lighting, dispose } = make();
    const before = lighting.uniforms.cityLampTex.value;
    const crowd = Array.from({ length: MAX_PER_CELL + 1 }, (_, k) => variant(a3Fixture, k));
    const result = lighting.replaceStreetLighting({
      ...runtime,
      fixtures: [...runtime.fixtures, ...crowd],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('capacity');
    const c = result.conflicts.find((c) => c.raw.includes(crowd[0].id))!;
    for (const r of crowd) expect(c.raw).toContain(r.id);
    expect(lighting.uniforms.cityLampTex.value).toBe(before);
    expect(lighting.describe().streetLighting.status).toBe('rendering-previous');
    expect(lighting.describe().fixtures).toBe(273);
    dispose();
  });
  test('an A3 record re-using an A2 canonical ID is rejected at the registry stage', () => {
    const { lighting, dispose } = make();
    const a2Record = a2LightingRegistry(terrain).fixtures[0];
    const result = lighting.replaceStreetLighting({
      ...runtime,
      fixtures: [...runtime.fixtures, { ...a3Fixture, id: a2Record.id, runtimeId: 'collision' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('registry');
    expect(lighting.describe().fixtures).toBe(273);
    dispose();
  });
  test('10 alternating replacements A2 state ↔ A2 + A3 keep exactly one live set and constant resources', () => {
    const { lighting, dispose } = make();
    const live = new Set<object>();
    const track = (r: { addEventListener: (t: 'dispose', f: () => void) => void }) => {
      live.add(r);
      r.addEventListener('dispose', () => live.delete(r));
    };
    const owned = () => {
      const out = new Set<object>();
      lighting.group.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.geometry instanceof BufferGeometry) out.add(mesh.geometry);
        for (const m of [mesh.material].flat()) if (m instanceof Material) out.add(m);
      });
      for (const k of ['cityLampTex', 'cityGridTex', 'cityPageTex'] as const)
        out.add(lighting.uniforms[k].value);
      return out;
    };
    for (const r of owned()) track(r as never);
    const sizes = { a2: new Set<number>(), a3: new Set<number>() };
    for (let k = 0; k < 10; k++) {
      const kind = k % 2 ? 'a3' : 'a2';
      const registry =
        kind === 'a2' ? a2RuntimeLightingRegistry(terrain) : runtimeLightingRegistry(terrain);
      expect(lighting.replaceStreetLighting(registry).ok).toBe(true);
      const now = owned();
      for (const r of now) if (!live.has(r)) track(r as never);
      expect([...live].every((r) => now.has(r))).toBe(true);
      sizes[kind].add(live.size);
      expect(lighting.describe().fixtures).toBe(kind === 'a2' ? 267 : 273);
    }
    expect(sizes.a2.size).toBe(1);
    expect(sizes.a3.size).toBe(1);
    dispose();
    expect([...live]).toEqual([]);
  });
});
