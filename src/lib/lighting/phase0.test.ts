/**
 * Lighting Phase 0: parity with the frozen Step 6.1b output (testdata/pilot-baseline.json, written by
 * scripts/lighting-phase0/freeze-baseline.test.ts from commit bf5f726 before any Phase 0 change),
 * determinism, bounds/LOD, lifecycle, material rebinding and failure behaviour of the controller.
 */
import { describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  Box3,
  BufferGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { boundUniforms, LAMP_TEXELS, MAX_PER_CELL } from './cityLights';
import { createCityLighting, pilotLightingRegistry } from './controller';
import { FIXTURES, fixtureLamps, HALO_CULL_MARGIN, POLE_DETAIL } from './fixtures';
import { lookupLamps } from './lightIndex';
import { lampLux } from './reference';
import type { LightingRegistry } from './registry';
import baseline from './testdata/pilot-baseline.json';

const M = terrain.data.reference.metresPerUnit;
const fakeRenderer = (extra: Record<string, unknown> = {}) =>
  ({ toneMappingExposure: 1, info: { programs: [] }, ...extra }) as unknown as WebGLRenderer;
const make = (
  registry?: LightingRegistry,
  extra: Parameters<typeof createCityLighting>[0] extends infer O ? Partial<O> : never = {},
) => {
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    renderer: fakeRenderer(),
    scene: new Scene(),
    registry,
    ...extra,
  });
  return {
    stadium,
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
const shuffled = <T>(a: T[], seed: number) => {
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
const frozenCells = baseline.grid.cells as Record<string, string[]>;

describe('parity with the frozen Step 6.1b pilot', () => {
  const { lighting, dispose } = make();
  const index = lighting.index!;
  const runtimeIds = lighting.fixtures.map((f) => f.id);
  const lampData = lighting.uniforms.cityLampTex.value.image.data as Float32Array;
  test('same 105 fixtures; every packed lamp row (position, range, colour × cd, profile, orientation, support, occlusion) is bit-identical', () => {
    expect(lighting.fixtures).toHaveLength(105);
    expect([...runtimeIds].sort()).toEqual([...baseline.fixtureOrder].sort());
    const rows = baseline.lampRows as Record<string, number[]>;
    runtimeIds.forEach((id, i) =>
      expect(
        Array.from(lampData.subarray(i * LAMP_TEXELS * 4, (i + 1) * LAMP_TEXELS * 4)),
        id,
      ).toEqual(rows[id]),
    );
  });
  test('every non-empty legacy cell lists exactly the same lamps; no cell gains or loses one', () => {
    let cells = 0;
    for (const [key, ids] of Object.entries(frozenCells)) {
      const [cx, cz] = key.split(',').map(Number);
      const got = lookupLamps(index, cx + 0.5, cz + 0.5).map((i) => runtimeIds[i]);
      expect(new Set(got).size, key).toBe(got.length);
      expect([...got].sort(), key).toEqual([...ids].sort());
      cells++;
    }
    expect(cells).toBe(279);
    expect(index.stats.nonEmptyCells).toBe(279);
    expect(index.stats.maxRawOccupancy).toBe(baseline.grid.maxPerCell);
    expect(index.stats.overflowCells).toBe(0);
  });
  test('receivers across the pilot, cell boundaries and corners evaluate the frozen lamp set', () => {
    const r = rng(7);
    const { originX, originZ, columns, rows } = baseline.grid;
    const receivers: [number, number][] = [];
    for (let k = 0; k < 4000; k++) receivers.push([originX + r() * columns, originZ + r() * rows]);
    // Exact integer cell boundaries and corners, and points 1e-9 either side.
    for (let k = 0; k < 400; k++) {
      const x = originX + Math.floor(r() * columns),
        z = originZ + Math.floor(r() * rows);
      for (const dx of [-1e-9, 0, 1e-9])
        for (const dz of [-1e-9, 0, 1e-9]) receivers.push([x + dx, z + dz]);
    }
    for (const [x, z] of receivers) {
      const frozen = frozenCells[`${Math.floor(x)},${Math.floor(z)}`] ?? [];
      const got = lookupLamps(index, x, z).map((i) => runtimeIds[i]);
      expect([...got].sort(), `${x},${z}`).toEqual([...frozen].sort());
    }
  });
  test('independent brute force: the cell lookup misses no contributing lamp and counts none twice', () => {
    const r = rng(11);
    const lamps = lighting.lamps;
    let offPage = 0,
      lit = 0;
    for (let k = 0; k < 3000; k++) {
      const l = lamps[Math.floor(r() * lamps.length)];
      const a = r() * Math.PI * 2,
        d = (r() * l.rangeM * 1.05) / M;
      const x = l.x + Math.cos(a) * d,
        z = l.z + Math.sin(a) * d;
      const p: [number, number, number] = [x, terrain.groundHeight(x, z), z];
      const all = lamps.reduce((s, q) => s + lampLux(q, p, [0, 1, 0], M), 0);
      const ids = lookupLamps(index, x, z);
      expect(new Set(ids).size).toBe(ids.length);
      const viaIndex = ids.reduce((s, i) => s + lampLux(lamps[i], p, [0, 1, 0], M), 0);
      expect(viaIndex).toBeCloseTo(all, 12);
      if (all > 0) lit++;
      // Contributions whose emitter lies in another page (offscreen/neighbour-chunk emitters).
      const C = index.chunkCells;
      for (const i of ids)
        if (
          lampLux(lamps[i], p, [0, 1, 0], M) > 0 &&
          (Math.floor(Math.floor(lamps[i].x) / C) !== Math.floor(Math.floor(x) / C) ||
            Math.floor(Math.floor(lamps[i].z) / C) !== Math.floor(Math.floor(z) / C))
        )
          offPage++;
    }
    expect(lit).toBeGreaterThan(2000);
    expect(offPage).toBeGreaterThan(50);
  });
  test('fixture instances (housings, lenses, halos) keep the frozen transforms and halo colours', () => {
    const groupKey = (v: { parent?: string; material: string; vertices: number; count: number }) =>
      `${v.parent}|${v.material}|${v.vertices}|${v.count}`;
    const frozen = new Map<string, string[]>();
    for (const v of baseline.visuals)
      frozen.set(groupKey(v), [
        ...v.instances.map((m) => m.join(',')),
        ...(v.colors ? [`colors:${[...v.colors].length}`] : []),
      ]);
    const m = new Matrix4();
    let meshes = 0;
    lighting.group.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return;
      meshes++;
      const key = groupKey({
        parent: o.parent?.name,
        material: o.material.type,
        vertices: o.geometry.getAttribute('position').count,
        count: o.count,
      });
      const mats: string[] = [];
      for (let k = 0; k < o.count; k++)
        mats.push((o.getMatrixAt(k, m), Array.from(m.elements).join(',')));
      if (o.instanceColor) mats.push(`colors:${o.instanceColor.array.length}`);
      expect(frozen.has(key), key).toBe(true);
      expect([...mats].sort(), key).toEqual([...frozen.get(key)!].sort());
    });
    expect(meshes).toBe(baseline.visuals.length);
    // Halo colour triples as multisets.
    const colours = (list: number[]) => {
      const out: string[] = [];
      for (let k = 0; k < list.length; k += 3) out.push(list.slice(k, k + 3).join(','));
      return out.sort();
    };
    const frozenColours = colours(baseline.visuals.flatMap((v) => v.colors ?? []));
    const nowColours: number[] = [];
    lighting.group.traverse(
      (o) =>
        o instanceof InstancedMesh &&
        o.instanceColor &&
        nowColours.push(...(o.instanceColor.array as Float32Array)),
    );
    expect(colours(nowColours)).toEqual(frozenColours);
  });
  test('the dense rectangle is replaced by pages: payload + directory below the frozen grid bytes', () => {
    const s = index.stats;
    expect(baseline.grid.gridTextureBytes).toBe(115200);
    expect(s.denseEquivalent.bytes).toBe(115200);
    expect(s.payload.bytes + s.directory.bytes).toBeLessThan(115200 / 2);
    expect(s.pages * index.chunkCells ** 2).toBeLessThan(
      baseline.grid.columns * baseline.grid.rows,
    );
    dispose();
  });
});

