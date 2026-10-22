/**
 * Idrottsparken (Norrköpings Idrottspark), Step 6 reconstruction. Dimensions: ./spec.ts (with sources).
 *
 * Built in the arena frame (metres) inside one group placed at the OSM pitch centre and the rendered
 * ground there (Object3D scale 1/metresPerUnit), so the verified anchor and orientation of the earlier
 * model are kept and no scale factors are scattered through the code.
 *
 * Draw calls: structure is merged per material with vertex colours (concrete, seats, roof, steel,
 * cladding, glass); projectors are instanced. The turf is a separate world-space mesh draped on the
 * terrain (like the runways), ordered above the OSM pitch land cover by depth rank, so the playing
 * surface neither floats nor z-fights.
 *
 * Terrain: rigid stands are not warped. Their bodies reach down to the lowest rendered ground under
 * them (foundations hidden in the terrain), and the south terrace treads are raised where the measured
 * slope (part of the DTM, LiDAR class 2) would cut through them.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import type { TerrainService } from '../terrain';
import { cityMap, centerOf } from '../mapModel';
import { groundRectangle } from '../placeBuilder';
import { LAYER_RANK, layeredSurface } from '../groundLayers';
import type { StadiumEmitter, StadiumRoof } from '../lighting/cityLights';
import {
  MASTS,
  OUTLINE,
  PITCH,
  ROOF,
  STANDS,
  STATUE,
  TEKNIKHALLEN,
  TENNISHALLEN,
  WEST_PROJECTION,
} from './spec';

/** The arena frame: OSM pitch centre and longest-edge orientation, pitch-level ground. */
export function arenaFrame(terrain: TerrainService) {
  const pitch = cityMap.areas.find((a) => a.id === 'way/100955051')!;
  const ring = pitch.rings[0];
  let longest = [ring[0], ring[1]];
  for (let i = 1; i < ring.length; i++)
    if (
      Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]) >
      Math.hypot(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1])
    )
      longest = [ring[i - 1], ring[i]];
  const rotation = Math.atan2(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1]);
  const [cx, cz] = centerOf(pitch);
  const metres = terrain.data.reference.metresPerUnit;
  const y0 = terrain.groundHeight(cx, cz);
  const toWorld = new Matrix4().compose(
    new Vector3(cx, y0, cz),
    new Quaternion().setFromEuler(new Euler(0, rotation, 0)),
    new Vector3(1 / metres, 1 / metres, 1 / metres),
  );
  const toLocal = toWorld.clone().invert();
  /** Arena metres → scene [x, z]. */
  const world = (x: number, z: number): [number, number] => [
    cx + (x * Math.cos(rotation) + z * Math.sin(rotation)) / metres,
    cz + (-x * Math.sin(rotation) + z * Math.cos(rotation)) / metres,
  ];
  /** Rendered ground at an arena point, metres above the pitch level. */
  const ground = (x: number, z: number) => (terrain.groundHeight(...world(x, z)) - y0) * metres;
  return {
    centre: [cx, cz] as [number, number],
    rotation,
    y0,
    metres,
    toWorld,
    toLocal,
    world,
    ground,
  };
}
export type ArenaFrame = ReturnType<typeof arenaFrame>;

/** Collects transformed, vertex-coloured triangles of one material into one geometry. */
class Merge {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private static box = new BoxGeometry(1, 1, 1).toNonIndexed();
  private m = new Matrix4();
  private nm = new Matrix3();
  private v = new Vector3();
  add(g: BufferGeometry, matrix: Matrix4, color: Color, faceColors?: (normal: Vector3) => Color) {
    const pos = g.getAttribute('position'),
      nor = g.getAttribute('normal');
    this.nm.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      this.v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.p.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize();
      this.n.push(this.v.x, this.v.y, this.v.z);
      const col = faceColors ? faceColors(this.v) : color;
      this.c.push(col.r, col.g, col.b);
    }
  }
  /** Axis-aligned (optionally rotated) box: centre, size, rotation (radians, XYZ order). */
  box(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    this.m.compose(
      new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
      new Vector3(sx, sy, sz),
    );
    this.add(Merge.box, this.m, color);
  }
  /** Unit box transformed by a matrix. */
  boxMatrix(matrix: Matrix4, color: Color) {
    this.add(Merge.box, matrix, color);
  }
  /** Box between two y levels. */
  column(x: number, z: number, sx: number, sz: number, y0: number, y1: number, color: Color) {
    this.box(x, (y0 + y1) / 2, z, sx, y1 - y0, sz, color);
  }
  /** Beam between two points with a square section. */
  beam(a: Vector3, b: Vector3, size: number, color: Color) {
    const d = new Vector3().subVectors(b, a),
      len = d.length();
    if (len < 1e-6) return;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    this.m.compose(
      new Vector3().addVectors(a, b).multiplyScalar(0.5),
      q,
      new Vector3(size, len, size),
    );
    this.add(Merge.box, this.m, color);
  }
  /**
   * Convex prism: plan polygon (counter-clockwise or clockwise), top and bottom height functions.
   * Top faces get `top`, bottom faces `bottom`, sides `side`.
   */
  prism(
    plan: [number, number][],
    topY: (x: number, z: number) => number,
    bottomY: (x: number, z: number) => number,
    top: Color,
    bottom: Color,
    side: Color,
  ) {
    const tri = (a: number[], b: number[], c: number[], col: Color) => {
      const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
        ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const n = ab.cross(ac).normalize();
      for (const p of [a, b, c]) {
        this.p.push(p[0], p[1], p[2]);
        this.n.push(n.x, n.y, n.z);
        this.c.push(col.r, col.g, col.b);
      }
    };
    // Orient the plan so top faces point up: x/z signed area (z is south, so seen from above the
    // usual counter-clockwise test is mirrored).
    let area = 0;
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i],
        b = plan[(i + 1) % plan.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const pts = area < 0 ? plan.slice().reverse() : plan;
    const T = pts.map(([x, z]) => [x, topY(x, z), z]),
      B = pts.map(([x, z]) => [x, bottomY(x, z), z]);
    for (let i = 1; i < pts.length - 1; i++) {
      tri(T[0], T[i + 1], T[i], top);
      tri(B[0], B[i], B[i + 1], bottom);
    }
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      tri(B[i], T[i], T[j], side);
      tri(B[i], T[j], B[j], side);
    }
  }
  get triangles() {
    return this.count || this.p.length / 9;
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    // The number[] buffers would otherwise stay alive in the builder's closure scope (16 MB of JS heap,
    // measured with a heap snapshot): keep only the triangle count.
    this.count = this.p.length / 9;
    this.p = [];
    this.n = [];
    this.c = [];
    return g;
  }
  private count = 0;
}

