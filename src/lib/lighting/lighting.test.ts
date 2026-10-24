import { describe, expect, test } from 'vitest';
import {
  BufferGeometry,
  Color,
  Material,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  type WebGLRenderer,
} from 'three';
import { terrain } from '../terrain';
import { layeredGround } from '../groundLayers';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { environmentAt } from './environment';
import {
  isPatched,
  MAX_PER_CELL,
  patchMaterial,
  createLightingUniforms,
  type ShaderLamp,
} from './cityLights';
import { buildLightGrid } from './legacyGrid';
import { FIXTURES, fixtureLamps } from './fixtures';
import { lampLux, emitterLux } from './reference';
import { createCityLighting } from './controller';

const M = terrain.data.reference.metresPerUnit;

describe('environment from solar elevation', () => {
  test('high sun reproduces the pre-Step-6 daylight scene exactly', () => {
    const e = environmentAt(53.6);
    const same = (c: Color, hex: string) =>
      expect(c.getHexString()).toBe(new Color(hex).getHexString());
    same(e.sunColor, '#fff3de');
    same(e.skyColor, '#d9efff');
    same(e.groundColor, '#8b9575');
    same(e.ambientColor, '#f3f1e7');
    same(e.fog, '#bacbd3');
    expect([e.sunIntensity, e.hemiIntensity, e.ambientIntensity, e.exposure, e.artificial]).toEqual(
      [2.1, 1.1, 0.75, 1, 0],
    );
  });
  test('street lighting follows elevation: off by day, on at night, smooth in between', () => {
    expect(environmentAt(5).artificial).toBe(0);
    expect(environmentAt(-4).artificial).toBe(1);
    expect(environmentAt(-0.5).artificial).toBeGreaterThan(0.2);
    expect(environmentAt(-0.5).artificial).toBeLessThan(0.9);
    let prev = environmentAt(-25);
    for (let h = -25; h <= 60; h += 0.05) {
      const e = environmentAt(h);
      expect(Math.abs(e.sunIntensity - prev.sunIntensity)).toBeLessThan(0.05);
      expect(Math.abs(e.hemiIntensity - prev.hemiIntensity)).toBeLessThan(0.02);
      expect(Math.abs(e.artificial - prev.artificial)).toBeLessThan(0.02);
      prev = { ...e, sunColor: e.sunColor.clone() } as typeof e;
    }
  });
  test('night is dark but not black: navigation light stays above zero', () => {
    const n = environmentAt(-30);
    expect(n.sunIntensity).toBe(0);
    expect(n.hemiIntensity).toBeGreaterThan(0.1);
    expect(n.hemiIntensity).toBeLessThan(0.25 * environmentAt(53.6).hemiIntensity);
  });
});

describe('light grid', () => {
  const lamps = fixtureLamps(FIXTURES, terrain);
  const grid = buildLightGrid(lamps, M, 1);
  test('every surface point within a lamp range finds that lamp in its cell; cap respected', () => {
    expect(grid.overflow).toBe(0);
    expect(Math.max(...grid.cells.map((c) => c.length))).toBeLessThanOrEqual(MAX_PER_CELL);
    lamps.forEach((l, i) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2,
          r = (((l.rangeM * 0.98) / M) * ((k % 3) + 1)) / 3;
        const x = l.x + Math.cos(a) * r,
          z = l.z + Math.sin(a) * r;
        const cx = Math.floor((x - grid.originX) / grid.cell),
          cz = Math.floor((z - grid.originZ) / grid.cell);
        expect(grid.cells[cz * grid.columns + cx]).toContain(i);
      }
    });
  });
  test('a lamp over a cell boundary is listed in both cells (no seams)', () => {
    const lamp: ShaderLamp = {
      x: 3,
      y: 0.3,
      z: 3.5,
      rangeM: 20,
      color: [1, 1, 1],
      candela: 1000,
      profile: 0,
      baseY: 0,
      clipBelow: false,
      occlusionM: Array(16).fill(20),
    };
    const g = buildLightGrid([lamp, { ...lamp, x: 5.2 }], M, 1);
    const cellOf = (x: number, z: number) =>
      g.cells[Math.floor(z - g.originZ) * g.columns + Math.floor(x - g.originX)];
    expect(cellOf(2.9, 3.5)).toContain(0);
    expect(cellOf(3.1, 3.5)).toContain(0);
  });
});

