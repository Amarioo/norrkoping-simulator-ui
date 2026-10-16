/**
 * Deterministic procedural city for the 3D scene.
 *
 * The layout mirrors the street grid rendered in Scene.svelte: street strips
 * run along every multiple of BLOCK metres, buildings fill the blocks between
 * them, and every rooftop (including masts and beacons) stays below the 18 m
 * floor of the flight lanes so the simulated drones (18–26 m) never clip the
 * skyline. The generator is pure data — three.js lives in cityView.ts.
 */

export type BuildingKind = 'tower' | 'midrise' | 'lowrise' | 'house' | 'cylinder';
export type RoofKind = 'parapet' | 'cap' | 'pyramid';
export type RoofPropKind = 'ac' | 'tank' | 'crate';

export interface Tier {
  /** Footprint in metres; for cylinders w === d is the diameter. */
  w: number;
  d: number;
  h: number;
  /** Bottom of the tier, metres above the block. */
  y: number;
}

export interface RoofProp {
  kind: RoofPropKind;
  /** Offset from the building centre in world axes (already rotated). */
  x: number;
  z: number;
}

export interface Building {
  id: number;
  x: number;
  z: number;
  /** Quarter turns around the vertical axis: 0 or 1. */
  quarter: 0 | 1;
  kind: BuildingKind;
  tiers: Tier[];
  wall: string;
  /** Fraction of lit windows. */
  lit: number;
  /** Bias towards warm instead of cool window light (0–1). */
  warm: number;
  roughness: number;
  metalness: number;
  emissive: number;
  roof: RoofKind;
  /** Pyramid roof height (kind === 'house'), otherwise 0. */
  roofH: number;
  roofColor: string;
  props: RoofProp[];
  /** Antenna mast height in metres, 0 = none. */
  antenna: number;
}

export interface Tree {
  x: number;
  z: number;
  /** Ground height the trunk stands on (street level or a block plinth). */
  y: number;
  /** Uniform scale factor. */
  s: number;
  tone: number;
}

export interface Lamp {
  x: number;
  z: number;
}

export type PlinthKind = 'pavement' | 'grass' | 'stone';

export interface Plinth {
  x: number;
  z: number;
  kind: PlinthKind;
}

export interface CityModel {
  buildings: Building[];
  trees: Tree[];
  lamps: Lamp[];
  plinths: Plinth[];
}

/** Street strips — and the rendered lane decals — run along these coordinates. */
export const LANES = [-68, -51, -34, -17, 0, 17, 34, 51, 68];
export const BLOCK_CENTERS = [-59.5, -42.5, -25.5, -8.5, 8.5, 25.5, 42.5, 59.5];
/** Usable half-width inside a block once the 3.5 m street strips are carved out. */
export const CORE = 6.75;
export const BLOCK = 17;
export const PLINTH_SIZE = 13.4;
export const PLINTH_TOP = 0.14;
/** Flight lanes occupy 18–26 m; nothing built may reach them. */
export const LANE_FLOOR = 18;
/** Hard ceiling for any built structure, mast and beacon included. */
export const MAX_TIP = 17.8;
/** Hard ceiling for the tallest tier stack (roof slabs add a little more). */
export const MAX_ROOF = 16.2;
/** Radius of the beacon spheres on top of antenna masts. */
export const BEACON_RADIUS = 0.15;
/** Backend hub positions (HUB_NORTH / HUB_SOUTH). */
export const HUBS: [number, number][] = [
  [-52, -40],
  [52, 40],
];
/** Blocks whose centre sits within this radius of a hub become open plazas. */
export const HUB_CLEARANCE = 16;
/** Hub landing pads have radius 7; no structure may stand closer than this. */
export const HUB_PAD = 7.5;
/** Trees keep this distance from hub centres so canopies clear the pads. */
export const HUB_TREE_CLEARANCE = 8.2;

const GLASS_WALLS = ['#2b3d52', '#31475c', '#263a4a', '#38506b'];
const BLOCK_WALLS = ['#41504f', '#4a5553', '#3d4a49', '#525046', '#46524d', '#574b42', '#3f4c55'];
const HOUSE_WALLS = ['#5a4f43', '#525d4d', '#585149', '#4a5651', '#5f554a'];
const SLAB_COLORS = ['#293a40', '#2f4148'];
const HOUSE_ROOFS = ['#4e423b', '#3c4a4e', '#574742', '#43413d'];

