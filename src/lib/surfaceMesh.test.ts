import { describe, it, expect } from 'vitest';
import { gridTriangles } from './surfaceMesh';
import { terrain } from './terrain';
describe('shared ground mesh', () => {
  it('clips triangles without creating holes or overlapping area', () => {
    const a: [number, number] = [-2.13, -1.27],
      b: [number, number] = [2.91, -0.45],
      c: [number, number] = [0.17, 3.22];
    const area = (p: number[], q: number[], r: number[]) =>
      Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
    let sum = 0,
      count = 0;
    gridTriangles(a, b, c, terrain.surfaceStep, (p, q, r) => {
      sum += area(p, q, r);
      count++;
    });
    expect(sum).toBeCloseTo(area(a, b, c), 8);
    expect(count).toBeGreaterThan(10);
  });
  it('has a continuous height at the fine/coarse boundary', () => {
    for (const z of [-51.3, -12.7, 8.21, 49.77])
      expect(terrain.surfaceHeight(64 - 1e-7, z)).toBeCloseTo(
        terrain.surfaceHeight(64 + 1e-7, z),
        5,
      );
  });
  it('uses a plane within each fine cell for ground layers and roads', () => {
    const a: [number, number] = [-20, -12],
      b: [number, number] = [-19.6, -12],
      c: [number, number] = [-20, -11.6];
    const p: [number, number] = [
      a[0] * 0.2 + b[0] * 0.3 + c[0] * 0.5,
      a[1] * 0.2 + b[1] * 0.3 + c[1] * 0.5,
    ];
    expect(terrain.surfaceHeight(...p)).toBeCloseTo(
      terrain.surfaceHeight(...a) * 0.2 +
        terrain.surfaceHeight(...b) * 0.3 +
        terrain.surfaceHeight(...c) * 0.5,
      9,
    );
  });
});
