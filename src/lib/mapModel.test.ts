import { describe, it, expect } from 'vitest';
import { cityMap, project, stadiumCenter, LANDMARKS } from './mapModel';
import { createParkTrees, insidePolygon, distanceToSegment } from './mapVegetation';

describe('mapped Norrköping', () => {
  it('includes both runways inside the extended region and removes Kungsgatan planting', () => {
    expect(cityMap.airports.map((a) => a.id)).toEqual(['ESSP', 'F13']);
    for (const a of cityMap.airports)
      for (const p of [a.start, a.end])
        for (let i = 0; i < 2; i++) {
          expect(p[i]).toBeGreaterThan(cityMap.meta.bounds[i]);
          expect(p[i]).toBeLessThan(cityMap.meta.bounds[i + 2]);
        }
    const streets = cityMap.roads.filter(
      (r) => r.name === 'Kungsgatan' && r.a[1] < 2 && r.a[1] > -34,
    );
    expect(streets.length).toBeGreaterThan(0);
    const trees = [...cityMap.trees, ...createParkTrees()];
    expect(trees.some((p) => streets.some((r) => distanceToSegment(p, r.a, r.b) < 0.599))).toBe(
      false,
    );
    expect(cityMap.signals.length).toBeGreaterThan(100);
  });
  it('continues the water through the inner harbour while preserving coastline islands', () => {
    const water = cityMap.areas.filter((a) => a.kind === 'water');
    expect(water.some((a) => insidePolygon(project(58.5955, 16.205), a))).toBe(true);
    expect(water.some((a) => insidePolygon([66.135, -58.329], a))).toBe(false);
  });
  it('places Parken southwest of the centre and Ljura southeast at a uniform scale', () => {
    // The scene origin is SWEREF 99 TM E 569030 N 6494989 (geodetic 58.589808871 N, 16.187465218 E).
    const origin = project(58.58980887139201, 16.187465218413905);
    expect(origin[0]).toBeCloseTo(0, 6);
    expect(origin[1]).toBeCloseTo(0, 6);
    expect(stadiumCenter[0]).toBeCloseTo(-33.29, 1);
    expect(stadiumCenter[1]).toBeCloseTo(25.34, 1);
    const park = LANDMARKS.find((p) => p.name === 'Ljuraparken')!;
    expect(park.position[0]).toBeCloseTo(35.7, 1);
    expect(park.position[1]).toBeCloseTo(39.752, 2);
    expect(cityMap.meta.metresPerUnit).toBe(25);
  });
  it('retains closed footprints, courtyard holes and finite heights within the map', () => {
    expect(cityMap.buildings.length).toBeGreaterThan(3000);
    expect(cityMap.buildings.some((b) => b.rings.length > 1)).toBe(true);
    expect(cityMap.areas.some((a) => a.kind === 'water' && a.rings.length > 1)).toBe(true);
    for (const p of [...cityMap.buildings, ...cityMap.areas])
      for (const ring of p.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(
          ring.every((p) =>
            p.every(
              (v, i) =>
                Number.isFinite(v) &&
                v >= cityMap.meta.bounds[i] - 0.002 &&
                v <= cityMap.meta.bounds[i + 2] + 0.002,
            ),
          ),
        ).toBe(true);
      }
    for (const b of cityMap.buildings) {
      expect(b.height).toBeGreaterThan(b.minHeight);
      expect(b.height).toBeLessThan(18);
    }
  });
  it('adds planting inside Ljuraparken without placing it on paths, water or buildings', () => {
    const park = cityMap.areas.find((a) => a.name === 'Ljuraparken')!;
    const trees = createParkTrees().filter((p) => insidePolygon(p, park));
    expect(trees.length).toBeGreaterThan(8);
    for (const p of trees) {
      expect(cityMap.buildings.some((b) => insidePolygon(p, b))).toBe(false);
      expect(
        cityMap.areas.some(
          (a) => (a.kind === 'water' || a.kind === 'pitch') && insidePolygon(p, a),
        ),
      ).toBe(false);
      expect(cityMap.roads.some((r) => distanceToSegment(p, r.a, r.b) < r.width / 2 + 0.219)).toBe(
        false,
      );
    }
  });
});
