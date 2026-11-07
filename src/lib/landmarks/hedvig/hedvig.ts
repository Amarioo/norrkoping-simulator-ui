/**
 * Hedvigs kyrka with its bell tower (Landmark Phase B2): measured geometry by day and estimated
 * floodlights at night. Dimensions and their sources: ./spec.ts. Replaces the OSM extrusion of
 * way/88741182 (cityPlaces DETAILED_BUILDING_IDS).
 *
 * Built in the BUILDING FRAME (ground metres, origin at the measured tower centre, local x = u along
 * the nave towards the east, local z = −v, local y = RH2000 metres) inside one group, placed like
 * Rådhuset (B1): position = origin in scene units at y 0, rotation about y onto the nave axis, scale
 * 1/metresPerUnit. The walls follow the OSM footprint and reach down to the lowest rendered ground
 * under it (like the generic OSM buildings in cityMesh.ts).
 *
 * Draw calls: one merged, vertex-coloured mesh per material (masonry incl. the timber tower, copper
 * roofs, dark openings, gilding) plus one textured mesh for the four clock faces. Plain
 * MeshStandardMaterials in the configurations Rådhuset already uses, so the lighting patch adds no
 * shader program. The floodlights are not meshes: `floodlights` lists them for the lighting
 * controller (cityLights.ts façade emitters), in scene units.
 */
import {
  CanvasTexture,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Color,
} from 'three';
import type { TerrainService } from '../../terrain';
import { cityMap } from '../../mapModel';
import type { FacadeEmitter } from '../../lighting/cityLights';
import { Builder, C, L, insidePolygon, type P } from '../builder';
import { toFacadeEmitters } from '../floodlights';
import {
  COLOURS,
  EAST_END,
  EAVE,
  FACADE,
  FLOOD_COLOR_3000K,
  FLOODLIGHTS,
  FRAME,
  HEDVIG_ID,
  NAVE,
  SACRISTY,
  TOWER,
  WEST_BAY,
} from './spec';

type UV = [number, number];

/** Scene ↔ building frame. */
export function hedvigFrame(terrain: TerrainService) {
  const metres = terrain.data.reference.metresPerUnit;
  const [ox, oz] = FRAME.originScene;
  // The stored axis is rounded to 6 decimals: normalise it so the frame is exactly metric.
  const axis = Math.hypot(...FRAME.axisScene),
    ux = FRAME.axisScene[0] / axis,
    uz = FRAME.axisScene[1] / axis;
  // three.js rotation about y: local +x → (cos θ, −sin θ) in scene x/z.
  const rotation = Math.atan2(-uz, ux);
  /** Scene [x, z] → building frame [u, v] (metres). */
  const toFrame = (x: number, z: number): UV => [
    ((x - ox) * ux + (z - oz) * uz) * metres,
    ((x - ox) * uz - (z - oz) * ux) * metres,
  ];
  /** Building frame [u, v] → scene [x, z]. */
  const toScene = (u: number, v: number): UV => [
    ox + (u * ux + v * uz) / metres,
    oz + (u * uz - v * ux) / metres,
  ];
  /** Rendered ground at a frame point, RH2000 metres. */
  const ground = (u: number, v: number) => terrain.groundHeight(...toScene(u, v)) * metres;
  return { origin: [ox, oz] as UV, rotation, metres, toFrame, toScene, ground };
}
export type HedvigFrame = ReturnType<typeof hedvigFrame>;

/** Roof height of the west bay at u: the single slope from its west eave up to the terrace. */
export function westBayRoof(u: number) {
  const W = WEST_BAY;
  const t = (u - W.eaveU) / (W.terraceU - W.eaveU);
  return W.eave + Math.min(1, Math.max(0, t)) * (W.terrace - W.eave);
}

/** Which part an OSM footprint edge belongs to, by its midpoint in the building frame. */
export function partOf(u: number, v: number): 'west' | 'porch' | 'sacristy' | 'nave' {
  if (u < 1.2) return 'west';
  if (u > SACRISTY.u1 - 0.2 && v > 11 && v < 14.2) return 'porch';
  if (u > SACRISTY.u0 - 0.3 && u < SACRISTY.u1 + 0.3 && v > 10.4) return 'sacristy';
  return 'nave';
}
/** Wall top (RH2000 m) at a point of an edge of the given part. */
export function wallTopAt(part: ReturnType<typeof partOf>, u: number) {
  if (part === 'west') return westBayRoof(u);
  if (part === 'porch') return SACRISTY.porchTop;
  if (part === 'sacristy') return SACRISTY.eave;
  return EAVE;
}