const C = (hex: string) => new Color(hex);
const COLORS = {
  concrete: C('#a3a39e'),
  concreteDark: C('#868884'),
  step: C('#9b9c98'),
  nosing: C('#d9b23a'),
  seatBlue: C('#1f57a6'),
  seatLight: C('#5d93d3'),
  seatWhite: C('#e3e8ec'),
  seatGrey: C('#a7b0b8'),
  roofTop: C('#2c3034'),
  roofUnder: C('#c4c9cd'),
  fascia: C('#e8ebed'),
  steel: C('#8b939a'),
  steelDark: C('#4b5258'),
  cladding: C('#4a5560'),
  claddingLight: C('#b7bdc2'),
  rib: C('#39424b'),
  glass: C('#46606f'),
  wall: C('#8d9196'),
  brick: C('#8c6d5a'),
  board: C('#183c6e'),
  white: C('#f3f5f2'),
  rail: C('#aab2b8'),
  bronze: C('#5d4a32'),
  granite: C('#6c6a66'),
  tunnel: C('#14325e'),
};

export interface StadiumMode {
  id: 'off' | 'training' | 'event';
  /** Weights of the mast and roof floodlight groups. */
  masts: number;
  roofs: number;
}
export const STADIUM_MODES: Record<StadiumMode['id'], StadiumMode> = {
  off: { id: 'off', masts: 0, roofs: 0 },
  training: { id: 'training', masts: 0.45, roofs: 0 },
  event: { id: 'event', masts: 1, roofs: 1 },
};

