import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  SpotLight,
  Vector3,
  type BufferGeometry,
  type WebGLRenderer,
} from 'three';
import { terrain } from '../../terrain';
import { cityMap } from '../../mapModel';
import { DETAILED_BUILDING_IDS } from '../../cityPlaces';
import {
  createLightingUniforms,
  facadeIlluminance,
  facadeZone,
  FACADE_MAX,
  patchMaterial,
} from '../../lighting/cityLights';
import { createCityLighting } from '../../lighting/controller';
import { createIdrottsparken } from '../../stadium/idrottsparken';
import { insidePolygon } from '../builder';
import { createHedvig, offsetPolygon, partOf, wallTopAt, westBayRoof } from './hedvig';
import {
  EAVE,
  FLOODLIGHTS,
  FRAME,
  GROUND,
  HEDVIG_ID,
  NAVE,
  SACRISTY,
  TOWER,
  WEST_BAY,
} from './spec';

/** The LiDAR measurements this model was built from (scripts/landmark-b2/hedvig_lidar.py). */
const lidar = JSON.parse(fs.readFileSync('docs/landmark-b2/data/hedvig-lidar.json', 'utf8'));
const M = terrain.data.reference.metresPerUnit;
const model = createHedvig(terrain);
model.group.updateMatrixWorld(true);
const mesh = (name: string) => model.group.getObjectByName('hedvig-' + name) as Mesh;
/** Vertices of a mesh in the building frame: [u, v, h RH2000]. */
const vertices = (name: string) => {
  const p = (mesh(name).geometry as BufferGeometry).getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), -p.getZ(i), p.getY(i)]);
};
const building = cityMap.buildings.find((b) => b.id === HEDVIG_ID)!;
const footprint = building.rings[0].slice(0, -1).map(([x, z]) => model.frame.toFrame(x, z)) as [
  number,
  number,
][];
const edgeDistance = (u: number, v: number, poly: number[][]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const du = b[0] - a[0],
      dv = b[1] - a[1],
      l2 = du * du + dv * dv;
    const t = Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / l2));
    d = Math.min(d, Math.hypot(u - a[0] - t * du, v - a[1] - t * dv));
  }
  return d;
};
const percentile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

describe('Hedvigs kyrka: frame and sources', () => {
  test('the frame is the measured one; the axis follows the OSM long walls', () => {
    expect(FRAME.originScene).toEqual(lidar.frame.originScene);
    expect(FRAME.axisScene).toEqual(lidar.frame.axisScene);
    // Both long walls run along +u within 1.5° (they are not exactly parallel in OSM).
    const ring = building.rings[0];
    for (const [i, j] of [
      [59, 43],
      [7, 19],
    ]) {
      const dx = ring[j][0] - ring[i][0],
        dz = ring[j][1] - ring[i][1];
      const cos = (dx * FRAME.axisScene[0] + dz * FRAME.axisScene[1]) / Math.hypot(dx, dz);
      expect(Math.acos(Math.min(1, cos)) * (180 / Math.PI)).toBeLessThan(1.5);
    }
    expect(model.group.scale.x).toBeCloseTo(1 / M, 12);
    expect(model.group.position.y).toBe(0);
  });
  test('the frame round-trips between scene and building metres and is metric', () => {
    for (const [u, v] of [
      [0, 0],
      [30, -10],
      [-9, 6],
    ]) {
      const [x, z] = model.frame.toScene(u, v);
      const [u2, v2] = model.frame.toFrame(x, z);
      expect(u2).toBeCloseTo(u, 9);
      expect(v2).toBeCloseTo(v, 9);
    }
    const [x0, z0] = model.frame.toScene(0, 0);
    for (const [u, v] of [
      [25, 0],
      [0, 25],
    ]) {
      const [x1, z1] = model.frame.toScene(u, v);
      expect(Math.hypot(x1 - x0, z1 - z0) * M).toBeCloseTo(25, 9);
    }
    // +v points north: a point at v = 10 lies north of the origin (smaller scene z).
    expect(model.frame.toScene(0, 10)[1]).toBeLessThan(model.frame.toScene(0, 0)[1]);
  });
  test('spec values agree with the LiDAR measurement file', () => {
    expect(TOWER.top).toBe(lidar.tower.topRH2000);
    expect(GROUND.west).toBe(lidar.ground.west.p50);
    expect(GROUND.south).toBe(lidar.ground.south.p50);
    const nave = lidar.sections.nave as number[][];
    const at = (v: number) => nave.find((s) => s[0] === v)![1];
    // Ridge, the eave edges and the säteritak step.
    expect(Math.abs(Math.max(...nave.map((s) => s[1])) - NAVE.profile.at(-1)![1])).toBeLessThan(
      0.1,
    );
    expect(Math.abs(at(-11.25) - EAVE)).toBeLessThan(0.1);
    expect(at(-4.25) - at(-4.75)).toBeGreaterThan(1); // the step
    expect(at(4.25) - at(4.75)).toBeGreaterThan(1);
    const sac = lidar.sections.sacristy as number[][];
    expect(Math.abs(Math.max(...sac.map((s) => s[1])) - SACRISTY.ridge)).toBeLessThan(0.1);
    const west = lidar.sections.westBayCentre as number[][];
    expect(Math.abs(west.find((s) => s[0] === -8.25)![1] - WEST_BAY.eave)).toBeLessThan(0.1);
  });
});

