import { describe, expect, it } from 'vitest';
import {
  BLOCK_CENTERS,
  buildingExtents,
  buildingTip,
  CORE,
  generateCity,
  HUBS,
  HUB_PAD,
  HUB_TREE_CLEARANCE,
  LANE_FLOOR,
  LANES,
  PLINTH_TOP,
} from './city';

const model = generateCity();

/** Nearest street-grid block centre for any coordinate. */
function nearestBlock(v: number): number {
  return BLOCK_CENTERS.reduce((best, c) => (Math.abs(v - c) < Math.abs(v - best) ? c : best));
}

describe('procedural city', () => {
  it('is deterministic', () => {
    expect(generateCity()).toEqual(model);
  });

  it('keeps the 18 m flight lanes clear of rooftops, masts and beacons', () => {
    for (const b of model.buildings) expect(buildingTip(b)).toBeLessThan(LANE_FLOOR);
  });

  it('surrounds both hub pads with open ground', () => {
    for (const b of model.buildings) {
      const [ex, ez] = buildingExtents(b);
      for (const [hx, hz] of HUBS) {
        const dx = Math.max(Math.abs(b.x - hx) - ex, 0);
        const dz = Math.max(Math.abs(b.z - hz) - ez, 0);
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(HUB_PAD);
      }
    }
  });

  it('keeps every footprint inside its block and off the street strips', () => {
    for (const b of model.buildings) {
      const [ex, ez] = buildingExtents(b);
      const bx = nearestBlock(b.x);
      const bz = nearestBlock(b.z);
      expect(Math.abs(b.x - bx) + ex).toBeLessThanOrEqual(CORE + 1e-9);
      expect(Math.abs(b.z - bz) + ez).toBeLessThanOrEqual(CORE + 1e-9);
    }
  });

  it('stacks tiers bottom-up without gaps or overhangs', () => {
    for (const b of model.buildings) {
      let y = 0;
      let w = b.tiers[0].w;
      let d = b.tiers[0].d;
      for (const tier of b.tiers) {
        expect(tier.y).toBeCloseTo(y, 9);
        expect(tier.w).toBeLessThanOrEqual(w + 1e-9);
        expect(tier.d).toBeLessThanOrEqual(d + 1e-9);
        y = tier.y + tier.h;
        w = tier.w;
        d = tier.d;
      }
    }
  });

  it('plants trees and lamps on valid ground away from hubs', () => {
    for (const t of model.trees) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(79);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(79);
      expect(t.y === 0 || t.y === PLINTH_TOP).toBe(true);
      for (const [hx, hz] of HUBS)
        expect(Math.hypot(t.x - hx, t.z - hz)).toBeGreaterThanOrEqual(HUB_TREE_CLEARANCE);
    }
    for (const l of model.lamps) {
      const onLaneX = LANES.some((lane) => Math.abs(l.x - 0.8 - lane) < 0.01);
      const onLaneZ = LANES.some((lane) => Math.abs(l.z - 0.8 - lane) < 0.01);
      expect(onLaneX && onLaneZ).toBe(true);
      for (const [hx, hz] of HUBS) expect(Math.hypot(l.x - hx, l.z - hz)).toBeGreaterThanOrEqual(8.5);
    }
  });

  it('gives the skyline size and character', () => {
    expect(model.buildings.length).toBeGreaterThan(35);
    const kinds = new Set(model.buildings.map((b) => b.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    const heights = new Set(model.buildings.map((b) => b.tiers[0].h.toFixed(1)));
    expect(heights.size).toBeGreaterThanOrEqual(12);
    expect(model.trees.length).toBeGreaterThan(30);
    expect(model.lamps.length).toBeGreaterThan(20);
    expect(model.plinths.filter((p) => p.kind === 'grass').length).toBeGreaterThan(3);
    expect(model.plinths.filter((p) => p.kind === 'stone').length).toBeGreaterThan(3);
    expect(model.buildings.filter((b) => b.antenna > 0).length).toBeGreaterThan(2);
  });
});