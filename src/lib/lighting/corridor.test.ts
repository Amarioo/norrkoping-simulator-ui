/**
 * Lighting Phase A1 (central corridor): reproducible generation, geographic placement rules, pilot
 * preservation inside the combined set, capacity, identity collisions, invalid data, grouping,
 * cross-group illumination, set replacement lifecycle and source precedence.
 *
 * Phase A2: the controller default is now pilot + A1 + A2; these tests keep verifying the accepted A1
 * state (pilot + A1, 232 fixtures) through a1RuntimeLightingRegistry. A2 tests: corridorA2.test.ts.
 */
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  BufferGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { sceneToSweref } from '../geo/sweref99tm.js';
import { ROAD_SURFACE, terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { LAMP_TEXELS, MAX_PER_CELL } from './cityLights';
import { STEP6_MAX_PER_CELL, toStep6SlotPayload } from './legacyGrid';
import {
  a1LightingRegistry,
  a1RuntimeLightingRegistry as runtimeLightingRegistry,
  createCityLighting,
  pilotLightingRegistry,
} from './controller';
import { A1_ZONES, GROUP_CHUNK_CELLS, groupKey, inRing, zoneOfEN } from './corridorA1';
import { A1_POLICY, generateCorridor, type GeneratorInput } from './corridorGenerator';
import { mergeRegistries, reconcileSources } from './corridorRegistry';
import { FIXTURE_TYPES, POLE_DETAIL } from './fixtures';
import { lookupLamps } from './lightIndex';
import { lampLux } from './reference';
import { validateRegistry, type LightingRegistry, type RegistryFixture } from './registry';
import baseline from './testdata/pilot-baseline.json';
import { byGeometry, frozenByGeometry, gatheredTransforms, shownAt } from './testVisuals';

const PILOT_GROUPS = new Set(['kungsgatan', 'stromparken', 'idrottsparken']);
import a1Data from '../data/streetlights-a1.json';
import { loadInputs, toFiles } from '../../../scripts/lighting-a1/inputs';
import { PILOTS } from '../../../scripts/step6/pilots.mjs';

const M = terrain.data.reference.metresPerUnit;
const ref = terrain.data.reference;
const input = loadInputs();
const output = generateCorridor(input);
const a1 = a1Data as unknown as { fixtures: typeof output.fixtures };
const fakeRenderer = () =>
  ({ toneMappingExposure: 1, info: { programs: [] } }) as unknown as WebGLRenderer;
const make = (registry: LightingRegistry = runtimeLightingRegistry(terrain), strict = true) => {
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    renderer: fakeRenderer(),
    scene: new Scene(),
    registry,
    strict,
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
const segDist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};

describe('A1 generation is reproducible and order-independent', () => {
  test('committed runtime and provenance files equal a fresh generation, byte for byte', () => {
    const files = toFiles(output, input);
    expect(fs.readFileSync('src/lib/data/streetlights-a1.json', 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync('src/lib/data/streetlights-a1-provenance.json', 'utf8')).toBe(
      files.provenance,
    );
  });
  test('the source extract is the pinned Step 6.2 snapshot (base and SHA-256)', () => {
    const meta = input.source.meta as unknown as { osmBase: string; snapshot: { sha256: string } };
    const manifest = JSON.parse(
      fs.readFileSync('docs/step62/evidence/source-manifest.json', 'utf8'),
    );
    expect(meta.osmBase).toBe('2026-10-23T09:05:06Z');
    expect(meta.snapshot.sha256).toBe(
      manifest.files.find(
        (f: { localPath: string }) => f.localPath === 'work/step62/osm-research.json',
      ).sha256,
    );
  });
  test('shuffling every input list (source, roads, buildings, areas, bridges, platforms, pilot, occluders) changes nothing', () => {
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
      expect(JSON.stringify(generateCorridor(s))).toBe(reference);
    }
  });
  test('counts: 127 fixtures, 10 mapped and 117 estimated, in zones A/B/C', () => {
    expect(output.counts).toMatchObject({
      fixtures: 127,
      mapped: 10,
      estimated: 117,
      zoneA: 72,
      zoneB: 37,
      zoneC: 18,
      deck: 6,
    });
    expect(a1.fixtures).toHaveLength(127);
    // Every fixture has exactly one provenance record; estimate IDs carry the A1 generator version.
    expect(output.provenance.map((p) => p.id)).toEqual(output.fixtures.map((f) => f.id));
    for (const f of output.fixtures)
      expect(f.id).toMatch(/^(osm:node\/\d+|estimate:lighting-a1-v1:way\/\d+:s\d+)$/);
  });
});

describe('geographic placement rules', () => {
  const ways = new Map(
    input.source.elements.filter((e) => e.type === 'way').map((e) => [`way/${e.id}`, e]),
  );
  test('every fixture lies inside its corridor zone (EPSG:3006)', () => {
    for (const f of output.fixtures) {
      const [e, n] = sceneToSweref(ref as never, f.x, f.z);
      expect(zoneOfEN(e, n), f.id).toBe(f.zone);
    }
  });
  test('estimates derive only from lit=yes ways; lit=no and untagged ways get none', () => {
    const litNo = output.ways.filter((w) => w.lit === 'no');
    expect(litNo.map((w) => w.way)).toContain(8237045); // Magasinsgatan
    for (const w of litNo) expect(w.fixtures).toBe(0);
    for (const p of output.provenance) {
      if (p.rule === 'mapped-osm-node') {
        expect(p.source.tags.highway).toBe('street_lamp');
        continue;
      }
      expect(ways.get(p.source.element)?.tags.lit, p.id).toBe('yes');
    }
    // Rendered ways inside the corridor without a lit tag are reported and never lit.
    expect(output.unknownWays.length).toBeGreaterThan(20);
    const used = new Set(output.provenance.map((p) => p.source.element));
    for (const u of output.unknownWays) expect(used.has(`way/${u.way}`)).toBe(false);
    // Platforms and pedestrian areas are not lit by invented fixtures.
    for (const w of output.ways.filter((w) => w.highway === 'platform' || /area/.test(w.status)))
      expect(w.fixtures).toBe(0);
  });
  test('no fixture inside a building, water, a platform or under a deck; estimates keep tram, rail and carriageway clearance', () => {
    const near = (p: number[]) => (r: { a: number[]; b: number[] }) =>
      segDist(p, r.a, r.b) < 3 || segDist(p, r.b, r.a) < 3;
    for (const f of output.fixtures) {
      const p = [f.x, f.z];
      for (const b of input.map.buildings.filter((b) =>
        b.rings[0]?.some((q) => Math.abs(q[0] - f.x) < 2 && Math.abs(q[1] - f.z) < 2),
      ))
        expect(
          inRing(p, b.rings[0]) && !b.rings.slice(1).some((r) => inRing(p, r)),
          `${f.id} in ${b.id}`,
        ).toBe(false);
      for (const pl of input.platforms)
        expect(inRing(p, pl.ring), `${f.id} on platform`).toBe(false);
      if (f.mount.kind === 'ground') {
        for (const a of input.map.areas.filter((a) => a.kind === 'water'))
          expect(
            inRing(p, a.rings[0]) && !a.rings.slice(1).some((r) => inRing(p, r)),
            `${f.id} in water`,
          ).toBe(false);
        for (const b of input.bridges)
          expect(inRing(p, b.ring), `${f.id} under ${b.name}`).toBe(false);
      } else {
        // Deck fixtures stand on their deck segment and inside the deck outline.
        expect(segDist(p, f.mount.segment.a, f.mount.segment.b) * M).toBeLessThan(5);
        expect(
          input.bridges.some((b) => inRing(p, b.ring)),
          `${f.id} off deck`,
        ).toBe(true);
      }
      if (f.placement !== 'estimated') continue;
      const local = input.map.roads.filter(near(p));
      for (const r of local) {
        const d = segDist(p, r.a, r.b) * M;
        if (r.kind === 'tram')
          expect(d, `${f.id} tram`).toBeGreaterThanOrEqual(A1_POLICY.tramClearanceM);
        if (r.kind === 'rail')
          expect(d, `${f.id} rail`).toBeGreaterThanOrEqual(A1_POLICY.railClearanceM);
        if (r.kind === 'road' && !(f.mount.kind === 'bridge' && r.way === f.mount.segment.way))
          expect(d, `${f.id} carriageway way/${r.way}`).toBeGreaterThanOrEqual(
            (r.width * M) / 2 + A1_POLICY.carriagewayClearanceM - 1e-9,
          );
      }
    }
  });
  test('supports: ground bases on the rendered ground, deck bases on the deck profile (no floating or buried pole)', () => {
    const { lighting, dispose } = make(a1LightingRegistry(terrain));
    lighting.fixtures.forEach((f, i) => {
      const l = lighting.lamps[i];
      if (f.mount.kind === 'ground') expect(l.baseY).toBe(terrain.groundHeight(f.x, f.z));
      else {
        const s = f.mount.segment;
        expect(l.baseY).toBeCloseTo(
          terrain.profileHeight([s.a[0], s.yA, s.a[1]], [s.b[0], s.yB, s.b[1]], s.t) + ROAD_SURFACE,
          12,
        );
        expect(l.clipBelow).toBe(true);
      }
      expect((l.y - l.baseY) * M).toBeGreaterThan(3.5);
    });
    dispose();
  });
  test('no light reaches the surface under Saltängsbron through its deck (ray test, CPU shader reference)', () => {
    const { lighting, dispose } = make();
    const br = input.bridges.find((b) => b.name === 'Saltängsbron')!;
    const decks = input.map.roads.filter((r) => r.bridge && [47460598, 501428826].includes(r.way));
    const deckTop = (x: number, z: number) => {
      let best: { d: number; y: number } | null = null;
      for (const r of decks) {
        const dx = r.b[0] - r.a[0],
          dz = r.b[1] - r.a[1],
          l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / l2));
        const d = Math.hypot(x - r.a[0] - t * dx, z - r.a[1] - t * dz);
        const y = terrain.profileHeight([r.a[0], r.yA, r.a[1]], [r.b[0], r.yB, r.b[1]], t);
        if (!best || d < best.d) best = { d, y };
      }
      return best!.y;
    };
    const xs = br.ring.map((q) => q[0]),
      zs = br.ring.map((q) => q[1]);
    let covered = 0,
      worst = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.04)
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.04) {
        if (!inRing([x, z], br.ring)) continue;
        const y = Math.max(terrain.surfaceHeight(x, z), terrain.waterHeight(x, z));
        if ((deckTop(x, z) - y) * M < 2) continue;
        covered++;
        for (const l of lighting.lamps) {
          const lux = lampLux(l, [x, y, z], [0, 1, 0], M);
          if (lux <= 0) continue;
          // Leak = the emitter→receiver segment enters the outline below the deck top from above it.
          for (let k = 1; k < 200; k++) {
            const u = k / 200,
              qx = l.x + (x - l.x) * u,
              qz = l.z + (z - l.z) * u,
              qy = l.y + (y - l.y) * u;
            if (!inRing([qx, qz], br.ring)) continue;
            if (qy < deckTop(qx, qz)) {
              const pu = (k - 1) / 200,
                px = l.x + (x - l.x) * pu,
                pz = l.z + (z - l.z) * pu;
              if (inRing([px, pz], br.ring) && l.y + (y - l.y) * pu >= deckTop(px, pz))
                worst = Math.max(worst, lux);
              break;
            }
          }
        }
      }
    expect(covered).toBeGreaterThan(1000);
    // No light through the deck (road surfaces under a lamp: ~25 lux). Without the deck occluders: 1.96 lux.
    expect(worst).toBe(0);
    dispose();
  });
  test('the corridor stays clear of the Step 6 pilot areas', () => {
    for (const f of output.fixtures)
      for (const p of PILOTS) {
        const { x0, x1, z0, z1 } = p.bounds;
        expect(f.x >= x0 && f.x <= x1 && f.z >= z0 && f.z <= z1, `${f.id} in ${p.id}`).toBe(false);
      }
  });
});

