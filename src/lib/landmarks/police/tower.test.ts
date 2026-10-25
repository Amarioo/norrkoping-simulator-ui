import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Box3, BufferGeometry, Vector3 } from 'three';
import {
  DETAIL,
  EDGE_M,
  METRES_PER_UNIT,
  PLANT,
  SIGN,
  TOWER,
  TOWER_MEASURED,
  TOWER_MODEL,
  signPlacement,
} from './spec';
import {
  PARTS,
  TOWER_SURFACES,
  nearTower,
  policeTowerGeometry,
  sceneToTower,
  towerOutline,
  towerToScene,
} from './tower';

/** Police Tower D1b LiDAR parts (scripts/police-tower-d1b/police_tower_parts.py). */
const parts = JSON.parse(
  fs.readFileSync('docs/police-tower-d1b/data/police-tower-parts.json', 'utf8'),
);
/** D1's whole-roof measurement (scripts/police-signs-d1/police_tower_lidar.py), unchanged. */
const d1 = JSON.parse(fs.readFileSync('docs/police-signs-d1/data/police-tower-lidar.json', 'utf8'));
const terrainRef = JSON.parse(fs.readFileSync('src/lib/data/terrain.json', 'utf8')).reference;
const M = METRES_PER_UNIT;
const BASE = 11.0; // RH2000 m, a ground level for the pure-geometry tests (the app uses the DTM)

describe('Police Tower D1b: measurements', () => {
  test('spec.ts holds the LiDAR output', () => {
    expect(TOWER.centreScene).toEqual(parts.frame.centreScene);
    expect(TOWER.axisSweref).toEqual(parts.frame.axisSweref);
    const u = parts.upper.extent;
    expect([TOWER.upper.a0, TOWER.upper.a1, TOWER.upper.c0, TOWER.upper.c1]).toEqual([
      u.a0,
      u.a1,
      u.c0,
      u.c1,
    ]);
    expect(TOWER.upper.roof).toBe(parts.upper.roof.p50);
    // Parapet: the edge returns' 90th percentile, between their median and maximum.
    expect(TOWER.upper.parapet).toBe(parts.upper.edges.p90);
    expect(TOWER.upper.parapet).toBeGreaterThan(parts.upper.gableEdge.p50);
    expect(TOWER.upper.parapet).toBeLessThanOrEqual(parts.upper.gableEdge.max);
    expect(TOWER.east).toEqual({
      a1: parts.east.extent.a1,
      c1: parts.east.extent.c1,
      roof: parts.east.trough.p50,
      rimInnerC: parts.east.rimInnerC,
      rimTop: parts.east.rim.p50,
    });
    expect(TOWER.north).toEqual({
      a0: parts.north.extent.a0,
      c0: parts.north.extent.c0,
      roof: parts.north.roof.p50,
    });
    expect(TOWER.ground).toBe(parts.ground.gableFront.p50);
    expect(PLANT).toEqual(
      parts.plant.map((p: Record<string, unknown>) => {
        const { a0, a1, c0, c1, top, mastAt, baseTop } = p;
        return mastAt ? { a0, a1, c0, c1, top, mastAt, baseTop } : { a0, a1, c0, c1, top };
      }),
    );
    // The recess beside the SSE gable is empty above 13.5 m (the low wings).
    expect(parts.recess.returnsAbove13_5).toBe(0);
  });

  test('scene units: 25 m and RH2000 from 0, as the terrain reference', () => {
    expect(terrainRef.metresPerUnit).toBe(M);
    expect(terrainRef.verticalDatum).toBe('RH2000');
    expect(terrainRef.verticalOriginMetres).toBe(0);
  });

  test('the parts are as the photos show: a taller gable block, a lower east strip and north end', () => {
    // UPPER ≈ 9 m wide, one storey (3.2–4 m) above the EAST strip; NORTH as high as the rim.
    expect(PARTS.upper.c1 - PARTS.upper.c0).toBeGreaterThan(8.5);
    expect(PARTS.upper.c1 - PARTS.upper.c0).toBeLessThan(9.5);
    expect(TOWER.upper.roof - TOWER.east.roof).toBeGreaterThan(3.2);
    expect(TOWER.upper.roof - TOWER.east.roof).toBeLessThan(4);
    expect(Math.abs(TOWER.north.roof - TOWER.east.rimTop)).toBeLessThan(0.1);
    // The EAST strip ends 4–5 m short of the SSE gable.
    expect(PARTS.upper.a1 - PARTS.east.a1).toBeGreaterThan(4);
    expect(PARTS.upper.a1 - PARTS.east.a1).toBeLessThan(5);
  });

  test('the whole tower agrees with D1’s one-rectangle measurement', () => {
    const length = PARTS.upper.a1 - PARTS.north.a0,
      width = PARTS.east.c1 - PARTS.upper.c0;
    // D1: 54.38 × 13.42 m between the 1st/99th percentiles (walls up to 0.5 m further out).
    expect(length - d1.tower.lengthM).toBeGreaterThan(0);
    expect(length - d1.tower.lengthM).toBeLessThan(1.5);
    expect(width - d1.tower.widthM).toBeGreaterThan(0);
    expect(width - d1.tower.widthM).toBeLessThan(0.5);
    // The footprint's centre is D1's centre within 0.5 m.
    const [a, c] = sceneToTower(...(d1.frame.centreScene as [number, number]));
    expect(Math.abs(a - (PARTS.upper.a1 + PARTS.north.a0) / 2)).toBeLessThan(0.5);
    expect(Math.abs(c - (PARTS.east.c1 + PARTS.upper.c0) / 2)).toBeLessThan(0.5);
    // Height: parapet above the ground in front of the SSE gable ≈ 37.6 m (D1: ≈ 37.7 m).
    expect(TOWER.upper.parapet - TOWER.ground).toBeCloseTo(37.61, 2);
    expect(
      Math.abs(TOWER.upper.parapet - TOWER.ground - (49.5 - TOWER_MEASURED.groundRH2000)),
    ).toBeLessThan(0.3);
    // The UPPER block's axis is within 2° of D1's whole-roof axis.
    expect(Math.abs(parts.frame.axisBearingDeg - TOWER_MEASURED.bearingDeg)).toBeLessThan(2);
  });
});