const STYLE: Record<BuildingKind, { roughness: number; metalness: number; emissive: number }> = {
  tower: { roughness: 0.5, metalness: 0.3, emissive: 1.8 },
  cylinder: { roughness: 0.45, metalness: 0.35, emissive: 1.9 },
  midrise: { roughness: 0.8, metalness: 0.05, emissive: 1.4 },
  lowrise: { roughness: 0.85, metalness: 0.05, emissive: 1.3 },
  house: { roughness: 0.9, metalness: 0, emissive: 1.1 },
};

type District = 'downtown' | 'midring' | 'outskirt';

/** Small, fast, seedable PRNG — the city is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const span = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function districtAt(x: number, z: number): District {
  const r = Math.hypot(x, z);
  if (r <= 30) return 'downtown';
  return r <= 54 ? 'midring' : 'outskirt';
}

function rotateOffset(quarter: 0 | 1, x: number, z: number): [number, number] {
  return quarter === 0 ? [x, z] : [z, -x];
}

/** Height of the walkable roof surface (top of the slab, cap or ridge). */
export function buildingRoofTop(b: Building): number {
  const top = b.tiers[b.tiers.length - 1];
  const tierTop = top.y + top.h;
  if (b.roof === 'parapet') return tierTop + 0.22;
  if (b.roof === 'cap') return tierTop + 0.2;
  return tierTop + b.roofH;
}

/** Highest point of the building: roof plus mast and beacon. */
export function buildingTip(b: Building): number {
  return buildingRoofTop(b) + b.antenna + (b.antenna > 0 ? BEACON_RADIUS * 2 : 0);
}

/** Half extents of the base footprint in world axes (after rotation). */
export function buildingExtents(b: Building): [number, number] {
  const base = b.tiers[0];
  return b.quarter === 0 ? [base.w / 2, base.d / 2] : [base.d / 2, base.w / 2];
}

function rollKind(district: District, rand: () => number): BuildingKind {
  const roll = rand();
  if (district === 'downtown') {
    if (roll < 0.62) return 'tower';
    return roll < 0.86 ? 'midrise' : 'cylinder';
  }
  if (district === 'midring') {
    if (roll < 0.14) return 'tower';
    return roll < 0.56 ? 'midrise' : roll < 0.92 ? 'lowrise' : 'house';
  }
  if (roll < 0.1) return 'midrise';
  return roll < 0.4 ? 'lowrise' : 'house';
}

interface Lot {
  x: number;
  z: number;
  maxW: number;
  maxD: number;
  rotatable: boolean;
}

function towerTiers(rand: () => number, w: number, d: number, total: number): Tier[] {
  const count = total > 13 && rand() < 0.5 ? 3 : rand() < 0.78 ? 2 : 1;
  const fractions: number[] = [];
  let remaining = 1;
  for (let i = 0; i < count - 1; i++) {
    const f = span(rand, 0.55, 0.68) * remaining;
    fractions.push(f);
    remaining -= f;
  }
  fractions.push(remaining);
  const tiers: Tier[] = [];
  let y = 0;
  let tw = w;
  let td = d;
  for (const f of fractions) {
    const h = total * f;
    tiers.push({ w: tw, d: td, h, y });
    y += h;
    tw = Math.max(tw - span(rand, 1.5, 2.9), 4.4);
    td = Math.max(td - span(rand, 1.3, 2.5), 4.4);
  }
  return tiers;
}

function roofProps(
  rand: () => number,
  top: Tier,
  quarter: 0 | 1,
): RoofProp[] {
  if (top.w < 6.5 || top.d < 5) return [];
  const count = Math.floor(rand() * 2.4); // 0–2
  const props: RoofProp[] = [];
  for (let i = 0; i < count; i++) {
    const lx = span(rand, -(top.w / 2 - 1.3), top.w / 2 - 1.3);
    const lz = span(rand, -(top.d / 2 - 1.3), top.d / 2 - 1.3);
    const roll = rand();
    const kind: RoofPropKind = roll < 0.45 ? 'ac' : roll < 0.75 ? 'tank' : 'crate';
    const [x, z] = rotateOffset(quarter, lx, lz);
    props.push({ kind, x, z });
  }
  return props;
}

