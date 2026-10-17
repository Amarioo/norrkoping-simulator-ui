import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { PlaceBuilder } from './placeBuilder';
import { treeProfile } from './treeProfile';
import terrain from './data/terrain-levels.json';
import network from './data/transport-network.json';
import { cityMap, pointInRing } from './mapModel';
import { trenchDepth, trenchPoint } from './ingelstaTerrain';
import ingelsta from './data/ingelsta-bridge.json';
import bridges from './data/city-bridges.json';

describe('city structures', () => {
  it('merges custom roofs and boxes sharing a material without dropping the scene', () => {
    const b = new PlaceBuilder(),
      g = b.local([0, 0]);
    b.box(g, 0, 0.1, 0, 1, 0.2, 1, '#354047');
    b.roof(g, 0, 0.2, 0, 1, 1, 0.2, '#354047');
    const result = b.finish();
    expect(result.group.children).toHaveLength(1);
    const geo = (result.group.children[0] as Mesh).geometry;
    expect(geo.getAttribute('position').count).toBe(54);
    expect(geo.getAttribute('uv').count).toBe(54);
    result.dispose();
  });
  it('leaves pedestrian-height sightlines below promenade crowns', () => {
    for (const name of ['Norra Promenaden', 'Södra Promenaden']) {
      const r = cityMap.roads.find((r) => r.name === name)!;
      for (let i = 0; i < 30; i++) {
        const p = treeProfile(r.a, i);
        expect(p.avenue).toBe(true);
        expect(p.radius * 2 * 25).toBeLessThan(6);
        expect((p.crownY - 0.012 - p.crownHeight * 0.78 - 0.071) * 25).toBeGreaterThan(3);
      }
    }
  });
  it('anchors named bridge decks to the mapped crossings above water', () => {
    for (const name of ['Bergsbron', 'Laxholmsbron', 'Saltängsbron', 'Hamnbron', 'Spången']) {
      const b = bridges.bridges.find((b) => b.name === name)!;
      expect(b).toBeDefined();
      expect(b.length).toBeGreaterThan(b.width);
      expect(b.deckY - 0.035).toBeGreaterThan(terrain.water);
      const near = cityMap.roads.filter(
        (r) => r.bridge && Math.hypot(r.a[0] - b.center[0], r.a[1] - b.center[1]) < b.length,
      );
      expect(near.length).toBeGreaterThan(0);
    }
  });
  it('keeps river crossings and both approach endpoints level, including simulated traffic', () => {
    const ways = new Set([
      26154805, 47460598, 501428826, 27690828, 286445684, 501428828, 39446066, 92416248, 26154766,
      8237053, 26154679,
    ]);
    const crossings = cityMap.roads.filter((r) => ways.has(r.way!));
    expect(crossings.length).toBeGreaterThan(0);
    for (const r of crossings) {
      expect(r.yA).toBeCloseTo(terrain.road, 6);
      expect(r.yB).toBeCloseTo(terrain.road, 6);
      for (const p of [r.a, r.b]) {
        const approaches = cityMap.roads.filter(
          (a) => a.kind === r.kind && (a.a.join() === p.join() || a.b.join() === p.join()),
        );
        for (const a of approaches)
          expect(a.a.join() === p.join() ? a.yA : a.yB).toBeCloseTo(terrain.road, 6);
      }
    }
    for (const e of network.edges.filter((e) => ways.has(e.way))) {
      expect(network.nodes[e.from].y).toBeCloseTo(terrain.road, 6);
      expect(network.nodes[e.to].y).toBeCloseTo(terrain.road, 6);
    }
    expect(cityMap.roads.some((r) => r.kind === 'rail' && r.yA > 0.3)).toBe(true);
    expect(network.transitRoutes).toEqual(cityMap.transitRoutes);
    const salt = network.transitRoutes
      .filter((r) => r.kind === 'tram')
      .flatMap((r) => r.points)
      .filter((p) => p[0] > -6 && p[0] < -3 && p[2] > -18.5 && p[2] < -15.5);
    expect(salt.length).toBeGreaterThan(0);
    for (const p of salt) expect(p[1]).toBeCloseTo(terrain.road + 0.018, 6);
  });
  it('cuts the river out of ground and land coverings instead of hiding lowered water', () => {
    const contains = (p: [number, number], rings: [number, number][][]) =>
      pointInRing(p, rings[0]) && !rings.slice(1).some((r) => pointInRing(p, r));
    for (const b of bridges.bridges.filter((b) =>
      ['Spången', 'Saltängsbron', 'Hamnbron', 'Bergsbron'].includes(b.name),
    )) {
      const p = b.center as [number, number];
      expect(cityMap.areas.some((a) => a.kind === 'water' && contains(p, a.rings))).toBe(true);
      expect(cityMap.ground.some((a) => contains(p, a.rings))).toBe(false);
      expect(cityMap.areas.some((a) => a.kind !== 'water' && contains(p, a.rings))).toBe(false);
    }
    // Centralstation remains dry land after carving holes in the regional ground.
    expect(cityMap.ground.some((a) => contains([-8, -32], a.rings))).toBe(true);
  });
  it('keeps Ingelstagatan level and cuts the railway below the bridge', () => {
    for (const path of cityMap.roads.filter((r) => [93304103, 94010853].includes(r.way!))) {
      expect(path.yA).toBeCloseTo(ingelsta.deck, 6);
      expect(path.yB).toBeCloseTo(ingelsta.deck, 6);
    }
    const bridge = cityMap.roads.find((r) => r.way === 536359154)!;
    expect(bridge.yA).toBeCloseTo(ingelsta.deck, 6);
    expect(bridge.yB).toBeCloseTo(ingelsta.deck, 6);
    const rails = cityMap.roads.filter((r) => r.kind === 'rail' && trenchDepth(r.a) > 0.3);
    expect(rails.length).toBeGreaterThan(0);
    for (const r of rails) expect(ingelsta.deck - 0.05 - r.yA).toBeGreaterThan(0.25);
    expect(trenchDepth(trenchPoint(7, 0))).toBe(0);
    expect(trenchDepth(trenchPoint(0, 2))).toBe(0);
    const p = trenchPoint(0, 0) as [number, number];
    expect(
      cityMap.ground.some(
        (a) => pointInRing(p, a.rings[0]) && !a.rings.slice(1).some((r) => pointInRing(p, r)),
      ),
    ).toBe(false);
  });
});
