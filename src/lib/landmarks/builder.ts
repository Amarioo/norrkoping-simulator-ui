/**
 * Shared geometry helpers of the measured landmark models (Rådhuset B1, Hedvigs kyrka B2).
 *
 * Every model is built in its own BUILDING FRAME: horizontal ground metres (u, v) and heights in RH2000
 * metres. `L` maps a frame point to the local coordinates of the model's group (x = u, y = height,
 * z = −v); the group is then placed with position = frame origin, a rotation about y onto the frame
 * axis and scale 1/metresPerUnit (see each model's `…Frame`).
 */
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Vector3,
} from 'three';

export type P = [number, number, number];
/** Building frame (u, v metres, h RH2000 metres) → local group coordinates. */
export const L = (u: number, v: number, h: number): P => [u, h, -v];
export const C = (hex: string) => new Color(hex);

/** Collects flat-shaded, vertex-coloured triangles; faces are oriented by an outward hint. */
export class Builder {
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

/** Point-in-polygon test in the building frame (even-odd rule). */
export function insidePolygon(poly: readonly (readonly [number, number])[], u: number, v: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ua, va] = poly[i],
      [ub, vb] = poly[j];
    if (va > v !== vb > v && u < ((ub - ua) * (v - va)) / (vb - va) + ua) hit = !hit;
  }
  return hit;
}
