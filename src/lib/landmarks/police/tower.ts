import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { DETAIL, EDGE_M, METRES_PER_UNIT, PLANT, TOWER, TOWER_MODEL } from './spec';

/**
 * Police Tower Phase D1b: the police tower (Polishuset, Stinsen 1) from the LiDAR parts in spec.ts
 * (TOWER, PLANT), replacing the earlier illustrative slab. Built in the tower group's frame
 * (TOWER_MODEL): scene units, local +z = a (towards the SSE gable), local +x = c (towards ENE),
 * local y = RH2000 / 25 (the group stands at scene height 0, like Rådhuset). The walls reach down
 * to `base`, the lowest rendered ground under the tower's footprint (as for every OSM building).
 *
 * One geometry per surface kind, so the tower is six meshes whatever its detail: the window
 * texture on the long façades, the dark gables, plain light walls, roofs, the parapet coping and
 * the rooftop plant. The façade geometry has two groups, as the earlier slab's box had for its long
 * sides: group 0 = the faces towards ENE (+c, local +x), group 1 = towards WSW (−c), so each side
 * gets its own lit-window pattern at night (windows.ts, FACADE_SEEDS). mapLandmarks.ts gives the
 * surfaces the material kinds the earlier tower used (colour; window map + emissive map on a
 * single-instance InstancedMesh), so no shader program is added.
 */
export type TowerSurface = 'facade' | 'gable' | 'wall' | 'roof' | 'coping' | 'plant';
export const TOWER_SURFACES: TowerSurface[] = [
  'facade',
  'gable',
  'wall',
  'roof',
  'coping',
  'plant',
];

type P = [number, number, number];
/** TOWER FRAME (a, c metres, h RH2000 metres) → tower group coordinates (scene units). */
const L = (a: number, c: number, h: number): P => [
  c / METRES_PER_UNIT,
  h / METRES_PER_UNIT,
  a / METRES_PER_UNIT,
];

/** The drawn parts in the TOWER FRAME (metres): extents + EDGE_M, joined where they meet. */
export const PARTS = (() => {
  const e = EDGE_M,
    u = TOWER.upper;
  const upper = { a0: u.a0 - e, a1: u.a1 + e, c0: u.c0 - e, c1: u.c1 + e };
  const north = {
    a0: TOWER.north.a0 - e,
    a1: upper.a0,
    c0: TOWER.north.c0 - e,
    c1: TOWER.east.c1 + e,
  };
  const east = { a0: upper.a0, a1: TOWER.east.a1 + e, c0: upper.c1, c1: TOWER.east.c1 + e };
  return { upper, east, north };
})();

/** TOWER FRAME (a, c metres) → scene [x, z]. */
export function towerToScene(a: number, c: number): [number, number] {
  const r = TOWER_MODEL.rotation,
    [x0, z0] = TOWER_MODEL.position;
  const lx = c / METRES_PER_UNIT,
    lz = a / METRES_PER_UNIT;
  // three.js rotation about +y: local (x, z) → (x cos r + z sin r, −x sin r + z cos r).
  return [x0 + lx * Math.cos(r) + lz * Math.sin(r), z0 - lx * Math.sin(r) + lz * Math.cos(r)];
}

/** Scene [x, z] → TOWER FRAME (a, c metres). */
export function sceneToTower(x: number, z: number): [number, number] {
  const r = TOWER_MODEL.rotation,
    dx = x - TOWER_MODEL.position[0],
    dz = z - TOWER_MODEL.position[1];
  return [
    (dx * Math.sin(r) + dz * Math.cos(r)) * METRES_PER_UNIT,
    (dx * Math.cos(r) - dz * Math.sin(r)) * METRES_PER_UNIT,
  ];
}

/** The tower's footprint outline in scene [x, z] (counter-clockwise in the TOWER FRAME, open ring). */
export function towerOutline(): [number, number][] {
  const { upper: U, east: E, north: N } = PARTS;
  const corners: [number, number][] = [
    [U.a1, U.c0],
    [U.a1, U.c1],
    [E.a1, E.c0],
    [E.a1, E.c1],
    [N.a0, N.c1],
    [N.a0, N.c0],
    [N.a1, N.c0],
    [U.a0, U.c0],
  ];
  return corners.map(([a, c]) => towerToScene(a, c));
}

/** True when the scene point lies within `marginM` metres of the tower's footprint. */
export function nearTower(x: number, z: number, marginM = 0) {
  const [a, c] = sceneToTower(x, z);
  return Object.values(PARTS).some(
    (p) => a > p.a0 - marginM && a < p.a1 + marginM && c > p.c0 - marginM && c < p.c1 + marginM,
  );
}

