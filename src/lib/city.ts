/**
 * The scene city: a hand-built miniature of central Norrköping, Sweden.
 *
 * The layout mirrors the real city at 1:15 scale — scene x runs east, z runs
 * south, and the origin sits on Drottninggatan (WGS84 58.58981 N, 16.18747 E).
 * Motala ström falls through the old Holmen mill island and Laxholmen before
 * squeezing past Gamlebro; Gamla stan keeps its grid between the river arms,
 * the promenades ring the core, and the harbour meets Bråviken in the
 * north-east. Every rooftop stays below the 18 m floor of the flight lanes so
 * the simulated drones (18–26 m) never clip the skyline. The layout data is
 * pure and hand-authored; three.js resources live in cityView.ts.
 */

import { buildNorrkoping } from './norrkoping';

export type BuildingKind = 'tower' | 'midrise' | 'lowrise' | 'house' | 'cylinder' | 'iron';
export type RoofKind = 'parapet' | 'cap' | 'pyramid' | 'spire' | 'dome';
export type RoofPropKind = 'ac' | 'tank' | 'crate';

export interface Tier {
  /** Footprint in metres; for cylinders and irons w === d is the diameter. */
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
  /** Pyramid/spire/dome height, otherwise 0. */
  roofH: number;
  roofColor: string;
  props: RoofProp[];
  /** Antenna mast height in metres, 0 = none. */
  antenna: number;
  /** Real-world identity for landmarks ("Strykjärnet"); filler blocks are unnamed. */
  name?: string;
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
  /** Uniform scale of the 13.4 m plinth base, default 1. */
  size?: number;
}

/** A flat strip on the ground: street, walking avenue or tram track. */
export interface Strip {
  x: number;
  z: number;
  len: number;
  /** In-plane rotation about Y, radians. */
  angle: number;
  width: number;
  kind: 'street' | 'walk' | 'tram';
}

/** One segment of Motala ström; rapids render paler. */
export interface WaterSegment {
  x: number;
  z: number;
  len: number;
  angle: number;
  width: number;
  rapids: boolean;
}

/** A small bridge deck crossing the ström. */
export interface Bridge {
  x: number;
  z: number;
  len: number;
  angle: number;
  width: number;
}

/** A cactus of the Kaktusplanteringen beds in Carl Johans park. */
export interface Cactus {
  x: number;
  z: number;
  /** Uniform scale factor. */
  s: number;
}

export interface CityModel {
  buildings: Building[];
  trees: Tree[];
  lamps: Lamp[];
  plinths: Plinth[];
  water: WaterSegment[];
  streets: Strip[];
  bridges: Bridge[];
  cacti: Cactus[];
}

/** Flight lanes occupy 18–26 m; nothing built may reach them. */
export const LANE_FLOOR = 18;
/** Radius of the beacon spheres on top of antenna masts. */
export const BEACON_RADIUS = 0.15;
/** Block plinth base size; individual plinths scale via Plinth.size. */
export const PLINTH_SIZE = 13.4;
export const PLINTH_TOP = 0.14;
/** Backend hub positions (HUB_HAMNEN / HUB_VRINNEVI). */
export const HUBS: [number, number][] = [
  [59.139, -57.2],
  [-16.94, 62.445],
];
/** Hub landing pads have radius 7; no structure may stand closer than this. */
export const HUB_PAD = 7.5;
/** Trees keep this distance from hub centres so canopies clear the pads. */
export const HUB_TREE_CLEARANCE = 8.2;

/** Height of the walkable roof surface (top of the slab, cap, ridge or spire). */
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

/** Small, fast, seedable PRNG — used for facade window patterns. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The city is pure data — identical on every load. */
export function generateCity(): CityModel {
  return buildNorrkoping();
}