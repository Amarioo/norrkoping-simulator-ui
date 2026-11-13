/**
 * Phase C1: the forest floor of a measured tile. The LiDAR canopy mask (forest.ts `floor`) is laid
 * exactly on the rendered terrain, clipped to the surface mesh triangles like the land cover
 * (terrain.drape), so only its depth rank orders it: above grass, below pitches, paths and roads,
 * the rank of the map's own woodland cover.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { COVER_ORDER, LAYER_RANK } from '../groundLayers';
import type { Point } from '../mapModel';
import { terrain } from '../terrain';
import type { ForestTile } from './forest';

/** The map's woodland colour (cityMesh.ts land cover `wood`). */
export const FOREST_FLOOR_COLOR = '#648b51';
export const FOREST_FLOOR_RANK = LAYER_RANK.cover + COVER_ORDER.indexOf('wood');

export function forestFloorGeometry(tile: ForestTile) {
  const position: number[] = [];
  for (const [x0, z0, x1, z1] of tile.floor) {
    const corners: Point[] = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
    for (const [a, b, c] of [
      [0, 1, 2],
      [0, 2, 3],
    ])
      terrain.drape(corners[a], corners[b], corners[c], (p, q, r, ground) => {
        // Counter-clockwise seen from above, so the faces point up.
        const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) > 0;
        for (const [x, z] of [p, up ? q : r, up ? r : q]) position.push(x, ground.at(x, z), z);
      });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}