export function createIdrottsparken(terrain: TerrainService) {
  const frame = arenaFrame(terrain);
  const { ground, metres } = frame;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const group = new Group();
  group.name = 'idrottsparken';
  group.userData.placed = true;
  group.position.set(frame.centre[0], frame.y0, frame.centre[1]);
  group.rotation.y = frame.rotation;
  group.scale.setScalar(1 / metres);
  const detail = new Group();
  detail.name = 'idrottsparken-detail';
  group.add(detail);

  const concrete = new Merge(),
    seats = new Merge(),
    roof = new Merge(),
    steel = new Merge(),
    cladding = new Merge(),
    glass = new Merge(),
    small = new Merge();

  /** Lowest rendered ground (metres above pitch) under an axis-aligned arena rectangle. */
  const groundMin = (x0: number, x1: number, z0: number, z1: number) => {
    let m = Infinity;
    const nx = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 6)),
      nz = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 6));
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++)
        m = Math.min(m, ground(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz));
    return m;
  };
  const groundMax = (x0: number, x1: number, z0: number, z1: number) => {
    let m = -Infinity;
    const nx = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 2)),
      nz = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 2));
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++)
        m = Math.max(m, ground(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz));
    return m;
  };
  const report = {
    raisedRows: 0,
    maxRaise: 0,
    foundationDepth: 0,
    /** Rows raised above their design height by the rendered ground, per stand (count, max m). */
    raised: {} as Record<string, [number, number]>,
  };

  /**
   * A raked stand in its own frame: u along the stand (u0 → u1), d outward from the pitch.
   * `place(u, d)` → arena [x, z]; `swap` when u runs along arena x.
   */
  type Orientation = { place: (u: number, d: number) => [number, number]; alongX: boolean };
  const W: Orientation = { place: (u, d) => [d, u], alongX: false };
  const E: Orientation = { place: (u, d) => [-d, u], alongX: false };
  const N: Orientation = { place: (u, d) => [u, d], alongX: true };
  const S: Orientation = { place: (u, d) => [u, -d], alongX: true };
  const ob = (
    o: Orientation,
    m: Merge,
    u: number,
    y: number,
    d: number,
    lu: number,
    h: number,
    ld: number,
    color: Color,
  ) => {
    const [x, z] = o.place(u, d);
    if (o.alongX) m.box(x, y, z, lu, h, ld, color);
    else m.box(x, y, z, ld, h, lu, color);
  };
  interface RakeOptions {
    o: Orientation;
    u0: number;
    u1: number;
    front: number;
    rows: number;
    depth: number;
    rise: number;
    frontY: number;
    seat: ((row: number, u: number) => Color) | null;
    aisle: number;
    /** Raise treads above the rendered ground (default; the south terrace is built into Berget). */
    clearGround?: boolean;
    barrierEvery?: number;
    name: string;
  }
  /** Treads, risers, seats/barriers and aisle stairs of a raked stand; returns the top tread height. */
  const rake = (r: RakeOptions) => {
    const { o, u0, u1, front, rows, depth, rise, frontY } = r;
    const [ax0, az0] = o.place(u0, front),
      [ax1, az1] = o.place(u1, front + rows * depth);
    const base =
      groundMin(Math.min(ax0, ax1), Math.max(ax0, ax1), Math.min(az0, az1), Math.max(az0, az1)) -
      0.6;
    report.foundationDepth = Math.min(report.foundationDepth, base);
    // Front wall (pitch side), at least 0.1 m above the rendered ground along its length.
    const [fx0, fz0] = o.place(u0, front - 0.3),
      [fx1, fz1] = o.place(u1, front);
    const wallTop = Math.max(
      frontY + 0.15,
      groundMax(Math.min(fx0, fx1), Math.max(fx0, fx1), Math.min(fz0, fz1), Math.max(fz0, fz1)) +
        0.1,
    );
    ob(
      o,
      concrete,
      (u0 + u1) / 2,
      (base + wallTop) / 2,
      front - 0.15,
      u1 - u0,
      wallTop - base,
      0.3,
      COLORS.concrete,
    );
    let y = frontY;
    const length = u1 - u0;
    const aisles: number[] = [];
    if (r.aisle > 0) for (let a = u0 + r.aisle / 2; a < u1; a += r.aisle) aisles.push(a);
    for (let i = 0; i < rows; i++) {
      const d = front + i * depth;
      let tread = frontY + i * rise;
      if (r.clearGround !== false) {
        const [x0, z0] = o.place(u0, d),
          [x1, z1] = o.place(u1, d + depth);
        const g =
          groundMax(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)) + 0.08;
        if (g > tread) {
          report.raisedRows++;
          report.maxRaise = Math.max(report.maxRaise, g - tread);
          const k = (report.raised[r.name] ??= [0, 0]);
          k[0]++;
          k[1] = Math.max(k[1], Number((g - tread).toFixed(2)));
          tread = g;
        }
      }
      // A raised row never leaves the next row below it: the rake stays monotonic.
      if (i > 0) tread = Math.max(tread, y);
      y = tread;
      ob(
        o,
        concrete,
        (u0 + u1) / 2,
        (base + tread) / 2,
        d + depth / 2,
        length,
        tread - base,
        depth,
        i % 2 ? COLORS.step : COLORS.concreteDark,
      );
      // Seats: one block per section between aisles (seat pan + back), or standing-terrace barriers.
      const edges = [u0, ...aisles.flatMap((a) => [a - 0.6, a + 0.6]), u1];
      for (let k = 0; k < edges.length; k += 2) {
        const a = edges[k] + 0.15,
          b = edges[k + 1] - 0.15;
        if (b - a < 0.5) continue;
        if (r.seat) {
          const col = r.seat(i, (a + b) / 2);
          ob(o, seats, (a + b) / 2, tread + 0.22, d + depth * 0.62, b - a, 0.44, depth * 0.5, col);
          ob(o, seats, (a + b) / 2, tread + 0.5, d + depth * 0.86, b - a, 0.56, 0.08, col);
        } else if (r.barrierEvery && i % r.barrierEvery === 1) {
          ob(o, small, (a + b) / 2, tread + 1.02, d + 0.15, b - a, 0.06, 0.06, COLORS.rail);
          for (let p = a + 1; p < b; p += 3)
            ob(o, small, p, tread + 0.52, d + 0.15, 0.06, 1.0, 0.06, COLORS.rail);
        }
      }
      // Aisle stairs: half steps with yellow nosing.
      for (const a of aisles) {
        ob(o, concrete, a, tread + rise / 4, d + depth / 4, 1.2, rise / 2, depth / 2, COLORS.step);
        ob(o, small, a, tread + 0.005, d + depth - 0.04, 1.2, 0.012, 0.08, COLORS.nosing);
      }
    }
    return { top: y, back: front + rows * depth, base };
  };
  const blueSeats = (row: number, u: number) =>
    row % 6 === 5
      ? COLORS.seatLight
      : (Math.floor(u / 9) + row) % 11 === 0
        ? COLORS.seatWhite
        : COLORS.seatBlue;

  // ---- West (main) stand: lower tier, loge balcony, glazed loges and restaurant band. ----
  const w = STANDS.west;
  const wLower = rake({
    name: 'west',
    o: W,
    u0: w.z0,
    u1: w.z1,
    front: w.front,
    rows: w.lowerRows,
    depth: w.rowDepth,
    rise: w.rowRise,
    frontY: w.frontY,
    seat: blueSeats,
    aisle: 13,
  });
  const wTop = wLower.top;
  const wx = wLower.back;
  concrete.box(wx + 0.2, wTop + 0.45, 0, 0.4, 0.9, w.z1 - w.z0, COLORS.fascia); // sponsor fascia band
  cladding.box(wx + 0.21, wTop + 0.45, 0, 0.36, 0.42, w.z1 - w.z0, COLORS.board); // club-blue band
  concrete.box((wx + 55.5) / 2, wTop + 0.85, 0, 55.5 - wx, 0.3, w.z1 - w.z0, COLORS.concrete); // balcony slab
  for (const [i, x] of [wx + 0.9, wx + 1.9].entries())
    for (let z = w.z0 + 2; z < w.z1 - 2; z += 8.2) {
      seats.box(x, wTop + 1.25 + i * 0.4, z + 3.6, 0.45, 0.44, 7.2, COLORS.seatBlue);
      seats.box(x + 0.2, wTop + 1.55 + i * 0.4, z + 3.6, 0.08, 0.56, 7.2, COLORS.seatBlue);
    }
  glass.box(55.5, wTop + 2.35, 0, 0.12, 2.7, w.z1 - w.z0, COLORS.glass); // loges
  for (let z = w.z0; z <= w.z1; z += 7.6)
    cladding.box(55.55, wTop + 2.35, z, 0.3, 2.7, 0.25, COLORS.rib);
  concrete.box(60.6, wTop + 3.85, 0, 10.2, 0.3, w.z1 - w.z0, COLORS.concrete);
  glass.box(56.6, (wTop + 4.0 + 14.3) / 2, 0, 0.12, 14.3 - wTop - 4.0, w.z1 - w.z0, COLORS.glass); // restaurant band
  for (let z = w.z0; z <= w.z1; z += 7.6)
    cladding.box(56.65, (wTop + 4 + 14.3) / 2, z, 0.3, 14.3 - wTop - 4, 0.25, COLORS.rib);
  // Players' tunnel and dugouts on the main-stand touchline [PHOTO 2012].
  small.box(37.0, 1.1, 0, 2.4, 2.2, 5.0, COLORS.tunnel);
  for (const z of [-12, 12]) {
    small.box(36.2, 0.75, z, 1.8, 1.5, 9.0, COLORS.glass);
    small.box(36.2, 1.55, z, 2.0, 0.1, 9.2, COLORS.white);
  }

  // ---- East stand: single tier, roof carried on front columns [PHOTO 2011]. ----
  const e = STANDS.east;
  const eRake = rake({
    name: 'east',
    o: E,
    u0: e.z0,
    u1: e.z1,
    front: -e.front,
    rows: e.rows,
    depth: e.rowDepth,
    rise: e.rowRise,
    frontY: e.frontY,
    seat: blueSeats,
    aisle: 14,
  });
  concrete.box(
    -(eRake.back + (-e.back - eRake.back) / 2),
    eRake.top - 0.15,
    (e.z0 + e.z1) / 2,
    -e.back - eRake.back,
    0.3,
    e.z1 - e.z0,
    COLORS.concrete,
  );
  glass.box(
    -61.5,
    (eRake.top + 13.8) / 2 + 0.2,
    (e.z0 + e.z1) / 2,
    0.12,
    13.8 - eRake.top - 0.4,
    e.z1 - e.z0 - 2,
    COLORS.glass,
  );
  // Vomitories (dark openings) through the rake at mid height.
  for (let z = e.z0 + 12; z < e.z1 - 6; z += 22) {
    const d = 38.3 + 10 * e.rowDepth;
    small.box(-d - 1.0, e.frontY + 10 * e.rowRise + 0.9, z, 2.2, 1.9, 2.2, COLORS.glass);
  }

  // ---- North stand: standing terrace, grey concrete; seated corners (NW blue, NE grey). ----
  const n = STANDS.north;
  const nRake = rake({
    name: 'north',
    o: N,
    u0: -37.8,
    u1: 38.2,
    front: n.front,
    rows: n.rows,
    depth: n.rowDepth,
    rise: n.rowRise,
    frontY: n.frontY,
    seat: null,
    aisle: 12.5,
    barrierEvery: 3,
  });
  rake({
    name: 'north-west',
    o: N,
    u0: 38.2,
    u1: n.x1,
    front: n.front,
    rows: n.rows,
    depth: n.rowDepth,
    rise: n.rowRise,
    frontY: n.frontY,
    seat: blueSeats,
    aisle: 13.5,
  });
  rake({
    name: 'north-east',
    o: N,
    u0: n.x0,
    u1: -37.8,
    front: n.front,
    rows: n.rows,
    depth: n.rowDepth,
    rise: n.rowRise,
    frontY: n.frontY,
    seat: () => COLORS.seatGrey,
    aisle: 12.6,
  });
  glass.box(
    (n.x0 + n.x1) / 2,
    (nRake.top + 14.3) / 2,
    n.back - 1.6,
    n.x1 - n.x0,
    14.3 - nRake.top,
    0.12,
    COLORS.glass,
  );
  concrete.box(
    (n.x0 + n.x1) / 2,
    nRake.top - 0.15,
    (nRake.back + n.back) / 2,
    n.x1 - n.x0,
    0.3,
    n.back - nRake.back,
    COLORS.concrete,
  );

  // ---- South: open standing terrace built into Berget (raised above the measured slope). ----
  const s = STANDS.south;
  const sRake = rake({
    name: 'south',
    o: S,
    u0: s.x0,
    u1: s.x1,
    front: -s.front,
    rows: s.rows,
    depth: s.rowDepth,
    rise: s.rowRise,
    frontY: s.frontY,
    seat: null,
    aisle: 12,
    clearGround: true,
    barrierEvery: 3,
  });
  concrete.box(
    (s.x0 + s.x1) / 2,
    sRake.top + 0.55,
    -(sRake.back + 0.15),
    s.x1 - s.x0,
    1.1,
    0.3,
    COLORS.concrete,
  );
  // ---- South-west corner: seated, roofed ("familjeläktare"), same rake as the south terrace. ----
  const sw = STANDS.southWest;
  const swRake = rake({
    name: 'south-west',
    o: S,
    u0: sw.x0,
    u1: sw.x1,
    front: -sw.front,
    rows: s.rows,
    depth: s.rowDepth,
    rise: s.rowRise,
    frontY: s.frontY,
    seat: (row, u) => (Math.floor(u / 4) % 2 ? COLORS.seatWhite : COLORS.seatBlue),
    aisle: 11,
    clearGround: true,
  });
  glass.box(
    (sw.x0 + sw.x1) / 2,
    (swRake.top + 13.6) / 2,
    -81.2,
    sw.x1 - sw.x0,
    13.6 - swRake.top,
    0.12,
    COLORS.glass,
  );

  // ---- Exterior walls along the OSM outline: concrete plinth, dark cladding, ribs. ----
  const wallTop = (x: number, z: number) => {
    if (z < -80 && x > -2 && x < 31.2) return sRake.top + 1.1; // open south terrace: parapet only
    if (z < -61 && x < -2) return sRake.top + 1.1;
    if (x < -37 && z < -54) return 0; // open south-east corner
    return 14.3;
  };
  for (let i = 0; i < OUTLINE.length; i++) {
    const a = OUTLINE[i],
      b = OUTLINE[(i + 1) % OUTLINE.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) continue;
    const mx = (a[0] + b[0]) / 2,
      mz = (a[1] + b[1]) / 2;
    // Inner edges along the pitch area are stand fronts (handled by the rakes).
    const onPitch = Math.abs(Math.abs(mx) - 37.8) < 0.8 && Math.abs(mz) < 62.5;
    const onPitchEnd = Math.abs(mz) > 61 && Math.abs(mz) < 62.5 && Math.abs(mx) < 41;
    if (onPitch || onPitchEnd) continue;
    const top = wallTop(mx, mz);
    if (top <= 0) continue;
    const base = Math.min(ground(a[0], a[1]), ground(b[0], b[1]), ground(mx, mz)) - 0.6;
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const plinth = Math.min(top, Math.max(ground(mx, mz) + 3.6, 3.6));
    concrete.box(mx, (base + plinth) / 2, mz, 0.5, plinth - base, len, COLORS.wall, 0, ry);
    if (top > plinth)
      cladding.box(mx, (plinth + top) / 2, mz, 0.45, top - plinth, len, COLORS.cladding, 0, ry);
    // Vertical ribs every ~6 m give the long façades depth.
    if (top > 6)
      for (let t = 3; t < len - 1; t += 6.2) {
        const x = a[0] + ((b[0] - a[0]) * t) / len,
          z = a[1] + ((b[1] - a[1]) * t) / len;
        const nx = (b[1] - a[1]) / len,
          nz = -(b[0] - a[0]) / len;
        // Outward normal: away from the arena centre.
        const sign = nx * x + nz * z > 0 ? 1 : -1;
        cladding.box(
          x + sign * nx * 0.35,
          (plinth + top) / 2,
          z + sign * nz * 0.35,
          0.25,
          top - plinth,
          0.45,
          COLORS.rib,
          0,
          ry,
        );
      }
  }
  // West projection: main entrance block, glazed entrance hall towards Ektorpsgatan.
  {
    const p = WEST_PROJECTION;
    const base = groundMin(p.x0, p.x1, p.z0, p.z1) - 0.6;
    cladding.box(
      (p.x0 + p.x1) / 2,
      (base + p.height) / 2,
      (p.z0 + p.z1) / 2,
      p.x1 - p.x0,
      p.height - base,
      p.z1 - p.z0,
      COLORS.claddingLight,
    );
    roof.box(
      (p.x0 + p.x1) / 2,
      p.height + 0.15,
      (p.z0 + p.z1) / 2,
      p.x1 - p.x0 + 0.4,
      0.3,
      p.z1 - p.z0 + 0.4,
      COLORS.roofTop,
    );
    const gy = ground(p.x1, (p.z0 + p.z1) / 2);
    glass.box(p.x1 + 0.08, gy + 4.2, (p.z0 + p.z1) / 2 + 2, 0.12, 8.0, 26, COLORS.glass);
    roof.box(p.x1 + 2.0, gy + 4.6, (p.z0 + p.z1) / 2 + 2, 4.0, 0.35, 28, COLORS.fascia); // entrance canopy
    cladding.box(p.x1 + 0.12, gy + 10.6, (p.z0 + p.z1) / 2 + 2, 0.1, 2.2, 30, COLORS.board); // name band
  }

  // ---- Roofs: skillion slabs [LIDAR heights], white fascia, light underside. ----
  const slopeW = (x: number) =>
    ROOF.frontTop -
    ((x - ROOF.westFront) / (65.7 - ROOF.westFront)) * (ROOF.frontTop - ROOF.backTop);
  const slopeE = (x: number) =>
    ROOF.frontTop -
    ((-x + ROOF.eastFront) / (64 + ROOF.eastFront)) * (ROOF.frontTop - ROOF.backTop);
  const slopeN = (z: number) =>
    ROOF.frontTop -
    ((z - ROOF.northFront) / (89.5 - ROOF.northFront)) * (ROOF.frontTop - ROOF.backTop);
  const sw0 = ROOF.southWest;
  const slopeSW = (z: number) => 16.0 - ((sw0.z1 - z) / (sw0.z1 - sw0.z0)) * 1.4;
  const roofSlab = (plan: [number, number][], top: (x: number, z: number) => number) =>
    roof.prism(
      plan,
      top,
      (x, z) => top(x, z) - ROOF.thickness,
      COLORS.roofTop,
      COLORS.roofUnder,
      COLORS.fascia,
    );
  roofSlab(
    [
      [ROOF.westFront, -63.0],
      [65.9, -63.0],
      [65.9, 89.4],
      [ROOF.westFront, 89.4],
    ],
    (x) => slopeW(x),
  );
  roofSlab(
    [
      [-64.2, -53.4],
      [ROOF.eastFront, -53.4],
      [ROOF.eastFront, ROOF.northFront],
      [-64.2, ROOF.northFront],
    ],
    (x) => slopeE(x),
  );
  roofSlab(
    [
      [-64.2, ROOF.northFront],
      [ROOF.westFront, ROOF.northFront],
      [ROOF.westFront, 89.6],
      [-64.2, 89.6],
    ],
    (_x, z) => slopeN(z),
  );
  roofSlab(
    [
      [sw0.x0, sw0.z0],
      [sw0.x1, sw0.z0],
      [sw0.x1, sw0.z1],
      [sw0.x0, sw0.z1],
    ],
    (_x, z) => slopeSW(z),
  );
  // Deep front fascia beams (white), as in the 2011/2012 photos.
  roof.box(
    ROOF.westFront + 0.3,
    slopeW(ROOF.westFront) - 1.0,
    13.2,
    0.6,
    1.2,
    152.4,
    COLORS.fascia,
  );
  roof.box(
    ROOF.eastFront - 0.3,
    slopeE(ROOF.eastFront) - 1.0,
    7.45,
    0.6,
    1.2,
    121.7,
    COLORS.fascia,
  );
  roof.box(
    (-64.2 + ROOF.westFront) / 2,
    slopeN(ROOF.northFront) - 1.0,
    ROOF.northFront + 0.3,
    104.3,
    1.2,
    0.6,
    COLORS.fascia,
  );
  roof.box((sw0.x0 + sw0.x1) / 2, 15.0, sw0.z1 - 0.3, sw0.x1 - sw0.x0, 1.0, 0.6, COLORS.fascia);
  // Cantilever trusses under the roofs (dark steel), one every 7.6 m.
  const truss = (a: Vector3, b: Vector3, c: Vector3) => {
    steel.beam(a, b, 0.35, COLORS.steelDark);
    steel.beam(c, b, 0.25, COLORS.steelDark);
  };
  for (let z = -61; z <= 88; z += 7.6)
    truss(
      new Vector3(65.4, slopeW(65.4) - 1.05, z),
      new Vector3(ROOF.westFront + 0.6, slopeW(ROOF.westFront) - 1.05, z),
      new Vector3(65.4, 12.2, z),
    );
  for (let z = -52; z <= 67; z += 7.6)
    truss(
      new Vector3(-63.8, slopeE(-63.8) - 1.05, z),
      new Vector3(ROOF.eastFront - 0.6, slopeE(ROOF.eastFront) - 1.05, z),
      new Vector3(-63.8, 12.2, z),
    );
  for (let x = -62; x <= 39; x += 7.6)
    truss(
      new Vector3(x, slopeN(89.2) - 1.05, 89.2),
      new Vector3(x, slopeN(ROOF.northFront) - 1.05, ROOF.northFront + 0.6),
      new Vector3(x, 12.2, 89.2),
    );
  // East roof front columns standing in the rake [PHOTO Nyaparken 2011].
  for (let z = -45; z <= 60; z += 21) {
    const xCol = -44.6,
      d = -xCol - 38.3,
      yTread = e.frontY + Math.floor(d / e.rowDepth) * e.rowRise;
    steel.column(xCol, z, 0.45, 0.45, yTread, slopeE(xCol) - ROOF.thickness, COLORS.white);
  }

  // ---- Teknikhallen and Gamla tennishallen [OSM footprints, LIDAR heights]. ----
  {
    const t = TEKNIKHALLEN;
    const base = groundMin(t.x0, t.x1, t.z0, t.z1) - 0.6;
    cladding.box(
      (t.x0 + t.x1) / 2,
      (base + t.eave) / 2,
      (t.z0 + t.z1) / 2,
      t.x1 - t.x0,
      t.eave - base,
      t.z1 - t.z0,
      COLORS.claddingLight,
    );
    roof.prism(
      [
        [t.x0, t.z0],
        [t.x1, t.z0],
        [t.x1, t.z1],
        [t.x0, t.z1],
      ],
      (_x, z) => t.ridge - ((z - t.z0) / (t.z1 - t.z0)) * (t.ridge - t.eave),
      (_x, z) => t.ridge - 0.4 - ((z - t.z0) / (t.z1 - t.z0)) * (t.ridge - t.eave),
      COLORS.roofTop,
      COLORS.roofUnder,
      COLORS.claddingLight,
    );
    for (const x of [t.x0 - 0.05, t.x1 + 0.05])
      glass.box(x, 6.0, (t.z0 + t.z1) / 2 + 6, 0.1, 2.0, 36, COLORS.glass);
    for (let x = t.x0 + 4; x < t.x1; x += 6)
      cladding.box(x, (base + t.eave) / 2, t.z1 + 0.15, 0.25, t.eave - base, 0.3, COLORS.wall);
  }
  {
    const t = TENNISHALLEN;
    const base = groundMin(t.x0, t.x1, t.z0, t.z1) - 0.6;
    concrete.box(
      (t.x0 + t.x1) / 2,
      (base + t.eave) / 2,
      (t.z0 + t.z1) / 2,
      t.x1 - t.x0,
      t.eave - base,
      t.z1 - t.z0,
      COLORS.brick,
    );
    // Low segmental vault: crest 12 m, eaves 9.6 m, in 8 facets across the hall.
    const cx = (t.x0 + t.x1) / 2,
      half = (t.x1 - t.x0) / 2;
    const vault = (x: number) => t.eave + (t.crest - t.eave) * (1 - ((x - cx) / half) ** 2);
    for (let k = 0; k < 8; k++) {
      const xa = t.x0 + ((t.x1 - t.x0) * k) / 8,
        xb = t.x0 + ((t.x1 - t.x0) * (k + 1)) / 8;
      roof.prism(
        [
          [xa, t.z0],
          [xb, t.z0],
          [xb, t.z1],
          [xa, t.z1],
        ],
        (x) => vault(x) + 0.25,
        (x) => vault(x) - 0.05,
        COLORS.roofTop,
        COLORS.roofUnder,
        COLORS.roofTop,
      );
      // Brick gables closing the vault at both ends.
      for (const z of [t.z0, t.z1 - 0.3])
        concrete.prism(
          [
            [xa, z],
            [xb, z],
            [xb, z + 0.3],
            [xa, z + 0.3],
          ],
          (x) => vault(x),
          () => t.eave - 0.1,
          COLORS.brick,
          COLORS.brick,
          COLORS.brick,
        );
    }
  }

  // ---- Floodlight masts [LIDAR positions/heights, PHOTO lattice and head]. ----
  const projector = new BoxGeometry(0.55, 0.45, 0.42).translate(0, 0, -0.21);
  const lensPlane = new PlaneGeometry(0.46, 0.36);
  const projectorMatrices: Matrix4[] = [];
  const emitters: StadiumEmitter[] = [];
  const emitterGroups: ('masts' | 'roofs')[] = [];
  const LED: [number, number, number] = [0.93, 0.97, 1.0];
  const aimFrom = (from: [number, number, number], at: [number, number, number]) => {
    const d = new Vector3(at[0] - from[0], at[1] - from[1], at[2] - from[2]).normalize();
    return [d.x, d.y, d.z] as [number, number, number];
  };
  for (const mast of MASTS) {
    const g = ground(mast.x, mast.z);
    const towardX = -mast.x,
      towardZ = -mast.z;
    const heading = Math.atan2(towardX, towardZ);
    const top = mast.headBottom - 0.4;
    const panels = 11;
    const half = (t: number) => 1.35 - 0.8 * t; // half leg spacing: 2.7 m at the foot → 1.1 m at the top
    const legs = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const at = (sx: number, sz: number, t: number) => {
      const h = half(t);
      return new Vector3(mast.x + sx * h, g + (top - g) * t, mast.z + sz * h);
    };
    for (const [sx, sz] of legs) steel.beam(at(sx, sz, 0), at(sx, sz, 1), 0.22, COLORS.steel);
    for (let k = 0; k < panels; k++) {
      const t0 = k / panels,
        t1 = (k + 1) / panels;
      for (let j = 0; j < 4; j++) {
        const [ax, az] = legs[j],
          [bx, bz] = legs[(j + 1) % 4];
        steel.beam(at(ax, az, t1), at(bx, bz, t1), 0.1, COLORS.steel);
        steel.beam(at(ax, az, t0), at(bx, bz, t1), 0.07, COLORS.steel);
      }
    }
    // Platform and head frame, facing the pitch, tilted 12° down.
    const headCentre = new Vector3(mast.x, (mast.headBottom + mast.headTop) / 2, mast.z);
    const rot = new Quaternion().setFromEuler(new Euler(0.21, heading, 0, 'YXZ'));
    steel.box(mast.x, mast.headBottom - 0.3, mast.z, 3.2, 0.2, 3.2, COLORS.steelDark);
    const frameM = new Matrix4().compose(headCentre, rot, new Vector3(1, 1, 1));
    const local = new Matrix4();
    local.compose(
      new Vector3(0, 0, -0.35),
      new Quaternion(),
      new Vector3(mast.headWidth, mast.headTop - mast.headBottom, 0.25),
    );
    steel.boxMatrix(new Matrix4().multiplyMatrices(frameM, local), COLORS.steelDark);
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 6; c++) {
        local.compose(
          new Vector3(-2.0 + c * 0.8, -2.2 + r * 1.1, 0),
          new Quaternion(),
          new Vector3(1, 1, 1),
        );
        projectorMatrices.push(new Matrix4().multiplyMatrices(frameM, local));
      }
    // Two emitters per mast: near half and far half of the pitch.
    const p: [number, number, number] = [
      mast.x * 0.97,
      (mast.headBottom + mast.headTop) / 2,
      mast.z * 0.97,
    ];
    const sx = Math.sign(mast.x),
      sz = Math.sign(mast.z);
    for (const target of [
      [sx * 14, 0, sz * 30],
      [-sx * 12, 0, sz * 4],
    ] as [number, number, number][]) {
      emitters.push({
        position: p,
        aim: aimFrom(p, target),
        cosInner: Math.cos((20 * Math.PI) / 180),
        cosOuter: Math.cos((36 * Math.PI) / 180),
        candela: 2.55e6,
        color: LED,
      });
      emitterGroups.push('masts');
    }
  }
  // Roof-front floodlight rows [PHOTO 2011/2012]: projectors every 5.5 m, tilted 38° down.
  const rowLights = (list: { x: number; z: number; y: number; heading: number }[]) => {
    for (const l of list) {
      const m = new Matrix4().compose(
        new Vector3(l.x, l.y, l.z),
        new Quaternion().setFromEuler(new Euler(0.66, l.heading, 0, 'YXZ')),
        new Vector3(1, 1, 1),
      );
      projectorMatrices.push(m);
      steel.box(l.x, l.y + 0.45, l.z, 0.12, 0.5, 0.12, COLORS.steelDark);
    }
  };
  const west: { x: number; z: number; y: number; heading: number }[] = [],
    east: typeof west = [],
    north: typeof west = [];
  for (let z = -58; z <= 58; z += 5.5)
    west.push({
      x: ROOF.westFront + 0.6,
      z,
      y: slopeW(ROOF.westFront) - 2.0,
      heading: -Math.PI / 2,
    });
  for (let z = -50; z <= 63; z += 5.5)
    east.push({
      x: ROOF.eastFront - 0.6,
      z,
      y: slopeE(ROOF.eastFront) - 2.0,
      heading: Math.PI / 2,
    });
  for (let x = -58; x <= 36; x += 5.5)
    north.push({ x, z: ROOF.northFront + 0.6, y: slopeN(ROOF.northFront) - 2.0, heading: Math.PI });
  rowLights(west);
  rowLights(east);
  rowLights(north);
  const roofEmitter = (p: [number, number, number], target: [number, number, number]) => {
    emitters.push({
      position: p,
      aim: aimFrom(p, target),
      cosInner: Math.cos((38 * Math.PI) / 180),
      cosOuter: Math.cos((62 * Math.PI) / 180),
      candela: 5.4e5,
      color: LED,
    });
    emitterGroups.push('roofs');
  };
  for (const z of [-28, 28]) {
    roofEmitter([ROOF.westFront + 0.6, 14.6, z], [-6, 0, z]);
    roofEmitter([ROOF.eastFront - 0.6, 14.6, z], [6, 0, z]);
  }
  for (const x of [-22, 22]) roofEmitter([x, 14.6, ROOF.northFront + 0.6], [x, 0, 28]);

  // Projectors: instanced housing + lens (lens brightness follows the floodlight state).
  const projectorMaterial = own(
    new MeshStandardMaterial({ color: '#3d4247', roughness: 0.5, metalness: 0.5 }),
  );
  const lensMaterial = own(new MeshBasicMaterial({ color: '#9aa1a6' }));
  const projectors = own(
    new InstancedMesh(own(projector), projectorMaterial, projectorMatrices.length),
  );
  const lenses = own(new InstancedMesh(own(lensPlane), lensMaterial, projectorMatrices.length));
  projectorMatrices.forEach((m, i) => {
    projectors.setMatrixAt(i, m);
    lenses.setMatrixAt(
      i,
      new Matrix4().multiplyMatrices(m, new Matrix4().makeTranslation(0, 0, 0.012)),
    );
  });
  projectors.computeBoundingSphere();
  lenses.computeBoundingSphere();
  group.add(projectors, lenses);

  // ---- Pitch-side: LED boards, goals, corner flags; statue at the main entrance. ----
  const boardColors = [
    C('#1b3f73'),
    C('#e4e7ea'),
    C('#0f2f58'),
    C('#2d64ad'),
    C('#e9b941'),
    C('#c7372f'),
  ];
  let bi = 0;
  const boards = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0; t < len - 0.1; t += 6) {
      const l = Math.min(6, len - t) - 0.1;
      const x = x0 + ((x1 - x0) * (t + l / 2)) / len,
        z = z0 + ((z1 - z0) * (t + l / 2)) / len;
      small.box(
        x,
        0.45,
        z,
        Math.abs(x1 - x0) > 0.1 ? l : 0.18,
        0.9,
        Math.abs(z1 - z0) > 0.1 ? l : 0.18,
        boardColors[bi++ % boardColors.length],
      );
    }
  };
  boards(-36.9, -55, -36.9, 55);
  boards(36.2, -55, 36.2, -16);
  boards(36.2, 16, 36.2, 55);
  boards(-30, 58.8, 30, 58.8);
  boards(-30, -58.8, 30, -58.8);
  for (const side of [-1, 1]) {
    const z = side * (PITCH.field.length / 2);
    for (const x of [-3.66, 3.66]) small.box(x, 1.22, z, 0.12, 2.44, 0.12, COLORS.white);
    small.box(0, 2.44, z, 7.44, 0.12, 0.12, COLORS.white);
    small.box(0, 1.2, z + side * 2.0, 7.3, 2.3, 0.03, COLORS.rail);
    small.box(0, 2.38, z + side * 1.0, 7.3, 0.03, 2.0, COLORS.rail);
    for (const x of [-34, 34]) small.box(x, 0.75, z, 0.04, 1.5, 0.04, COLORS.white);
  }
  small.column(
    STATUE.x,
    STATUE.z,
    1.4,
    1.4,
    ground(STATUE.x, STATUE.z) - 0.2,
    ground(STATUE.x, STATUE.z) + 1.2,
    COLORS.granite,
  );
  small.column(
    STATUE.x,
    STATUE.z,
    0.5,
    0.35,
    ground(STATUE.x, STATUE.z) + 1.2,
    ground(STATUE.x, STATUE.z) + 3.0,
    COLORS.bronze,
  );

  // ---- Materials and meshes. ----
  const material = (roughness: number, metalness = 0) =>
    own(new MeshStandardMaterial({ vertexColors: true, roughness, metalness }));
  const meshes: Record<string, { merge: Merge; material: MeshStandardMaterial; detail?: boolean }> =
    {
      concrete: { merge: concrete, material: material(0.92) },
      seats: { merge: seats, material: material(0.55), detail: true },
      roof: { merge: roof, material: material(0.7, 0.15) },
      steel: { merge: steel, material: material(0.45, 0.6) },
      cladding: { merge: cladding, material: material(0.6, 0.25) },
      glass: { merge: glass, material: material(0.12, 0.4) },
      small: { merge: small, material: material(0.6, 0.1), detail: true },
    };
  let triangles = 0;
  for (const [name, m] of Object.entries(meshes)) {
    const geometry = own(m.merge.geometry());
    // Retain the typed arrays: WebGL needs them to upload the geometry again after context loss.
    // Merge.geometry() releases the much larger temporary number[] buffers instead.
    const mesh = new Mesh(geometry, m.material);
    mesh.name = 'idrottsparken-' + name;
    triangles += m.merge.triangles;
    (m.detail ? detail : group).add(mesh);
  }
  triangles += projectorMatrices.length * 14;

  // ---- Turf: draped on the terrain in scene units, above the OSM pitch land cover. ----
  const turfTexture = own(paintTurf());
  const turfMaterial = own(
    layeredSurface(
      new MeshStandardMaterial({ map: turfTexture, roughness: 0.95 }),
      LAYER_RANK.marking,
    ),
  );
  const tw = (PITCH.turf.x1 - PITCH.turf.x0) / metres,
    tl = (PITCH.turf.z1 - PITCH.turf.z0) / metres;
  const [tcx, tcz] = frame.world(
    (PITCH.turf.x0 + PITCH.turf.x1) / 2,
    (PITCH.turf.z0 + PITCH.turf.z1) / 2,
  );
  const turf = new Mesh(own(groundRectangle(tcx, tcz, frame.rotation, tw, tl)), turfMaterial);
  turf.name = 'idrottsparken-turf';
  turf.receiveShadow = true;
  turf.userData.placed = true;
  triangles += (turf.geometry.getAttribute('position').count / 3) | 0;

  // ---- Lighting hooks. ----
  const roofs: StadiumRoof[] = [
    { x0: ROOF.westFront, x1: 65.9, z0: -63.0, z1: 89.4, y: ROOF.backTop + 0.3 },
    { x0: -64.2, x1: ROOF.eastFront, z0: -53.4, z1: ROOF.northFront, y: ROOF.backTop + 0.3 },
    { x0: -64.2, x1: ROOF.westFront, z0: ROOF.northFront, z1: 89.6, y: ROOF.backTop + 0.3 },
    { x0: sw0.x0, x1: sw0.x1, z0: sw0.z0, z1: sw0.z1, y: 15.0 },
  ];
  const lensColor = new Color(),
    lensOff = new Color('#9aa1a6');
  return {
    group,
    turf,
    frame,
    emitters,
    emitterGroups,
    roofs,
    report: {
      ...report,
      triangles,
      projectors: projectorMatrices.length,
      emitters: emitters.length,
    },
    /** Floodlight state 0–1 (lens glow); detail level by camera distance (no allocation). */
    update(camera: Camera, floodlight: number) {
      lensColor.setRGB(LED[0] * 9, LED[1] * 9, LED[2] * 9);
      lensMaterial.color.copy(lensOff).lerp(lensColor, floodlight);
      const d = camera.position.distanceTo(group.position);
      detail.visible = d < 60;
      lenses.visible = projectors.visible = d < 120;
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}

/** Artificial turf with mowing-like stripes and the standard markings (10 px per metre). */
function paintTurf() {
  // Unit tests run without a DOM: a plain turf colour stands in for the painted canvas.
  if (typeof document === 'undefined') {
    const t = new DataTexture(new Uint8Array([63, 125, 60, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const PX = 10;
  const W = PITCH.turf.x1 - PITCH.turf.x0,
    L = PITCH.turf.z1 - PITCH.turf.z0;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * PX);
  canvas.height = Math.round(L * PX);
  const c = canvas.getContext('2d')!;
  const stripe = 105 / 18;
  c.fillStyle = '#3f7d3c';
  c.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i * stripe * PX < canvas.height; i++) {
    c.fillStyle = i % 2 ? '#3b7739' : '#458542';
    c.fillRect(0, canvas.height / 2 - (52.5 - i * stripe) * PX, canvas.width, stripe * PX + 1);
  }
  const ox = (-PITCH.turf.x0 - PITCH.field.width / 2) * PX,
    oz = (L / 2 - PITCH.field.length / 2) * PX;
  const w = PITCH.field.width * PX,
    l = PITCH.field.length * PX;
  c.strokeStyle = '#eef2e8';
  c.fillStyle = '#eef2e8';
  c.lineWidth = 0.12 * PX;
  c.strokeRect(ox, oz, w, l);
  c.beginPath();
  c.moveTo(ox, oz + l / 2);
  c.lineTo(ox + w, oz + l / 2);
  c.stroke();
  c.beginPath();
  c.arc(ox + w / 2, oz + l / 2, 9.15 * PX, 0, Math.PI * 2);
  c.stroke();
  const spot = (x: number, y: number) => {
    c.beginPath();
    c.arc(x, y, 0.2 * PX, 0, Math.PI * 2);
    c.fill();
  };
  spot(ox + w / 2, oz + l / 2);
  for (const end of [0, 1]) {
    const y0 = end ? oz + l : oz,
      dir = end ? -1 : 1;
    const box = (bw: number, bd: number) =>
      c.strokeRect(ox + w / 2 - (bw * PX) / 2, end ? y0 - bd * PX : y0, bw * PX, bd * PX);
    box(40.32, 16.5);
    box(18.32, 5.5);
    spot(ox + w / 2, y0 + dir * 11 * PX);
    // Penalty arc: the part of the 9.15 m circle around the spot outside the 16.5 m box.
    const a = Math.asin(5.5 / 9.15);
    c.beginPath();
    if (end) c.arc(ox + w / 2, y0 - 11 * PX, 9.15 * PX, Math.PI + a, 2 * Math.PI - a);
    else c.arc(ox + w / 2, y0 + 11 * PX, 9.15 * PX, a, Math.PI - a);
    c.stroke();
  }
  // Corner arcs (1 m), quarter circles into the field.
  for (const [x, y, from] of [
    [ox, oz, 0],
    [ox + w, oz, Math.PI / 2],
    [ox + w, oz + l, Math.PI],
    [ox, oz + l, 1.5 * Math.PI],
  ] as const) {
    c.beginPath();
    c.arc(x, y, 1 * PX, from, from + Math.PI / 2);
    c.stroke();
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