describe('determinism', () => {
  test('shuffled registry input produces byte-identical textures, order and instance buffers', () => {
    const hashes = (registry?: LightingRegistry) => {
      const { lighting, dispose } = make(registry);
      const u = lighting.uniforms;
      const instances: string[] = [];
      lighting.group.traverse(
        (o) =>
          o instanceof InstancedMesh && instances.push(sha(o.instanceMatrix.array as Float32Array)),
      );
      const out = {
        lamp: sha(u.cityLampTex.value.image.data as Float32Array),
        payload: sha(u.cityGridTex.value.image.data as Float32Array),
        directory: sha(u.cityPageTex.value.image.data as Float32Array),
        order: lighting.index!.order.join('\n'),
        grid: u.cityGrid.value
          .toArray()
          .concat([
            u.cityGridRows.value,
            u.cityChunkCells.value,
            u.cityPagesPerRow.value,
            u.cityLampRows.value,
          ]),
        instances,
      };
      dispose();
      return out;
    };
    const reference = hashes();
    const registry = pilotLightingRegistry(terrain);
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = { ...registry, fixtures: shuffled(registry.fixtures, seed) };
      expect(hashes(r)).toEqual(reference);
    }
  });
  test('pinned pilot output matches the Phase 0 manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync('docs/lighting-phase0/measurements/registry-manifest.json', 'utf8'),
    );
    const { lighting, dispose } = make();
    const u = lighting.uniforms;
    expect({
      lampTexture: sha(u.cityLampTex.value.image.data as Float32Array),
      pagePayload: sha(u.cityGridTex.value.image.data as Float32Array),
      pageDirectory: sha(u.cityPageTex.value.image.data as Float32Array),
      canonicalOrder: createHash('sha256').update(lighting.index!.order.join('\n')).digest('hex'),
    }).toEqual(manifest.outputs.hashes);
    dispose();
  });
});

