import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Mesh, MeshStandardMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { terrain } from '../../terrain';
import { cityMap } from '../../mapModel';
import { DETAILED_BUILDING_IDS } from '../../cityPlaces';
import { createRadhuset, wallTop } from './radhuset';
import { EAVE, FRAME, GROUND, GULL_OLLE, MIDDLE, RADHUSET_ID, TOWER, WINGS } from './spec';

/** The LiDAR measurements this model was built from (scripts/landmark-b1/radhuset_lidar.py). */
const lidar = JSON.parse(fs.readFileSync('docs/landmark-b1/data/radhuset-lidar.json', 'utf8'));
const M = terrain.data.reference.metresPerUnit;
const model = createRadhuset(terrain);
model.group.updateMatrixWorld(true);
const mesh = (name: string) => model.group.getObjectByName('radhuset-' + name) as Mesh;
/** Vertices of a mesh in the building frame: [u, v, h RH2000]. */
const vertices = (name: string) => {
  const p = (mesh(name).geometry as BufferGeometry).getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), -p.getZ(i), p.getY(i)]);
};
const building = cityMap.buildings.find((b) => b.id === RADHUSET_ID)!;
const footprint = building.rings[0].slice(0, -1).map(([x, z]) => model.frame.toFrame(x, z));
const inPolygon = (u: number, v: number, poly: number[][]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (
      poly[i][1] > v !== poly[j][1] > v &&
      u < ((poly[j][0] - poly[i][0]) * (v - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]
    )
      inside = !inside;
  return inside;
};
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

describe('Rådhuset: frame and sources', () => {
  test('the frame is the measured one and the axis follows the OSM north façade', () => {
    expect(FRAME.originScene).toEqual(lidar.frame.originScene);
    expect(FRAME.axisScene).toEqual(lidar.frame.axisScene);
    const [a, b] = [building.rings[0][0], building.rings[0][5]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect((b[0] - a[0]) / len).toBeCloseTo(FRAME.axisScene[0], 5);
    expect((b[1] - a[1]) / len).toBeCloseTo(FRAME.axisScene[1], 5);
    expect(model.group.scale.x).toBeCloseTo(1 / M, 12);
    expect(model.group.position.y).toBe(0);
  });
  test('the frame round-trips between scene and building metres', () => {
    for (const [u, v] of [
      [0, 0],
      [30, -40],
      [-33, 5],
    ]) {
      const [x, z] = model.frame.toScene(u, v);
      const [u2, v2] = model.frame.toFrame(x, z);
      expect(u2).toBeCloseTo(u, 9);
      expect(v2).toBeCloseTo(v, 9);
    }
    // Metric: 25 building-frame metres are 25 scene metres in both directions.
    const [x0, z0] = model.frame.toScene(0, 0);
    for (const [u, v] of [
      [25, 0],
      [0, 25],
    ]) {
      const [x1, z1] = model.frame.toScene(u, v);
      expect(Math.hypot(x1 - x0, z1 - z0) * M).toBeCloseTo(25, 9);
    }
  });
  test('spec values agree with the LiDAR measurement file', () => {
    expect(GULL_OLLE.top).toBe(lidar.tower.topRH2000);
    expect(GROUND.towerFront).toBe(lidar.ground.towerFront.p50);
    const ridge = (name: string) => Math.max(...lidar.sections[name].map((s: number[]) => s[1]));
    expect(Math.abs(WINGS.north.profile.at(-1)![1] - ridge('north'))).toBeLessThan(0.1);
    expect(Math.abs(WINGS.west.profile.at(-1)![1] - ridge('west'))).toBeLessThan(0.1);
    expect(Math.abs(WINGS.east.profile.at(-1)![1] - ridge('east'))).toBeLessThan(0.1);
    // Cornice: the outermost roof returns of the south side of the north wing and the side wings.
    const edge = (name: string, at: number) =>
      lidar.sections[name].find((s: number[]) => s[0] === at)[1];
    expect(Math.abs(edge('north', -15.75) - EAVE)).toBeLessThan(0.2);
    expect(Math.abs(edge('west', -33.25) - EAVE)).toBeLessThan(0.2);
    expect(Math.abs(edge('east', 33.25) - EAVE)).toBeLessThan(0.2);
  });
  test('tower height: 68.7 m above the ground in front (municipality: 68 m); Gull-Olle 4.5 m', () => {
    const height = GULL_OLLE.top - GROUND.towerFront;
    expect(height).toBeCloseTo(68.68, 2);
    expect(Math.abs(height - 68)).toBeLessThan(1);
    expect(GULL_OLLE.height).toBe(4.5);
    // The statue stands on the tower roof's top ring.
    expect(TOWER.roof.at(-1)![0]).toBeCloseTo(GULL_OLLE.top - GULL_OLLE.height, 9);
  });
});

describe('Rådhuset: geometry', () => {
  test('the highest point is the top of Gull-Olle; the gilded figure spans its 4.5 m', () => {
    let top = -Infinity;
    for (const name of ['masonry', 'roofs', 'windows', 'clocks', 'gull-olle'])
      for (const p of vertices(name)) top = Math.max(top, p[2]);
    // Geometry is stored as float32: 4 decimals (0.05 mm at 73 m).
    expect(top).toBeCloseTo(GULL_OLLE.top, 4);
    const gold = vertices('gull-olle').map((p) => p[2]);
    expect(Math.min(...gold)).toBeCloseTo(GULL_OLLE.top - GULL_OLLE.height, 4);
    expect(Math.max(...gold)).toBeCloseTo(GULL_OLLE.top, 4);
    // Narrow like the LiDAR returns (≤ 1.6 m across at 69–70.5 m).
    for (const p of vertices('gull-olle')) expect(Math.hypot(p[0], p[1])).toBeLessThan(0.85);
  });
  test('the walls stand on the OSM footprint and reach the lowest ground under it', () => {
    const base = terrain.footprintGround(building.rings) * M;
    expect(model.report.base).toBeCloseTo(base, 9);
    // Every footprint vertex carries a wall from the base to its part's top.
    const masonry = vertices('masonry');
    for (const [u, v] of footprint) {
      const here = masonry.filter((p) => Math.hypot(p[0] - u, p[1] - v) < 1e-4);
      expect(here.some((p) => Math.abs(p[2] - base) < 1e-4)).toBe(true);
    }
    expect(model.report.walls).toBe(footprint.length);
  });
  test('wall tops: eave 22.5 m, courtyard strips 19.7 m, hall 10.3 m', () => {
    expect(wallTop(-20, 4.8)).toBe(EAVE);
    expect(wallTop(8.78, -17)).toBe(MIDDLE.strips.top);
    expect(wallTop(0, -28.57)).toBe(MIDDLE.hall.eave);
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
  });
  test('the generic OSM extrusion is replaced; the OSM data itself is unchanged', () => {
    expect(DETAILED_BUILDING_IDS.has(RADHUSET_ID)).toBe(true);
    expect(building.name).toBe('Rådhuset');
    expect(building.height * M).toBeCloseTo(20, 6); // the OSM import's estimate, untouched
  });
});

describe('Rådhuset: model against the LiDAR surface', () => {
  // Highest model surface under each 1 m LiDAR cell centre inside the footprint, by a downward ray.
  const ray = new Raycaster();
  const meshes = ['masonry', 'roofs', 'gull-olle'].map(mesh);
  const s = lidar.surface;
  const results: { u: number; v: number; d: number }[] = [];
  for (let j = 0; j < s.nv; j++)
    for (let i = 0; i < s.nu; i++) {
      const z = s.rows[j][i];
      if (z < 0) continue;
      const u = s.u0 + i + 0.5,
        v = s.v0 + j + 0.5;
      // Interior cells only: the OSM outline is ±1 m (it differs from the LiDAR eave line by up to
      // ≈ 1 m, e.g. the west wing's courtyard wall) and the 1 m cells on it mix ground and eave returns.
      if (!inPolygon(u, v, footprint) || edgeDistance(u, v, footprint) < 1.5) continue;
      const [x, zz] = model.frame.toScene(u, v);
      ray.set(new Vector3(x, 200 / M, zz), new Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) continue;
      results.push({ u, v, d: hit.point.y * M - z / 10 });
    }
  test('covers the footprint', () => {
    expect(results.length).toBeGreaterThan(1500);
  });
  test('roof heights match LiDAR: median |Δ| ≤ 0.6 m, p90 ≤ 1.6 m', () => {
    const abs = results.map((r) => Math.abs(r.d));
    const median = percentile(abs, 0.5),
      p90 = percentile(abs, 0.9);
    console.log(
      `[radhuset] model − LiDAR over ${results.length} cells: median |Δ| ${median.toFixed(2)} m, ` +
        `p90 ${p90.toFixed(2)} m, mean Δ ${(results.reduce((a, r) => a + r.d, 0) / results.length).toFixed(2)} m`,
    );
    expect(median).toBeLessThanOrEqual(0.6);
    expect(p90).toBeLessThanOrEqual(1.6);
  });
  test('the tower roof and statue match LiDAR within 1.5 m (p90)', () => {
    const tower = results
      .filter((r) => Math.abs(r.u) < 5 && Math.abs(r.v) < 5)
      .map((r) => Math.abs(r.d));
    expect(tower.length).toBeGreaterThan(60);
    expect(percentile(tower, 0.9)).toBeLessThanOrEqual(1.5);
  });
});
