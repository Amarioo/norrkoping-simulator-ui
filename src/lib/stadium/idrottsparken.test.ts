import { describe, expect, test } from 'vitest';
import { Mesh, Raycaster, Vector3, type BufferGeometry } from 'three';
import { terrain } from '../terrain';
import { stadiumCenter } from '../mapModel';
import { STADIUM_MAX, STADIUM_ROOFS } from '../lighting/cityLights';
import { createIdrottsparken } from './idrottsparken';
import { MASTS, OUTLINE, PITCH, TEKNIKHALLEN, TENNISHALLEN, WEST_PROJECTION } from './spec';

const M = terrain.data.reference.metresPerUnit;
const stadium = createIdrottsparken(terrain);
const { frame } = stadium;
stadium.group.updateMatrixWorld(true);
const mesh = (name: string) => stadium.group.getObjectByName('idrottsparken-' + name) as Mesh;
/** Vertices of a stadium mesh in the arena frame (metres). */
const vertices = (name: string) => {
  const p = (mesh(name).geometry as BufferGeometry).getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
};
const inPolygon = (x: number, z: number, poly: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (
      poly[i][1] > z !== poly[j][1] > z &&
      x < ((poly[j][0] - poly[i][0]) * (z - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]
    )
      inside = !inside;
  return inside;
};
const edgeDistance = (x: number, z: number, poly: [number, number][]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
};
const rect = (
  r: { x0: number; x1: number; z0: number; z1: number },
  x: number,
  z: number,
  pad = 0,
) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

describe('Idrottsparken: anchor, scale and pitch', () => {
  test('keeps the verified anchor: OSM pitch centre and orientation, metre scale', () => {
    expect(frame.centre[0]).toBe(stadiumCenter[0]);
    expect(frame.centre[1]).toBe(stadiumCenter[1]);
    expect((frame.rotation * 180) / Math.PI).toBeCloseTo(171.68, 2);
    expect(stadium.group.scale.x).toBeCloseTo(1 / M, 12);
    expect(stadium.group.position.y).toBeCloseTo(terrain.groundHeight(...frame.centre), 12);
  });
  test('pitch level agrees with LiDAR (27.75 m RH2000) and the turf is draped on the terrain', () => {
    const rh2000 = frame.y0 * M + terrain.data.reference.verticalOriginMetres;
    expect(Math.abs(rh2000 - 27.75)).toBeLessThan(0.2);
    const p = stadium.turf.geometry.getAttribute('position');
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      expect(Math.abs(p.getY(i) - terrain.groundHeight(x, z)) * M).toBeLessThan(0.005);
      const v = new Vector3(x, p.getY(i), z).applyMatrix4(frame.toLocal);
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      z0 = Math.min(z0, v.z);
      z1 = Math.max(z1, v.z);
    }
    expect(Math.abs(x0 - PITCH.turf.x0)).toBeLessThan(0.3);
    expect(Math.abs(x1 - PITCH.turf.x1)).toBeLessThan(0.3);
    expect(Math.abs(z0 - PITCH.turf.z0)).toBeLessThan(0.3);
    expect(Math.abs(z1 - PITCH.turf.z1)).toBeLessThan(0.3);
  });
});