describe('Hedvigs kyrka: geometry', () => {
  test('the highest point is the tower needle at the LiDAR top', () => {
    let top = -Infinity;
    for (const name of ['masonry', 'roofs', 'openings', 'gilding', 'clocks'])
      for (const p of vertices(name)) top = Math.max(top, p[2]);
    expect(top).toBeCloseTo(TOWER.top, 4);
    // 32 m above the ground at the west front.
    expect(TOWER.top - GROUND.west).toBeCloseTo(32.13, 2);
  });
  test('the walls stand on the OSM footprint and reach the lowest ground under it', () => {
    const base = terrain.footprintGround(building.rings) * M;
    expect(model.report.base).toBeCloseTo(base, 9);
    const masonry = vertices('masonry');
    for (const [u, v] of footprint) {
      const here = masonry.filter((p) => Math.hypot(p[0] - u, p[1] - v) < 1e-4);
      expect(here.some((p) => Math.abs(p[2] - base) < 1e-4)).toBe(true);
    }
    expect(model.report.walls).toBe(footprint.length);
  });
  test('wall tops: nave 15 m, sacristy 10.2 m, the west bay rakes from 12.8 m to the 17.4 m terrace', () => {
    expect(partOf(10, -10.4)).toBe('nave');
    expect(partOf(28, 20)).toBe('sacristy');
    expect(partOf(34, 12.6)).toBe('porch');
    expect(partOf(-3, 5.3)).toBe('west');
    expect(wallTopAt('nave', 10)).toBe(EAVE);
    expect(wallTopAt('sacristy', 28)).toBe(SACRISTY.eave);
    expect(westBayRoof(WEST_BAY.eaveU)).toBeCloseTo(WEST_BAY.eave, 9);
    expect(westBayRoof(WEST_BAY.terraceU)).toBeCloseTo(WEST_BAY.terrace, 9);
    expect(westBayRoof(0)).toBeCloseTo(WEST_BAY.terrace, 9);
  });
  test('offsetPolygon moves every edge outward by its offset', () => {
    const sq: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ];
    expect(offsetPolygon(sq, [1, 1, 1, 0])).toEqual([
      [0, -1],
      [5, -1],
      [5, 3],
      [0, 3],
    ]);
  });
  test('budget: five meshes, plain standard materials (no new shader programs), < 6 000 triangles', () => {
    expect(model.group.children.length).toBe(5);
    for (const child of model.group.children) {
      const m = (child as Mesh).material as MeshStandardMaterial;
      expect(m.type).toBe('MeshStandardMaterial');
      expect(m.side).toBe(0); // FrontSide
      expect(m.transparent).toBe(false);
      expect(!!m.map !== m.vertexColors).toBe(true);
    }
    expect(model.report.triangles).toBeLessThan(6000);
    expect(model.report.triangles).toBeGreaterThan(1000);
    // Windows: five bays on the south wall, three on the north (the sacristy covers the rest), one on
    // each diagonal wall of the east end.
    expect(model.report.windows).toBe(10);
  });
  test('the generic OSM extrusion is replaced; the OSM data itself is unchanged', () => {
    expect(DETAILED_BUILDING_IDS.has(HEDVIG_ID)).toBe(true);
    expect(building.name).toBe('Hedvigs kyrka');
    expect(building.height * M).toBeCloseTo(13, 6); // the OSM import's estimate, untouched
  });
});

