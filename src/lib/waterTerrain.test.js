import { describe, it, expect } from 'vitest';
import pc from 'polygon-clipping';
import { waterFootprints, carveTerrain, crossesWater } from '../../scripts/water-terrain.mjs';

const square = (x, z, r) => [
  [
    [x - r, z - r],
    [x + r, z - r],
    [x + r, z + r],
    [x - r, z + r],
    [x - r, z - r],
  ],
];
describe('river terrain import', () => {
  it('joins stream banks through a bend without leaving dry triangular notches', () => {
    const raw = {
      elements: [
        {
          type: 'way',
          tags: { waterway: 'stream', width: '25' },
          geometry: [
            { lon: -2, lat: 0 },
            { lon: 0, lat: 0 },
            { lon: 0, lat: 2 },
          ],
        },
      ],
    };
    const water = waterFootprints({ features: [] }, raw, (p) => p, square(0, 0, 5));
    expect(pc.intersection(water, square(0.15, -0.15, 0.01)).length).toBeGreaterThan(0);
    expect(
      crossesWater(
        [
          [-1, -1],
          [-1, 1],
        ],
        water,
      ),
    ).toBe(true);
    expect(
      crossesWater(
        [
          [2, -1],
          [2, 1],
        ],
        water,
      ),
    ).toBe(false);
  });
  it('preserves islands while cutting water out of ground and overlapping grass', () => {
    const water = [square(0, 0, 3)[0], square(0, 0, 1)[0]];
    const { ground, surfaces } = carveTerrain(
      [{ id: 'park', kind: 'grass', rings: square(0, 0, 4) }],
      [water],
      square(0, 0, 5),
    );
    expect(
      pc.intersection(
        ground.map((p) => p.rings),
        [water],
      ),
    ).toHaveLength(0);
    expect(
      pc.intersection(
        surfaces.filter((p) => p.kind === 'grass').map((p) => p.rings),
        [water],
      ),
    ).toHaveLength(0);
    expect(
      pc.intersection(
        ground.map((p) => p.rings),
        square(0, 0, 0.5),
      ).length,
    ).toBeGreaterThan(0);
  });
});