function mastHeight(rand: () => number, roofTop: number): number {
  if (roofTop > 15 || rand() >= 0.5) return 0;
  return clamp(span(rand, 1.1, 2.2), 0.8, MAX_TIP - BEACON_RADIUS * 2 - roofTop);
}

function makeBuilding(
  id: number,
  lot: Lot,
  district: District,
  rand: () => number,
  forcedKind?: BuildingKind,
): Building {
  const kind = forcedKind ?? rollKind(district, rand);
  const quarter: 0 | 1 = lot.rotatable && rand() < 0.5 ? 1 : 0;
  const style = STYLE[kind];
  const wall =
    kind === 'tower' || kind === 'cylinder'
      ? pick(rand, GLASS_WALLS)
      : kind === 'house'
        ? pick(rand, HOUSE_WALLS)
        : pick(rand, BLOCK_WALLS);
  const lit =
    kind === 'tower'
      ? span(rand, 0.38, 0.55)
      : kind === 'cylinder'
        ? span(rand, 0.45, 0.6)
        : kind === 'midrise'
          ? span(rand, 0.3, 0.45)
          : kind === 'lowrise'
            ? span(rand, 0.24, 0.36)
            : span(rand, 0.18, 0.3);
  const warm =
    kind === 'tower' || kind === 'cylinder'
      ? span(rand, 0.2, 0.45)
      : kind === 'house'
        ? span(rand, 0.65, 0.85)
        : span(rand, 0.45, 0.7);

  let tiers: Tier[];
  let roof: RoofKind;
  let roofH = 0;
  let roofColor = pick(rand, SLAB_COLORS);
  let props: RoofProp[] = [];
  let antenna = 0;

  if (kind === 'tower') {
    const w = clamp(span(rand, 9.5, 12.8), 9.5, lot.maxW);
    const d = clamp(span(rand, 8, 12.6), 8, lot.maxD);
    const total = span(rand, 9.5, MAX_ROOF);
    tiers = towerTiers(rand, w, d, total);
    roof = 'parapet';
  } else if (kind === 'cylinder') {
    const diameter = 2 * span(rand, 3.5, 4.5);
    const h = span(rand, 9, 15.6);
    tiers = [{ w: diameter, d: diameter, h, y: 0 }];
    roof = 'cap';
  } else if (kind === 'midrise') {
    const w = clamp(span(rand, 7.5, 12.8), 7.5, lot.maxW);
    const d = clamp(span(rand, 6, 10.5), 6, lot.maxD);
    const h = district === 'downtown' ? span(rand, 7.5, 11.5) : span(rand, 6, 10.5);
    tiers = [{ w, d, h, y: 0 }];
    roof = 'parapet';
  } else if (kind === 'lowrise') {
    const w = clamp(span(rand, 6, 10.5), 6, lot.maxW);
    const d = clamp(span(rand, 5, 8.5), 5, lot.maxD);
    tiers = [{ w, d, h: span(rand, 4.2, 7.2), y: 0 }];
    roof = 'parapet';
  } else {
    const w = clamp(span(rand, 5, 7.4), 5, lot.maxW);
    const d = clamp(span(rand, 4.6, 6.8), 4.6, lot.maxD);
    roofH = span(rand, 1.1, 2);
    roofColor = pick(rand, HOUSE_ROOFS);
    tiers = [{ w, d, h: span(rand, 2.4, 4.4), y: 0 }];
    roof = 'pyramid';
  }

  const top = tiers[tiers.length - 1];
  if (roof === 'parapet') {
    props = roofProps(rand, top, quarter);
    antenna = mastHeight(rand, top.y + top.h + 0.22);
  } else if (roof === 'cap') {
    antenna = mastHeight(rand, top.y + top.h + 0.2);
  }

  return {
    id,
    x: lot.x,
    z: lot.z,
    quarter,
    kind,
    tiers,
    wall,
    lit,
    warm,
    roughness: style.roughness,
    metalness: style.metalness,
    emissive: style.emissive,
    roof,
    roofH,
    roofColor,
    props,
    antenna,
  };
}