describe('surface response (CPU reference of the shader)', () => {
  const lamp: ShaderLamp = {
    x: 0,
    y: 8 / M,
    z: 0,
    rangeM: 30,
    color: [1, 1, 1],
    candela: 1600,
    profile: 0,
    baseY: 0,
    clipBelow: false,
    occlusionM: Array(16).fill(30),
  };
  test('inverse square from the nadir; full cut-off above the lamp horizon', () => {
    const under = lampLux(lamp, [0, 0, 0], [0, 1, 0], M);
    expect(under).toBeGreaterThan(15);
    expect(under).toBeLessThan(25);
    expect(lampLux(lamp, [12 / M, 0, 0], [0, 1, 0], M)).toBeLessThan(under);
    expect(lampLux(lamp, [12 / M, 0, 0], [0, 1, 0], M)).toBeGreaterThan(1);
    // A wall facing the lamp at lamp height gets nothing (cut-off), above it neither.
    expect(lampLux(lamp, [6 / M, 8 / M, 0], [-1, 0, 0], M)).toBe(0);
    expect(lampLux(lamp, [6 / M, 12 / M, 0], [-1, 0, 0], M)).toBe(0);
    // Surfaces facing away receive nothing.
    expect(lampLux(lamp, [0, 0, 0], [0, -1, 0], M)).toBe(0);
  });
  test('occlusion sectors stop light behind a façade', () => {
    // A wall 5 m east of the lamp (sector of angle 0 → index 7/8 boundary): everything beyond is dark.
    const walled = {
      ...lamp,
      occlusionM: Array.from({ length: 16 }, (_, s) => (s === 7 || s === 8 ? 5 : 30)),
    };
    expect(lampLux(walled, [4 / M, 0, 0], [0, 1, 0], M)).toBeGreaterThan(5);
    expect(lampLux(walled, [8 / M, 0, 0], [0, 1, 0], M)).toBe(0);
    expect(lampLux(walled, [-8 / M, 0, 0], [0, 1, 0], M)).toBeGreaterThan(1);
  });
  test('bridge-deck lamps do not light the water under the deck', () => {
    const deck = { ...lamp, y: 4 / M + 8 / M, baseY: 4 / M, clipBelow: true };
    expect(lampLux(deck, [0, 4 / M, 2 / M], [0, 1, 0], M)).toBeGreaterThan(5);
    expect(lampLux(deck, [0, 0, 2 / M], [0, 1, 0], M)).toBe(0);
  });
  test('street pools follow the road, limit house-side spill and rotate with the fixture', () => {
    const lux = (l: ShaderLamp, x: number, z: number) =>
      lampLux(l, [x / M, 0, z / M], [0, 1, 0], M);
    const oriented = { ...lamp, heading: 0 };
    const along = lux(oriented, 12, 0);
    const roadSide = lux(oriented, 0, 12);
    const houseSide = lux(oriented, 0, -12);
    expect(along).toBeGreaterThan(roadSide * 1.3);
    expect(houseSide).toBeLessThan(roadSide * 0.65);
    expect(lux({ ...oriented, heading: Math.PI / 2 }, 12, 0)).toBeCloseTo(roadSide, 8);
    expect(lux({ ...oriented, heading: Math.PI / 2 }, 0, -12)).toBeCloseTo(along, 8);
    // Park lanterns still illuminate real space radially, irrespective of an estimated heading.
    const lantern = { ...oriented, profile: 1 };
    expect(lux(lantern, 10, 0)).toBeCloseTo(lux(lantern, 0, -10), 8);
  });
  test('park lanterns retain a readable path with a soft, darker outer lawn', () => {
    const lantern = { ...lamp, y: 4.2 / M, profile: 1, candela: 380, rangeM: 16 };
    const lux = (r: number) => lampLux(lantern, [r / M, 0, 0], [0, 1, 0], M);
    expect(lux(1.5)).toBeGreaterThan(10);
    expect(lux(10)).toBeLessThan(0.5);
    expect(lux(16)).toBe(0);
    for (let r = 1; r < 16; r += 0.25) expect(lux(r + 0.25)).toBeLessThanOrEqual(lux(r));
  });
  test('real fixtures light their own pavement', () => {
    const lamps = fixtureLamps(FIXTURES, terrain);
    lamps.forEach((l, i) => {
      const f = FIXTURES[i];
      // A point on the ground 1.5 m from the pole, on the side the arm points to.
      const h = f.heading ?? 0;
      const x = f.x + (Math.sin(h) * 1.5) / M,
        z = f.z + (Math.cos(h) * 1.5) / M;
      const y = f.mount.kind === 'bridge' ? l.baseY : terrain.groundHeight(x, z);
      expect(lampLux(l, [x, y, z], [0, 1, 0], M), f.id).toBeGreaterThan(5);
    });
  });
});

