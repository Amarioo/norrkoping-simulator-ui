/**
 * Lighting Phase A2 (western Norra Promenaden + northern Kungsgatan): reproducible generation, the
 * geographic boundary and its seams with A1 and the Kungsgatan pilot, cross-phase identity and
 * duplicate prevention, parity of the 232 earlier fixtures inside the combined set, capacity,
 * cross-corridor influence, illumination continuity, supports and occlusion, grouping/LOD,
 * rejection and lifecycle. The accepted A1 state is tested in corridor.test.ts.
 */
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Scene, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import { sceneToSweref, swerefToScene } from '../geo/sweref99tm.js';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { LAMP_TEXELS, MAX_PER_CELL } from './cityLights';
import { STEP6_MAX_PER_CELL, toStep6SlotPayload } from './legacyGrid';
import {
  a1LightingRegistry,
  a1RuntimeLightingRegistry,
  a2LightingRegistry,
  // Phase A3: the controller default is now pilot + A1 + A2 + A3; these tests keep verifying the
  // accepted A2 state (pilot + A1 + A2, 267 fixtures). A3 tests: corridorA3.test.ts.
  a2RuntimeLightingRegistry as runtimeLightingRegistry,
  createCityLighting,
  pilotLightingRegistry,
} from './controller';
import { A1_ZONES, groupKey, inRing } from './corridorA1';
import { A2_GENERATOR, A2_ZONE_ORDER, A2_ZONES } from './corridorA2';
import { A2_POLICY, A2_SPEC, generateCorridor, type GeneratorInput } from './corridorGenerator';
import { FIXTURE_TYPES, POLE_DETAIL, emitterPosition, type FixtureRecord } from './fixtures';
import { lookupLamps } from './lightIndex';
import { lampLux } from './reference';
import { validateRegistry, type LightingRegistry, type RegistryFixture } from './registry';
import baseline from './testdata/pilot-baseline.json';
import { byGeometry, frozenByGeometry, gatheredTransforms, shownAt } from './testVisuals';

const PILOT_GROUPS = new Set(['kungsgatan', 'stromparken', 'idrottsparken']);
import {
  A2_OUTPUT_FILES,
  existingBeforeA2,
  generateA2,
  loadA2Inputs,
  toA2Files,
} from '../../../scripts/lighting-a2/inputs';
import { PILOTS } from '../../../scripts/step6/pilots.mjs';

const M = terrain.data.reference.metresPerUnit;
const ref = terrain.data.reference;
const input = loadA2Inputs();
const output = generateA2(input);
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
const zoneOfEN = (e: number, n: number) =>
  A2_ZONE_ORDER.find((z) => inRing([e, n], A2_ZONES[z].ring)) ?? null;
const inA1 = (e: number, n: number) => Object.values(A1_ZONES).some((z) => inRing([e, n], z.ring));
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
const KUNGSGATAN = PILOTS.find((p: { id: string }) => p.id === 'kungsgatan')!.bounds as {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
};

