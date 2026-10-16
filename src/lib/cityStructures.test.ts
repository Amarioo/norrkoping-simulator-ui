import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { PlaceBuilder } from './placeBuilder';
import { treeProfile } from './treeProfile';
import { cityMap } from './mapModel';
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
      expect(b.deckY - 0.035).toBeGreaterThan(0.043);
      const near = cityMap.roads.filter(
        (r) => r.bridge && Math.hypot(r.a[0] - b.center[0], r.a[1] - b.center[1]) < b.length,
      );
      expect(near.length).toBeGreaterThan(0);
    }
  });
});