describe('Police Tower D1b: frame', () => {
  test('TOWER_MODEL places the group on the measured frame', () => {
    expect(TOWER_MODEL.position).toEqual(TOWER.centreScene);
    const bearing =
      (Math.atan2(Math.sin(TOWER_MODEL.rotation), Math.cos(TOWER_MODEL.rotation)) * 180) / Math.PI;
    // Local +z = (sin r, cos r) in scene x/z (x east, z south): bearing from grid north = 180° − r.
    expect(180 - bearing).toBeCloseTo(parts.frame.axisBearingDeg, 2);
    expect(TOWER_MODEL.halfLength * M).toBeCloseTo(TOWER.upper.a1 + EDGE_M, 10);
    expect(TOWER_MODEL.parapetTop * M).toBeCloseTo(TOWER.upper.parapet, 10);
  });

  test('frame ↔ scene: origin, SSE gable centre, round trip', () => {
    expect(towerToScene(0, 0)).toEqual(TOWER.centreScene);
    const [gx, gz] = towerToScene(TOWER.upper.a1, 0);
    expect(gx).toBeCloseTo(parts.frame.gableCentreScene[0], 3);
    expect(gz).toBeCloseTo(parts.frame.gableCentreScene[1], 3);
    for (const [a, c] of [
      [12.5, -3],
      [-30, 9],
      [0, 0],
    ]) {
      const [x, z] = towerToScene(a, c);
      const [a2, c2] = sceneToTower(x, z);
      expect(a2).toBeCloseTo(a, 9);
      expect(c2).toBeCloseTo(c, 9);
    }
  });

  test('footprint outline and nearTower', () => {
    const ring = towerOutline();
    expect(ring).toHaveLength(8);
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i],
        [x1, z1] = ring[(i + 1) % ring.length];
      area += (x0 * z1 - x1 * z0) / 2;
    }
    const partsArea = Object.values(PARTS).reduce((s, p) => s + (p.a1 - p.a0) * (p.c1 - p.c0), 0);
    expect(Math.abs(area) * M * M).toBeCloseTo(partsArea, 3);
    expect(nearTower(...TOWER.centreScene)).toBe(true);
    expect(nearTower(...towerToScene(0, PARTS.upper.c0 - 2), 0)).toBe(false);
    expect(nearTower(...towerToScene(0, PARTS.upper.c0 - 2), 3)).toBe(true);
    // The recess corner is not part of the footprint.
    expect(nearTower(...towerToScene(PARTS.upper.a1 - 1, PARTS.east.c1 - 1))).toBe(false);
  });
});