describe('combined runtime set (pilot + A1)', () => {
  const runtime = runtimeLightingRegistry(terrain);
  test('validates as one set: 232 fixtures, unique canonical and runtime IDs, disjoint rollouts', () => {
    const v = validateRegistry(runtime, { reference: ref, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    expect(v.counts).toMatchObject({ fixtures: 232, mapped: 20, estimated: 212 });
    const pilotIds = new Set(pilotLightingRegistry(terrain).fixtures.map((r) => r.id));
    const a1Ids = a1LightingRegistry(terrain).fixtures.map((r) => r.id);
    expect(a1Ids.filter((id) => pilotIds.has(id))).toEqual([]);
    expect(new Set(runtime.fixtures.map((r) => r.runtimeId)).size).toBe(232);
  });
  test('pilot records are unchanged by the merge (deep-equal)', () => {
    expect(runtime.fixtures.slice(0, 105)).toEqual(pilotLightingRegistry(terrain).fixtures);
  });
  const { lighting } = make();
  const ids = lighting.fixtures.map((f) => f.id);
  const lampData = lighting.uniforms.cityLampTex.value.image.data as Float32Array;
  const rows = lighting.index!.stats;
  test('capacity: accepted with at most 16 contributing lamps per cell (no overflow)', () => {
    const d = lighting.describe().streetLighting;
    expect(d.status).toBe('ok');
    expect(rows.overflowCells).toBe(0);
    expect(rows.maxRawOccupancy).toBeLessThanOrEqual(STEP6_MAX_PER_CELL);
    expect(rows.maxRawOccupancy).toBe(15);
    expect(rows.histogram.slice(STEP6_MAX_PER_CELL + 1).every((n) => n === 0)).toBe(true);
  });
  test('every pilot lamp row is bit-identical to the frozen baseline inside the combined set', () => {
    const frozen = baseline.lampRows as Record<string, number[]>;
    let n = 0;
    ids.forEach((id, i) => {
      if (!frozen[id]) return;
      const block = Math.floor(i / lighting.uniforms.cityLampRows.value);
      const row = i - block * lighting.uniforms.cityLampRows.value;
      const width = lighting.uniforms.cityLampTex.value.image.width;
      const o = (row * width + block * LAMP_TEXELS) * 4;
      expect(Array.from(lampData.subarray(o, o + LAMP_TEXELS * 4)), id).toEqual(frozen[id]);
      n++;
    });
    expect(n).toBe(105);
  });
  test('every frozen pilot cell keeps its lamps; A1 adds none to them', () => {
    const cells = baseline.grid.cells as Record<string, string[]>;
    let gained = 0;
    for (const [key, frozen] of Object.entries(cells)) {
      const [cx, cz] = key.split(',').map(Number);
      const got = lookupLamps(lighting.index!, cx + 0.5, cz + 0.5).map((i) => ids[i]);
      expect(got.filter((id) => frozen.includes(id)).sort(), key).toEqual([...frozen].sort());
      if (got.length > frozen.length) gained++;
    }
    expect(gained).toBe(0);
  });
  test('pilot fixture visuals (housings, lenses, halos) keep the frozen instance transforms', () => {
    // Phase L1: visuals are gathered per fixture (testVisuals.ts); the pilot's housings, lenses and
    // halos inside the combined set must reproduce the frozen transforms per geometry, bit for bit.
    const pilotIds = new Set(
      lighting.fixtures.filter((f) => PILOT_GROUPS.has(f.pilot)).map((f) => f.id),
    );
    expect(pilotIds.size).toBe(105);
    const now = byGeometry(gatheredTransforms(lighting), pilotIds);
    expect(now).toEqual(frozenByGeometry(baseline.visuals));
  });
  test('pinned combined output matches the A1 manifest', () => {
    const manifest = JSON.parse(fs.readFileSync('docs/lighting-phase-a1/data/manifest.json', 'utf8'));
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
    for (const seed of [1, 2, 3])
      expect(hash({ ...runtime, fixtures: shuffled(runtime.fixtures, seed) })).toEqual(reference);
  });
  test('A1 fixtures are grouped by fixed 800 m chunks; pilot groups keep their names', () => {
    const groups = new Set(runtime.fixtures.map((r) => r.group));
    expect([...groups].sort()).toEqual([
      'chunk:-1,-1',
      'chunk:0,-1',
      'idrottsparken',
      'kungsgatan',
      'stromparken',
    ]);
    for (const r of a1LightingRegistry(terrain).fixtures)
      expect(r.group).toBe(groupKey(r.position.scene.x, r.position.scene.z));
    expect(GROUP_CHUNK_CELLS % lighting.index!.chunkCells).toBe(0);
  });
  test('grouping never hides a nearby lamp: every fixture within the detail distance has its housing drawn', () => {
    const r = rng(5);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      // Cameras around the A1 corridor and its seams with the chunk boundary x = 0.
      const position = new Vector3(-20 + r() * 26, 0.2 + r() * 3, -34 + r() * 26);
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
  test('lamps illuminate receivers across group (chunk) boundaries', () => {
    const groupOf = new Map(runtime.fixtures.map((r) => [r.runtimeId, r.group]));
    let crossing = 0;
    for (let x = -1.5; x <= 1.5; x += 0.1)
      for (let z = -31.5; z <= -28; z += 0.1) {
        const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
        const receiver = groupKey(x, z);
        for (const i of lookupLamps(lighting.index!, x, z))
          if (groupOf.get(ids[i]) !== receiver && lampLux(lighting.lamps[i], p, [0, 1, 0], M) > 0)
            crossing++;
      }
    expect(crossing).toBeGreaterThan(50);
  });
});

describe('rejection keeps the last valid set', () => {
  const runtime = runtimeLightingRegistry(terrain);
  const corridorFixture = runtime.fixtures.find((r) => r.id.startsWith('estimate:lighting-a1-v1'))!;
  const variant = (
    r: RegistryFixture,
    k: number,
    patch: Partial<RegistryFixture> = {},
  ): RegistryFixture => ({
    ...r,
    id: `estimate:lighting-a1-v1:test/${k}`,
    runtimeId: `estimate:lighting-a1-v1:test/${k}`,
    ...patch,
  });
  test('an ID colliding with the pilot is rejected at the registry stage; the previous textures stay bound', () => {
    const { lighting, dispose } = make();
    const before = lighting.uniforms.cityGridTex.value;
    const pilotRecord = runtime.fixtures[0];
    const result = lighting.replaceStreetLighting({
      ...runtime,
      fixtures: [
        ...runtime.fixtures,
        { ...corridorFixture, id: pilotRecord.id, runtimeId: 'collision' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('registry');
    expect(lighting.uniforms.cityGridTex.value).toBe(before);
    expect(lighting.describe().streetLighting.status).toBe('rendering-previous');
    expect(lighting.describe().fixtures).toBe(232);
    dispose();
  });
  test('MAX_PER_CELL + 1 (33) lamps crowding one corridor cell are rejected as a capacity conflict with the full raw list', () => {
    const { lighting, dispose } = make();
    const before = lighting.uniforms.cityLampTex.value;
    const crowd = Array.from({ length: MAX_PER_CELL + 1 }, (_, k) => variant(corridorFixture, k));
    const result = lighting.replaceStreetLighting({
      ...runtime,
      fixtures: [...runtime.fixtures, ...crowd],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('capacity');
    const c = result.conflicts.find((c) => c.raw.includes(crowd[0].id))!;
    expect(c.raw.length).toBeGreaterThan(MAX_PER_CELL);
    for (const r of crowd) expect(c.raw).toContain(r.id);
    expect(lighting.uniforms.cityLampTex.value).toBe(before);
    expect(lighting.replaceStreetLighting(runtime).ok).toBe(true);
    expect(lighting.describe().streetLighting.status).toBe('ok');
    dispose();
  });
  test('invalid geographic data is rejected: outside the map, non-finite, inconsistent E/N, explicitly unlit source, bad deck station', () => {
    const { lighting, dispose } = make();
    const bridgeFixture = runtime.fixtures.find(
      (r) => r.support.kind === 'bridge-deck' && r.id.startsWith('estimate:lighting-a1'),
    )!;
    const cases: [string, RegistryFixture][] = [
      [
        'outside',
        variant(corridorFixture, 1, {
          position: { ...corridorFixture.position, e: 0, n: 0, scene: { x: -22700, z: 259800 } },
        }),
      ],
      ['nan', variant(corridorFixture, 2, { position: { ...corridorFixture.position, e: NaN } })],
      [
        'moved',
        variant(corridorFixture, 3, {
          position: { ...corridorFixture.position, e: corridorFixture.position.e + 5 },
        }),
      ],
      [
        'deck',
        variant(bridgeFixture, 4, {
          support: {
            ...(bridgeFixture.support as Extract<
              RegistryFixture['support'],
              { kind: 'bridge-deck' }
            >),
            segment: {
              ...(
                bridgeFixture.support as Extract<
                  RegistryFixture['support'],
                  { kind: 'bridge-deck' }
                >
              ).segment,
              t: 1.5,
            },
          },
        }),
      ],
    ];
    for (const [name, bad] of cases) {
      const result = lighting.replaceStreetLighting({
        ...runtime,
        fixtures: [...runtime.fixtures, bad],
      });
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.stage, name).toBe('registry');
    }
    // A record derived from an explicitly unlit way (Magasinsgatan, lit=no) is rejected.
    const unlit = validateRegistry(
      {
        ...runtime,
        fixtures: [
          ...runtime.fixtures,
          variant(corridorFixture, 5, {
            source: { ...corridorFixture.source, element: 'way/8237045' },
          }),
        ],
      },
      { reference: ref, supportedTypes: FIXTURE_TYPES, unlitElements: new Set(['way/8237045']) },
    );
    expect(unlit.errors.map((e) => e.message)).toContain(
      'derived from explicitly unlit way/8237045',
    );
    expect(lighting.describe().streetLighting.emitters).toBe(232);
    dispose();
  });
});

describe('lifecycle with the expanded set', () => {
  test('10 alternating replacements pilot ↔ pilot + A1 keep exactly one live set and constant resources', () => {
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
    const sizes = { pilot: new Set<number>(), runtime: new Set<number>() };
    for (let k = 0; k < 10; k++) {
      const kind = k % 2 ? 'runtime' : 'pilot';
      const registry =
        kind === 'pilot' ? pilotLightingRegistry(terrain) : runtimeLightingRegistry(terrain);
      expect(lighting.replaceStreetLighting(registry).ok).toBe(true);
      const now = owned();
      for (const r of now) if (!live.has(r)) track(r as never);
      expect([...live].every((r) => now.has(r))).toBe(true);
      sizes[kind].add(live.size);
      expect(lighting.describe().fixtures).toBe(kind === 'pilot' ? 105 : 232);
    }
    expect(sizes.pilot.size).toBe(1);
    expect(sizes.runtime.size).toBe(1);
    dispose();
    expect([...live]).toEqual([]);
  });
});

describe('source precedence for future authoritative (municipal) data', () => {
  const pilot = pilotLightingRegistry(terrain);
  const a1r = a1LightingRegistry(terrain);
  const mapped = a1r.fixtures.find((r) => r.placement === 'mapped')!;
  const estimate = a1r.fixtures.find(
    (r) => r.placement === 'estimated' && r.id.includes('way/92459665'),
  )!;
  // Synthetic register records (test-only identities; no municipal ID is invented in runtime data).
  const register = (id: string, at: RegistryFixture): RegistryFixture => ({
    ...at,
    id,
    runtimeId: id,
    source: { dataset: 'test-register', element: null, snapshot: 'test', licence: 'test' },
  });
  const municipal = {
    ...a1r,
    sources: [{ id: 'test-register', dataset: 'test', license: 'test', snapshot: 'test' }],
    fixtures: [register('municipal:test/1', mapped), register('municipal:test/2', estimate)],
  };
  test('without a crosswalk or coverage nothing is merged, even at identical positions', () => {
    const r = reconcileSources([
      { name: 'pilot', registry: pilot },
      { name: 'a1', registry: a1r },
      { name: 'register', registry: municipal, authoritative: true, coverageEN: [] },
    ]);
    expect(r.errors).toContain('register: authoritative set without a coverage declaration');
    expect(r.superseded).toEqual([]);
    expect(r.registry.fixtures).toHaveLength(234);
  });
  test('crosswalk supersedes the OSM record; coverage supersedes estimates; mapped records without a crosswalk go to review', () => {
    const coverage = A1_ZONES.B.ring;
    const r = reconcileSources(
      [
        { name: 'pilot', registry: pilot },
        { name: 'a1', registry: a1r },
        { name: 'register', registry: municipal, authoritative: true, coverageEN: [coverage] },
      ],
      [{ from: mapped.id, to: 'municipal:test/1', basis: 'test: surveyed match' }],
    );
    expect(r.errors).toEqual([]);
    expect(r.superseded).toContainEqual({
      id: mapped.id,
      by: 'municipal:test/1',
      reason: 'crosswalk (test: surveyed match)',
    });
    const inB = a1r.fixtures.filter(
      (f) => f.placement === 'estimated' && zoneOfEN(f.position.e, f.position.n) === 'B',
    );
    for (const f of inB) expect(r.superseded.map((s) => s.id)).toContain(f.id);
    expect(r.review.length).toBe(9); // the other mapped OSM lamps in zone B
    // Pilot records outside the coverage are untouched.
    for (const f of pilot.fixtures) expect(r.registry.fixtures).toContain(f);
  });
  test('duplicate identities and unresolved or downgrading crosswalks are errors', () => {
    const dup = reconcileSources([
      { name: 'a', registry: a1r },
      { name: 'b', registry: mergeRegistries(a1r) },
    ]);
    expect(dup.ok).toBe(false);
    const bad = reconcileSources(
      [{ name: 'a1', registry: a1r }],
      [
        { from: 'osm:node/1', to: 'municipal:none', basis: 'x' },
        { from: mapped.id, to: estimate.id, basis: 'x' },
      ],
    );
    expect(bad.errors).toHaveLength(2);
  });
});
