/**
 * Phase C1 (Vrinneviskogen vegetation): the measured tree data of the 250 m tiles along the northern
 * trail loop (the pilot tile among them), their conversion to the scene, which trees are drawn, the
 * drawn shape inside the measured envelope, and the forest floor laid on the terrain.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cityMap, pointInRing, project, type Point } from '../mapModel';
import { createParkTrees, distanceToSegment } from '../mapVegetation';
import { terrain } from '../terrain';
import data from '../data/forest-c1.json';
import {
  FOREST_VERSION,
  forestStatistics,
  forestTiles,
  inMeasuredForest,
  STEM_CLEARANCE_M,
  treeHash,
  treeShape,
  trunkRadiusM,
} from './forest';
import { FOREST_FLOOR_RANK, forestFloorGeometry } from './forestFloor';
import { COVER_ORDER, LAYER_RANK } from '../groundLayers';

const reference = terrain.data.reference;
const M = reference.metresPerUnit;
const UNIT = M * reference.gridScaleFactor;
const provenance = JSON.parse(
  fs.readFileSync('docs/vegetation-c1/forest-provenance.json', 'utf8'),
) as { runtimeFile: { path: string; sha256: string } };
const sceneOf = (e: number, n: number): Point => [
  (e - reference.originEasting) / UNIT,
  (reference.originNorthing - n) / UNIT,
];
const PILOT = '569250_6492500';
const pilotData = data.tiles.find((t) => t.e0 === 569250 && t.n0 === 6492500)!;
const TOTAL = 8071;

describe('measured data (src/lib/data/forest-c1.json)', () => {
  test('14 tiles on the 250 m SWEREF grid, inside the map, 8 071 measured tree tops', () => {
    expect(FOREST_VERSION).toBe('forest-c1-v2');
    expect(data.crs).toBe('EPSG:3006');
    expect(data.tiles).toHaveLength(14);
    expect(data.tiles.reduce((s, t) => s + t.trees.length, 0)).toBe(TOTAL);
    const clip = (cityMap.meta as unknown as { clip: Point[] }).clip;
    const seen = new Set<string>();
    let previous = [-Infinity, -Infinity];
    for (const tile of data.tiles) {
      expect(tile.sizeM).toBe(250);
      expect(tile.e0 % 250).toBe(0);
      expect(tile.n0 % 250).toBe(0);
      // No tile twice; tiles sorted by northing, then easting.
      expect(seen.has(`${tile.e0}_${tile.n0}`)).toBe(false);
      seen.add(`${tile.e0}_${tile.n0}`);
      expect(
        tile.n0 > previous[0] || (tile.n0 === previous[0] && tile.e0 > previous[1]),
      ).toBe(true);
      previous = [tile.n0, tile.e0];
      expect(tile.stats.trees).toBe(tile.trees.length);
      // At least a tenth of every tile lies in the reserve (the selection rule).
      expect(tile.stats.reserveShare).toBeGreaterThanOrEqual(0.1);
      // The whole tile lies inside the map's clip polygon.
      for (const [e, n] of [
        [tile.e0, tile.n0],
        [tile.e0 + 250, tile.n0],
        [tile.e0, tile.n0 + 250],
        [tile.e0 + 250, tile.n0 + 250],
      ])
        expect(pointInRing(sceneOf(e, n), clip)).toBe(true);
    }
    expect(data.selection.pilotTile).toEqual([569250, 6492500]);
    expect(data.selection.measuredOnlyInsideReserve).toBe(true);
  });
  test('the pilot tile is unchanged from the pilot: 649 tree tops, same canopy', () => {
    expect(pilotData.trees).toHaveLength(649);
    expect(pilotData.stats.treeHeightP50).toBe(20.5);
    expect(pilotData.stats.treeHeightMax).toBe(31.6);
    expect(pilotData.stats.canopyShareAbove2m).toBe(0.719);
    expect(pilotData.stats.reserveShare).toBe(1);
  });
  test('every tree: inside its tile, sorted, plausible height, crown radius and crown base', () => {
    for (const tile of data.tiles) {
      let previous = [-Infinity, -Infinity];
      let estimated = 0;
      for (const [e, n, height, radius, base, flag] of tile.trees) {
        expect(e).toBeGreaterThanOrEqual(tile.e0);
        expect(e).toBeLessThan(tile.e0 + tile.sizeM);
        expect(n).toBeGreaterThanOrEqual(tile.n0);
        expect(n).toBeLessThan(tile.n0 + tile.sizeM);
        // Sorted by northing, then easting (deterministic output).
        expect(n > previous[0] || (n === previous[0] && e > previous[1])).toBe(true);
        previous = [n, e];
        expect(height).toBeGreaterThanOrEqual(data.method.minTreeM);
        expect(height).toBeLessThan(40);
        expect(radius).toBeGreaterThanOrEqual(0.8);
        expect(radius).toBeLessThanOrEqual(8);
        // Height and base are both rounded to 0.1 m after the limit was applied, hence the slack.
        expect(base).toBeGreaterThanOrEqual(0.2 * height - 0.1);
        expect(base).toBeLessThanOrEqual(0.8 * height + 0.1);
        expect([0, 1]).toContain(flag);
        if (flag === 1) {
          estimated++;
          expect(Math.abs(base - 0.5 * height)).toBeLessThanOrEqual(0.1);
        }
      }
      expect(estimated).toBe(tile.stats.crownBaseEstimated);
      // Mature stands everywhere along the loop: median tree top 18–28 m, none above 37 m.
      expect(tile.stats.treeHeightP50).toBeGreaterThan(18);
      expect(tile.stats.treeHeightP50).toBeLessThan(28);
      expect(tile.stats.treeHeightMax).toBeLessThan(37);
      // No two tops of a tile closer than 1 m.
      const t = tile.trees;
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length && t[j][1] - t[i][1] < 1; j++)
          expect(Math.hypot(t[i][0] - t[j][0], t[i][1] - t[j][1])).toBeGreaterThanOrEqual(1);
    }
  });
  test('every measured tree stands inside the reserve outline', () => {
    const way = JSON.parse(fs.readFileSync('scripts/vegetation-c1/reserve-osm.json', 'utf8'))
      .elements[0] as { geometry: { lat: number; lon: number }[] };
    const ring = way.geometry.map((g) => project(g.lat, g.lon) as Point);
    for (const tile of forestTiles())
      for (const tree of tile.measured) expect(pointInRing([tree.x, tree.z], ring)).toBe(true);
  });
  test('the trail loop (2.4 km) runs through measured tiles wherever it is inside the map', () => {
    expect(data.selection.trailLengthM).toBeGreaterThan(2300);
    expect(data.selection.trailLengthM).toBeLessThan(2450);
    const relation = JSON.parse(fs.readFileSync('scripts/vegetation-c1/trail-osm.json', 'utf8'))
      .elements[0] as { members: { geometry?: { lat: number; lon: number }[] }[] };
    let vertices = 0;
    for (const member of relation.members)
      for (const g of member.geometry ?? []) {
        vertices++;
        expect(inMeasuredForest(project(g.lat, g.lon))).toBe(true);
      }
    expect(vertices).toBeGreaterThan(100);
  });
  test('the reserve against the map: 286 ha, 21 % of it south of the map edge, LiDAR covers it all', () => {
    const r = data.reserve;
    expect(r.areaHa).toBeCloseTo(286.2, 1);
    expect(r.insideMapHa + r.outsideMapHa).toBeCloseTo(r.areaHa, 0);
    expect(r.outsideMapShare).toBeCloseTo(0.207, 3);
    expect(r.southernmostNorthing).toBeGreaterThan(r.lidarSouthLimitNorthing);
    expect(r.canopyShareAbove5m).toBeGreaterThan(0.8);
  });
  test('the committed file is the one recorded in the provenance (sha256)', () => {
    expect(provenance.runtimeFile.path).toBe('src/lib/data/forest-c1.json');
    const text = fs.readFileSync('src/lib/data/forest-c1.json', 'utf8').replace(/\r\n/g, '\n');
    expect(crypto.createHash('sha256').update(text).digest('hex')).toBe(
      provenance.runtimeFile.sha256,
    );
    // No timestamps of the run or machine paths in the generated file.
    expect(text).not.toMatch(/[A-Za-z]:\\|\/Users\/|generatedAt/);
  });
});

describe('the tiles in the scene', () => {
  const tiles = forestTiles();
  const pilot = tiles.find((t) => t.id === PILOT)!;
  test('scene rectangle = (SWEREF − origin) / (25 · k), x east, z south', () => {
    expect(tiles).toHaveLength(14);
    expect(pilot.x0).toBeCloseTo((569250 - reference.originEasting) / UNIT, 12);
    expect(pilot.x1).toBeCloseTo((569500 - reference.originEasting) / UNIT, 12);
    // North (larger N) is smaller z.
    expect(pilot.z0).toBeCloseTo((reference.originNorthing - 6492750) / UNIT, 12);
    expect(pilot.z1).toBeCloseTo((reference.originNorthing - 6492500) / UNIT, 12);
    for (const tile of tiles) {
      expect((tile.x1 - tile.x0) * UNIT).toBeCloseTo(250, 9);
      expect((tile.z1 - tile.z0) * UNIT).toBeCloseTo(250, 9);
      expect(inMeasuredForest([(tile.x0 + tile.x1) / 2, (tile.z0 + tile.z1) / 2])).toBe(true);
      for (const tree of tile.measured) {
        expect(tree.x).toBeGreaterThanOrEqual(tile.x0);
        expect(tree.x).toBeLessThan(tile.x1);
        expect(tree.z).toBeGreaterThan(tile.z0);
        expect(tree.z).toBeLessThanOrEqual(tile.z1);
      }
    }
    // North-east of the pilot tile's row there is no measured tile (the housing area).
    expect(inMeasuredForest(sceneOf(569900, 6493100))).toBe(false);
  });
  test('drawn + omitted = measured; no drawn stem on a path, road, pitch, water or building', () => {
    const s = forestStatistics();
    expect(s.tiles).toBe(14);
    expect(s.measured).toBe(TOTAL);
    expect(s.drawn + s.omitted.path + s.omitted.area + s.omitted.building).toBe(s.measured);
    // Most tops are drawn; the rest overhang a trail, a road or a pitch.
    expect(s.drawn).toBeGreaterThan(0.9 * s.measured);
    expect(s.omitted.path).toBeGreaterThan(0);
    // Buildings are masked out in the measurement already.
    expect(s.omitted.building).toBe(0);
    const allBlocking = cityMap.areas.filter((a) =>
      ['water', 'pitch', 'square', 'apron'].includes(a.kind),
    );
    for (const tile of tiles) {
      const near = (p: Point) =>
        p[0] > tile.x0 - 1 && p[0] < tile.x1 + 1 && p[1] > tile.z0 - 1 && p[1] < tile.z1 + 1;
      const blocking = allBlocking.filter((a) => a.rings[0].some(near));
      const ways = cityMap.roads.filter(
        (r) =>
          r.kind !== 'stream' &&
          Math.max(r.a[0], r.b[0]) > tile.x0 - 1 &&
          Math.min(r.a[0], r.b[0]) < tile.x1 + 1 &&
          Math.max(r.a[1], r.b[1]) > tile.z0 - 1 &&
          Math.min(r.a[1], r.b[1]) < tile.z1 + 1,
      );
      const buildings = cityMap.buildings.filter((b) =>
        b.rings[0].some(
          (p) => p[0] > tile.x0 - 1 && p[0] < tile.x1 + 1 && p[1] > tile.z0 - 1 && p[1] < tile.z1 + 1,
        ),
      );
      // Counted, not asserted pair by pair: there are millions of tree–segment pairs.
      let onWay = 0,
        onArea = 0,
        onBuilding = 0;
      for (const tree of tile.trees) {
        const p: Point = [tree.x, tree.z];
        const gap = (trunkRadiusM(tree.heightM) + STEM_CLEARANCE_M) / M;
        if (ways.some((r) => distanceToSegment(p, r.a, r.b) < r.width / 2 + gap)) onWay++;
        if (blocking.some((a) => pointInRing(p, a.rings[0]))) onArea++;
        if (buildings.some((b) => pointInRing(p, b.rings[0]))) onBuilding++;
      }
      expect([tile.id, onWay, onArea, onBuilding]).toEqual([tile.id, 0, 0, 0]);
    }
  });
  test('no mapped OSM tree lies in a measured tile; the illustrative planting there is replaced', () => {
    // mapView.ts skips the points inside a measured tile (and keeps counting them for the other
    // trees' looks). Mapped single trees (OSM nodes) would be lost that way: there are none.
    expect(cityMap.trees.filter(inMeasuredForest)).toHaveLength(0);
    const illustrative = createParkTrees().filter(inMeasuredForest);
    expect(illustrative.length).toBeLessThan(0.05 * TOTAL);
  });
});

describe('drawn shape', () => {
  const tiles = forestTiles();
  test('the crown stays inside the measured envelope: top, widest radius and base', () => {
    const hashes = new Set<number>();
    for (const tile of tiles)
      for (const tree of tile.trees) {
        const { trunk, lobes } = treeShape(tree);
        const [lower, upper] = lobes;
        expect(upper.y + upper.ry).toBeCloseTo(tree.heightM, 9);
        expect(lower.y - lower.ry).toBeCloseTo(tree.crownBaseM, 9);
        expect(Math.max(lower.r, upper.r)).toBe(tree.crownRadiusM);
        expect(upper.r).toBeLessThan(lower.r);
        // The lobes overlap, and the trunk ends inside the lower lobe.
        expect(upper.y - upper.ry).toBeLessThan(lower.y + lower.ry);
        expect(trunk.height).toBeGreaterThan(tree.crownBaseM);
        expect(trunk.height).toBeLessThan(lower.y + lower.ry);
        expect(trunk.radius).toBe(trunkRadiusM(tree.heightM));
        expect(trunk.radius).toBeLessThan(0.3);
        const h = treeHash(tree);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        hashes.add(h);
      }
    // The hash varies between trees (rotation and tone).
    expect(hashes.size).toBeGreaterThan(900);
  });
  test('stems stand on the rendered ground, which exists everywhere in the tiles', () => {
    for (const tile of tiles)
      for (const tree of tile.trees) {
        const ground = terrain.groundHeight(tree.x, tree.z);
        expect(Number.isFinite(ground)).toBe(true);
        // The loop area lies roughly 25–90 m above sea level (RH2000); the lowest stem is at 29 m.
        expect(ground * M).toBeGreaterThan(20);
        expect(ground * M).toBeLessThan(90);
      }
  });
});

describe('forest floor', () => {
  const tiles = forestTiles();
  test('the canopy masks: 50 × 50 cells of 5 m, share as measured, rectangles inside their tile', () => {
    for (const tile of tiles) {
      const source = data.tiles.find((t) => `${t.e0}_${t.n0}` === tile.id)!;
      expect(source.canopyMask.cellM).toBe(5);
      expect(source.canopyMask.rows).toHaveLength(50);
      for (const row of source.canopyMask.rows) expect(row).toMatch(/^[01]{50}$/);
      expect(tile.floorShare).toBeCloseTo(source.stats.canopyMaskShare, 3);
      let area = 0;
      for (const [x0, z0, x1, z1] of tile.floor) {
        expect(x0).toBeGreaterThanOrEqual(tile.x0 - 1e-9);
        expect(x1).toBeLessThanOrEqual(tile.x1 + 1e-9);
        expect(z0).toBeGreaterThanOrEqual(tile.z0 - 1e-9);
        expect(z1).toBeLessThanOrEqual(tile.z1 + 1e-9);
        area += (x1 - x0) * (z1 - z0);
      }
      expect(area / ((tile.x1 - tile.x0) * (tile.z1 - tile.z0))).toBeCloseTo(tile.floorShare, 9);
    }
    // Most drawn trees stand on the floor (the mask is coarser than a crown, so not all).
    let on = 0,
      all = 0;
    for (const tile of tiles)
      for (const t of tile.trees) {
        all++;
        if (tile.floor.some(([x0, z0, x1, z1]) => t.x >= x0 && t.x < x1 && t.z >= z0 && t.z < z1))
          on++;
      }
    expect(on / all).toBeGreaterThan(0.95);
  });
  test('the pilot tile mesh lies exactly on the terrain and covers the mask area', () => {
    const tile = tiles.find((t) => t.id === PILOT)!;
    const geometry = forestFloorGeometry(tile);
    const p = geometry.getAttribute('position');
    expect(p.count % 3).toBe(0);
    let area = 0;
    for (let i = 0; i < p.count; i += 3) {
      const [ax, az, bx, bz, cx, cz] = [
        p.getX(i),
        p.getZ(i),
        p.getX(i + 1),
        p.getZ(i + 1),
        p.getX(i + 2),
        p.getZ(i + 2),
      ];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      // Counter-clockwise seen from above (y up, z south): faces point up.
      expect(cross).toBeLessThanOrEqual(1e-12);
      area += Math.abs(cross) / 2;
      for (let k = 0; k < 3; k++)
        expect(
          Math.abs(p.getY(i + k) - terrain.groundHeight(p.getX(i + k), p.getZ(i + k))),
        ).toBeLessThan(1e-4);
    }
    const maskArea = tile.floorShare * (tile.x1 - tile.x0) * (tile.z1 - tile.z0);
    expect(area / maskArea).toBeCloseTo(1, 3);
    // Ordered like the map's woodland: above grass, below pitches, paths and roads.
    expect(FOREST_FLOOR_RANK).toBe(LAYER_RANK.cover + COVER_ORDER.indexOf('wood'));
    expect(FOREST_FLOOR_RANK).toBeGreaterThan(LAYER_RANK.cover + COVER_ORDER.indexOf('grass'));
    expect(FOREST_FLOOR_RANK).toBeLessThan(LAYER_RANK.cover + COVER_ORDER.indexOf('pitch'));
    expect(FOREST_FLOOR_RANK).toBeLessThan(LAYER_RANK.path);
    geometry.dispose();
  });
});