describe('fixture bounds and detail selection', () => {
  test('housing and lens bounds contain every instance including arms; halo bounds include the margin', () => {
    const { lighting, dispose } = make();
    const m = new Matrix4(),
      v = new Vector3(),
      armTip = new Box3();
    let checked = 0;
    lighting.group.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return;
      const position = o.geometry.getAttribute('position');
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m);
        // Every vertex (pole, arm, head, lens) of every instance lies inside the mesh bounds.
        for (let j = 0; j < position.count; j++) {
          v.fromBufferAttribute(position, j).applyMatrix4(m);
          expect(o.boundingSphere!.distanceToPoint(v)).toBeLessThanOrEqual(1e-9);
          if ((o.material as Material).type === 'MeshStandardMaterial') armTip.expandByPoint(v);
        }
        checked++;
      }
      if ((o.material as Material).type === 'ShaderMaterial') {
        // The halo margin is added on top of the instances' own bounding sphere.
        const padded = o.boundingSphere!.clone();
        o.computeBoundingSphere();
        expect(padded.radius).toBeCloseTo(o.boundingSphere!.radius + HALO_CULL_MARGIN, 12);
        expect(padded.center.equals(o.boundingSphere!.center)).toBe(true);
        o.boundingSphere = padded;
      }
    });
    expect(checked).toBeGreaterThan(300);
    expect(armTip.isEmpty()).toBe(false);
    dispose();
  });
  test('a fixture within detail distance is shown even when its group centre is beyond it', () => {
    const { lighting, dispose } = make();
    const groups = lighting.describe().streetLighting.visuals!.groupBounds;
    const kungs = groups.find((g) => g.id === 'kungsgatan')!;
    const members = lighting.fixtures.filter((f) => f.pilot === 'kungsgatan');
    // Camera beyond the nearest member (along the axis away from the centre), 0.95 · POLE_DETAIL from it.
    const far = members.reduce((a, b) => (b.z > a.z ? b : a));
    const camera = { position: new Vector3(far.x, 2, far.z + POLE_DETAIL * 0.95) } as never;
    const centreDistance = new Vector3(...kungs.centre).distanceTo(
      new Vector3(far.x, 2, far.z + POLE_DETAIL * 0.95),
    );
    expect(centreDistance).toBeGreaterThan(POLE_DETAIL);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, camera, 800);
    const kGroup = lighting.group.getObjectByName('lighting-kungsgatan')!;
    const bodies = kGroup.children.filter(
      (c) => c instanceof InstancedMesh && (c.material as Material).type === 'MeshStandardMaterial',
    );
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.every((b) => b.visible)).toBe(true);
    dispose();
  });
});

