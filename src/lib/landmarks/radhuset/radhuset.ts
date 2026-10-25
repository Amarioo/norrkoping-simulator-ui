/**
 * Norrköpings rådhus with its tower and Gull-Olle (Landmark Phase B1, part 1: geometry by day).
 * Dimensions and their sources: ./spec.ts. Replaces the OSM extrusion of way/285809156 (cityPlaces
 * DETAILED_BUILDING_IDS) and the earlier illustrative clock tower in mapLandmarks.ts.
 *
 * Built in the BUILDING FRAME (ground metres, origin at the measured tower centre, local x = u along
 * the north façade, local z = −v, local y = RH2000 metres) inside one group: position = origin in scene
 * units at y 0, rotation about y onto the façade axis, scale 1/metresPerUnit. So a local height in
 * metres RH2000 is exactly the scene height × metresPerUnit, and the measured LiDAR heights are used
 * as they are. The walls follow the OSM footprint and reach down to the lowest rendered ground under
 * it (like the generic OSM buildings in cityMesh.ts).
 *
 * Draw calls: one merged, vertex-coloured mesh per material (masonry, roofs, windows, gold) plus one
 * textured mesh for the four clock faces. Materials are plain MeshStandardMaterial (vertex colours,
 * or a map), the configurations the stadium and the landmark details already use, so the lighting
 * patch adds no shader program.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { TerrainService } from '../../terrain';
import { cityMap } from '../../mapModel';
import {
  BALUSTRADE,
  COLOURS,
  EAVE,
  FACADE,
  FRAME,
  GULL_OLLE,
  MIDDLE,
  PROJECTIONS,
  RADHUSET_ID,
  ROOF_FEATURES,
  TOWER,
  WINGS,
} from './spec';

type P = [number, number, number];
/** Building frame (u, v metres, h RH2000 metres) → local group coordinates. */
const L = (u: number, v: number, h: number): P => [u, h, -v];

/** Scene ↔ building frame. */
export function radhusetFrame(terrain: TerrainService) {
  const metres = terrain.data.reference.metresPerUnit;
  const [ox, oz] = FRAME.originScene;
  // The stored axis is rounded to 6 decimals: normalise it so the frame is exactly metric.
  const axis = Math.hypot(...FRAME.axisScene),
    ux = FRAME.axisScene[0] / axis,
    uz = FRAME.axisScene[1] / axis;
  // three.js rotation about y: local +x → (cos θ, −sin θ) in scene x/z.
  const rotation = Math.atan2(-uz, ux);
  /** Scene [x, z] → building frame [u, v] (metres). */
  const toFrame = (x: number, z: number): [number, number] => [
    ((x - ox) * ux + (z - oz) * uz) * metres,
    ((x - ox) * uz - (z - oz) * ux) * metres,
  ];
  /** Building frame [u, v] → scene [x, z]. */
  const toScene = (u: number, v: number): [number, number] => [
    ox + (u * ux + v * uz) / metres,
    oz + (u * uz - v * ux) / metres,
  ];
  /** Rendered ground at a frame point, RH2000 metres. */
  const ground = (u: number, v: number) => terrain.groundHeight(...toScene(u, v)) * metres;
  return { origin: [ox, oz] as [number, number], rotation, metres, toFrame, toScene, ground };
}
export type RadhusetFrame = ReturnType<typeof radhusetFrame>;