/**
 * Convex polygon (counter-clockwise in u, v) moved outward edge by edge: edge i (from vertex i to
 * i + 1) by offsets[i] metres; vertices are the intersections of neighbouring moved edges.
 */
export function offsetPolygon(poly: UV[], offsets: number[]): UV[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const du = b[0] - a[0],
      dv = b[1] - a[1],
      len = Math.hypot(du, dv);
    const nu = dv / len,
      nv = -du / len; // outward for a counter-clockwise polygon
    return {
      p: [a[0] + nu * offsets[i], a[1] + nv * offsets[i]] as UV,
      d: [du / len, dv / len] as UV,
    };
  });
  return poly.map((_, i) => {
    const A = lines[(i - 1 + n) % n],
      B = lines[i];
    const det = A.d[0] * -B.d[1] + A.d[1] * B.d[0];
    const rx = B.p[0] - A.p[0],
      ry = B.p[1] - A.p[1];
    const s = (rx * -B.d[1] + ry * B.d[0]) / det;
    return [A.p[0] + A.d[0] * s, A.p[1] + A.d[1] * s] as UV;
  });
}

/**
 * Pitched roof over a convex eave outline (counter-clockwise). Every outline vertex moves towards its
 * point on the ridge — the ridge runs along `axis` at `ridge` across it, from `along[0]` to `along[1]`
 * — and the rings follow `profile` ([inset from the eave edge (m), height]; the last inset reaches the
 * ridge: `halfWidth`). Straight edges between neighbouring targets give planar faces: slopes along the
 * long sides, hips that close at a ridge end, and vertical faces for gable edges (`gable[i]`, drawn in
 * `gableColor`) and for vertical steps of the profile (a säteritak).
 */