function plantBlockTrees(
  x: number,
  z: number,
  count: number,
  rand: () => number,
  into: Tree[],
): void {
  for (let i = 0; i < count; i++) {
    const tx = x + span(rand, -5.2, 5.2);
    const tz = z + span(rand, -5.2, 5.2);
    if (HUBS.some(([hx, hz]) => Math.hypot(tx - hx, tz - hz) < HUB_TREE_CLEARANCE)) continue;
    into.push({ x: tx, z: tz, y: PLINTH_TOP, s: span(rand, 0.75, 1.35), tone: Math.floor(rand() * 4) });
  }
}

/**
 * Generates the procedural city: one block per cell of the street grid, each
 * carrying a building, a park or a hub plaza, plus street trees, lamps and the
 * tree belt around the rim of the ground plane.
 */
export function generateCity(seed = 0x51ce): CityModel {
  const rand = mulberry32(seed);
  const buildings: Building[] = [];
  const trees: Tree[] = [];
  const lamps: Lamp[] = [];
  const plinths: Plinth[] = [];
  let id = 0;

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const district = districtAt(bx, bz);
      const hubDist = Math.min(...HUBS.map(([hx, hz]) => Math.hypot(bx - hx, bz - hz)));

      if (hubDist < HUB_CLEARANCE) {
        // Open plaza around a delivery hub: stone paving and a few trees.
        plinths.push({ x: bx, z: bz, kind: 'stone' });
        plantBlockTrees(bx, bz, 3 + Math.floor(rand() * 3), rand, trees);
        continue;
      }

      const parkChance = district === 'downtown' ? 0.05 : district === 'midring' ? 0.12 : 0.16;
      if (rand() < parkChance) {
        plinths.push({ x: bx, z: bz, kind: 'grass' });
        plantBlockTrees(bx, bz, 5 + Math.floor(rand() * 4), rand, trees);
        continue;
      }

      plinths.push({ x: bx, z: bz, kind: 'pavement' });
      for (const sx of [-6, 6]) {
        for (const sz of [-6, 6]) {
          if (rand() < 0.15) {
            const tx = bx + sx;
            const tz = bz + sz;
            if (HUBS.some(([hx, hz]) => Math.hypot(tx - hx, tz - hz) < HUB_TREE_CLEARANCE)) continue;
            trees.push({ x: tx, z: tz, y: PLINTH_TOP, s: span(rand, 0.7, 1.1), tone: Math.floor(rand() * 4) });
          }
        }
      }

      // Some mid/outskirt blocks split into two smaller lots instead of one
      // dominant building, which keeps the street wall from feeling uniform.
      const split = district !== 'downtown' && rand() < 0.28;
      if (split) {
        const alongX = rand() < 0.5;
        for (const side of [-1, 1]) {
          const lot: Lot = alongX
            ? { x: bx + side * 3.15, z: bz, maxW: 5.8, maxD: 12.8, rotatable: false }
            : { x: bx, z: bz + side * 3.15, maxW: 12.8, maxD: 5.8, rotatable: false };
          const kind: BuildingKind = rand() < 0.55 ? 'house' : 'lowrise';
          buildings.push(makeBuilding(id, lot, district, rand, kind));
          id++;
        }
      } else {
        buildings.push(
          makeBuilding(id, { x: bx, z: bz, maxW: 12.8, maxD: 12.8, rotatable: true }, district, rand),
        );
        id++;
      }
    }
  }

  // Tree belt around the rim of the ground plane, outside the outermost street.
  for (let i = 0; i < 22; i++) {
    const along = span(rand, -74, 74);
    const depth = span(rand, 70.5, 77.5);
    const side = Math.floor(rand() * 4);
    const [x, z] =
      side === 0 ? [along, depth] : side === 1 ? [along, -depth] : side === 2 ? [depth, along] : [-depth, along];
    trees.push({ x, z, y: 0, s: span(rand, 0.8, 1.4), tone: Math.floor(rand() * 4) });
  }

  // Street lamps on alternating street intersections.
  for (let i = 0; i < LANES.length; i++) {
    for (let j = 0; j < LANES.length; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = LANES[i] + 0.8;
      const z = LANES[j] + 0.8;
      if (HUBS.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 8.5)) continue;
      lamps.push({ x, z });
    }
  }

  return { buildings, trees, lamps, plinths };
}