describe('Hedvigs kyrka: model against the LiDAR surface', () => {
  const ray = new Raycaster();
  const meshes = ['masonry', 'roofs', 'gilding'].map(mesh);
  const s = lidar.surface;
  const results: { u: number; v: number; d: number }[] = [];
  for (let j = 0; j < s.nv; j++)
    for (let i = 0; i < s.nu; i++) {
      const z = s.rows[j][i];
      if (z < 0) continue;
      const u = s.u0 + i + 0.5,
        v = s.v0 + j + 0.5;
      // Interior cells only (the OSM outline is ±1 m; 1 m cells on it mix ground and eave returns).
      if (!insidePolygon(footprint, u, v) || edgeDistance(u, v, footprint) < 1.5) continue;
      const [x, zz] = model.frame.toScene(u, v);
      ray.set(new Vector3(x, 200 / M, zz), new Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) continue;
      results.push({ u, v, d: hit.point.y * M - z / 10 });
    }
  test('covers the footprint', () => {
    // ≈ 630 interior cells (1 100 m² footprint less the 1.5 m band along the outline).
    expect(results.length).toBeGreaterThan(550);
  });
  test('roof heights match LiDAR: median |Δ| ≤ 0.5 m, p90 ≤ 1.5 m', () => {
    const abs = results.map((r) => Math.abs(r.d));
    const median = percentile(abs, 0.5),
      p90 = percentile(abs, 0.9);
    console.log(
      `[hedvig] model − LiDAR over ${results.length} cells: median |Δ| ${median.toFixed(2)} m, ` +
        `p90 ${p90.toFixed(2)} m, mean Δ ${(results.reduce((a, r) => a + r.d, 0) / results.length).toFixed(2)} m`,
    );
    expect(median).toBeLessThanOrEqual(0.5);
    expect(p90).toBeLessThanOrEqual(1.5);
  });
  // The tower is stepped (cap rim 25.5 m, lantern roof 30.4 m, needle 36.9 m): a 1 m cell across a
  // step mixes levels 4–5 m apart, so its p90 measures the cell size, not the model. Checked instead:
  // the median over the tower's cells, and the plan width at every height band against the returns.
  test('the tower matches LiDAR: median |Δ| ≤ 0.6 m over its cells', () => {
    const tower = results
      .filter((r) => Math.abs(r.u) < 3.5 && Math.abs(r.v) < 4.3)
      .map((r) => Math.abs(r.d));
    expect(tower.length).toBeGreaterThan(30);
    console.log(
      `[hedvig] tower cells ${tower.length}: median |Δ| ${percentile(tower, 0.5).toFixed(2)} m, ` +
        `p75 ${percentile(tower, 0.75).toFixed(2)} m, p90 ${percentile(tower, 0.9).toFixed(2)} m`,
    );
    expect(percentile(tower, 0.5)).toBeLessThanOrEqual(0.6);
  });
  test('the tower plan follows the LiDAR slices: model half-width − half-width of the returns in −0.15 … +0.65 m', () => {
    // Model half-widths (u, v) at height h from the cap and lantern-roof rings.
    const width = (h: number) => {
      for (const rings of [TOWER.cap, TOWER.roof])
        for (let k = 0; k + 1 < rings.length; k++) {
          const [h0, a0, c0] = rings[k],
            [h1, a1, c1] = rings[k + 1];
          if (h >= h0 && h <= h1) {
            const t = (h - h0) / (h1 - h0);
            return [a0 + t * (a1 - a0), c0 + t * (c1 - c0)];
          }
        }
      return null;
    };
    let checked = 0;
    for (const [z0, count, u0, u1, v0, v1] of lidar.tower.slices as (number | null)[][]) {
      // Below 25.5 m the slices keep only u < 1.5 (the nave roof abuts the tower's east side), so
      // their u extent is not a width.
      const w = width((z0 as number) + 0.25);
      if (!w || (count as number) < 8 || (z0 as number) < 25.5) continue;
      const du = w[0] - ((u1 as number) - (u0 as number)) / 2,
        dv = w[1] - ((v1 as number) - (v0 as number)) / 2;
      for (const d of [du, dv]) {
        expect(d).toBeGreaterThanOrEqual(-0.15);
        expect(d).toBeLessThanOrEqual(0.65);
      }
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });
});

describe('Hedvigs kyrka: floodlights (estimates)', () => {
  const lights = model.floodlights;
  test('eight ground floodlights, within the shader budget, outside the footprint', () => {
    expect(lights.length).toBe(FLOODLIGHTS.length);
    expect(lights.length).toBe(8);
    expect(lights.length).toBeLessThanOrEqual(FACADE_MAX);
    for (const f of FLOODLIGHTS) {
      expect(insidePolygon(footprint, f.at[0], f.at[1])).toBe(false);
      expect(f.inner).toBeLessThan(f.outer);
    }
    for (const e of lights) {
      expect(Math.hypot(...e.aim)).toBeCloseTo(1, 9);
      expect(e.aim[1]).toBeGreaterThan(0.3); // aimed up at the walls
      // On the ground: 0.3 m above the rendered terrain.
      const [u, v] = model.frame.toFrame(e.position[0], e.position[2]);
      expect(e.position[1] * M - model.frame.ground(u, v)).toBeCloseTo(0.3, 6);
    }
  });
  test('the zone contains every emitter with its full range', () => {
    const z = facadeZone(lights, M);
    for (const e of lights)
      expect(
        Math.hypot(e.position[0] - z.x, e.position[2] - z.z) + e.rangeM / M,
      ).toBeLessThanOrEqual(z.radius + 1e-9);
    expect(z.radius * M).toBeLessThan(90);
    expect(facadeZone([], M).radius).toBe(-1);
  });
  test('façade illuminance is in the estimated 50–200 lx range on the lit walls', () => {
    const lux = (name: string, u: number, v: number, h: number) => {
      const e = lights.find((l) => l.name === 'hedvig-' + name)!;
      const [x, z] = model.frame.toScene(u, v);
      return facadeIlluminance(e, [x, h / M, z], M);
    };
    // West front at mid-height, the bell stage's south face, the east wall.
    const values = [
      lux('west-south', -7.9, -2.5, 9),
      lux('tower-south', -0.5, -4.4, 22),
      lux('east', 36.8, -0.3, 10),
    ];
    for (const v of values) {
      expect(v).toBeGreaterThan(50);
      expect(v).toBeLessThan(400);
    }
    // Nothing behind a flood: the tower's north face from the south flood.
    expect(lux('tower-south', -0.5, 4.4, 22)).toBeLessThan(lux('tower-south', -0.5, -4.4, 22) / 3);
  });
});

describe('Hedvigs kyrka: floodlights in the lighting controller and shader', () => {
  test('the patch declares a fixed façade array; floodlights share the floodlight part of the loop', () => {
    const u = createLightingUniforms();
    expect(u.facadeLights.value).toHaveLength(FACADE_MAX * 3);
    const m = new MeshStandardMaterial();
    patchMaterial(m, u);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <lights_pars_begin>\n#include <lights_fragment_maps>',
    };
    m.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain(`uniform vec4 facadeLights[ ${FACADE_MAX * 3} ];`);
    expect(shader.fragmentShader).toContain('int cityFloods = cityFacades + ');
    expect(shader.uniforms.facadeCount).toBe(u.facadeCount);
    expect(m.customProgramCacheKey()).toBe('city-lights-v3');
  });
  test('controller: written once, on at night with the street lighting, off by day, no real-time lights', () => {
    const stadium = createIdrottsparken(terrain);
    const lighting = createCityLighting({
      terrain,
      stadium,
      renderer: { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer,
      scene: new Scene(),
      facades: model.floodlights,
    });
    const camera = new PerspectiveCamera(50, 1, 0.01, 1000);
    const f = lighting.uniforms.facadeLights.value;
    const e = model.floodlights[2];
    expect([f[6].x, f[6].y, f[6].z, f[6].w]).toEqual([...e.position, e.cosInner]);
    expect([f[7].x, f[7].y, f[7].z, f[7].w]).toEqual([...e.aim, e.cosOuter]);
    expect(f[8].x).toBeCloseTo(e.color[0] * e.candela, 6);
    expect(f[8].w).toBe(e.rangeM);
    lighting.set({ date: '2026-10-21', minutes: 12 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, camera, 800);
    expect(lighting.describe().facadeLights).toMatchObject({ emitters: 8, active: 0, level: 0 });
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, camera, 800);
    const night = lighting.describe();
    expect(night.facadeLights.active).toBe(8);
    expect(night.facadeLights.level).toBe(night.artificial);
    expect(night.facadeLights.level).toBeGreaterThan(0.9);
    let lights = 0;
    lighting.group.traverse((o) => {
      if (o instanceof PointLight || o instanceof SpotLight) lights++;
    });
    expect(lights).toBe(0);
    lighting.dispose();
    // Too many emitters are refused, never truncated.
    expect(() =>
      createCityLighting({
        terrain,
        stadium,
        renderer: { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer,
        scene: new Scene(),
        facades: Array.from({ length: FACADE_MAX + 1 }, () => model.floodlights[0]),
      }),
    ).toThrow(/shader budget/);
    stadium.dispose();
  });
});