/** Collects flat-shaded, vertex-coloured triangles; faces are oriented by an outward hint. */
class Builder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private uv: number[] | null = null;
  constructor(withUv = false) {
    if (withUv) this.uv = [];
  }
  private a = new Vector3();
  private b = new Vector3();
  private m = new Matrix4();
  tri(p0: P, p1: P, p2: P, color: Color, out?: P, uvs?: [number, number][]) {
    this.a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    this.b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const n = this.a.cross(this.b);
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    let q = [p0, p1, p2],
      t = uvs;
    if (out && n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) {
      n.negate();
      q = [p0, p2, p1];
      if (uvs) t = [uvs[0], uvs[2], uvs[1]];
    }
    for (let i = 0; i < 3; i++) {
      this.p.push(...q[i]);
      this.n.push(n.x, n.y, n.z);
      this.c.push(color.r, color.g, color.b);
      if (this.uv) this.uv.push(...(t?.[i] ?? [0, 0]));
    }
  }
  quad(p0: P, p1: P, p2: P, p3: P, color: Color, out?: P, uvs?: [number, number][]) {
    this.tri(p0, p1, p2, color, out, uvs && [uvs[0], uvs[1], uvs[2]]);
    this.tri(p0, p2, p3, color, out, uvs && [uvs[0], uvs[2], uvs[3]]);
  }
  /** Axis-aligned box in the building frame (u, v ranges; h from y0 to y1). */
  box(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: Color) {
    if (u1 <= u0 || v1 <= v0 || y1 <= y0) return;
    const c = (u: number, v: number, h: number) => L(u, v, h);
    const cu = (u0 + u1) / 2,
      cv = (v0 + v1) / 2;
    const out = (u: number, v: number, h: number): P => L(u - cu, v - cv, h);
    this.quad(c(u0, v1, y1), c(u1, v1, y1), c(u1, v0, y1), c(u0, v0, y1), color, [0, 1, 0]);
    this.quad(c(u0, v0, y0), c(u1, v0, y0), c(u1, v1, y0), c(u0, v1, y0), color, [0, -1, 0]);
    this.quad(c(u0, v0, y0), c(u0, v1, y0), c(u0, v1, y1), c(u0, v0, y1), color, out(u0, cv, 0));
    this.quad(c(u1, v0, y0), c(u1, v1, y0), c(u1, v1, y1), c(u1, v0, y1), color, out(u1, cv, 0));
    this.quad(c(u0, v0, y0), c(u1, v0, y0), c(u1, v0, y1), c(u0, v0, y1), color, out(cu, v0, 0));
    this.quad(c(u0, v1, y0), c(u1, v1, y0), c(u1, v1, y1), c(u0, v1, y1), color, out(cu, v1, 0));
  }
  /** The four vertical faces of an axis-aligned box (no top or bottom). */
  sides(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: Color) {
    const cu = (u0 + u1) / 2,
      cv = (v0 + v1) / 2;
    const out = (u: number, v: number): P => L(u - cu, v - cv, 0);
    this.quad(L(u0, v0, y0), L(u0, v1, y0), L(u0, v1, y1), L(u0, v0, y1), color, out(u0, cv));
    this.quad(L(u1, v0, y0), L(u1, v1, y0), L(u1, v1, y1), L(u1, v0, y1), color, out(u1, cv));
    this.quad(L(u0, v0, y0), L(u1, v0, y0), L(u1, v0, y1), L(u0, v0, y1), color, out(cu, v0));
    this.quad(L(u0, v1, y0), L(u1, v1, y0), L(u1, v1, y1), L(u0, v1, y1), color, out(cu, v1));
  }
  /** Tapered n-sided cylinder (frustum) standing at (u, v) from y0 to y1. */
  cylinder(
    u: number,
    v: number,
    y0: number,
    y1: number,
    r0: number,
    r1: number,
    sides: number,
    color: Color,
  ) {
    const g = new CylinderGeometry(r1, r0, y1 - y0, sides, 1).toNonIndexed();
    this.m.makeTranslation(...L(u, v, (y0 + y1) / 2));
    const pos = g.getAttribute('position'),
      v3 = new Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      const t: P[] = [0, 1, 2].map((k) => {
        v3.fromBufferAttribute(pos, i + k).applyMatrix4(this.m);
        return [v3.x, v3.y, v3.z];
      });
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3 - L(u, v, 0)[0],
        cz = (t[0][2] + t[1][2] + t[2][2]) / 3 - L(u, v, 0)[2],
        cy = (t[0][1] + t[1][1] + t[2][1]) / 3 - (y0 + y1) / 2;
      this.tri(t[0], t[1], t[2], color, [cx, cy, cz]);
    }
    g.dispose();
  }
  get triangles() {
    return this.p.length / 9;
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    if (this.uv) g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    else g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    this.p = [];
    this.n = [];
    this.c = [];
    if (this.uv) this.uv = [];
    return g;
  }
}

const C = (hex: string) => new Color(hex);

/** Wall top of an OSM footprint edge (midpoint in the building frame): which part it belongs to. */
export function wallTop(u: number, v: number) {
  if (v < -21.0 && Math.abs(u) < 8) return MIDDLE.hall.eave;
  if (Math.abs(u) > MIDDLE.tall.u1 && Math.abs(u) < 10.6 && v > -21.3 && v < -14.9)
    return MIDDLE.strips.top;
  return EAVE;
}

