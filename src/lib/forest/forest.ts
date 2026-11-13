/**
 * Phase C1 (Vrinneviskogen vegetation), pilot: trees measured from the LiDAR, one 250 m tile.
 *
 * `src/lib/data/forest-c1.json` (scripts/vegetation-c1/forest_lidar.py) lists every visible tree top
 * of a tile: position (SWEREF 99 TM), height, crown radius and crown base, all DERIVED from
 * Lantmäteriet's Laserdata NH 2020. Inside a measured tile these trees replace the illustrative
 * planting of mapVegetation.ts (which is sparse and about 13 m tall everywhere).
 *
 * Frame: scene = (SWEREF − origin) / (25 · k), x east, z south (map meta.reference). Heights are
 * metres above the ground at the tree; the model puts the stem on the RENDERED ground (the app's DTM
 * terrain) and converts metres with 25 m per unit, as every other model.
 *
 * [LIDAR] position, height, crown radius, crown base (flag 0).
 * [EST]   crown base of flag-1 trees (0.5 × height), trunk radius, the crown's shape and colour,
 *         species (none assigned: a neutral crown).
 * Not drawn: tops whose stem would stand on a rendered path, road, pitch, water or building. The
 * LiDAR sees their crown from above, but the position of the stem under it is not known to better
 * than about a metre, and a stem on a path would be wrong for certain.
 */
import data from '../data/forest-c1.json';
import { cityMap, pointInRing, type Point } from '../mapModel';
import { terrain } from '../terrain';

export const FOREST_VERSION: string = data.version;
const reference = terrain.data.reference;
const UNIT = reference.metresPerUnit * reference.gridScaleFactor;
/** Scene units per metre for model sizes (25 m per unit, like the other models). */
const M = reference.metresPerUnit;
const sceneX = (e: number) => (e - reference.originEasting) / UNIT;
const sceneZ = (n: number) => (reference.originNorthing - n) / UNIT;

export interface ForestTree {
  /** Scene position of the tree top (and of the drawn stem). */
  x: number;
  z: number;
  /** Metres above the ground at the tree. */
  heightM: number;
  crownRadiusM: number;
  crownBaseM: number;
  /** True when the crown base is an estimate (too few returns in the crown). */
  baseEstimated: boolean;
}
export interface ForestTile {
  id: string;
  /** Scene rectangle: x0 ≤ x < x1, z0 ≤ z < z1. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Every measured tree top of the tile. */
  measured: ForestTree[];
  /** The trees that are drawn (measured minus the ones standing on a rendered surface). */
  trees: ForestTree[];
  /** Measured tops not drawn, by reason. */
  omitted: { path: number; area: number; building: number };
  /**
   * The forest floor: scene rectangles (x0, z0, x1, z1) covering the cells that lie under canopy in
   * the LiDAR (canopy mask, 5 m cells; runs of cells along x are joined). [LIDAR] where the canopy
   * is; [EST] that the ground under it looks like the map's other woodland.
   */
  floor: [number, number, number, number][];
  /** Share of the tile's cells under canopy. */
  floorShare: number;
}

/** Clear distance kept between a stem and the edge of a rendered path or road, metres. [EST] */
export const STEM_CLEARANCE_M = 0.3;
const BLOCKING_AREAS = new Set(['water', 'pitch', 'square', 'apron']);

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const inPolygon = (p: Point, rings: Point[][]) =>
  pointInRing(p, rings[0]) && !rings.slice(1).some((r) => pointInRing(p, r));
const touches = (rings: Point[][], t: { x0: number; z0: number; x1: number; z1: number }) => {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const [x, z] of rings[0]) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return x1 >= t.x0 && x0 <= t.x1 && z1 >= t.z0 && z0 <= t.z1;
};

