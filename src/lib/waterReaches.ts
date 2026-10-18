/**
 * Water surfaces at measured levels (Step 3.5), from src/lib/data/water-reaches.json
 * (scripts/prepare-water-reaches.py + .mjs).
 *
 * Each OSM water polygon is drawn flat at the level of its reach instead of being draped on the
 * terrain. Motala ström is several reaches separated by dams and falls; the sea and the tidal river
 * use the SMHI 2021-2025 mean sea level. Polygons listed as `unmeasured` (narrow, sloping streams with
 * no hydro-flattened DTM surface) keep the terrain-following surface. Levels are RH2000 metres.
 */
import data from './data/water-reaches.json';
import { terrain } from './terrain';
import type { Point } from './surfaceMesh';

export interface WaterReach {
  id: string;
  levelMetres: number;
  source: string;
  class9Cells?: number;
  dtmLevelMetres?: number;
  scanDayMetres?: number;
}
export interface WaterSurface {
  reach: WaterReach;
  /** OSM water area the surface was cut from. */
  area: string;
  /** Outer ring first, then holes; open rings (no repeated closing vertex). */
  rings: Point[][];
  /** Scene height of the flat surface. */
  y: number;
}
export interface WaterFall {
  a: Point;
  b: Point;
  /** Scene heights of the upper and lower reach. */
  upper: number;
  lower: number;
}

export const WATER_REACHES = new Map<string, WaterReach>(
  (data.reaches as WaterReach[]).map((r) => [r.id, r]),
);
export const waterSurfaces: WaterSurface[] = data.surfaces.map((s) => {
  const reach = WATER_REACHES.get(s.reach);
  if (!reach || !Number.isFinite(reach.levelMetres)) throw new Error(`Invalid water reach ${s.reach}`);
  return {
    reach,
    area: s.area,
    rings: s.rings as Point[][],
    y: terrain.toSceneHeight(reach.levelMetres),
  };
});
export const waterFalls: WaterFall[] = data.falls.map((f) => ({
  a: f.a as Point,
  b: f.b as Point,
  upper: terrain.toSceneHeight(f.upperMetres),
  lower: terrain.toSceneHeight(f.lowerMetres),
}));
/** OSM water areas without a measured flat surface. */
export const unmeasuredWater = new Set<string>(data.unmeasured);
/** Dry sloping banks inside OSM water polygons (DTM > reach level + 0.5 m): drawn as land. */
export const dryBanks: { area: string; rings: Point[][] }[] = data.dry.map((d) => ({
  area: d.area,
  rings: d.rings as Point[][],
}));
/** Parts of measured areas without a level (sloping side channels, cascades): follow the terrain. */
export const drapedWater: { area: string; rings: Point[][] }[] = data.draped.map((d) => ({
  area: d.area,
  rings: d.rings as Point[][],
}));

const key = (p: Point) => `${p[0]},${p[1]}`;
const fallEdges = new Set(waterFalls.flatMap((f) => [key(f.a) + '|' + key(f.b), key(f.b) + '|' + key(f.a)]));
/** True for a surface edge between two reaches (a fall), false for a shoreline edge. */
export function isFallEdge(a: Point, b: Point) {
  return fallEdges.has(key(a) + '|' + key(b));
}

function inRings(x: number, z: number, rings: Point[][]) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
    }
  return inside;
}
const CELL = 2;
let index: Map<number, WaterSurface[]> | null = null;
function cells() {
  if (index) return index;
  index = new Map();
  for (const s of waterSurfaces) {
    const xs = s.rings[0].map((p) => p[0]),
      zs = s.rings[0].map((p) => p[1]);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++) {
        const k = i * 100003 + j;
        if (!index.has(k)) index.set(k, []);
        index.get(k)!.push(s);
      }
  }
  return index;
}
/** The measured water surface at (x, z), or null outside measured water. */
export function waterSurfaceAt(x: number, z: number): WaterSurface | null {
  const list = cells().get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  return list?.find((s) => inRings(x, z, s.rings)) ?? null;
}