describe('Idrottsparken: measured architecture', () => {
  test('four masts at the LiDAR positions, heads 52–58 m above the pitch', () => {
    const steel = vertices('steel');
    for (const m of MASTS) {
      const near = steel.filter(([x, , z]) => Math.hypot(x - m.x, z - m.z) < 4);
      const top = Math.max(...near.map((v) => v[1]));
      expect(top).toBeGreaterThan(57);
      expect(top).toBeLessThan(59.5);
      const base = Math.min(...near.map((v) => v[1]));
      expect(base).toBeCloseTo(frame.ground(m.x, m.z), 0);
    }
  });
  test('roof heights within the LiDAR range and front edges at the measured lines', () => {
    const roof = vertices('roof').filter(
      ([x, , z]) =>
        !rect(TEKNIKHALLEN, x, z, 1) &&
        !rect(TENNISHALLEN, x, z, 1) &&
        !rect(WEST_PROJECTION, x, z, 3),
    );
    const ys = roof.map((v) => v[1]);
    expect(Math.max(...ys)).toBeLessThan(16.9);
    expect(Math.max(...ys)).toBeGreaterThan(16.5);
    // No roof part overhangs the turf (LiDAR fronts: west 40.1, east −42.8, north 68.3).
    for (const [x, , z] of roof) expect(rect(PITCH.turf, x, z, -0.5)).toBe(false);
  });
  test('stands, roofs and walls stay inside the OSM footprint; the south-east corner stays open', () => {
    for (const name of ['concrete', 'roof', 'cladding', 'glass']) {
      for (const [x, y, z] of vertices(name)) {
        const ok =
          inPolygon(x, z, OUTLINE) ||
          edgeDistance(x, z, OUTLINE) < 2.4 ||
          rect(TEKNIKHALLEN, x, z, 0.5) ||
          rect(TENNISHALLEN, x, z, 0.5) ||
          rect(WEST_PROJECTION, x, z, 4.5) ||
          rect(PITCH.turf, x, z, 0.5);
        expect(ok, `${name} vertex ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`).toBe(true);
        // Open corner (OSM: no building between the east stand gable and the south terrace).
        if (x < -42 && z < -56 && z > -78)
          expect(y, `${name} in the open corner`).toBeLessThan(frame.ground(x, z) + 1.5);
      }
    }
  });
  test('terrain never pokes through the stands, and every rake reaches below the ground', () => {
    const ray = new Raycaster();
    const solids = ['concrete', 'seats', 'roof', 'cladding', 'glass'].map(mesh);
    let checked = 0;
    for (let x = -62; x <= 64; x += 3)
      for (let z = -80; z <= 88; z += 3) {
        if (!inPolygon(x, z, OUTLINE) || rect(PITCH.turf, x, z, 0.5)) continue;
        const [wx, wz] = frame.world(x, z);
        ray.set(new Vector3(wx, frame.y0 + 80 / M, wz), new Vector3(0, -1, 0));
        const hit = ray.intersectObjects(solids, false)[0];
        if (!hit) continue;
        checked++;
        expect((hit.point.y - terrain.groundHeight(wx, wz)) * M, `${x},${z}`).toBeGreaterThan(
          -0.03,
        );
      }
    expect(checked).toBeGreaterThan(1000); // 3 m grid over the outline minus the turf
    expect(stadium.report.foundationDepth).toBeLessThan(0);
  });
  test('Teknikhallen and the tennis hall follow LiDAR heights, not the earlier estimates', () => {
    const roof = vertices('roof');
    const hall = roof.filter(([x, , z]) => rect(TEKNIKHALLEN, x, z));
    expect(Math.max(...hall.map((v) => v[1]))).toBeLessThan(14.2);
    const tennis = roof.filter(([x, , z]) => rect(TENNISHALLEN, x, z));
    expect(Math.max(...tennis.map((v) => v[1]))).toBeLessThan(12.6);
  });
});

describe('Idrottsparken: budgets and lighting hooks', () => {
  test('merged structure: few draw calls, bounded triangles', () => {
    let meshes = 0;
    stadium.group.traverse((o) => (o as Mesh).isMesh && meshes++);
    expect(meshes).toBeLessThanOrEqual(10);
    expect(stadium.report.triangles).toBeLessThan(150_000);
  });
  test('floodlights fit the shader budget; mast emitters sit in the mast heads', () => {
    expect(stadium.emitters.length).toBeLessThanOrEqual(STADIUM_MAX);
    expect(stadium.roofs.length).toBeLessThanOrEqual(STADIUM_ROOFS);
    const masts = stadium.emitters.filter((_, j) => stadium.emitterGroups[j] === 'masts');
    expect(masts.length).toBe(8);
    for (const e of masts) {
      expect(e.position[1]).toBeGreaterThan(52);
      expect(
        Math.min(...MASTS.map((m) => Math.hypot(m.x - e.position[0], m.z - e.position[2]))),
      ).toBeLessThan(4);
      expect(e.aim[1]).toBeLessThan(-0.3); // aimed down at the pitch
    }
  });
});
