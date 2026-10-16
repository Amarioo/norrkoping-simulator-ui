import { describe, expect, it } from 'vitest';
import { smoothingAlpha, shortestAngle } from './motion';
describe('render interpolation', () => {
  it('has the same decay at 30 and 120 FPS', () => {
    expect(Math.pow(1 - smoothingAlpha(1 / 30), 30)).toBeCloseTo(
      Math.pow(1 - smoothingAlpha(1 / 120), 120),
      10,
    );
  });
  it('clamps long frames and never overshoots', () => {
    expect(smoothingAlpha(30)).toBeLessThan(1);
    expect(smoothingAlpha(-1)).toBe(0);
  });
  it('turns across the angle seam by the shortest arc', () => {
    expect(shortestAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });
});
