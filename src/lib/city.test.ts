import { describe, expect, it } from 'vitest';
import {
  buildingTip,
  generateCity,
  HUBS,
  HUB_PAD,
  HUB_TREE_CLEARANCE,
  LANE_FLOOR,
  PLINTH_SIZE,
  PLINTH_TOP,
} from './city';
import { circleRectOverlap, clearOfWater, waterRect } from './cityGeometry';
import { buildingExtents } from './city';

const model = generateCity();

describe('the Norrköping miniature', () => {
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

  it('keeps every building out of Motala ström and its rapids', () => {
    for (const w of model.water) {
      const rect = waterRect(w);
      for (const b of model.buildings) {
        expect(clearOfWater(b, rect), `${b.name ?? 'building ' + b.id} at (${b.x}, ${b.z}) vs water at (${w.x}, ${w.z})`).toBe(true);
      }
    }
  });

  it('keeps the Kaktusplanteringen cacti inside Carl Johans park and out of the water', () => {
    const park = model.plinths.find((p) => p.kind === 'grass' && Math.abs(p.x - -9.5) < 0.01);
    expect(park).toBeDefined();
    const half = ((park?.size ?? 1) * PLINTH_SIZE) / 2;
    expect(model.cacti.length).toBeGreaterThanOrEqual(8);
    for (const c of model.cacti) {
      expect(Math.abs(c.x - (park?.x ?? 0))).toBeLessThanOrEqual(half - 0.15);
      expect(Math.abs(c.z - (park?.z ?? 0))).toBeLessThanOrEqual(half - 0.15);
      for (const w of model.water) {
        expect(circleRectOverlap(c.x, c.z, 0.35 * c.s, waterRect(w)), `cactus at (${c.x}, ${c.z}) vs water at (${w.x}, ${w.z})`).toBe(false);
      }
    }
  });

  it('names the real landmarks', () => {
    const names = new Set(model.buildings.flatMap((b) => (b.name ? [b.name] : [])));
    for (const expected of [
      'Sankt Olai kyrka',
      'Norrköpings rådhus',
      'Stora hotellet',
      'Holmentornet',
      'Holmens skorsten',
      'Strykjärnet',
      'Strykbrädan',
      'Tryckeriet',
      'Visualiseringscenter C',
      'Louis De Geer-hallen',
      'Drags kraftstation',
      'Norrköpings centralstation',
      'Hamnens silo',
      'Holmen Paper',
      'Vrinnevisjukhuset',
      'Sankt Johannes kyrka',
      'Himmelstalund',
      'Nya Parken',
    ]) {
      expect(names.has(expected)).toBe(true);
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
      expect(Math.abs(l.x)).toBeLessThanOrEqual(79);
      expect(Math.abs(l.z)).toBeLessThanOrEqual(79);
      for (const [hx, hz] of HUBS) expect(Math.hypot(l.x - hx, l.z - hz)).toBeGreaterThanOrEqual(8.5);
    }
  });

  it('gives the city size and Norrköping character', () => {
    expect(model.buildings.length).toBeGreaterThanOrEqual(55);
    const kinds = new Set(model.buildings.map((b) => b.kind));
    expect(kinds.has('iron')).toBe(true);
    expect(model.buildings.filter((b) => b.kind === 'cylinder').length).toBeGreaterThanOrEqual(6);
    const roofs = new Set(model.buildings.map((b) => b.roof));
    expect(roofs.has('spire')).toBe(true);
    expect(roofs.has('dome')).toBe(true);
    expect(roofs.has('pyramid')).toBe(true);
    expect(model.trees.length).toBeGreaterThan(40);
    expect(model.lamps.length).toBeGreaterThan(20);
    expect(model.cacti.length).toBeGreaterThanOrEqual(8);
    expect(model.water.length).toBeGreaterThan(30);
    expect(model.water.filter((w) => w.rapids).length).toBeGreaterThanOrEqual(4);
    expect(model.streets.filter((s) => s.kind === 'tram').length).toBeGreaterThanOrEqual(6);
    expect(model.bridges.length).toBeGreaterThanOrEqual(5);
    expect(model.plinths.filter((p) => p.kind === 'grass').length).toBeGreaterThanOrEqual(4);
    expect(model.plinths.filter((p) => p.kind === 'stone').length).toBeGreaterThanOrEqual(4);
    expect(model.buildings.filter((b) => b.antenna > 0).length).toBeGreaterThanOrEqual(3);
  });
});