let tiles: ForestTile[] | undefined;
/** The measured tiles, in the scene frame (built once). */
export function forestTiles(): ForestTile[] {
  if (tiles) return tiles;
  tiles = data.tiles.map((tile) => {
    const rect = {
      x0: sceneX(tile.e0),
      x1: sceneX(tile.e0 + tile.sizeM),
      z0: sceneZ(tile.n0 + tile.sizeM),
      z1: sceneZ(tile.n0),
    };
    const margin = 0.5;
    const ways = cityMap.roads.filter(
      (r) =>
        r.kind !== 'stream' &&
        Math.max(r.a[0], r.b[0]) >= rect.x0 - margin &&
        Math.min(r.a[0], r.b[0]) <= rect.x1 + margin &&
        Math.max(r.a[1], r.b[1]) >= rect.z0 - margin &&
        Math.min(r.a[1], r.b[1]) <= rect.z1 + margin,
    );
    const areas = cityMap.areas.filter((a) => BLOCKING_AREAS.has(a.kind) && touches(a.rings, rect));
    const buildings = cityMap.buildings.filter((b) => touches(b.rings, rect));
    const omitted = { path: 0, area: 0, building: 0 };
    const measured: ForestTree[] = [],
      trees: ForestTree[] = [];
    for (const [e, n, heightM, crownRadiusM, crownBaseM, flag] of tile.trees) {
      const tree: ForestTree = {
        x: sceneX(e),
        z: sceneZ(n),
        heightM,
        crownRadiusM,
        crownBaseM,
        baseEstimated: flag === 1,
      };
      measured.push(tree);
      const p: Point = [tree.x, tree.z];
      if (
        ways.some(
          (r) => distanceToSegment(p, r.a, r.b) < r.width / 2 + (trunkRadiusM(heightM) + STEM_CLEARANCE_M) / M,
        )
      )
        omitted.path++;
      else if (areas.some((a) => inPolygon(p, a.rings))) omitted.area++;
      else if (buildings.some((b) => inPolygon(p, b.rings))) omitted.building++;
      else trees.push(tree);
    }
    // Canopy mask: rows from north (z0) to south, characters from west (x0) to east.
    const { rows, cellM } = tile.canopyMask;
    const cell = (rect.x1 - rect.x0) / (tile.sizeM / cellM);
    const floor: [number, number, number, number][] = [];
    let under = 0;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '1') continue;
        const start = i;
        while (i + 1 < row.length && row[i + 1] === '1') i++;
        under += i - start + 1;
        floor.push([
          rect.x0 + start * cell,
          rect.z0 + j * cell,
          rect.x0 + (i + 1) * cell,
          rect.z0 + (j + 1) * cell,
        ]);
      }
    });
    const floorShare = under / (rows.length * rows[0].length);
    return { id: `${tile.e0}_${tile.n0}`, ...rect, measured, trees, omitted, floor, floorShare };
  });
  return tiles;
}

/** True inside a measured tile: the illustrative planting is not drawn there. */
export function inMeasuredForest(point: readonly number[]) {
  return forestTiles().some(
    (t) => point[0] >= t.x0 && point[0] < t.x1 && point[1] >= t.z0 && point[1] < t.z1,
  );
}

/** Trunk radius at the ground, metres. [EST]: not measured; grows with the tree's height. */
export const trunkRadiusM = (heightM: number) => 0.05 + 0.006 * heightM;

/** Deterministic 0…1 value per tree (rotation and tone), from its position in decimetres. */
export function treeHash(tree: ForestTree) {
  const a = Math.round(tree.x * 2500),
    b = Math.round(tree.z * 2500);
  return (((Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0) % 1000) / 1000;
}

/**
 * The drawn shape of one tree, metres above its ground: a trunk reaching into the crown and two
 * crown lobes inside the measured envelope (top at heightM, widest radius crownRadiusM, bottom at
 * crownBaseM). The lobes are ellipsoids: `y` is the centre, `ry` the vertical and `r` the horizontal
 * half-axis. [EST] shape; [LIDAR] envelope.
 */
export function treeShape(tree: ForestTree) {
  const depth = tree.heightM - tree.crownBaseM;
  return {
    trunk: { radius: trunkRadiusM(tree.heightM), height: tree.crownBaseM + depth * 0.35 },
    lobes: [
      // Lower, wide lobe: from the crown base to 70 % of the crown depth.
      { y: tree.crownBaseM + depth * 0.35, ry: depth * 0.35, r: tree.crownRadiusM },
      // Upper, narrower lobe: from 40 % of the crown depth to the top.
      { y: tree.crownBaseM + depth * 0.7, ry: depth * 0.3, r: tree.crownRadiusM * 0.6 },
    ],
  };
}

/** Totals for diagnostics and tests. */
export function forestStatistics() {
  const t = forestTiles();
  return {
    version: FOREST_VERSION,
    tiles: t.length,
    measured: t.reduce((s, x) => s + x.measured.length, 0),
    drawn: t.reduce((s, x) => s + x.trees.length, 0),
    omitted: t.reduce(
      (s, x) => ({
        path: s.path + x.omitted.path,
        area: s.area + x.omitted.area,
        building: s.building + x.omitted.building,
      }),
      { path: 0, area: 0, building: 0 },
    ),
  };
}