/**
 * A roof over the rectangle [u0,u1]×[v0,v1] whose ridge runs along `along`, from a profile
 * [inset from the eave edge, height] that ends at the ridge (inset = half the width). `profileHi`
 * (same heights, same length) gives the insets on the high-coordinate side when the two slopes differ;
 * the ridge then lies where both reach their last point. Hipped ends use the mean inset (a mansard
 * hip); other ends are vertical gables (filled with `gableColor`).
 */
function roof(
  b: Builder,
  r: { u0: number; u1: number; v0: number; v1: number },
  along: 'u' | 'v',
  profile: [number, number][],
  hipped: { start: boolean; end: boolean },
  color: Color,
  gableColor: Color,
  profileHi: [number, number][] = profile,
) {
  // Work in (a = along, c = across) and map back.
  const [a0, a1, c0, c1] = along === 'u' ? [r.u0, r.u1, r.v0, r.v1] : [r.v0, r.v1, r.u0, r.u1];
  const P2 = (a: number, c: number, h: number) => (along === 'u' ? L(a, c, h) : L(c, a, h));
  const half = (c1 - c0) / 2,
    mid = (c0 + c1) / 2,
    am = (a0 + a1) / 2;
  const rings = profile.map(([dLo, h], i) => {
    const dHi = profileHi[i][0];
    const cLo = Math.min(c0 + dLo, mid + half),
      cHi = Math.max(c1 - dHi, cLo);
    const d = (dLo + dHi) / 2;
    const s = hipped.start ? Math.min(d, (a1 - a0) / 2) : 0,
      e = hipped.end ? Math.min(d, (a1 - a0) / 2) : 0;
    return { a0: a0 + s, a1: a1 - e, cLo, cHi, h };
  });
  const outLo = P2(0, -1, 0),
    outHi = P2(0, 1, 0);
  for (let i = 0; i + 1 < rings.length; i++) {
    const p = rings[i],
      q = rings[i + 1];
    // Long sides.
    b.quad(
      P2(p.a0, p.cLo, p.h),
      P2(p.a1, p.cLo, p.h),
      P2(q.a1, q.cLo, q.h),
      P2(q.a0, q.cLo, q.h),
      color,
      [outLo[0], 0.5, outLo[2]],
    );
    b.quad(
      P2(p.a0, p.cHi, p.h),
      P2(p.a1, p.cHi, p.h),
      P2(q.a1, q.cHi, q.h),
      P2(q.a0, q.cHi, q.h),
      color,
      [outHi[0], 0.5, outHi[2]],
    );
    // Ends: hipped slopes or vertical gables.
    for (const [atEnd, pa, qa] of [
      [false, p.a0, q.a0],
      [true, p.a1, q.a1],
    ] as const) {
      const dir = atEnd ? 1 : -1;
      const o = P2(am + dir, mid, 0),
        base = P2(am, mid, 0);
      const out: P = [
        o[0] - base[0],
        (atEnd ? hipped.end : hipped.start) ? 0.6 : 0,
        o[2] - base[2],
      ];
      b.quad(
        P2(pa, p.cLo, p.h),
        P2(pa, p.cHi, p.h),
        P2(qa, q.cHi, q.h),
        P2(qa, q.cLo, q.h),
        (atEnd ? hipped.end : hipped.start) ? color : gableColor,
        out,
      );
    }
  }
}

/** Gilded-figure silhouette of Gull-Olle, standing on the tower roof's top ring. */
function gullOlle(b: Builder, gold: Color) {
  const base = GULL_OLLE.top - GULL_OLLE.height,
    H = GULL_OLLE.height;
  // Proportions [EST]: plinth 8 %, robe to 58 %, shoulders/torso to 78 %, head to 92 %, crown to 100 %.
  const y = (f: number) => base + H * f;
  b.cylinder(0, 0, y(0), y(0.08), 0.8, 0.72, 8, gold);
  b.cylinder(0, 0, y(0.08), y(0.58), 0.72, 0.5, 10, gold);
  b.cylinder(0, 0, y(0.58), y(0.72), 0.5, 0.56, 10, gold);
  b.cylinder(0, 0, y(0.72), y(0.78), 0.56, 0.2, 10, gold);
  b.cylinder(0, 0, y(0.78), y(0.92), 0.24, 0.22, 8, gold);
  b.cylinder(0, 0, y(0.92), y(1), 0.26, 0.29, 8, gold);
}