describe('A2 generation is reproducible, pinned and order-independent', () => {
  test('committed runtime and provenance files equal a fresh generation, byte for byte', () => {
    const files = toA2Files(output, input);
    expect(fs.readFileSync(A2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(A2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  });
  test('the A2 extract is clipped from the pinned Step 6.2 snapshot (base and SHA-256); it has no mapped lamp', () => {
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
      corridor: 'src/lib/lighting/corridorA2.ts (A2_ZONES)',
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
      expect(JSON.stringify(generateCorridor(s, A2_SPEC))).toBe(reference);
    }
  });
  test('counts: 35 estimates (no mapped lamp exists in the corridor), 20 in zone D, 15 in zone E', () => {
    expect(output.counts).toMatchObject({
      fixtures: 35,
      mapped: 0,
      estimated: 35,
      zoneD: 20,
      zoneE: 15,
      deck: 0,
    });
    expect(output.provenance.map((p) => p.id)).toEqual(output.fixtures.map((f) => f.id));
    for (const f of output.fixtures)
      expect(f.id).toMatch(/^estimate:lighting-a2-v1:way\/\d+:s\d+$/);
  });
  test('stable identity: an ID and its record do not depend on the earlier rollouts or the corridor bounds', () => {
    // Without the earlier rollouts the same stations are generated (plus those the seam rules skip).
    const alone = generateCorridor({ ...input, existing: [] }, A2_SPEC);
    const byId = new Map(alone.fixtures.map((f) => [f.id, f]));
    for (const f of output.fixtures) expect(byId.get(f.id), f.id).toEqual(f);
    // The station index is way-local: chainage = (index + ½) · length / stations.
    for (const p of output.provenance) {
      const s = p.station!;
      expect(s.chainageM, p.id).toBeCloseTo(((s.index + 0.5) * s.wayLengthM) / s.of, 1);
      expect(p.id).toBe(`estimate:lighting-a2-v1:${p.source.element}:s${s.index}`);
    }
  });
  test('every record keeps its provenance: source way and snapshot, generator version, method, estimated status and licence; unknowns stay unknown', () => {
    const a2 = a2LightingRegistry(terrain);
    const ways = new Map(input.source.elements.map((e) => [`way/${e.id}`, e]));
    for (const r of a2.fixtures) {
      expect(r.source).toMatchObject({
        dataset: 'osm-lighting-a2-snapshot',
        snapshot: '2026-10-23T09:05:06Z',
        licence: 'ODbL-1.0 © OpenStreetMap contributors',
      });
      expect(ways.get(r.source.element!)?.tags.lit, r.id).toBe('yes');
      expect(r.generator).toMatchObject({
        script: A2_GENERATOR.script,
        version: 'lighting-a2-v1',
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

describe('A2 boundary and seams', () => {
  const rings = A2_ZONE_ORDER.map((z) => A2_ZONES[z].ring as number[][]);
  const pilotRing = [
    [KUNGSGATAN.x0, KUNGSGATAN.z0],
    [KUNGSGATAN.x1, KUNGSGATAN.z0],
    [KUNGSGATAN.x1, KUNGSGATAN.z1],
    [KUNGSGATAN.x0, KUNGSGATAN.z1],
  ].map(([x, z]) => sceneToSweref(ref as never, x, z));
  test('zones are simple polygons, a corridor not a rectangle (≤ 0.02 km²)', () => {
    for (const ring of rings) {
      const es = edges(ring);
      for (let i = 0; i < es.length; i++)
        for (let j = i + 2; j < es.length; j++) {
          if (i === 0 && j === es.length - 1) continue;
          expect(
            crosses(es[i][0], es[i][1], es[j][0], es[j][1]),
            `self-intersection ${i}/${j}`,
          ).toBe(false);
        }
    }
    const total = rings.reduce((s, r) => s + area(r), 0) / 1e6;
    expect(total).toBeGreaterThan(0.01);
    expect(total).toBeLessThan(0.02);
  });
  test('no overlap with each other, with A1 or with the pilot; the seams are shared edges', () => {
    const others = [...Object.values(A1_ZONES).map((z) => z.ring as number[][]), pilotRing];
    for (const ring of rings) {
      for (const other of [...others, ...rings.filter((r) => r !== ring)])
        for (const [a, b] of edges(ring))
          for (const [c, d] of edges(other)) expect(crosses(a, b, c, d), 'edges cross').toBe(false);
      // Interior samples (fan from each vertex) are inside this zone only.
      for (let i = 1; i < ring.length - 1; i++) {
        const c = [
          (ring[0][0] + ring[i][0] + ring[i + 1][0]) / 3,
          (ring[0][1] + ring[i][1] + ring[i + 1][1]) / 3,
        ];
        if (!inRing(c, ring)) continue;
        expect(inA1(c[0], c[1])).toBe(false);
        const [x, z] = swerefToScene(ref as never, c[0], c[1]);
        expect(inPilot(x, z)).toBe(false);
      }
    }
    // D's east edge lies on A1 zone A's west edge (E 568 572.7) and ends at A1's south-west vertex.
    const D = A2_ZONES.D.ring,
      A = A1_ZONES.A.ring;
    expect(D[0][0]).toBe(A[0][0]);
    expect(D[0][1]).toBeGreaterThan(A[A.length - 1][1]);
    expect(D[0][1]).toBeLessThan(A[0][1]);
    expect(D[D.length - 1]).toEqual(A[A.length - 1]);
    // E's south edge lies on the pilot's north bound (z = −14.6, within 1 mm) inside its x range.
    const south = A2_ZONES.E.ring.filter(([e, n]) => {
      const [, z] = swerefToScene(ref as never, e, n);
      return Math.abs(z - KUNGSGATAN.z0) * M < 0.001;
    });
    expect(south).toHaveLength(2);
    for (const [e, n] of south) {
      const [x, z] = swerefToScene(ref as never, e, n);
      expect(z).toBeLessThan(KUNGSGATAN.z0); // strictly outside (north of) the pilot
      expect(x).toBeGreaterThanOrEqual(KUNGSGATAN.x0 - 0.001);
      expect(x).toBeLessThanOrEqual(KUNGSGATAN.x1);
    }
    // D and E share the seam across Kungsgatan.
    const shared = A2_ZONES.E.ring.filter((p) =>
      A2_ZONES.D.ring.some((q) => q[0] === p[0] && q[1] === p[1]),
    );
    expect(shared).toHaveLength(2);
  });
  test('every A2 fixture lies in its zone; none in A1 or a pilot area; no earlier fixture lies in an A2 zone', () => {
    for (const f of output.fixtures) {
      const [e, n] = sceneToSweref(ref as never, f.x, f.z);
      expect(zoneOfEN(e, n), f.id).toBe(f.zone);
      expect(inA1(e, n), f.id).toBe(false);
      expect(inPilot(f.x, f.z), f.id).toBe(false);
    }
    for (const r of a1RuntimeLightingRegistry(terrain).fixtures)
      expect(zoneOfEN(r.position.e, r.position.n), r.id).toBeNull();
  });
  test('exclusions: untagged carriageways and paths, platforms and the rest of Kungstorget get no fixture', () => {
    const used = new Set(output.provenance.map((p) => p.source.element));
    const unknown = output.unknownWays.map((u) => u.way);
    // Norra Promenaden carriageway pieces at the Norrtull stop without a lit tag (unknown, not lit=no).
    for (const w of [286445696, 300186798, 1050773512]) {
      expect(unknown).toContain(w);
      expect(used.has(`way/${w}`)).toBe(false);
    }
    for (const u of unknown) expect(used.has(`way/${u}`)).toBe(false);
    for (const w of output.ways.filter((w) => w.highway === 'platform')) expect(w.fixtures).toBe(0);
    for (const w of [312490062, 312486752, 286445688, 684962393, 163928046, 308315550, 286445686])
      expect(used.has(`way/${w}`), `Kungstorget way/${w}`).toBe(false);
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
          expect(d, `${f.id} tram`).toBeGreaterThanOrEqual(A2_POLICY.tramClearanceM);
        if (r.kind === 'rail')
          expect(d, `${f.id} rail`).toBeGreaterThanOrEqual(A2_POLICY.railClearanceM);
        if (r.kind === 'road')
          expect(d, `${f.id} way/${r.way}`).toBeGreaterThanOrEqual(
            (r.width * M) / 2 + A2_POLICY.carriagewayClearanceM - 1e-9,
          );
      }
    }
  });
  test('supports: every base on the rendered ground at the terrain height (no floating or buried pole), mounting heights from the type table', () => {
    const { lighting, dispose } = make(a2LightingRegistry(terrain));
    lighting.fixtures.forEach((f, i) => {
      const l = lighting.lamps[i];
      expect(f.mount.kind).toBe('ground');
      expect(l.baseY).toBe(terrain.groundHeight(f.x, f.z));
      expect(l.clipBelow).toBe(false);
      // Emitter at the type's lens height above the support; record height = Step 6 type table.
      expect(l.y - l.baseY).toBeCloseTo(emitterPosition(f, 0, M)[1], 12);
      expect(f.heightM).toBe(input.types[f.type].heightM);
    });
    dispose();
  });
  test('no A2 lamp can reach a bridge deck (nearest outline beyond the lamp range): no under-deck leakage is possible', () => {
    for (const f of output.fixtures)
      for (const b of input.bridges)
        for (const [a, c] of edges(b.ring))
          expect(segDist([f.x, f.z], a, c) * M, `${f.id} ${b.name}`).toBeGreaterThan(f.rangeM);
  });
  test('occlusion sectors are measured from the emitter (the A1 new-fixture convention), not the pole base', () => {
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
    let differs = 0;
    for (const f of output.fixtures) {
      const [ex, , ez] = emitterPosition(f as unknown as FixtureRecord, 0, M);
      // The generator measures before the stored position is rounded to 0.1 mm: ±0.02 m.
      const dev = (a: number[]) => Math.max(...a.map((v, k) => Math.abs(v - f.occlusionM[k])));
      expect(dev(sectors([ex, ez], f.rangeM)), f.id).toBeLessThanOrEqual(0.02);
      if (dev(sectors([f.x, f.z], f.rangeM)) > 0.1) differs++;
    }
    expect(differs).toBeGreaterThan(0); // the convention matters for bracket arms near walls
  });
});

describe('cross-phase identity and duplicate prevention', () => {
  const earlier = a1RuntimeLightingRegistry(terrain);
  const earlierIds = new Set(earlier.fixtures.map((r) => r.id));
  test('A2 identities are disjoint from the pilot and A1 (canonical and runtime IDs)', () => {
    for (const r of a2LightingRegistry(terrain).fixtures) {
      expect(earlierIds.has(r.id)).toBe(false);
      expect(earlier.fixtures.some((e) => e.runtimeId === r.runtimeId)).toBe(false);
    }
  });
  test('no new estimate doubles an earlier one: ≥ 3 m from any earlier fixture, ≥ 0.55 × spacing from an earlier estimate of its class', () => {
    const cls = (t: string) =>
      t === 'street-bracket-8m' ? 'road' : t === 'street-bracket-6m' ? 'minor' : 'path';
    for (const f of output.fixtures)
      for (const e of input.existing) {
        const d = Math.hypot(f.x - e.x, f.z - e.z) * M;
        expect(d, `${f.id} vs ${e.id}`).toBeGreaterThanOrEqual(A2_POLICY.anySeparationM);
        if (e.placement === 'estimated' && cls(e.type) === cls(f.type))
          expect(d, `${f.id} vs ${e.id}`).toBeGreaterThanOrEqual(
            A2_POLICY.estimateSeparationFactor * input.types[f.type].spacingM,
          );
      }
  });
  test('ways shared with A1 continue its station sequence: no station slot exists twice', () => {
    const slots = new Set(
      [...earlierIds]
        .filter((id) => id.startsWith('estimate:lighting-a1-v1:way/'))
        .map((id) => id.split(':').slice(2).join(':')),
    );
    const shared = output.fixtures.filter((f) => slots.has(f.id.split(':').slice(2).join(':')));
    expect(shared).toEqual([]);
    // Norra Promenaden way 4384887: A1 renders s0, A2 s1 and s2.
    expect(earlierIds.has('estimate:lighting-a1-v1:way/4384887:s0')).toBe(true);
    expect(output.fixtures.filter((f) => f.id.includes('way/4384887:')).map((f) => f.id)).toEqual([
      'estimate:lighting-a2-v1:way/4384887:s1',
      'estimate:lighting-a2-v1:way/4384887:s2',
    ]);
  });
  test('identity guards: a station slot or OSM node already rendered by an earlier rollout is never imported again', () => {
    const victim = output.fixtures.find((f) => f.id.includes('way/286445690:s1'))!;
    const slot = {
      id: 'estimate:lighting-a1-v1:way/286445690:s1',
      x: 999,
      z: 999,
      type: victim.type,
      placement: 'estimated' as const,
      element: 'way/286445690',
    };
    const node = {
      type: 'node' as const,
      id: 42,
      version: 1,
      timestamp: 'test',
      tags: { highway: 'street_lamp' },
    };
    const [lat, lon] = terrain.unproject(victim.x + 0.4, victim.z + 0.4);
    const out = generateCorridor(
      {
        ...input,
        source: { ...input.source, elements: [...input.source.elements, { ...node, lat, lon }] },
        existing: [
          ...input.existing,
          slot,
          { id: 'osm:node/42', x: 999, z: 999, type: 'park-lantern-4m', placement: 'mapped' },
        ],
      },
      A2_SPEC,
    );
    expect(out.fixtures.map((f) => f.id)).not.toContain(victim.id);
    expect(out.fixtures.map((f) => f.id)).not.toContain('osm:node/42');
    expect(out.rejected).toContainEqual(
      expect.objectContaining({ candidate: victim.id, reason: 'identity-in-existing-set' }),
    );
    expect(out.rejected).toContainEqual(
      expect.objectContaining({ candidate: 'osm:node/42', reason: 'identity-in-existing-set' }),
    );
  });
  test('the pilot seam: Kungsgatan station s0 yields to the pilot bracket it would double; nothing else is suppressed by an earlier rollout', () => {
    const byExisting = output.rejected.filter((r) => r.reason === 'suppressed-by-existing');
    expect(byExisting.map((r) => [r.candidate, r.detail])).toEqual([
      [
        'estimate:lighting-a2-v1:way/297613947:s0',
        'estimate:step6-pilot-v1:way/444474488:s0 at 15.5 m',
      ],
    ]);
  });
  test('the earlier records are inputs only: the generator never changes them', () => {
    const before = JSON.stringify(existingBeforeA2(ref));
    generateA2(input);
    expect(JSON.stringify(existingBeforeA2(ref))).toBe(before);
    expect(JSON.stringify(input.existing)).toBe(before);
  });
});

describe('combined runtime set (pilot + A1 + A2)', () => {
  const runtime = runtimeLightingRegistry(terrain);
  const before = a1RuntimeLightingRegistry(terrain);
  test('validates as one set: 267 fixtures (20 mapped, 247 estimated), unique IDs, three rollouts', () => {
    const v = validateRegistry(runtime, { reference: ref, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    expect(v.counts).toMatchObject({ fixtures: 267, mapped: 20, estimated: 247 });
    expect(new Set(runtime.fixtures.map((r) => r.runtimeId)).size).toBe(267);
  });
  test('the 232 earlier records are unchanged by the merge (deep-equal, same order)', () => {
    expect(runtime.fixtures.slice(0, 232)).toEqual(before.fixtures);
    expect(runtime.fixtures.slice(0, 105)).toEqual(pilotLightingRegistry(terrain).fixtures);
    expect(runtime.fixtures.slice(105, 232)).toEqual(a1LightingRegistry(terrain).fixtures);
  });
  const { lighting } = make();
  const prior = make(before);
  const ids = lighting.fixtures.map((f) => f.id);
  const row = (l: typeof lighting, i: number) => {
    const rows = l.uniforms.cityLampRows.value;
    const block = Math.floor(i / rows);
    const width = l.uniforms.cityLampTex.value.image.width;
    const o = ((i - block * rows) * width + block * LAMP_TEXELS) * 4;
    return Array.from(
      (l.uniforms.cityLampTex.value.image.data as Float32Array).subarray(o, o + LAMP_TEXELS * 4),
    );
  };
  test('every one of the 232 earlier lamp rows is bit-identical inside the combined set (and the 105 pilot rows equal the frozen baseline)', () => {
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
    expect([n, pilot]).toEqual([232, 105]);
  });
  test('every cell of the A1 state keeps all its lamps; cells that gain lamps gain only A2 lamps', () => {
    const a2Ids = new Set(a2LightingRegistry(terrain).fixtures.map((r) => r.id));
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
        expect(now.filter((id) => !a2Ids.has(id)).sort(), `${cx},${cz}`).toEqual([...was].sort());
        if (now.length > was.length) gained++;
      }
    expect(cells).toBeGreaterThan(500);
    expect(gained).toBeGreaterThan(0);
  });
  test('capacity: accepted, ≤ 16 per cell, no overflow; every cell an A2 lamp reaches holds ≤ 9', () => {
    const stats = lighting.index!.stats;
    expect(lighting.describe().streetLighting.status).toBe('ok');
    expect(stats.overflowCells).toBe(0);
    expect(stats.maxRawOccupancy).toBe(15); // unchanged: A1's square with 8 mapped lamps
    expect(stats.histogram.slice(STEP6_MAX_PER_CELL + 1).every((n) => n === 0)).toBe(true);
    const a2 = new Set(a2LightingRegistry(terrain).fixtures.map((r) => r.id));
    let max = 0;
    for (let cx = -32; cx <= -14; cx++)
      for (let cz = -30; cz <= -10; cz++) {
        const here = lookupLamps(lighting.index!, cx + 0.5, cz + 0.5).map((i) => ids[i]);
        if (here.some((id) => a2.has(id))) max = Math.max(max, here.length);
      }
    expect(max).toBe(9);
  });
  test('pilot visuals keep the frozen instance transforms; every A1 housing keeps its transform', () => {
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
    expect(was.size).toBe(232);
    for (const [id, t] of was) expect(now.near.get(id)?.matrix, id).toBe(t.matrix);
  });
  test('pinned combined output matches the A2 manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync('docs/lighting-phase-a2/data/manifest.json', 'utf8'),
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
  test('A2 records join the fixed 800 m chunk groups; no new group, pilot groups keep their names', () => {
    for (const r of a2LightingRegistry(terrain).fixtures) {
      expect(r.group).toBe(groupKey(r.position.scene.x, r.position.scene.z));
      expect(r.group).toBe('chunk:-1,-1');
    }
    expect([...new Set(runtime.fixtures.map((r) => r.group))].sort()).toEqual([
      'chunk:-1,-1',
      'chunk:0,-1',
      'idrottsparken',
      'kungsgatan',
      'stromparken',
    ]);
  });
  test('grouping never hides a nearby lamp around A2 and its seams (pilot group ↔ chunk group)', () => {
    const r = rng(7);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const position = new Vector3(-29 + r() * 14, 0.2 + r() * 3, -28 + r() * 18);
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
  test('cross-corridor influence: indexed lookup equals brute force at the seams; A2 lamps light receivers owned by A1 and the pilot', () => {
    const a2 = new Set(a2LightingRegistry(terrain).fixtures.map((r) => r.id));
    let intoA1 = 0,
      intoPilot = 0,
      samples = 0;
    const check = (x: number, z: number) => {
      const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
      const indexed = lookupLamps(lighting.index!, x, z);
      let a = 0,
        b = 0;
      for (const i of indexed) a += lampLux(lighting.lamps[i], p, [0, 1, 0], M);
      lighting.lamps.forEach((l) => (b += lampLux(l, p, [0, 1, 0], M)));
      expect(a).toBeCloseTo(b, 9);
      samples++;
      const [e, n] = sceneToSweref(ref as never, x, z);
      for (const i of indexed)
        if (a2.has(ids[i]) && lampLux(lighting.lamps[i], p, [0, 1, 0], M) > 0) {
          if (inA1(e, n)) intoA1++;
          if (inPilot(x, z)) intoPilot++;
        }
    };
    for (let x = -19.5; x <= -17; x += 0.1) for (let z = -26.5; z <= -23; z += 0.1) check(x, z); // A1 seam
    for (let x = -25.5; x <= -23; x += 0.1) for (let z = -15.5; z <= -13.5; z += 0.1) check(x, z); // pilot seam
    expect(samples).toBeGreaterThan(1000);
    expect(intoA1).toBeGreaterThan(20);
    expect(intoPilot).toBeGreaterThan(20);
  });
  test('continuity: the lit connection has no dark seam; only the untagged Norrtull stretches stay dark', () => {
    const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8')) as {
      roads: { way: number; a: number[]; b: number[] }[];
    };
    const lux = (l: typeof lighting, x: number, z: number) => {
      const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
      return lookupLamps(l.index!, x, z).reduce(
        (s, i) => s + lampLux(l.lamps[i], p, [0, 1, 0], M),
        0,
      );
    };
    const along = (ways: number[], f: (x: number, z: number, way: number) => void) => {
      for (const w of ways)
        for (const r of map.roads.filter((r) => r.way === w)) {
          const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M;
          for (let s = 0; s <= L; s += 2)
            f(r.a[0] + ((r.b[0] - r.a[0]) * s) / L, r.a[1] + ((r.b[1] - r.a[1]) * s) / L, w);
        }
    };
    const untagged = [286445696, 300186798, 1050773512];
    const untaggedSegs = map.roads.filter((r) => untagged.includes(r.way));
    const nearUntagged = (x: number, z: number) =>
      untaggedSegs.some((r) => segDist([x, z], r.a, r.b) * M < 12);
    // Kungsgatan: from inside the pilot, across the pilot seam, to the Kungstorget junction.
    let minK = Infinity,
      darkBefore = 0;
    along([297613947, 297613948, 92385198], (x, z) => {
      minK = Math.min(minK, lux(lighting, x, z));
      if (lux(prior.lighting, x, z) < 0.5) darkBefore++;
    });
    expect(minK).toBeGreaterThan(8);
    expect(darkBefore).toBeGreaterThan(50);
    // Norra Promenaden lit carriageways from the A1 seam to Kungstorget (≥ 12 m from untagged pieces).
    let minN = Infinity;
    along([4384887, 286445690, 300186799, 4384888, 286445689], (x, z) => {
      if (!nearUntagged(x, z)) minN = Math.min(minN, lux(lighting, x, z));
    });
    expect(minN).toBeGreaterThan(3.5);
    // Evidence gap (documented): the untagged pieces keep their low level (< 1 lux in their middle).
    let gap = 0;
    along(untagged, (x, z) => {
      if (lux(lighting, x, z) < 1) gap++;
    });
    expect(gap).toBeGreaterThan(10);
  });
});

describe('rejection keeps the last valid set; lifecycle', () => {
  const runtime = runtimeLightingRegistry(terrain);
  const a2Fixture = runtime.fixtures.find((r) => r.id.startsWith('estimate:lighting-a2-v1'))!;
  const variant = (r: RegistryFixture, k: number): RegistryFixture => ({
    ...r,
    id: `estimate:lighting-a2-v1:test/${k}`,
    runtimeId: `estimate:lighting-a2-v1:test/${k}`,
  });
  test('MAX_PER_CELL + 1 (33) lamps crowding one A2 cell are rejected as a capacity conflict; the 267-fixture set stays rendered', () => {
    const { lighting, dispose } = make();
    const before = lighting.uniforms.cityLampTex.value;
    const crowd = Array.from({ length: MAX_PER_CELL + 1 }, (_, k) => variant(a2Fixture, k));
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
    expect(lighting.describe().fixtures).toBe(267);
    dispose();
  });
  test('an A2 record re-using an A1 canonical ID is rejected at the registry stage', () => {
    const { lighting, dispose } = make();
    const a1Record = a1LightingRegistry(terrain).fixtures[0];
    const result = lighting.replaceStreetLighting({
      ...runtime,
      fixtures: [...runtime.fixtures, { ...a2Fixture, id: a1Record.id, runtimeId: 'collision' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('registry');
    expect(lighting.describe().fixtures).toBe(267);
    dispose();
  });
  test('10 alternating replacements A1 state ↔ A1 + A2 keep exactly one live set and constant resources', () => {
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
    const sizes = { a1: new Set<number>(), a2: new Set<number>() };
    for (let k = 0; k < 10; k++) {
      const kind = k % 2 ? 'a2' : 'a1';
      const registry =
        kind === 'a1' ? a1RuntimeLightingRegistry(terrain) : runtimeLightingRegistry(terrain);
      expect(lighting.replaceStreetLighting(registry).ok).toBe(true);
      const now = owned();
      for (const r of now) if (!live.has(r)) track(r as never);
      expect([...live].every((r) => now.has(r))).toBe(true);
      sizes[kind].add(live.size);
      expect(lighting.describe().fixtures).toBe(kind === 'a1' ? 232 : 267);
    }
    expect(sizes.a1.size).toBe(1);
    expect(sizes.a2.size).toBe(1);
    dispose();
    expect([...live]).toEqual([]);
  });
});
