import { describe, expect, it } from 'vitest';
import { needsGenericBridge, hasDetailedBridge, genericBridgeSegments } from './bridgeOwnership';
import { cityMap, type MapRoad } from './mapModel';
describe('bridge ownership with absolute terrain elevations', () => {
  it('does not create viaducts on ordinary streets at high RH2000 elevations', () => {
    const street = cityMap.roads.find((r) => r.kind === 'road' && !r.bridge)!;
    expect(needsGenericBridge({ ...street, yA: 100, yB: 101 })).toBe(false);
  });
  it('excludes detailed crossings from generic support generation', () => {
    const crossing = { ...cityMap.roads[0], kind: 'road', bridge: true, way: 536359154 } as MapRoad;
    expect(hasDetailedBridge(crossing)).toBe(true);
    expect(needsGenericBridge(crossing)).toBe(false);
  });
  it('requires mapped bridge ownership independently of altitude', () => {
    const crossing = {
      ...cityMap.roads[0],
      a: [200, 100],
      b: [201, 100],
      kind: 'road',
      bridge: true,
      way: -1,
      yA: 0.1,
      yB: 0.1,
    } as MapRoad;
    expect(needsGenericBridge(crossing)).toBe(true);
    expect(genericBridgeSegments.every((r) => r.bridge && !hasDetailedBridge(r))).toBe(true);
    expect(genericBridgeSegments.length).toBeLessThan(1000);
  });
});

describe('pedestrian bridge network', () => {
  it('provides structure for the campus crossing and riverfront paths', () => {
    for (const way of [182081653, 182081883, 1212234769, 239470502]) {
      const segments = cityMap.roads.filter(r => r.way === way);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every(needsGenericBridge)).toBe(true);
    }
  });
  it('keeps connected bridge and approach endpoints at one height despite old layer offsets', () => {
    // SWEREF 99 TM scene frame (legacy [-25.037, .89], [-25.107, 2.312], [-23.102, .131]).
    for (const point of [[-25.07, 1.329], [-25.115, 2.755], [-23.144, .534]]) {
      const heights = cityMap.roads.filter(r => r.kind === 'path').flatMap(r =>
        [[r.a, r.yA], [r.b, r.yB]].filter(([p]) => (p as number[])[0] === point[0] && (p as number[])[1] === point[1]).map(([,y]) => y as number));
      expect(heights.length).toBeGreaterThan(1);
      expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1e-6);
    }
  });
});