class Faces {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly uv: number[] = [];
  private a = new Vector3();
  private b = new Vector3();
  /** Quad p0..p3 (a planar loop), facing `out` (local direction); `uvs` per corner. */
  quad(p: P[], out: P, uvs?: [number, number][]) {
    this.a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    this.b.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    const n = this.a.cross(this.b);
    if (n.lengthSq() < 1e-16) return;
    n.normalize();
    let order = [0, 1, 2, 0, 2, 3];
    if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) {
      n.negate();
      order = [0, 2, 1, 0, 3, 2];
    }
    for (const i of order) {
      this.position.push(...p[i]);
      this.normal.push(n.x, n.y, n.z);
      this.uv.push(...(uvs?.[i] ?? [0, 0]));
    }
  }
  get triangles() {
    return this.position.length / 9;
  }
  /** The faces as one geometry; with `more`, its faces follow as material group 1 (this = group 0). */
  geometry(more?: Faces) {
    const g = new BufferGeometry();
    const cat = (k: 'position' | 'normal' | 'uv') => (more ? [...this[k], ...more[k]] : this[k]);
    g.setAttribute('position', new Float32BufferAttribute(cat('position'), 3));
    g.setAttribute('normal', new Float32BufferAttribute(cat('normal'), 3));
    g.setAttribute('uv', new Float32BufferAttribute(cat('uv'), 2));
    if (more) {
      g.addGroup(0, this.triangles * 3, 0);
      g.addGroup(this.triangles * 3, more.triangles * 3, 1);
    }
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The tower's geometry per surface kind, in the tower group's frame. `base` = lowest ground under the
 * footprint, RH2000 m.
 */
export function policeTowerGeometry(base: number) {
  const f = Object.fromEntries(TOWER_SURFACES.map((s) => [s, new Faces()])) as Record<
    TowerSurface,
    Faces
  >;
  /** WSW-facing façade faces (material group 1); `f.facade` holds the ENE-facing ones (group 0). */
  const facadeW = new Faces();
  // Window texture [EST]: 16 bays × 11 storeys per texture repeat, anchored at the ground in front.
  const repeatU = 16 * DETAIL.bayM,
    repeatV = 11 * DETAIL.storeyM;
  const facadeUv = (s0: number, s1: number, h0: number, h1: number): [number, number][] => {
    const v0 = (h0 - TOWER.ground) / repeatV,
      v1 = (h1 - TOWER.ground) / repeatV;
    return [
      [s0 / repeatU, v0],
      [s1 / repeatU, v0],
      [s1 / repeatU, v1],
      [s0 / repeatU, v1],
    ];
  };
  /** Wall at a = const (normal ±a), c from c0 to c1. */
  const wallA = (
    s: TowerSurface,
    a: number,
    dir: number,
    c0: number,
    c1: number,
    h0: number,
    h1: number,
  ) =>
    f[s].quad(
      [L(a, c0, h0), L(a, c1, h0), L(a, c1, h1), L(a, c0, h1)],
      L(dir, 0, 0),
      s === 'facade' ? facadeUv(c0, c1, h0, h1) : undefined,
    );
  /** Wall at c = const (normal ±c), a from a0 to a1. */
  const wallC = (
    s: TowerSurface,
    c: number,
    dir: number,
    a0: number,
    a1: number,
    h0: number,
    h1: number,
  ) =>
    (s === 'facade' && dir < 0 ? facadeW : f[s]).quad(
      [L(a0, c, h0), L(a1, c, h0), L(a1, c, h1), L(a0, c, h1)],
      L(0, dir, 0),
      s === 'facade' ? facadeUv(a0, a1, h0, h1) : undefined,
    );
  const top = (s: TowerSurface, a0: number, a1: number, c0: number, c1: number, h: number) => {
    if (a1 - a0 < 1e-6 || c1 - c0 < 1e-6) return;
    f[s].quad([L(a0, c0, h), L(a1, c0, h), L(a1, c1, h), L(a0, c1, h)], [0, 1, 0]);
  };
  /** Closed-top box (four sides, top) in the TOWER FRAME, all one surface. */
  const box = (
    s: TowerSurface,
    a0: number,
    a1: number,
    c0: number,
    c1: number,
    h0: number,
    h1: number,
  ) => {
    wallA(s, a1, 1, c0, c1, h0, h1);
    wallA(s, a0, -1, c0, c1, h0, h1);
    wallC(s, c1, 1, a0, a1, h0, h1);
    wallC(s, c0, -1, a0, a1, h0, h1);
    top(s, a0, a1, c0, c1, h1);
  };

  const { upper: U, east: E, north: N } = PARTS;
  const roofU = TOWER.upper.roof,
    parapet = TOWER.upper.parapet,
    t = DETAIL.parapetM;
  // UPPER block: walls to the parapet top, roof inside the parapet, coping on top.
  wallA('gable', U.a1, 1, U.c0, U.c1, base, parapet); // SSE gable (the emblem)
  wallA('gable', U.a0, -1, U.c0, U.c1, base, parapet); // NNW gable [EST: not photographed]
  wallC('facade', U.c0, -1, U.a0, U.a1, base, parapet); // WSW façade
  // ENE façade: above the EAST strip's roof along the strip, full height in the SSE recess.
  wallC('facade', U.c1, 1, U.a0, E.a1, TOWER.east.roof, parapet);
  wallC('facade', U.c1, 1, E.a1, U.a1, base, parapet);
  top('roof', U.a0 + t, U.a1 - t, U.c0 + t, U.c1 - t, roofU);
  top('coping', U.a0, U.a1, U.c0, U.c0 + t, parapet);
  top('coping', U.a0, U.a1, U.c1 - t, U.c1, parapet);
  top('coping', U.a0, U.a0 + t, U.c0 + t, U.c1 - t, parapet);
  top('coping', U.a1 - t, U.a1, U.c0 + t, U.c1 - t, parapet);
  wallA('coping', U.a1 - t, -1, U.c0 + t, U.c1 - t, roofU, parapet);
  wallA('coping', U.a0 + t, 1, U.c0 + t, U.c1 - t, roofU, parapet);
  wallC('coping', U.c1 - t, -1, U.a0 + t, U.a1 - t, roofU, parapet);
  wallC('coping', U.c0 + t, 1, U.a0 + t, U.a1 - t, roofU, parapet);

  // EAST strip: roof (trough) and the raised outer rim; its SSE end is the recessed light wall.
  const rimC = TOWER.east.rimInnerC,
    roofE = TOWER.east.roof,
    rimTop = TOWER.east.rimTop;
  wallC('facade', E.c1, 1, E.a0, E.a1, base, rimTop); // ENE façade
  wallA('wall', E.a1, 1, E.c0, rimC, base, roofE); // SSE end, beside the gable (recessed)
  wallA('wall', E.a1, 1, rimC, E.c1, base, rimTop);
  top('roof', E.a0, E.a1, E.c0, rimC, roofE);
  top('coping', E.a0, E.a1, rimC, E.c1, rimTop);
  wallC('wall', rimC, -1, E.a0, E.a1, roofE, rimTop);

  // NORTH block.
  const roofN = TOWER.north.roof;
  wallA('wall', N.a0, -1, N.c0, N.c1, base, roofN); // NNW end
  wallC('wall', N.c0, -1, N.a0, N.a1, base, roofN); // WSW side
  wallC('facade', N.c1, 1, N.a0, N.a1, base, roofN); // ENE façade, in line with the EAST strip
  top('roof', N.a0, N.a1, N.c0, N.c1, roofN);
  wallA('wall', N.a1, 1, U.c1, rimC, roofE, roofN); // step up from the EAST strip's roof

  // Rooftop plant: each cluster a box from the roof under its centre to its top, clamped to that
  // roof part (single returns get the [EST] minimum size); the mast a thin box to its top.
  const roofAt = (a: number, c: number) => {
    if (a < U.a0) return { h: roofN, part: N };
    if (c > U.c1) return { h: c > rimC ? rimTop : roofE, part: E };
    return { h: roofU, part: { a0: U.a0 + t, a1: U.a1 - t, c0: U.c0 + t, c1: U.c1 - t } };
  };
  const grow = (lo: number, hi: number) => {
    const pad = Math.max(0, DETAIL.plantMinM - (hi - lo)) / 2;
    return [lo - pad, hi + pad];
  };
  const plant: { a0: number; a1: number; c0: number; c1: number; h0: number; h1: number }[] = [];
  for (const p of PLANT) {
    const { h, part } = roofAt((p.a0 + p.a1) / 2, (p.c0 + p.c1) / 2);
    const [a0, a1] = grow(p.a0, p.a1).map((v) => Math.min(part.a1, Math.max(part.a0, v)));
    const [c0, c1] = grow(p.c0, p.c1).map((v) => Math.min(part.c1, Math.max(part.c0, v)));
    if (p.mastAt) {
      const half = DETAIL.mastM / 2,
        [ma, mc] = p.mastAt;
      plant.push({ a0, a1, c0, c1, h0: h, h1: p.baseTop! });
      plant.push({
        a0: ma - half,
        a1: ma + half,
        c0: mc - half,
        c1: mc + half,
        h0: p.baseTop!,
        h1: p.top,
      });
    } else plant.push({ a0, a1, c0, c1, h0: h, h1: p.top });
  }
  for (const b of plant) box('plant', b.a0, b.a1, b.c0, b.c1, b.h0, b.h1);

  const geometries = Object.fromEntries(
    TOWER_SURFACES.map((s) => [s, s === 'facade' ? f[s].geometry(facadeW) : f[s].geometry()]),
  ) as Record<TowerSurface, BufferGeometry>;
  return {
    geometries,
    plant,
    triangles: TOWER_SURFACES.reduce((n, s) => n + f[s].triangles, facadeW.triangles),
  };
}
