// Landmark Phase B1 part 2: Rådhuset's tower floodlights (estimates reproducing the 2017 night
// photograph). Kept apart from radhuset.test.ts (part 1, geometry).
import { describe, expect, test } from 'vitest';
import { terrain } from '../../terrain';
import { facadeIlluminance, facadeZone, FACADE_MAX } from '../../lighting/cityLights';
import { createHedvig } from '../hedvig/hedvig';
import { mountHeight } from '../floodlights';
import { createRadhuset } from './radhuset';
import { FLOOD_COLOR_WARM, FLOODLIGHTS, GULL_OLLE, TOWER } from './spec';

const M = terrain.data.reference.metresPerUnit;
const model = createRadhuset(terrain);
const lights = model.floodlights;
/**
 * Illuminance (lx) from the tower floods at a building-frame point on a surface with outward normal
 * n = (u, v, up) (none: facing each flood), as the shader shades it: facadeIlluminance × max(0, n·l).
 */
const lux = (u: number, v: number, h: number, only?: string, n?: [number, number, number]) => {
  const [x, z] = model.frame.toScene(u, v);
  return lights
    .filter((e) => !only || e.name === 'radhuset-' + only)
    .reduce((a, e) => {
      const [lu, lv] = model.frame.toFrame(e.position[0], e.position[2]);
      const d = [lu - u, lv - v, e.position[1] * M - h];
      const len = Math.hypot(...d);
      const cos = n
        ? Math.max(0, (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / len / Math.hypot(...n))
        : 1;
      return a + facadeIlluminance(e, [x, h / M, z], M) * cos;
    }, 0);
};
/** Outward normals of the tower roof's faces (slope from [TOWER.roof]: 5.0 → 1.1 m over 10.35 m). */
const roofNormal = (nu: number, nv: number): [number, number, number] => [
  nu * 10.35,
  nv * 10.35,
  3.9,
];

describe('Rådhuset tower floodlights (B1 part 2)', () => {
  test('eight floods: one per shaft face, four on the cornice; warm colour; aimed up', () => {
    expect(lights.map((e) => e.name)).toEqual(FLOODLIGHTS.map((f) => 'radhuset-' + f.name));
    expect(lights).toHaveLength(8);
    for (const e of lights) {
      expect(e.color).toEqual(FLOOD_COLOR_WARM);
      expect(Math.hypot(...e.aim)).toBeCloseTo(1, 9);
      expect(e.aim[1]).toBeGreaterThan(0.3);
      expect(e.cosInner).toBeGreaterThan(e.cosOuter);
    }
    // The square flood stands on the ground; the others on the roofs and the cornice.
    const north = FLOODLIGHTS.find((f) => f.name === 'shaft-north')!;
    const e = lights.find((l) => l.name === 'radhuset-shaft-north')!;
    expect(e.position[1] * M).toBeCloseTo(model.frame.ground(0, 30) + 0.5, 6);
    expect(mountHeight(model.frame, north)).toBeCloseTo(e.position[1] * M, 9);
    for (const f of FLOODLIGHTS.filter((f) => f.name.startsWith('roof-')))
      expect(f.z).toBeCloseTo(TOWER.cornice.top, 6);
  });
  test('the shaft and the roof are lit at 50–400 lx on their surfaces; the façades below stay dark', () => {
    // Middle of each shaft face (45 m) and of each roof face, with the face's orientation.
    for (const [u, v, name] of [
      [0, 5.0, 'shaft-north'],
      [0, -5.6, 'shaft-south'],
      [5.25, 0, 'shaft-east'],
      [-5.3, 0, 'shaft-west'],
    ] as const) {
      const e = lux(u, v, 45, name, [Math.sign(u), Math.sign(v), 0]);
      console.log(`[radhuset] ${name} at 45 m: ${e.toFixed(0)} lx`);
      expect(e).toBeGreaterThan(50);
      expect(e).toBeLessThan(400);
    }
    for (const [u, v, name] of [
      [0, 3.4, 'roof-north'],
      [0, -3.4, 'roof-south'],
      [3.4, 0, 'roof-east'],
      [-3.4, 0, 'roof-west'],
    ] as const) {
      const e = lux(u, v, 62, name, roofNormal(Math.sign(u), Math.sign(v)));
      console.log(`[radhuset] ${name} at 62 m: ${e.toFixed(0)} lx`);
      expect(e).toBeGreaterThan(50);
      expect(e).toBeLessThan(400);
    }
    // Gull-Olle receives light from the cornice floods.
    expect(lux(0, 0.8, GULL_OLLE.top - 2)).toBeGreaterThan(20);
    // The north façade beside the tower and the entrance below it: dark (photograph).
    for (const [u, v, h] of [
      [-20, 5.0, 12],
      [20, 5.0, 18],
      [0, 6.1, 8],
    ])
      expect(lux(u, v, h)).toBeLessThan(1);
  });
  test('with Hedvigs kyrka the façade budget is full but not exceeded; one zone holds both', () => {
    const all = [...createHedvig(terrain).floodlights, ...lights];
    expect(all).toHaveLength(FACADE_MAX);
    const z = facadeZone(all, M);
    for (const e of all)
      expect(
        Math.hypot(e.position[0] - z.x, e.position[2] - z.z) + e.rangeM / M,
      ).toBeLessThanOrEqual(z.radius + 1e-9);
    expect(z.radius * M).toBeLessThan(150);
  });
});