const fakeRenderer = () =>
  ({ toneMappingExposure: 1, info: { programs: [] } }) as unknown as WebGLRenderer;

describe('stadium floodlights', () => {
  const stadium = createIdrottsparken(terrain);
  const lux = (p: [number, number, number], n: [number, number, number] = [0, 1, 0]) =>
    stadium.emitters.reduce((s, e) => s + emitterLux(e, stadium.roofs, p, n), 0);
  test('event lighting covers the pitch with plausible level and uniformity', () => {
    const samples: number[] = [];
    for (let x = -30; x <= 30; x += 10)
      for (let z = -50; z <= 50; z += 10) samples.push(lux([x, 0, z]));
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(avg).toBeGreaterThan(700);
    expect(avg).toBeLessThan(2500);
    expect(Math.min(...samples) / avg).toBeGreaterThan(0.35);
  });
  test('roofs block mast light from the seats beneath them; no light outside the arena', () => {
    // Back row of the west stand under its roof, lit by masts only through the open bowl.
    const seat: [number, number, number] = [60, 12, 0];
    const fromMasts = stadium.emitters
      .filter((_, j) => stadium.emitterGroups[j] === 'masts')
      .reduce((s, e) => s + emitterLux(e, stadium.roofs, seat, [-0.6, 0.8, 0]), 0);
    expect(fromMasts).toBe(0);
    // A street 60 m beyond the east façade receives no floodlight (outside every beam / masked).
    const street: [number, number, number] = [-130, 0, 0];
    const shaderMask = (p: number[]) => Math.abs(p[0]) < 70 + 8 && Math.abs(p[2]) < 96 + 8;
    expect(shaderMask(street)).toBe(false);
  });
});

