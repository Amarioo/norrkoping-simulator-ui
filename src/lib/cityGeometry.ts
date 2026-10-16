/**
 * Exact 2D geometry helpers for testing the miniature: strips (streets,
 * water) are rotated rectangles, buildings are boxes, circles or the
 * Strykjärnet triangle. All tests run in the scene's (x, z) plane.
 */
import { buildingExtents, type Building } from './city';

export type Vec = [number, number];
export interface Rect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  angle: number;
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

/** Strip geometry stores the in-plane rotation about Y; long axis is (cos, -sin). */
export function rectAxes(angle: number): [Vec, Vec] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, -s],
    [s, c],
  ];
}

export function rectCorners(r: Rect): Vec[] {
  const [a1, a2] = rectAxes(r.angle);
  const sx = [a1[0] * r.hx, a1[1] * r.hx];
  const sz = [a2[0] * r.hz, a2[1] * r.hz];
  return [
    [r.cx + sx[0] + sz[0], r.cz + sx[1] + sz[1]],
    [r.cx + sx[0] - sz[0], r.cz + sx[1] - sz[1]],
    [r.cx - sx[0] - sz[0], r.cz - sx[1] - sz[1]],
    [r.cx - sx[0] + sz[0], r.cz - sx[1] + sz[1]],
  ];
}

function rectRadius(hx: number, hz: number, axes: [Vec, Vec], n: Vec): number {
  return Math.abs(hx * dot(axes[0], n)) + Math.abs(hz * dot(axes[1], n));
}

/** Separating-axis test for two rotated rectangles. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const axesA = rectAxes(a.angle);
  const axesB = rectAxes(b.angle);
  const d: Vec = [b.cx - a.cx, b.cz - a.cz];
  for (const n of [axesA[0], axesA[1], axesB[0], axesB[1]]) {
    const ra = rectRadius(a.hx, a.hz, axesA, n);
    const rb = rectRadius(b.hx, b.hz, axesB, n);
    if (Math.abs(dot(d, n)) >= ra + rb) return false;
  }
  return true;
}

export function circleRectOverlap(cx: number, cz: number, r: number, rect: Rect): boolean {
  const axes = rectAxes(rect.angle);
  const d: Vec = [cx - rect.cx, cz - rect.cz];
  const lx = dot(d, axes[0]);
  const lz = dot(d, axes[1]);
  const qx = Math.max(-rect.hx, Math.min(rect.hx, lx));
  const qz = Math.max(-rect.hz, Math.min(rect.hz, lz));
  return Math.hypot(lx - qx, lz - qz) <= r;
}

/** Strykjärnet's triangular footprint: three prism vertices in scene axes. */
export function ironVertices(b: Building): Vec[] {
  const r = b.tiers[0].w / 2;
  const k = Math.sqrt(3) / 2;
  return [
    [b.x, b.z + r],
    [b.x + k * r, b.z - r / 2],
    [b.x - k * r, b.z - r / 2],
  ];
}

export function polygonRectOverlap(poly: Vec[], rect: Rect): boolean {
  const corners = rectCorners(rect);
  const axes: Vec[] = [...rectAxes(rect.angle)];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q[0] - p[0];
    const ez = q[1] - p[1];
    const len = Math.hypot(ex, ez);
    axes.push([-ez / len, ex / len]);
  }
  for (const n of axes) {
    const polyProj = poly.map((p) => dot(p, n));
    const rectProj = corners.map((c) => dot(c, n));
    if (Math.max(...polyProj) <= Math.min(...rectProj)) return false;
    if (Math.max(...rectProj) <= Math.min(...polyProj)) return false;
  }
  return true;
}

export function waterRect(w: { x: number; z: number; len: number; angle: number; width: number }): Rect {
  return { cx: w.x, cz: w.z, hx: w.len / 2, hz: w.width / 2, angle: w.angle };
}

/** Buildings never stand in Motala ström. */
export function clearOfWater(b: Building, w: Rect): boolean {
  if (b.kind === 'iron') return !polygonRectOverlap(ironVertices(b), w);
  if (b.kind === 'cylinder') return !circleRectOverlap(b.x, b.z, b.tiers[0].w / 2, w);
  const [ex, ez] = buildingExtents(b);
  return !rectsOverlap({ cx: b.x, cz: b.z, hx: ex, hz: ez, angle: 0 }, w);
}