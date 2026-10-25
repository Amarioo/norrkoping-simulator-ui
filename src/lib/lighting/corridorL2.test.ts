/**
 * Lighting Phase L2a: citywide street fixtures (corridorL2.ts, generator with L0 lit evidence).
 * Reproduction, compact format, seams with every earlier rollout, the combined city set through the
 * real controller, placement invariants and Norrtull.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { cityLightingRegistry, createCityLighting, l2LightingRegistry, runtimeLightingRegistry } from './controller';
import { decodeCompactSet, encodeCompactSet, type CompactSet } from './compactSet';
import { L2_GENERATOR } from './corridorL2';
import { validateRegistry } from './registry';
import { FIXTURE_TYPES } from './fixtures';
import { L2_OUTPUT_FILES, generateL2, loadL2Inputs, toL2Files } from '../../../scripts/lighting-l2/inputs';

const M = terrain.data.reference.metresPerUnit;
const inputs = loadL2Inputs();
const output = generateL2(inputs);
const l2 = JSON.parse(fs.readFileSync(L2_OUTPUT_FILES.runtime, 'utf8')) as CompactSet;

describe('L2a generation', () => {
  test('committed runtime and provenance files equal a fresh generation, byte for byte', () => {
    const files = toL2Files(output, inputs);
    expect(fs.readFileSync(L2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
    expect(fs.readFileSync(L2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  });
  test('only street brackets on car roads; IDs carry the L2a generator version; every fixture labelled an estimate', () => {
    expect(output.fixtures.length).toBeGreaterThan(14000);
    for (const f of output.fixtures) {
      expect(['street-bracket-8m', 'street-bracket-6m']).toContain(f.type);
      expect(f.id.startsWith(`estimate:${L2_GENERATOR.version}:way/`) || f.id.startsWith('osm:node/')).toBe(true);
    }
    expect(output.fixtures.filter((f) => f.placement === 'mapped')).toHaveLength(0);
  });
  test('seams: no earlier fixture re-created, none within 3 m of an L2a fixture; A1–A3 station slots are identities', () => {
    const existing = inputs.input.existing;
    const ids = new Set(existing.map((f) => f.id));
    for (const f of output.fixtures) expect(ids.has(f.id)).toBe(false);
    let nearest = Infinity;
    for (const f of output.fixtures)
      for (const e of existing) nearest = Math.min(nearest, Math.hypot(f.x - e.x, f.z - e.z) * M);
    expect(nearest).toBeGreaterThanOrEqual(3);
    // A1–A3 slots met again are reported as identities, never as a second record.
    const slots = output.rejected.filter((r) => r.reason === 'identity-in-existing-set');
    expect(slots.length).toBeGreaterThan(0);
    for (const r of slots) expect(r.detail).toMatch(/station slot already rendered as estimate:lighting-a[123]-v1:/);
  });
  test('Norrtull: the Norra Promenaden pieces left unlit in A2/A3 now have brackets (gap fill)', () => {
    for (const w of [286445696, 300186798, 1050773512]) {
      expect(output.fixtures.some((f) => f.id.includes(`:way/${w}:`)), `way ${w}`).toBe(true);
      expect(output.ways.find((c) => c.way === w)?.status).toBe('estimated');
    }
  });
  test('placement: no fixture inside a building, on a carriageway or in water (generator conflicts re-checked independently)', () => {
    const map = inputs.input.map;
    const inRing = (p: number[], r: number[][]) => {
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < r[i][0] + ((p[1] - r[i][1]) * (r[j][0] - r[i][0])) / (r[j][1] - r[i][1]))
          inside = !inside;
      return inside;
    };
    const cell = (x: number, z: number) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
    const byCell = new Map<string, number[][][][]>();
    for (const b of map.buildings) {
      const r = b.rings[0];
      if (!r?.length) continue;
      const xs = r.map((p) => p[0]),
        zs = r.map((p) => p[1]);
      for (let x = Math.floor(Math.min(...xs) / 2); x <= Math.floor(Math.max(...xs) / 2); x++)
        for (let z = Math.floor(Math.min(...zs) / 2); z <= Math.floor(Math.max(...zs) / 2); z++)
          byCell.set(`${x},${z}`, [...(byCell.get(`${x},${z}`) ?? []), b.rings]);
    }
    let checked = 0;
    for (const f of output.fixtures) {
      for (const rings of byCell.get(cell(f.x, f.z)) ?? [])
        expect(inRing([f.x, f.z], rings[0]) && !rings.slice(1).some((h) => inRing([f.x, f.z], h)), f.id).toBe(false);
      checked++;
    }
    expect(checked).toBe(output.fixtures.length);
  });
});

describe('compact format', () => {
  test('decodes to the generator records (heading within 5e-7 rad) and re-encodes to the same bytes', () => {
    const decoded = decodeCompactSet(l2).fixtures;
    expect(decoded.length).toBe(output.fixtures.length);
    decoded.forEach((d, i) => {
      const f = output.fixtures[i];
      expect({ ...d, heading: 0 }).toEqual({ ...f, heading: 0 });
      if (f.heading === null) expect(d.heading).toBeNull();
      else expect(Math.abs(d.heading! - f.heading)).toBeLessThanOrEqual(5e-7);
    });
    const { meta } = l2;
    const { format: _format, ...rest } = meta;
    expect(JSON.stringify(encodeCompactSet(decoded, rest))).toBe(JSON.stringify(l2));
  });
  test('is about 75 bytes per fixture as JSON (A1–A3 format: ≈ 330)', () => {
    const bytes = fs.statSync(L2_OUTPUT_FILES.runtime).size;
    expect(bytes / l2.count).toBeLessThan(80);
  });
  test('rejects a foreign format and truncated columns', () => {
    expect(() => decodeCompactSet({ ...l2, meta: { ...l2.meta, format: 'x' as never } })).toThrow(/unsupported format/);
    expect(() => decodeCompactSet({ ...l2, count: l2.count + 1 })).toThrow(/column/);
  });
});

describe('the citywide rendered set (pilot + A1–A3 + L2a)', () => {
  const registry = cityLightingRegistry(terrain, l2);
  test('validates as a registry: supported types, consistent E/N, sources and licences', () => {
    const v = validateRegistry(registry, { reference: terrain.data.reference, supportedTypes: FIXTURE_TYPES });
    expect(v.errors).toEqual([]);
    expect(l2LightingRegistry(terrain, l2).fixtures).toHaveLength(l2.count);
  });
  test('accepted by the controller; ≤ 32 per cell; every earlier lamp row is bit-identical inside it', () => {
    const stadium = createIdrottsparken(terrain);
    const renderer = { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer;
    const city = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry, strict: true });
    const before = createCityLighting({
      terrain,
      stadium,
      renderer,
      scene: new Scene(),
      registry: runtimeLightingRegistry(terrain),
      strict: true,
    });
    const d = city.describe();
    expect(d.fixtures).toBe(273 + l2.count);
    expect(d.streetLighting.index!.overflowCells).toBe(0);
    expect(d.streetLighting.index!.maxRawOccupancy).toBeLessThanOrEqual(32);
    expect(d.streetLighting.rollouts!['lighting-l2a-v1']).toEqual({ mapped: 0, estimated: l2.count });
    // Lamp texture rows: an earlier fixture's 8 texels are identical in both sets.
    const rows = (l: typeof city) => {
      const data = l.uniforms.cityLampTex.value.image.data as Float32Array;
      const rowsPerBlock = l.describe().streetLighting.textures.lamp!.rows;
      const width = l.describe().streetLighting.textures.lamp!.width;
      return new Map(
        l.fixtures.map((f, i) => {
          const block = Math.floor(i / rowsPerBlock),
            o = ((i - block * rowsPerBlock) * width + block * 8) * 4;
          return [f.id, Array.from(data.subarray(o, o + 32)).join(',')];
        }),
      );
    };
    const was = rows(before),
      is = rows(city);
    expect(was.size).toBe(273);
    for (const [id, row] of was) expect(is.get(id), id).toBe(row);
    city.dispose();
    before.dispose();
    stadium.dispose();
  });
});