/** Clock dial texture (cream face, gold ring and numerals, dark hands) [EST from PHOTO]. */
function paintClock() {
  if (typeof document === 'undefined') {
    const t = new DataTexture(new Uint8Array([224, 210, 170, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = COLOURS.towerBrick;
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#c9a24a';
  c.beginPath();
  c.arc(64, 64, 63, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#e6dcc2';
  c.beginPath();
  c.arc(64, 64, 55, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#2a2a2a';
  c.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    c.beginPath();
    c.moveTo(64 + Math.sin(a) * 42, 64 - Math.cos(a) * 42);
    c.lineTo(64 + Math.sin(a) * 51, 64 - Math.cos(a) * 51);
    c.stroke();
  }
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(64, 64);
  c.lineTo(64 + 24, 64 - 14);
  c.moveTo(64, 64);
  c.lineTo(64 - 6, 64 - 40);
  c.stroke();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createRadhuset(terrain: TerrainService) {
  const frame = radhusetFrame(terrain);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const group = new Group();
  group.name = 'radhuset';
  group.userData.placed = true;
  group.position.set(frame.origin[0], 0, frame.origin[1]);
  group.rotation.y = frame.rotation;
  group.scale.setScalar(1 / frame.metres);

  const building = cityMap.buildings.find((b) => b.id === RADHUSET_ID);
  if (!building) throw new Error(`Rådhuset: OSM building ${RADHUSET_ID} missing from the map`);
  const ring = building.rings[0].map(([x, z]) => frame.toFrame(x, z));
  if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1])
    ring.pop();
  /** Lowest rendered ground under the footprint (RH2000 m): wall bottoms, like cityMesh buildingBase. */
  const base = terrain.footprintGround(building.rings) * frame.metres;
  const inside = (u: number, v: number) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ua, va] = ring[i],
        [ub, vb] = ring[j];
      if (va > v !== vb > v && u < ((ub - ua) * (v - va)) / (vb - va) + ua) hit = !hit;
    }
    return hit;
  };

  const masonry = new Builder(),
    roofs = new Builder(),
    glass = new Builder(),
    gold = new Builder(),
    clocks = new Builder(true);
  const brick = C(COLOURS.brick),
    towerBrick = C(COLOURS.towerBrick),
    stone = C(COLOURS.stone),
    plinth = C(COLOURS.plinth),
    slate = C(COLOURS.roof),
    towerSlate = C(COLOURS.towerRoof),
    copper = C(COLOURS.copper),
    windowColor = C(COLOURS.window),
    opening = C(COLOURS.opening),
    goldColor = C(COLOURS.gold);

  // ---- Walls along the OSM footprint, each edge to the top of its part (wallTop). ----
  const report = { walls: 0, windows: 0, base, footprintVertices: ring.length };
  for (let i = 0; i < ring.length; i++) {
    const [ua, va] = ring[i],
      [ub, vb] = ring[(i + 1) % ring.length];
    const len = Math.hypot(ub - ua, vb - va);
    if (len < 1e-3) continue;
    const mu = (ua + ub) / 2,
      mv = (va + vb) / 2;
    // Outward normal: the side of the edge that is not inside the footprint.
    let nu = (vb - va) / len,
      nv = -(ub - ua) / len;
    if (inside(mu + nu * 0.3, mv + nv * 0.3)) [nu, nv] = [-nu, -nv];
    const out = L(nu, nv, 0);
    const top = wallTop(mu, mv);
    masonry.quad(L(ua, va, base), L(ub, vb, base), L(ub, vb, top), L(ua, va, top), brick, out);
    // Granite plinth and stone string courses [PHOTO/EST], 6 cm proud of the wall.
    const proud = (h0: number, h1: number, color: Color, d = 0.06) =>
      h1 > h0 &&
      masonry.quad(
        L(ua + nu * d, va + nv * d, h0),
        L(ub + nu * d, vb + nv * d, h0),
        L(ub + nu * d, vb + nv * d, h1),
        L(ua + nu * d, va + nv * d, h1),
        color,
        out,
      );
    proud(base, Math.min(top, FACADE.plinthTop), plinth);
    if (top >= EAVE) {
      for (const h of FACADE.bands) proud(h, h + 0.45, stone);
      proud(FACADE.cornice.bottom, EAVE, stone, FACADE.cornice.projection);
    }
    report.walls++;
    // Windows [EST rhythm], only on full-height walls, skipped where the ground is too high.
    if (top < EAVE || len < 3) continue;
    const onRisalit = mv > 4.5 && Math.abs(mu - 0.25) < 6;
    const n = Math.floor((len - 2 * FACADE.windows.margin) / FACADE.windows.spacing) + 1;
    if (n < 1) continue;
    const first = (len - (n - 1) * FACADE.windows.spacing) / 2;
    for (let k = 0; k < n; k++) {
      const t = (first + k * FACADE.windows.spacing) / len,
        cu = ua + (ub - ua) * t,
        cv = va + (vb - va) * t;
      if (onRisalit) continue;
      const g = frame.ground(cu + nu * 1.5, cv + nv * 1.5);
      const du = ((ub - ua) / len) * (FACADE.windows.width / 2),
        dv = ((vb - va) / len) * (FACADE.windows.width / 2);
      for (const row of FACADE.windows.rows) {
        const y0 = row - FACADE.windows.height / 2,
          y1 = row + FACADE.windows.height / 2;
        if (y0 < g + 0.6) continue;
        const d = 0.08;
        glass.quad(
          L(cu - du + nu * d, cv - dv + nv * d, y0),
          L(cu + du + nu * d, cv + dv + nv * d, y0),
          L(cu + du + nu * d, cv + dv + nv * d, y1),
          L(cu - du + nu * d, cv - dv + nv * d, y1),
          windowColor,
          out,
        );
        report.windows++;
      }
    }
  }
  // North wing's courtyard wall between the strips (no OSM edge: the middle block attaches here).
  masonry.quad(
    L(-MIDDLE.tall.u1 - 1.4, WINGS.north.v0, MIDDLE.strips.top - 0.5),
    L(MIDDLE.tall.u1 + 1.4, WINGS.north.v0, MIDDLE.strips.top - 0.5),
    L(MIDDLE.tall.u1 + 1.4, WINGS.north.v0, EAVE),
    L(-MIDDLE.tall.u1 - 1.4, WINGS.north.v0, EAVE),
    brick,
    L(0, -1, 0),
  );
  // Entrance portal under the tower [EST: "norra fasadens portparti", position assumed central].
  glass.quad(
    L(TOWER.base.u0 + 3.9, TOWER.base.v1 + 0.08, frame.ground(0.25, 7)),
    L(TOWER.base.u1 - 3.9, TOWER.base.v1 + 0.08, frame.ground(0.25, 7)),
    L(TOWER.base.u1 - 3.9, TOWER.base.v1 + 0.08, frame.ground(0.25, 7) + 4.6),
    L(TOWER.base.u0 + 3.9, TOWER.base.v1 + 0.08, frame.ground(0.25, 7) + 4.6),
    opening,
    L(0, 1, 0),
  );

  // ---- Cornice ledge: flat caps over the wing rectangles, 0.5 m beyond the walls (the projection). ----
  const p = FACADE.cornice.projection;
  const cap = (u0: number, u1: number, v0: number, v1: number, h: number, color = slate) =>
    roofs.quad(L(u0, v0, h), L(u1, v0, h), L(u1, v1, h), L(u0, v1, h), color, [0, 1, 0]);
  const N = WINGS.north,
    W = WINGS.west,
    E = WINGS.east;
  cap(N.u0 - p, N.u1 + p, N.v0 - p, N.v1 + p, EAVE, stone);
  cap(W.u0 - p, W.u1 + p, W.v0 - p, N.v0 - p, EAVE, stone);
  cap(E.u0 - p, E.u1 + p, E.v0 - p, N.v0 - p, EAVE, stone);
  // The tower's entrance projection (OSM), flat to the eave.
  cap(TOWER.base.u0, TOWER.base.u1, TOWER.base.v0, TOWER.base.v1 + p, EAVE, stone);
  // The cornice fascia: the vertical outer faces of the ledge.
  for (const [u0, u1, v0, v1] of [
    [N.u0 - p, N.u1 + p, N.v0 - p, N.v1 + p],
    [W.u0 - p, W.u1 + p, W.v0 - p, N.v0 - p],
    [E.u0 - p, E.u1 + p, E.v0 - p, N.v0 - p],
  ])
    masonry.sides(u0, u1, v0, v1, FACADE.cornice.bottom, EAVE, stone);
  // North façade balustrade [LIDAR 23.6 m] on the ledge.
  masonry.box(
    N.u0 - p,
    N.u1 + p,
    N.v1 + p - BALUSTRADE.thickness,
    N.v1 + p,
    EAVE,
    BALUSTRADE.top,
    stone,
  );

  // ---- Roofs [LIDAR profiles]. ----
  roof(
    roofs,
    N,
    'u',
    WINGS.north.profile,
    { start: true, end: true },
    slate,
    brick,
    WINGS.north.profileNorth,
  );
  // Side wings: hipped at the south end, running into the north wing's roof (hidden gable).
  roof(
    roofs,
    { ...W, v1: WINGS.north.v0 + 3 },
    'v',
    W.profile,
    { start: true, end: false },
    slate,
    brick,
  );
  roof(
    roofs,
    { ...E, v1: WINGS.north.v0 + 3 },
    'v',
    E.profile,
    { start: true, end: false },
    slate,
    brick,
  );
  // Courtyard projections: cross gables along u, hipped at the courtyard end.
  for (const P of Object.values(PROJECTIONS)) {
    const halfP = (P.v1 - P.v0) / 2;
    roof(
      roofs,
      P,
      'u',
      [
        [0, EAVE],
        [halfP, P.ridge],
      ],
      { start: P.hippedEnd === 'u0', end: P.hippedEnd === 'u1' },
      slate,
      brick,
    );
  }
  // Tall middle block: walls to 30.6, roof along v to the ridge 36.1, hipped to the south, running
  // into the north wing roof.
  const T = MIDDLE.tall;
  masonry.box(T.u0, T.u1, T.v0, -9.5, base, T.eave, brick);
  const half = (T.u1 - T.u0) / 2;
  roof(
    roofs,
    { ...T, v1: -9.5 },
    'v',
    [
      [0, T.eave],
      [half, T.ridge],
    ],
    { start: true, end: false },
    slate,
    brick,
  );
  // Strips/flanks beside it: flat at 19.7 (OSM outline).
  for (const s of [-1, 1]) {
    const box = (a: number, bb: number, v0: number, v1: number) =>
      cap(Math.min(s * a, s * bb), Math.max(s * a, s * bb), v0, v1, MIDDLE.strips.top);
    box(T.u1, 8.75, -21.1, WINGS.north.v0);
    box(8.75, 10.37, -21.1, -19.0);
  }
  // Hall: low gable roof along v.
  const H = MIDDLE.hall;
  roof(
    roofs,
    H,
    'v',
    [
      [0, H.eave],
      [(H.u1 - H.u0) / 2, H.ridge],
    ],
    { start: false, end: false },
    slate,
    brick,
  );

  // ---- Roof features [LIDAR positions/heights; shape EST]: brick stacks with copper caps [PHOTO]. ----
  const F = ROOF_FEATURES;
  const stack = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number) => {
    masonry.box(u0, u1, v0, v1, y0, y1 - 0.5, brick);
    masonry.box(u0 - 0.12, u1 + 0.12, v0 - 0.12, v1 + 0.12, y1 - 0.5, y1, copper);
  };
  for (const u of F.ridge.u)
    stack(u - 0.6, u + 0.6, F.ridge.v - 0.6, F.ridge.v + 0.6, 35.5, F.ridge.top);
  for (const u of F.rear.u) stack(u - 0.8, u + 0.8, F.rear.v0, F.rear.v1, 30, F.rear.top);
  for (const u of F.middle.u) stack(u - 0.8, u + 0.8, F.middle.v0, F.middle.v1, 19, F.middle.top);
  for (const u of F.wings.u)
    for (const v of F.wings.v) stack(u - 0.6, u + 0.6, v - 0.6, v + 0.6, 28.5, F.wings.top);

  // ---- Tower [LIDAR shaft, cornice, roof; PHOTO/EST details]. ----
  const S = TOWER.shaft;
  masonry.box(S.u0, S.u1, S.v0, S.v1, base, TOWER.cornice.bottom, towerBrick);
  for (const h of TOWER.bands)
    masonry.box(S.u0 - 0.1, S.u1 + 0.1, S.v0 - 0.1, S.v1 + 0.1, h, h + 0.4, stone);
  const k = TOWER.cornice.half;
  masonry.box(-k, k, -k, k, TOWER.cornice.bottom, TOWER.cornice.top, stone);
  const R = TOWER.roof;
  for (let i = 0; i + 1 < R.length; i++) {
    const [h0, w0] = R[i],
      [h1, w1] = R[i + 1];
    for (const [du, dv] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const corner = (w: number, h: number, s: number): P =>
        du === 0 ? L(s * w, dv * w, h) : L(du * w, s * w, h);
      roofs.quad(
        corner(w0, h0, -1),
        corner(w0, h0, 1),
        corner(w1, h1, 1),
        corner(w1, h1, -1),
        towerSlate,
        [du, 0.4, -dv],
      );
    }
  }
  const [topH, topW] = R.at(-1)!;
  roofs.quad(
    L(-topW, -topW, topH),
    L(topW, -topW, topH),
    L(topW, topW, topH),
    L(-topW, topW, topH),
    towerSlate,
    [0, 1, 0],
  );
  // Faces of the shaft: belfry openings and clock dials.
  const faces = [
    { n: [0, 1], w: [S.u0, S.u1], at: S.v1 },
    { n: [0, -1], w: [S.u0, S.u1], at: S.v0 },
    { n: [1, 0], w: [S.v0, S.v1], at: S.u1 },
    { n: [-1, 0], w: [S.v0, S.v1], at: S.u0 },
  ];
  const O = TOWER.openings;
  for (const f of faces) {
    const mid = (f.w[0] + f.w[1]) / 2,
      d = 0.04;
    const at = (s: number, h: number): P =>
      f.n[0] === 0 ? L(s, f.at + f.n[1] * d, h) : L(f.at + f.n[0] * d, s, h);
    const out = L(f.n[0], f.n[1], 0);
    for (let i = 0; i < O.count; i++) {
      const c = mid + (i - (O.count - 1) / 2) * O.spacing,
        w = O.width / 2;
      masonry.quad(
        at(c - w, O.bottom),
        at(c + w, O.bottom),
        at(c + w, O.top - w),
        at(c - w, O.top - w),
        opening,
        out,
      );
      // Round arch head (half disc, 6 segments).
      for (let s = 0; s < 6; s++) {
        const a0 = (Math.PI * s) / 6,
          a1 = (Math.PI * (s + 1)) / 6;
        masonry.tri(
          at(c, O.top - w),
          at(c + Math.cos(a0) * w, O.top - w + Math.sin(a0) * w),
          at(c + Math.cos(a1) * w, O.top - w + Math.sin(a1) * w),
          opening,
          out,
        );
      }
    }
    const r = TOWER.clock.diameter / 2 + 0.25,
      y = TOWER.clock.centre,
      dc = 0.06;
    const atc = (s: number, h: number): P =>
      f.n[0] === 0 ? L(s, f.at + f.n[1] * dc, h) : L(f.at + f.n[0] * dc, s, h);
    // Texture u runs left → right seen from outside: on the +v and −u faces that is towards −s.
    const flip = f.n[1] === 1 || f.n[0] === -1;
    const uv0: [number, number] = flip ? [1, 0] : [0, 0],
      uv1: [number, number] = flip ? [0, 0] : [1, 0],
      uv2: [number, number] = flip ? [0, 1] : [1, 1],
      uv3: [number, number] = flip ? [1, 1] : [0, 1];
    clocks.quad(
      atc(mid - r, y - r),
      atc(mid + r, y - r),
      atc(mid + r, y + r),
      atc(mid - r, y + r),
      goldColor,
      out,
      [uv0, uv1, uv2, uv3],
    );
  }
  gullOlle(gold, goldColor);

  // ---- Meshes. ----
  const material = (roughness: number, metalness = 0) =>
    own(new MeshStandardMaterial({ vertexColors: true, roughness, metalness }));
  const parts: [string, Builder, MeshStandardMaterial][] = [
    ['masonry', masonry, material(0.88)],
    ['roofs', roofs, material(0.72, 0.1)],
    ['windows', glass, material(0.3, 0.3)],
    // Gilded: modest metalness, since the scene has no environment map (a high value renders dark).
    ['gull-olle', gold, material(0.38, 0.35)],
    ['clocks', clocks, own(new MeshStandardMaterial({ map: own(paintClock()), roughness: 0.6 }))],
  ];
  let triangles = 0;
  for (const [name, builder, mat] of parts) {
    triangles += builder.triangles;
    const mesh = new Mesh(own(builder.geometry()), mat);
    mesh.name = 'radhuset-' + name;
    group.add(mesh);
  }
  return {
    group,
    frame,
    report: { ...report, triangles, meshes: parts.length },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