describe('Police Tower D1b: geometry', () => {
  const tower = policeTowerGeometry(BASE);
  const bounds = (g: BufferGeometry) =>
    new Box3().setFromBufferAttribute(g.getAttribute('position') as never);

  test('six surfaces, each non-empty, small triangle budget', () => {
    expect(Object.keys(tower.geometries).sort()).toEqual([...TOWER_SURFACES].sort());
    for (const s of TOWER_SURFACES)
      expect(tower.geometries[s].getAttribute('position').count).toBeGreaterThan(0);
    expect(tower.triangles).toBeLessThan(500);
  });

  test('heights: walls from the base to the parapet, plant and mast at their measured tops', () => {
    const walls = new Box3();
    for (const s of ['facade', 'gable', 'wall', 'roof', 'coping'] as const)
      walls.union(bounds(tower.geometries[s]));
    expect(walls.min.y * M).toBeCloseTo(BASE, 4);
    expect(walls.max.y * M).toBeCloseTo(TOWER.upper.parapet, 4);
    const plant = bounds(tower.geometries.plant);
    expect(plant.max.y * M).toBeCloseTo(64.12, 4);
    // Every plant box stands on a roof and reaches its cluster's top.
    for (const b of tower.plant) {
      expect([
        TOWER.upper.roof,
        TOWER.east.roof,
        TOWER.east.rimTop,
        TOWER.north.roof,
        51.89,
      ]).toContain(b.h0);
      expect(b.h1).toBeGreaterThan(b.h0);
    }
    expect(Math.max(...tower.plant.map((b) => b.h1))).toBe(64.12);
  });

  test('footprint: the parts, nothing in the SSE recess, nothing outside', () => {
    const all = new Box3();
    for (const s of TOWER_SURFACES) all.union(bounds(tower.geometries[s]));
    expect(all.min.x * M).toBeCloseTo(PARTS.upper.c0, 4);
    expect(all.max.x * M).toBeCloseTo(PARTS.east.c1, 4);
    expect(all.min.z * M).toBeCloseTo(PARTS.north.a0, 4);
    expect(all.max.z * M).toBeCloseTo(PARTS.upper.a1, 4);
    // No triangle in the recess (a between the EAST strip's end and the gable, c east of UPPER).
    for (const s of TOWER_SURFACES) {
      const p = tower.geometries[s].getAttribute('position');
      for (let t = 0; t < p.count; t += 3) {
        const c = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3,
          a = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
        const inRecess =
          a * M > PARTS.east.a1 + 0.01 &&
          a * M < PARTS.upper.a1 - 0.01 &&
          c * M > PARTS.upper.c1 + 0.01 &&
          c * M < PARTS.east.c1;
        expect(inRecess).toBe(false);
      }
    }
  });

  test('faces point outwards: roofs up, walls horizontal, no faces underneath', () => {
    for (const s of TOWER_SURFACES) {
      const n = tower.geometries[s].getAttribute('normal');
      for (let i = 0; i < n.count; i++) {
        const v = new Vector3(n.getX(i), n.getY(i), n.getZ(i));
        expect(v.length()).toBeCloseTo(1, 5);
        expect(v.y).toBeGreaterThan(-1e-6);
      }
    }
    // The SSE gable faces +z (out of the gable, where the sign is).
    const g = tower.geometries.gable,
      pos = g.getAttribute('position'),
      nrm = g.getAttribute('normal');
    let sse = 0;
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(pos.getZ(i) - TOWER_MODEL.halfLength) < 1e-6) {
        expect(nrm.getZ(i)).toBeCloseTo(1, 6);
        sse++;
      }
    expect(sse).toBe(6);
  });

  test('façade groups: 0 = faces towards ENE (+x), 1 = towards WSW (−x), for the two window patterns', () => {
    const g = tower.geometries.facade,
      n = g.getAttribute('normal');
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1]);
    expect(g.groups[0].start + g.groups[0].count).toBe(g.groups[1].start);
    expect(g.groups[1].start + g.groups[1].count).toBe(n.count);
    for (const { start, count, materialIndex } of g.groups)
      for (let i = start; i < start + count; i++)
        expect(n.getX(i)).toBeCloseTo(materialIndex === 0 ? 1 : -1, 6);
    // Both sides carry windows: the ENE side (UPPER top storey, EAST strip, NORTH block) and WSW.
    expect(g.groups[0].count).toBeGreaterThan(0);
    expect(g.groups[1].count).toBeGreaterThan(0);
  });

  test('façade texture coordinates follow the [EST] bay and storey size', () => {
    const uv = tower.geometries.facade.getAttribute('uv'),
      pos = tower.geometries.facade.getAttribute('position');
    for (let i = 0; i < uv.count; i++) {
      expect(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i))).toBe(true);
      expect(uv.getY(i)).toBeCloseTo((pos.getY(i) * M - TOWER.ground) / (11 * DETAIL.storeyM), 5);
    }
  });
});

describe('Police Tower D1b: the emblem on the measured gable', () => {
  const p = signPlacement(M);
  test('centred on the UPPER gable, in front of it, 7.3 m below the parapet (42.05 m RH2000)', () => {
    expect((p.z - PARTS.upper.a1 / M) * M).toBeCloseTo(SIGN.standoffM, 4);
    expect((TOWER_MODEL.parapetTop - p.y) * M).toBeCloseTo(SIGN.centreBelowParapetM, 4);
    expect(p.y * M).toBeCloseTo(TOWER.upper.parapet - SIGN.centreBelowParapetM, 4);
    // D1 follow-up (on main): the emblem scaled to the 9.3 m dark gable, centre 7.3 m below the parapet.
    expect(SIGN.centreBelowParapetM).toBe(7.3);
    expect(p.y * M).toBeCloseTo(42.05, 4);
    expect((p.x + p.width / 2) * M).toBeLessThan(PARTS.upper.c1);
    expect((p.x - p.width / 2) * M).toBeGreaterThan(PARTS.upper.c0);
    expect((p.y + p.height / 2) * M).toBeLessThan(TOWER.upper.parapet);
    // 30.3 m above the ground in front of the gable.
    expect(p.y * M - TOWER.ground).toBeCloseTo(30.31, 2);
  });
});