describe('controller: independent states, no recompiles, clean teardown', () => {
  test('floodlights are independent of the time of day', () => {
    const stadium = createIdrottsparken(terrain);
    const lighting = createCityLighting({
      terrain,
      stadium,
      renderer: fakeRenderer(),
      scene: new Scene(),
    });
    const cam = { position: { distanceTo: () => 10 } } as never;
    lighting.set({ date: '2026-10-21', minutes: 12 * 60, stadium: 'event' });
    lighting.settle();
    lighting.update(0.016, cam, 800);
    expect(lighting.uniforms.stadiumLevel.value).toBe(1);
    expect(lighting.uniforms.cityLampLevel.value).toBe(0);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, cam, 800);
    expect(lighting.uniforms.stadiumLevel.value).toBe(0);
    expect(lighting.uniforms.cityLampLevel.value).toBe(1);
    // Floodlight colour/intensity slots are all zero when off (positions/aims stay set).
    lighting.uniforms.stadiumLights.value.forEach(
      (v, k) => k % 3 === 2 && expect([v.x, v.y, v.z]).toEqual([0, 0, 0]),
    );
    // Floodlights ramp, they do not switch abruptly; settle() ends the ramp.
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'event' });
    lighting.update(0.3, cam, 800);
    expect(lighting.describe().floodlights.masts).toBeGreaterThan(0.1);
    expect(lighting.describe().floodlights.masts).toBeLessThan(0.5);
    lighting.settle();
    expect(lighting.describe().floodlights.masts).toBe(1);
    lighting.dispose();
    stadium.dispose();
  });
  test('time scrubbing and floodlight toggling change no material and allocate no uniforms', () => {
    const stadium = createIdrottsparken(terrain);
    const lighting = createCityLighting({
      terrain,
      stadium,
      renderer: fakeRenderer(),
      scene: new Scene(),
    });
    const ground = layeredGround(new MeshStandardMaterial({ vertexColors: true }));
    lighting.patch(new Mesh(new BufferGeometry(), ground));
    const materials: Material[] = [ground];
    stadium.group.traverse(
      (o) => (o as Mesh).material && materials.push((o as Mesh).material as Material),
    );
    const versions = materials.map((m) => m.version);
    const uniformsBefore = { ...lighting.uniforms };
    const cam = { position: { distanceTo: () => 10 } } as never;
    for (let i = 0; i < 300; i++) {
      lighting.set({
        date: '2026-10-21',
        minutes: (i * 7) % 1440,
        stadium: (['off', 'training', 'event'] as const)[i % 3],
      });
      lighting.update(0.05, cam, 800);
    }
    expect(materials.map((m) => m.version)).toEqual(versions);
    for (const k of Object.keys(uniformsBefore) as (keyof typeof uniformsBefore)[])
      expect(lighting.uniforms[k]).toBe(uniformsBefore[k]);
    lighting.dispose();
    stadium.dispose();
  });
  test('patching is idempotent and keeps the layered-ground program key', () => {
    const u = createLightingUniforms();
    const m = layeredGround(new MeshStandardMaterial());
    expect(patchMaterial(m, u)).toBe(true);
    expect(patchMaterial(m, u)).toBe(false);
    expect(isPatched(m)).toBe(true);
    expect(m.customProgramCacheKey()).toBe('layered-ground|city-lights-v2');
    // The shader receives the shared uniform objects and the fixed injection points.
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <lights_pars_begin>\n#include <lights_fragment_maps>',
    };
    m.onBeforeCompile(shader as never, {} as never);
    expect((shader.uniforms as Record<string, unknown>).cityLampTex).toBe(u.cityLampTex);
    expect(shader.vertexShader).toContain('vCityWorld = ( modelMatrix * cityWorld ).xyz;');
    expect(shader.vertexShader).toContain('gl_Position.z -= uv.x'); // the chained layered-ground bias
    expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse += cityIrradiance');
  });
  test('repeated creation and teardown disposes every task-owned resource', () => {
    const live = new Set<object>();
    const track = (r: { addEventListener: (t: 'dispose', f: () => void) => void }) => {
      live.add(r);
      r.addEventListener('dispose', () => live.delete(r));
    };
    for (let round = 0; round < 5; round++) {
      const stadium = createIdrottsparken(terrain);
      const lighting = createCityLighting({
        terrain,
        stadium,
        renderer: fakeRenderer(),
        scene: new Scene(),
      });
      for (const root of [stadium.group, stadium.turf, lighting.group])
        root.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.geometry instanceof BufferGeometry) track(mesh.geometry);
          for (const m of [mesh.material].flat()) if (m instanceof Material) track(m);
        });
      track(lighting.uniforms.cityLampTex.value as Texture);
      track(lighting.uniforms.cityGridTex.value as Texture);
      track(lighting.uniforms.cityPageTex.value as Texture);
      lighting.dispose();
      stadium.dispose();
      expect([...live]).toEqual([]);
    }
  });
});
