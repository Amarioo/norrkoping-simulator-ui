import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import data from './data/city-places.json';
import training from './data/training-pitch.json';
import { cityMap, CITY_VIEWS } from './mapModel';

describe('mapped landmark additions', () => {
  it('keeps the reference training pitch separate from both full-size football pitches', () => {
    const { width: w, length: l, heading: a, center: c } = training;
    const ring = [
      [-w / 2, -l / 2],
      [w / 2, -l / 2],
      [w / 2, l / 2],
      [-w / 2, l / 2],
      [-w / 2, -l / 2],
    ].map(
      ([x, z]) =>
        [c[0] + x * Math.cos(a) + z * Math.sin(a), c[1] - x * Math.sin(a) + z * Math.cos(a)] as [
          number,
          number,
        ],
    );
    for (const pitch of data.pitches.filter((p) => p.sport === 'soccer'))
      expect(polygonClipping.intersection([ring], [pitch.ring as [number, number][]])).toEqual([]);
  });
  it('retains mapped platform outlines for Ljura and the central railway platforms', () => {
    const ljura = data.platforms.filter((p) => p.name === 'Ljura centrum');
    expect(ljura.length).toBeGreaterThanOrEqual(2);
    expect(
      ljura.every((p) => p.mapped && p.ring.length >= 4 && p.width > 0.05 && p.length > 1),
    ).toBe(true);
    expect(data.platforms.filter((p) => p.kind === 'rail').length).toBeGreaterThan(3);
    for (const p of data.platforms)
      expect([...p.center, p.width, p.length, p.heading].every(Number.isFinite)).toBe(true);
  });
  it('anchors custom buildings and camera views within the bundled map', () => {
    for (const b of data.buildings)
      expect(cityMap.buildings.some((p) => p.id === 'way/' + b.id)).toBe(true);
    for (const key of ['station', 'terminal', 'bollspelaren', 'ljuraStop', 'policeEmblem']) {
      const [x, y, z] = CITY_VIEWS[key].target;
      expect(Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThan(cityMap.meta.bounds[0]);
      expect(x).toBeLessThan(cityMap.meta.bounds[2]);
      expect(z).toBeGreaterThan(cityMap.meta.bounds[1]);
      expect(z).toBeLessThan(cityMap.meta.bounds[3]);
    }
  });
});