describe('lifecycle, rebinding and failure handling', () => {
  const track =
    (live: Set<object>) => (r: { addEventListener: (t: 'dispose', f: () => void) => void }) => {
      live.add(r);
      r.addEventListener('dispose', () => live.delete(r));
    };
  const owned = (lighting: ReturnType<typeof createCityLighting>) => {
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
  test('10 creation/disposal cycles: every owned resource disposed, constant per-cycle allocation', () => {
    const live = new Set<object>();
    const perCycle: number[] = [];
    for (let round = 0; round < 10; round++) {
      const { lighting, stadium, dispose } = make();
      const resources = owned(lighting);
      for (const root of [stadium.group, stadium.turf])
        root.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.geometry instanceof BufferGeometry) resources.add(mesh.geometry);
          for (const m of [mesh.material].flat()) if (m instanceof Material) resources.add(m);
        });
      perCycle.push(resources.size);
      for (const r of resources) track(live)(r as never);
      dispose();
      expect([...live]).toEqual([]);
    }
    expect(new Set(perCycle).size).toBe(1);
  });
  test('10 street-lighting replacements swap complete sets and release the previous one', () => {
    const { lighting, dispose } = make();
    const live = new Set<object>();
    for (const r of owned(lighting)) track(live)(r as never);
    const registry = pilotLightingRegistry(terrain);
    const sizes: number[] = [];
    for (let k = 0; k < 10; k++) {
      const before = lighting.uniforms.cityGridTex.value;
      const result = lighting.replaceStreetLighting({
        ...registry,
        fixtures: shuffled(registry.fixtures, k),
      });
      expect(result.ok).toBe(true);
      expect(lighting.uniforms.cityGridTex.value).not.toBe(before);
      const now = owned(lighting);
      for (const r of now) if (!live.has(r)) track(live)(r as never);
      // Only the current set is alive (stadium resources are not tracked here).
      expect([...live].every((r) => now.has(r))).toBe(true);
      sizes.push(live.size);
    }
    expect(new Set(sizes).size).toBe(1);
    expect(lighting.describe().streetLighting.builds).toBe(11);
    dispose();
    expect([...live]).toEqual([]);
  });
  test('a rejected replacement keeps the previous set rendered and is reported', () => {
    const { lighting, dispose } = make();
    const registry = pilotLightingRegistry(terrain);
    const textures = ['cityLampTex', 'cityGridTex', 'cityPageTex'].map(
      (k) => lighting.uniforms[k as 'cityLampTex'].value,
    );
    const crowd = { ...registry.fixtures[0] };
    // 17 co-located copies of one fixture: a capacity conflict (distinct canonical IDs).
    const crowded = {
      ...registry,
      fixtures: [
        ...registry.fixtures,
        ...Array.from({ length: 17 }, (_, k) => ({
          ...crowd,
          id: `estimate:test:crowd:${k}`,
          runtimeId: `test:crowd-${k}`,
          placement: 'estimated' as const,
          illumination: 'estimated' as const,
          generator: { ...crowd.generator, method: 'pilot-site' as const },
          position: { ...crowd.position, status: 'estimated' as const },
        })),
      ],
    };
    const result = lighting.replaceStreetLighting(crowded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('capacity');
    expect(result.conflictCount).toBeGreaterThan(0);
    const c = result.conflicts[0];
    expect(c.raw.length).toBeGreaterThan(MAX_PER_CELL);
    expect(c.candidateRetained).toHaveLength(MAX_PER_CELL);
    expect([...c.candidateRetained, ...c.candidateDropped].sort()).toEqual([...c.raw].sort());
    ['cityLampTex', 'cityGridTex', 'cityPageTex'].forEach((k, i) =>
      expect(lighting.uniforms[k as 'cityLampTex'].value).toBe(textures[i]),
    );
    const d = lighting.describe().streetLighting;
    expect(d.status).toBe('rendering-previous');
    expect(d.emitters).toBe(105);
    expect(d.lastRejection!.conflictCount).toBe(result.conflictCount);
    // A duplicate canonical ID is rejected at the registry stage, also without touching the GPU set.
    const dup = lighting.replaceStreetLighting({
      ...registry,
      fixtures: [...registry.fixtures, registry.fixtures[3]],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.stage).toBe('registry');
    expect(lighting.uniforms.cityGridTex.value).toBe(textures[1]);
    expect(lighting.replaceStreetLighting(registry).ok).toBe(true);
    expect(lighting.describe().streetLighting.status).toBe('ok');
    dispose();
  });
  test('invalid initial data: development throws with the report; production logs and renders no street lamps', () => {
    const registry = pilotLightingRegistry(terrain);
    const broken = {
      ...registry,
      fixtures: registry.fixtures.map((f, i) =>
        i === 5 ? { ...f, photometry: { ...f.photometry, rangeM: Number.NaN } } : f,
      ),
    };
    expect(() => make(broken)).toThrow(/rejected at registry/);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { lighting, dispose } = make(broken, { strict: false });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/street lighting rejected at registry/),
    );
    error.mockRestore();
    const d = lighting.describe();
    expect(d.fixtures).toBe(0);
    expect(d.streetLighting.status).toBe('rejected');
    expect(d.streetLighting.lastRejection!.firstErrors[0]).toMatchObject({
      field: 'photometry.rangeM',
    });
    expect(lighting.uniforms.stadiumCount.value).toBeGreaterThan(0);
    expect(lighting.uniforms.cityGrid.value.w).toBe(0);
    dispose();
  });
  test('a material shared across controllers rebinds to the current controller without a recompile', () => {
    const a = make();
    const material = new MeshStandardMaterial();
    a.lighting.patch(new Mesh(new BufferGeometry(), material));
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <lights_pars_begin>\n#include <lights_fragment_maps>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms.cityLampTex).toBe(a.lighting.uniforms.cityLampTex);
    const version = material.version,
      key = material.customProgramCacheKey();
    a.dispose();
    const b = make();
    b.lighting.patch(new Mesh(new BufferGeometry(), material));
    expect(boundUniforms(material)).toBe(b.lighting.uniforms);
    // The already compiled program's uniform object now reads the new controller's holders.
    for (const k of [
      'cityLampTex',
      'cityGridTex',
      'cityPageTex',
      'cityGrid',
      'cityLampLevel',
      'stadiumLights',
    ] as const)
      expect(shader.uniforms[k]).toBe(b.lighting.uniforms[k]);
    expect(material.version).toBe(version);
    expect(material.customProgramCacheKey()).toBe(key);
    expect(b.lighting.describe().reboundMaterials).toBe(1);
    // A later compile (context restoration) injects the current binding.
    const restored = { ...shader, uniforms: {} as Record<string, unknown> };
    material.onBeforeCompile(restored as never, {} as never);
    expect(restored.uniforms.cityPageTex).toBe(b.lighting.uniforms.cityPageTex);
    b.dispose();
  });
  test('textures keep their CPU data for context restoration and are uploaded eagerly when possible', () => {
    const uploaded: Texture[] = [];
    const stadium = createIdrottsparken(terrain);
    const lighting = createCityLighting({
      terrain,
      stadium,
      scene: new Scene(),
      renderer: fakeRenderer({
        capabilities: { maxTextureSize: 4096 },
        initTexture: (t: Texture) => uploaded.push(t),
      }),
    });
    const textures = (['cityLampTex', 'cityGridTex', 'cityPageTex'] as const).map(
      (k) => lighting.uniforms[k].value,
    );
    expect(uploaded).toEqual(textures);
    for (const t of textures) {
      expect(t.image.data).toBeInstanceOf(Float32Array);
      expect((t.image.data as Float32Array).length).toBe(
        t.image.width * t.image.height * (t === textures[2] ? 1 : 4),
      );
      expect(t.onUpdate).toBeNull();
      expect(t.generateMipmaps).toBe(false);
    }
    expect(lighting.describe().streetLighting.textures.maxTextureSize).toBe(4096);
    lighting.dispose();
    stadium.dispose();
  });
  test('no rebuild or re-upload while the time, day/night state or floodlights change', () => {
    const { lighting, dispose } = make();
    const textures = (['cityLampTex', 'cityGridTex', 'cityPageTex'] as const).map(
      (k) => lighting.uniforms[k].value,
    );
    const versions = textures.map((t) => t.version);
    const cam = { position: new Vector3(0, 10, 0) } as never;
    for (let i = 0; i < 300; i++) {
      lighting.set({
        date: '2026-10-21',
        minutes: (i * 7) % 1440,
        stadium: (['off', 'training', 'event'] as const)[i % 3],
      });
      lighting.update(0.05, cam, 800);
    }
    expect(
      (['cityLampTex', 'cityGridTex', 'cityPageTex'] as const).map(
        (k) => lighting.uniforms[k].value,
      ),
    ).toEqual(textures);
    expect(textures.map((t) => t.version)).toEqual(versions);
    expect(lighting.describe().streetLighting.builds).toBe(1);
    dispose();
  });
});

test('fixtureLamps still accepts the raw pilot order (legacy API)', () => {
  expect(fixtureLamps(FIXTURES, terrain)).toHaveLength(105);
});
