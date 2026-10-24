/**
 * The dense light grid of Step 6 – 6.1b (UI commit bf5f726), kept unchanged as an INDEPENDENT
 * REFERENCE for tests and historical audits. It is not used at runtime since Lighting Phase 0
 * (lightIndex.ts replaced it).
 *
 * Known shortcomings documented by scripts/step62/grid-audit.test.ts: the rectangle spans every lamp
 * range (memory grows with the bounding area, not with the lit area); a cell with more than
 * MAX_PER_CELL lamps is silently truncated to the nearest ones; equidistant ties depend on input order.
 */
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { MAX_PER_CELL, type ShaderLamp } from './cityLights';

export interface LightGrid {
  originX: number;
  originZ: number;
  cell: number;
  columns: number;
  rows: number;
  /** Lamp indices per cell (row-major), at most MAX_PER_CELL each. */
  cells: number[][];
  /** Cells whose lamp list was truncated to MAX_PER_CELL (should be 0). */
  overflow: number;
}
/**
 * Lists every lamp in each cell its range circle touches. A cell with more than MAX_PER_CELL lamps
 * keeps the nearest ones (to the cell centre) and is counted in `overflow`.
 */
export function buildLightGrid(lamps: ShaderLamp[], metresPerUnit: number, cell = 1): LightGrid {
  if (!lamps.length)
    return { originX: 0, originZ: 0, cell, columns: 0, rows: 0, cells: [], overflow: 0 };
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const l of lamps) {
    const r = l.rangeM / metresPerUnit;
    x0 = Math.min(x0, l.x - r);
    z0 = Math.min(z0, l.z - r);
    x1 = Math.max(x1, l.x + r);
    z1 = Math.max(z1, l.z + r);
  }
  const originX = Math.floor(x0 / cell) * cell,
    originZ = Math.floor(z0 / cell) * cell;
  const columns = Math.ceil((x1 - originX) / cell),
    rows = Math.ceil((z1 - originZ) / cell);
  const cells: number[][] = Array.from({ length: columns * rows }, () => []);
  lamps.forEach((l, i) => {
    const r = l.rangeM / metresPerUnit;
    for (
      let cz = Math.floor((l.z - r - originZ) / cell);
      cz <= Math.floor((l.z + r - originZ) / cell);
      cz++
    )
      for (
        let cx = Math.floor((l.x - r - originX) / cell);
        cx <= Math.floor((l.x + r - originX) / cell);
        cx++
      ) {
        if (cx < 0 || cz < 0 || cx >= columns || cz >= rows) continue;
        // Distance from the lamp to the nearest point of the cell.
        const nx = Math.max(originX + cx * cell, Math.min(l.x, originX + (cx + 1) * cell)),
          nz = Math.max(originZ + cz * cell, Math.min(l.z, originZ + (cz + 1) * cell));
        if (Math.hypot(nx - l.x, nz - l.z) <= r) cells[cz * columns + cx].push(i);
      }
  });
  let overflow = 0;
  cells.forEach((list, k) => {
    if (list.length <= MAX_PER_CELL) return;
    overflow++;
    const cx = originX + ((k % columns) + 0.5) * cell,
      cz = originZ + (Math.floor(k / columns) + 0.5) * cell;
    list.sort(
      (a, b) =>
        Math.hypot(lamps[a].x - cx, lamps[a].z - cz) - Math.hypot(lamps[b].x - cx, lamps[b].z - cz),
    );
    list.length = MAX_PER_CELL;
  });
  return { originX, originZ, cell, columns, rows, cells, overflow };
}
export function packGrid(grid: LightGrid) {
  const width = Math.max(1, grid.columns * (MAX_PER_CELL / 4)),
    height = Math.max(1, grid.rows);
  const data = new Float32Array(width * height * 4).fill(-1);
  grid.cells.forEach((list, k) => {
    const cx = k % grid.columns,
      cz = Math.floor(k / grid.columns);
    list.forEach((lamp, j) => (data[(cz * width + cx * (MAX_PER_CELL / 4)) * 4 + j] = lamp));
  });
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