function pitchedRoof(
  b: Builder,
  outline: UV[],
  o: {
    axis: 'u' | 'v';
    ridge: number;
    along: [number, number];
    halfWidth: number;
    profile: [number, number][];
    gable: boolean[];
    color: Color;
    gableColor: Color;
  },
) {
  const n = outline.length;
  const target = outline.map(([u, v]): UV => {
    const clamp = (x: number) => Math.min(o.along[1], Math.max(o.along[0], x));
    return o.axis === 'u' ? [clamp(u), o.ridge] : [o.ridge, clamp(v)];
  });
  const rings = o.profile.map(([inset, h]) => {
    const t = Math.min(1, inset / o.halfWidth);
    return outline.map((p, i): P => [
      p[0] + t * (target[i][0] - p[0]),
      p[1] + t * (target[i][1] - p[1]),
      h,
    ]);
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const du = outline[j][0] - outline[i][0],
      dv = outline[j][1] - outline[i][1],
      len = Math.hypot(du, dv);
    const out = L(dv / len, -du / len, o.gable[i] ? 0 : 0.6);
    for (let k = 0; k + 1 < rings.length; k++) {
      const a = rings[k],
        c = rings[k + 1];
      b.quad(
        L(...a[i]),
        L(...a[j]),
        L(...c[j]),
        L(...c[i]),
        o.gable[i] ? o.gableColor : o.color,
        out,
      );
    }
  }
}

/**
 * Plan outline around the tower axis with half-widths a (u) and c (v): a rectangle, or an octagon
 * whose corners are cut by `chamfer` × the smaller half-width (counter-clockwise).
 */
export function towerOutline(a: number, c: number, chamfer = 0): UV[] {
  if (chamfer <= 0)
    return [
      [a, -c],
      [a, c],
      [-a, c],
      [-a, -c],
    ];
  const k = chamfer * Math.min(a, c);
  return [
    [a, -c + k],
    [a, c - k],
    [a - k, c],
    [-a + k, c],
    [-a, c - k],
    [-a, -c + k],
    [-a + k, -c],
    [a - k, -c],
  ];
}

/**
 * Stack of rings [height, half-width u, half-width v] around the tower axis (cap and roof of the
 * tower), rectangular or octagonal (towerOutline): one face per outline edge and segment, and a flat
 * top on the last ring.
 */
function ringStack(b: Builder, rings: [number, number, number][], color: Color, chamfer = 0) {
  const outlines = rings.map(([h, a, c]) =>
    towerOutline(a, c, chamfer).map(([u, v]) => L(u, v, h)),
  );
  const n = outlines[0].length;
  for (let k = 0; k + 1 < rings.length; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const p = outlines[k][i],
        q = outlines[k][j];
      const out: P = [(p[0] + q[0]) / 2, 0.4, (p[2] + q[2]) / 2];
      b.quad(p, q, outlines[k + 1][j], outlines[k + 1][i], color, out);
    }
  const top = outlines.at(-1)!;
  for (let i = 1; i + 1 < n; i++) b.tri(top[0], top[i], top[i + 1], color, [0, 1, 0]);
}

/** A round-arched opening (rectangle + half disc) on a vertical face. */
function archedOpening(
  b: Builder,
  at: (s: number, h: number) => P,
  s: number,
  width: number,
  bottom: number,
  top: number,
  color: Color,
  out: P,
) {
  const w = width / 2,
    spring = top - w;
  b.quad(at(s - w, bottom), at(s + w, bottom), at(s + w, spring), at(s - w, spring), color, out);
  for (let k = 0; k < 8; k++) {
    const a0 = (Math.PI * k) / 8,
      a1 = (Math.PI * (k + 1)) / 8;
    b.tri(
      at(s, spring),
      at(s + Math.cos(a0) * w, spring + Math.sin(a0) * w),
      at(s + Math.cos(a1) * w, spring + Math.sin(a1) * w),
      color,
      out,
    );
  }
}

/** Clock dial texture (gilded face and ring, dark hands) [EST from PHOTO]. */
function paintClock() {
  if (typeof document === 'undefined') {
    const t = new DataTexture(new Uint8Array([214, 176, 82, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = COLOURS.timber;
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#c99a3c';
  c.beginPath();
  c.arc(64, 64, 63, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1e1f22';
  c.beginPath();
  c.arc(64, 64, 54, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#e2bd57';
  c.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    c.beginPath();
    c.moveTo(64 + Math.sin(a) * 40, 64 - Math.cos(a) * 40);
    c.lineTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
    c.stroke();
  }
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(64, 64);
  c.lineTo(64 + 22, 64 + 10);
  c.moveTo(64, 64);
  c.lineTo(64 - 4, 64 - 38);
  c.stroke();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The floodlights (spec FLOODLIGHTS) as scene-space façade emitters for the lighting controller. */
export function hedvigFloodlights(frame: HedvigFrame): FacadeEmitter[] {
  return toFacadeEmitters(frame, FLOODLIGHTS, FLOOD_COLOR_3000K, 'hedvig-');
}

export function createHedvig(terrain: TerrainService) {
  const frame = hedvigFrame(terrain);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const group = new Group();
  group.name = 'hedvig';
  group.userData.placed = true;
  group.position.set(frame.origin[0], 0, frame.origin[1]);
  group.rotation.y = frame.rotation;
  group.scale.setScalar(1 / frame.metres);

  const building = cityMap.buildings.find((b) => b.id === HEDVIG_ID);
  if (!building) throw new Error(`Hedvigs kyrka: OSM building ${HEDVIG_ID} missing from the map`);
  const ring = building.rings[0].map(([x, z]) => frame.toFrame(x, z));
  if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1])
    ring.pop();
  /** Lowest rendered ground under the footprint (RH2000 m): wall bottoms, like cityMesh buildingBase. */
  const base = terrain.footprintGround(building.rings) * frame.metres;

  const masonry = new Builder(),
    roofs = new Builder(),
    dark = new Builder(),
    gold = new Builder(),
    clocks = new Builder(true);
  const brick = C(COLOURS.brick),
    trim = C(COLOURS.trim),
    plinth = C(COLOURS.plinth),
    plaster = C(COLOURS.plaster),
    copper = C(COLOURS.copper),
    timber = C(COLOURS.timber),
    balustrade = C(COLOURS.balustrade),
    glass = C(COLOURS.window),
    door = C(COLOURS.door),
    louvre = C(COLOURS.louvre),
    gilt = C(COLOURS.gold);

  // ---- Walls along the OSM footprint, to the top of their part (the west bay's rake split at the
  //      terrace). ----
  const report = { walls: 0, windows: 0, base, footprintVertices: ring.length };
  const edges: { a: UV; b: UV; part: ReturnType<typeof partOf>; nu: number; nv: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    const mu = (a[0] + b[0]) / 2,
      mv = (a[1] + b[1]) / 2;
    let nu = (b[1] - a[1]) / len,
      nv = -(b[0] - a[0]) / len;
    if (insidePolygon(ring, mu + nu * 0.2, mv + nv * 0.2)) [nu, nv] = [-nu, -nv];
    edges.push({ a, b, part: partOf(mu, mv), nu, nv });
  }
  for (const { a, b, part, nu, nv } of edges) {
    const out = L(nu, nv, 0);
    // Split where the west bay's roof slope meets the terrace (the wall top has a kink there).
    const cuts = [0, 1];
    const k = WEST_BAY.terraceU;
    if (part === 'west' && (a[0] - k) * (b[0] - k) < 0)
      cuts.splice(1, 0, (k - a[0]) / (b[0] - a[0]));
    for (let c = 0; c + 1 < cuts.length; c++) {
      const p = [a[0] + (b[0] - a[0]) * cuts[c], a[1] + (b[1] - a[1]) * cuts[c]],
        q = [a[0] + (b[0] - a[0]) * cuts[c + 1], a[1] + (b[1] - a[1]) * cuts[c + 1]];
      const tp = wallTopAt(part, p[0]),
        tq = wallTopAt(part, q[0]);
      masonry.quad(
        L(p[0], p[1], base),
        L(q[0], q[1], base),
        L(q[0], q[1], tq),
        L(p[0], p[1], tp),
        brick,
        out,
      );
      // Stone plinth [PHOTO/EST], 6 cm proud.
      const d = 0.06;
      masonry.quad(
        L(p[0] + nu * d, p[1] + nv * d, base),
        L(q[0] + nu * d, q[1] + nv * d, base),
        L(q[0] + nu * d, q[1] + nv * d, Math.min(tq, FACADE.plinthTop)),
        L(p[0] + nu * d, p[1] + nv * d, Math.min(tp, FACADE.plinthTop)),
        plinth,
        out,
      );
    }
    report.walls++;
  }

  // ---- Stone cornice of the nave and the east end [PHOTO]: outer face, soffit and a top that also
  //      closes the pilasters and buttresses (0.6 m inward from every edge). ----
  const F = FACADE.cornice;
  for (const { a, b, part, nu, nv } of edges) {
    if (part !== 'nave') continue;
    const o = F.projection,
      i = -0.6;
    const at = (p: UV, d: number, h: number) => L(p[0] + nu * d, p[1] + nv * d, h);
    const out = L(nu, nv, 0);
    masonry.quad(at(a, o, F.bottom), at(b, o, F.bottom), at(b, o, EAVE), at(a, o, EAVE), trim, out);
    masonry.quad(
      at(a, 0, F.bottom),
      at(b, 0, F.bottom),
      at(b, o, F.bottom),
      at(a, o, F.bottom),
      trim,
      [0, -1, 0],
    );
    masonry.quad(at(a, i, EAVE), at(b, i, EAVE), at(b, o, EAVE), at(a, o, EAVE), trim, [0, 1, 0]);
  }

  // ---- Windows: tall round-arched, one per bay between the pilasters of the long walls, one on each
  //      diagonal wall of the east end [PHOTO/EST]. ----
  const W = FACADE.windows;
  for (const { a, b, part, nu, nv } of edges) {
    if (part !== 'nave') continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 3) continue;
    const long = Math.abs(nv) > 0.95,
      diagonal = Math.abs(nu) > 0.3 && Math.abs(nv) > 0.3;
    const du = (b[0] - a[0]) / len,
      dv = (b[1] - a[1]) / len;
    const centres: number[] = []; // distance along the edge
    if (long) {
      for (const c of FACADE.bayCentres) {
        const s = (c - a[0]) / du;
        if (s > W.width / 2 + 0.3 && s < len - W.width / 2 - 0.3) centres.push(s);
      }
    } else if (diagonal) centres.push(len / 2);
    for (const s of centres) {
      const d = 0.06;
      const at = (t: number, h: number) =>
        L(a[0] + du * (s + t) + nu * d, a[1] + dv * (s + t) + nv * d, h);
      archedOpening(dark, (t, h) => at(t, h), 0, W.width, W.sill, W.top, glass, L(nu, nv, 0));
      report.windows++;
    }
  }

  // ---- West front: cream portal frontispiece and the arched door [PHOTO/EST]. ----
  const westFace = edges.find(
    (e) =>
      e.part === 'west' &&
      e.nu < -0.95 &&
      Math.min(e.a[1], e.b[1]) < -1 &&
      Math.max(e.a[1], e.b[1]) > 1,
  );
  if (westFace) {
    const uFace = (westFace.a[0] + westFace.b[0]) / 2 - 0.08;
    const Fr = WEST_BAY.frontispiece;
    masonry.quad(
      L(uFace, Fr.v0, base),
      L(uFace, Fr.v1, base),
      L(uFace, Fr.v1, Fr.top),
      L(uFace, Fr.v0, Fr.top),
      plaster,
      L(-1, 0, 0),
    );
    // Cornice band over the whole west face at its top.
    const top = westBayRoof(uFace + 0.08);
    masonry.box(
      uFace - 0.3,
      uFace + 0.08,
      WEST_BAY.v0 - 0.9,
      WEST_BAY.v1 + 0.9,
      top - 0.6,
      top,
      trim,
    );
    const g = frame.ground(uFace - 1.5, (Fr.v0 + Fr.v1) / 2);
    archedOpening(
      dark,
      (s, h) => L(uFace - 0.04, s, h),
      (Fr.v0 + Fr.v1) / 2,
      WEST_BAY.door.width,
      g,
      g + WEST_BAY.door.height,
      door,
      L(-1, 0, 0),
    );
  }

  // ---- Roofs [LIDAR]. Nave: säteritak with the hipped three-sided east end, gable behind the tower. ----
  const naveWalls: UV[] = [
    [NAVE.u0, NAVE.south],
    [32.12, NAVE.south],
    [EAST_END.eastWall, -3.84],
    [EAST_END.eastWall, 3.23],
    [32.1, NAVE.north],
    [NAVE.u0, NAVE.north],
  ];
  const o = NAVE.overhang;
  const naveOutline = offsetPolygon(naveWalls, [o, o, o, o, o, 0]);
  const vMid = (naveOutline[0][1] + naveOutline[5][1]) / 2,
    half = (naveOutline[5][1] - naveOutline[0][1]) / 2;
  const eastEave = naveOutline[2][0];
  pitchedRoof(roofs, naveOutline, {
    axis: 'u',
    ridge: vMid,
    along: [NAVE.u0, eastEave - half],
    halfWidth: half,
    profile: NAVE.profile,
    gable: [false, false, false, false, false, true],
    color: copper,
    gableColor: brick,
  });
  // Sacristy: ridge along v, hipped to the north, its south gable hidden inside the nave wall.
  const S = SACRISTY;
  const sacWalls: UV[] = [
    [24.51, NAVE.north - 0.15],
    [33.15, NAVE.north - 0.15],
    [33.19, 20.39],
    [24.48, 19.86],
  ];
  const so = S.overhang;
  const sacOutline = offsetPolygon(sacWalls, [0, so, so, so]);
  const sHalf = (sacOutline[1][0] - sacOutline[0][0]) / 2,
    sMid = (sacOutline[1][0] + sacOutline[0][0]) / 2;
  const northAtRidge =
    sacOutline[3][1] +
    ((sacOutline[2][1] - sacOutline[3][1]) * (sMid - sacOutline[3][0])) /
      (sacOutline[2][0] - sacOutline[3][0]);
  pitchedRoof(roofs, sacOutline, {
    axis: 'v',
    ridge: sMid,
    along: [sacOutline[0][1], northAtRidge - sHalf],
    halfWidth: sHalf,
    profile: [
      [0, S.eave],
      [sHalf, S.ridge],
    ],
    gable: [true, false, false, false],
    color: copper,
    gableColor: brick,
  });
  // Sacristy porch: flat copper cap [LIDAR 8.6–9.4 m].
  roofs.box(33.0, 35.05, 11.15, 14.05, S.porchTop - 0.15, S.porchTop, copper);
  // West bay: single slope from the west eave to the terrace, the terrace itself, and fascias.
  const B = WEST_BAY;
  const bv0 = -7.0,
    bv1 = 6.5;
  roofs.quad(
    L(B.eaveU, bv0, B.eave),
    L(B.eaveU, bv1, B.eave),
    L(B.terraceU, bv1, B.terrace),
    L(B.terraceU, bv0, B.terrace),
    copper,
    [-0.7, 0.7, 0],
  );
  roofs.quad(
    L(B.terraceU, bv0, B.terrace),
    L(B.terraceU, bv1, B.terrace),
    L(B.u1, bv1, B.terrace),
    L(B.u1, bv0, B.terrace),
    copper,
    [0, 1, 0],
  );
  for (const [v, s] of [
    [bv0, -1],
    [bv1, 1],
  ]) {
    const f = 0.35;
    roofs.quad(
      L(B.eaveU, v, B.eave - f),
      L(B.terraceU, v, B.terrace - f),
      L(B.terraceU, v, B.terrace),
      L(B.eaveU, v, B.eave),
      copper,
      L(0, s, 0),
    );
    roofs.quad(
      L(B.terraceU, v, B.terrace - f),
      L(B.u1, v, B.terrace - f),
      L(B.u1, v, B.terrace),
      L(B.terraceU, v, B.terrace),
      copper,
      L(0, s, 0),
    );
  }
  roofs.quad(
    L(B.eaveU, bv0, B.eave - 0.35),
    L(B.eaveU, bv1, B.eave - 0.35),
    L(B.eaveU, bv1, B.eave),
    L(B.eaveU, bv0, B.eave),
    copper,
    L(-1, 0, 0),
  );

  // ---- Bell tower [LIDAR + PHOTO]. ----
  const T = TOWER;
  const Bal = T.balustrade;
  masonry.box(Bal.u0, Bal.u0 + Bal.thickness, -Bal.hv, Bal.hv, B.terrace, Bal.top, balustrade);
  for (const s of [-1, 1])
    masonry.box(
      Bal.u0,
      B.u1,
      s < 0 ? -Bal.hv : Bal.hv - Bal.thickness,
      s < 0 ? -Bal.hv + Bal.thickness : Bal.hv,
      B.terrace,
      Bal.top,
      balustrade,
    );
  const St = T.stage;
  masonry.box(-St.hu, St.hu, -St.hv, St.hv, St.bottom, St.top, timber);
  // Louvres (arched, dark), two on every face, with gilded swags above them [PHOTO].
  const Lv = T.louvres;
  for (const [nu, nv] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const wide = nu !== 0;
    const count = 2,
      spacing = wide ? Lv.spacingWide : Lv.spacingNarrow;
    const d = 0.05;
    const at = (s: number, h: number): P =>
      wide ? L(nu * (St.hu + d), s, h) : L(s, nv * (St.hv + d), h);
    const out = L(nu, nv, 0);
    for (let i = 0; i < count; i++) {
      const s = (i - (count - 1) / 2) * spacing;
      archedOpening(dark, at, s, Lv.width, Lv.bottom, Lv.top, louvre, out);
      // Swag: a bar with two short drops.
      const w = Lv.width / 2 + 0.15,
        y0 = Lv.top + 0.3;
      gold.quad(
        at(s - w, y0 + 0.25),
        at(s + w, y0 + 0.25),
        at(s + w, y0 + 0.45),
        at(s - w, y0 + 0.45),
        gilt,
        out,
      );
      for (const e of [-w, w - 0.18])
        gold.quad(
          at(s + e, y0 - 0.35),
          at(s + e + 0.18, y0 - 0.35),
          at(s + e + 0.18, y0 + 0.25),
          at(s + e, y0 + 0.25),
          gilt,
          out,
        );
    }
  }
  ringStack(roofs, T.cap, copper);
  // Octagonal lantern [PHOTO]: four wide faces (clocks) and four narrow diagonal faces (gilded
  // diamonds), under an octagonal, concave copper roof.
  const Ln = T.lantern;
  const lantern = towerOutline(Ln.hu, Ln.hv, T.chamfer);
  for (let i = 0; i < lantern.length; i++) {
    const [ua, va] = lantern[i],
      [ub, vb] = lantern[(i + 1) % lantern.length];
    const out = L((ua + ub) / 2, (va + vb) / 2, 0);
    masonry.quad(
      L(ua, va, Ln.bottom),
      L(ub, vb, Ln.bottom),
      L(ub, vb, Ln.top),
      L(ua, va, Ln.top),
      timber,
      out,
    );
    if (Math.abs(ua - ub) > 1e-6 && Math.abs(va - vb) > 1e-6) {
      // Diagonal face: a gilded diamond, 0.3 × 1.1 m.
      const len = Math.hypot(ub - ua, vb - va),
        nu = (vb - va) / len,
        nv = -(ub - ua) / len;
      const mu = (ua + ub) / 2 + nu * 0.05,
        mv = (va + vb) / 2 + nv * 0.05,
        tu = ((ub - ua) / len) * 0.15,
        tv = ((vb - va) / len) * 0.15;
      const yc = T.clock.centre;
      gold.quad(
        L(mu, mv, yc - 0.55),
        L(mu + tu, mv + tv, yc),
        L(mu, mv, yc + 0.55),
        L(mu - tu, mv - tv, yc),
        gilt,
        L(nu, nv, 0),
      );
    }
  }
  ringStack(roofs, T.roof, copper, T.chamfer);
  const roofTop = T.roof.at(-1)![0];
  gold.cylinder(0, 0, roofTop, T.top, 0.07, 0.04, 6, gilt);
  const Bl = T.ball;
  gold.cylinder(0, 0, Bl.centre - Bl.radius, Bl.centre, 0.12, Bl.radius, 8, gilt);
  gold.cylinder(0, 0, Bl.centre, Bl.centre + Bl.radius, Bl.radius, 0.12, 8, gilt);
  // Clock dials on the four lantern faces.
  const r = T.clock.diameter / 2,
    y = T.clock.centre;
  for (const [nu, nv] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const wide = nu !== 0,
      d = 0.05;
    const at = (s: number, h: number): P =>
      wide ? L(nu * (Ln.hu + d), s, h) : L(s, nv * (Ln.hv + d), h);
    // Texture u runs left → right seen from outside.
    const flip = nu === -1 || nv === 1;
    const uv: [number, number][] = flip
      ? [
          [1, 0],
          [0, 0],
          [0, 1],
          [1, 1],
        ]
      : [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
    clocks.quad(at(-r, y - r), at(r, y - r), at(r, y + r), at(-r, y + r), gilt, L(nu, nv, 0), uv);
  }

  // ---- Floodlight housings on the ground [EST positions, see spec FLOODLIGHTS]. ----
  const housing = C(COLOURS.fixture);
  for (const f of FLOODLIGHTS) {
    const g = frame.ground(f.at[0], f.at[1]);
    masonry.box(
      f.at[0] - 0.2,
      f.at[0] + 0.2,
      f.at[1] - 0.2,
      f.at[1] + 0.2,
      g - 0.05,
      g + (f.height ?? 0),
      housing,
    );
  }

  // ---- Meshes. ----
  const material = (roughness: number, metalness = 0) =>
    own(new MeshStandardMaterial({ vertexColors: true, roughness, metalness }));
  const parts: [string, Builder, MeshStandardMaterial][] = [
    ['masonry', masonry, material(0.88)],
    ['roofs', roofs, material(0.72, 0.1)],
    ['openings', dark, material(0.3, 0.3)],
    ['gilding', gold, material(0.38, 0.35)],
    ['clocks', clocks, own(new MeshStandardMaterial({ map: own(paintClock()), roughness: 0.6 }))],
  ];
  let triangles = 0;
  for (const [name, builder, mat] of parts) {
    triangles += builder.triangles;
    const mesh = new Mesh(own(builder.geometry()), mat);
    mesh.name = 'hedvig-' + name;
    group.add(mesh);
  }
  return {
    group,
    frame,
    floodlights: hedvigFloodlights(frame),
    report: { ...report, triangles, meshes: parts.length },
    dispose() {
      owned.forEach((x) => x.dispose());
      group.clear();
    },
  };
}
