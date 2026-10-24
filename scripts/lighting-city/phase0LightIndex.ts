/**
 * Lighting Phase 0: deterministic, capacity-checked sparse light index for the street-lamp shader.
 *
 * Cells are the Step 6 cells (1 scene unit ≈ 25 m, boundaries at integer scene coordinates, fixed to
 * the scene origin; scene x/z are SWEREF 99 TM grid axes, see geo/sweref99tm.js). A lamp is listed
 * in every cell whose closed square lies within its horizontal range, exactly as the legacy dense
 * grid (legacyGrid.ts) did, so the set of lamps a surface point evaluates is unchanged.
 *
 * Storage (all Float32, sampled with texelFetch):
 * - Page directory: one R32F texel per chunk of `chunkCells` × `chunkCells` cells over the bounding
 *   rectangle of the non-empty chunks; value = page index, or −1 (EMPTY_PAGE) for a chunk without
 *   lamps. This is the only structure that scales with the bounding rectangle (4 bytes per chunk).
 * - Page atlas: only non-empty chunks; per cell SLOT_TEXELS RGBA texels = MAX_PER_CELL lamp indices,
 *   unused slots −1 (the shader stops at the first negative slot). Pages are laid out in rows of
 *   `pagesPerRow` within the device texture limit.
 * - Lamp data are stored once (cityLights.packLampData), indexed in canonical-ID order.
 *
 * Determinism: lamps are ordered by canonical ID (UTF-16 code-unit order, never locale or input
 * order); a cell lists its lamps in that order; pages are numbered in (chunk z, chunk x) order. Any
 * permutation of equivalent input produces byte-identical arrays.
 *
 * Capacity: a cell with more than `capacity` contributing lamps is an error. The whole build is
 * rejected with a conflict report (raw / candidate-retained / candidate-dropped IDs); nothing is
 * truncated. The candidate split (nearest to the cell centre, canonical-ID tie-break) is reported for
 * review only and is never applied: no dropping policy has been approved.
 */
// FROZEN COPY of src/lib/lighting/lightIndex.ts at commit 53468b0 (Phase 0 – A3: 16 fixed slots per
// cell). Lighting Phase L0's capacity analysis (docs/lighting-city-l0/data/capacity.json) was made with
// this index; L1 changed the runtime index, so L0 keeps this copy to stay reproducible byte for byte.
const MAX_PER_CELL = 16;
const SLOT_TEXELS = 4;

export const EMPTY_PAGE = -1;
/** Default chunk side in cells (4 × 25 m = 100 m); see docs/lighting-phase0/README.md. */
export const CHUNK_CELLS = 4;
/** Largest accepted lamp range (metres). Pilot maximum is 30 m. */
export const MAX_RANGE_M = 100;
/** Largest accepted |x|, |z| (scene units, 250 km): rejects garbage before any allocation. */
export const MAX_COORDINATE = 10_000;
/** Largest accepted number of (cell, lamp) entries before allocation. */
export const MAX_CELL_ENTRIES = 4_000_000;
/** Conflicts listed in full in a report (the count is always complete). */
export const MAX_REPORTED_CONFLICTS = 200;

export interface IndexLamp {
  /** Canonical, unique ID (registry.ts). */
  id: string;
  /** Emitter position, scene units. */
  x: number;
  z: number;
  rangeM: number;
}
export interface IndexOptions {
  metresPerUnit: number;
  /** Device limit (renderer.capabilities.maxTextureSize). */
  maxTextureSize: number;
  chunkCells?: number;
  /** Lamp slots per cell; must stay MAX_PER_CELL for the shader. */
  capacity?: number;
  maxRangeM?: number;
  maxCellEntries?: number;
}
export interface CellConflict {
  /** Absolute cell coordinates (scene units of the cell's min corner / cell size). */
  cell: [number, number];
  chunk: [number, number];
  /** Cell centre, scene units. */
  centre: [number, number];
  capacity: number;
  /** Every contributing lamp, canonical order. */
  raw: string[];
  /** Review only, NOT applied: nearest to the cell centre (canonical-ID tie-break). */
  candidateRetained: string[];
  candidateDropped: string[];
}
export interface IndexStats {
  lamps: number;
  cellEntries: number;
  nonEmptyCells: number;
  /** Highest raw contributor count of any cell (before any capacity check). */
  maxRawOccupancy: number;
  /** Highest retained count (equals maxRawOccupancy when accepted; 0 when rejected). */
  maxRetainedOccupancy: number;
  /** histogram[k] = cells with exactly k contributors (k ≥ 1). */
  histogram: number[];
  overflowCells: number;
  chunkCells: number;
  cellMetres: number;
  pages: number;
  directory: { columns: number; rows: number; bytes: number };
  payload: { width: number; height: number; pagesPerRow: number; bytes: number };
  /** The dense Step 6 rectangle for the same lamps (for comparison; not allocated). */
  denseEquivalent: { columns: number; rows: number; bytes: number };
}
export interface SparseLightIndex {
  /** Lamp order: index i in the payload refers to order[i] (canonical). */
  order: string[];
  cell: number;
  chunkCells: number;
  capacity: number;
  /** Directory origin, scene units (chunk-aligned). */
  originX: number;
  originZ: number;
  /** Directory origin in chunks. */
  chunkX0: number;
  chunkZ0: number;
  directory: Float32Array;
  payload: Float32Array;
  stats: IndexStats;
}
export type IndexResult =
  | { ok: true; index: SparseLightIndex; errors: []; conflicts: [] }
  | {
      ok: false;
      index: null;
      errors: string[];
      conflicts: CellConflict[];
      conflictCount: number;
      stats: IndexStats | null;
    };

/** Canonical string order (UTF-16 code units; independent of locale). */
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const fail = (
  errors: string[],
  stats: IndexStats | null = null,
  conflicts: CellConflict[] = [],
  conflictCount = 0,
): IndexResult => ({
  ok: false,
  index: null,
  errors,
  conflicts,
  conflictCount,
  stats,
});

export function buildLightIndex(input: readonly IndexLamp[], options: IndexOptions): IndexResult {
  const cell = 1;
  const chunkCells = options.chunkCells ?? CHUNK_CELLS;
  const capacity = options.capacity ?? MAX_PER_CELL;
  const maxRangeM = options.maxRangeM ?? MAX_RANGE_M;
  const maxEntries = options.maxCellEntries ?? MAX_CELL_ENTRIES;
  const maxTex = options.maxTextureSize;
  const M = options.metresPerUnit;
  const errors: string[] = [];
  if (!(Number.isInteger(chunkCells) && chunkCells >= 1 && chunkCells <= 64))
    errors.push(`chunkCells ${chunkCells} must be an integer in 1..64`);
  if (capacity !== MAX_PER_CELL)
    errors.push(`capacity ${capacity} must equal the shader's ${MAX_PER_CELL}`);
  if (!(Number.isFinite(M) && M > 0)) errors.push(`metresPerUnit ${M} invalid`);
  if (!(Number.isInteger(maxTex) && maxTex >= 1)) errors.push(`maxTextureSize ${maxTex} invalid`);
  if (input.length >= 2 ** 24) errors.push(`${input.length} lamps exceed exact float index range`);
  if (errors.length) return fail(errors);

  // 1. Validate every lamp before allocating anything.
  const seen = new Set<string>();
  for (const l of input) {
    const where = `lamp ${JSON.stringify(l.id)}`;
    if (typeof l.id !== 'string' || !l.id) errors.push(`${where}: missing id`);
    else if (seen.has(l.id)) errors.push(`${where}: duplicate id`);
    else seen.add(l.id);
    if (!Number.isFinite(l.x) || !Number.isFinite(l.z))
      errors.push(`${where}: non-finite position`);
    else if (Math.abs(l.x) > MAX_COORDINATE || Math.abs(l.z) > MAX_COORDINATE)
      errors.push(`${where}: position outside ±${MAX_COORDINATE} scene units`);
    if (!Number.isFinite(l.rangeM) || l.rangeM <= 0)
      errors.push(`${where}: range must be finite and > 0`);
    else if (l.rangeM > maxRangeM)
      errors.push(`${where}: range ${l.rangeM} m exceeds ${maxRangeM} m`);
  }
  if (errors.length) return fail(errors);

  // 2. Canonical order.
  const lamps = [...input].sort((a, b) => compareIds(a.id, b.id));
  const n = lamps.length;

  // 3. Bound the work before allocation: cells touched by each range square.
  let estimate = 0;
  for (const l of lamps) {
    const r = l.rangeM / M;
    estimate +=
      (Math.floor((l.x + r) / cell) - Math.floor((l.x - r) / cell) + 1) *
      (Math.floor((l.z + r) / cell) - Math.floor((l.z - r) / cell) + 1);
  }
  if (estimate > maxEntries)
    return fail([`${estimate} candidate cell entries exceed ${maxEntries}`]);

  // 4. (cell, lamp) entries, lamps in canonical order. Same closed-cell test as the legacy grid.
  const ex = new Int32Array(estimate),
    ez = new Int32Array(estimate),
    el = new Uint32Array(estimate);
  let entries = 0;
  let minCx = Infinity,
    minCz = Infinity,
    maxCx = -Infinity,
    maxCz = -Infinity;
  let denseX0 = Infinity,
    denseZ0 = Infinity,
    denseX1 = -Infinity,
    denseZ1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const l = lamps[i];
    const r = l.rangeM / M;
    denseX0 = Math.min(denseX0, l.x - r);
    denseZ0 = Math.min(denseZ0, l.z - r);
    denseX1 = Math.max(denseX1, l.x + r);
    denseZ1 = Math.max(denseZ1, l.z + r);
    for (let cz = Math.floor((l.z - r) / cell); cz <= Math.floor((l.z + r) / cell); cz++)
      for (let cx = Math.floor((l.x - r) / cell); cx <= Math.floor((l.x + r) / cell); cx++) {
        const nx = Math.max(cx * cell, Math.min(l.x, (cx + 1) * cell)),
          nz = Math.max(cz * cell, Math.min(l.z, (cz + 1) * cell));
        if (Math.hypot(nx - l.x, nz - l.z) > r) continue;
        ex[entries] = cx;
        ez[entries] = cz;
        el[entries] = i;
        entries++;
        if (cx < minCx) minCx = cx;
        if (cz < minCz) minCz = cz;
        if (cx > maxCx) maxCx = cx;
        if (cz > maxCz) maxCz = cz;
      }
  }
  // Stable sort by cell (row-major); entries of one cell keep canonical lamp order.
  const spanX = entries ? maxCx - minCx + 1 : 0;
  const key = (k: number) => (ez[k] - minCz) * spanX + (ex[k] - minCx);
  const sorted = Array.from({ length: entries }, (_, k) => k).sort(
    (a, b) => key(a) - key(b) || a - b,
  );

  // 5. Occupancy, histogram and conflicts.
  const histogram: number[] = [0];
  const conflicts: CellConflict[] = [];
  let conflictCount = 0,
    maxRaw = 0,
    nonEmpty = 0;
  const cellStarts: number[] = [];
  for (let s = 0; s < entries;) {
    let e = s + 1;
    while (e < entries && key(sorted[e]) === key(sorted[s])) e++;
    const count = e - s;
    nonEmpty++;
    cellStarts.push(s);
    maxRaw = Math.max(maxRaw, count);
    while (histogram.length <= count) histogram.push(0);
    histogram[count]++;
    if (count > capacity) {
      conflictCount++;
      if (conflicts.length < MAX_REPORTED_CONFLICTS) {
        const cx = ex[sorted[s]],
          cz = ez[sorted[s]];
        const centre: [number, number] = [(cx + 0.5) * cell, (cz + 0.5) * cell];
        const ids = sorted.slice(s, e).map((k) => lamps[el[k]]);
        const ranked = [...ids].sort(
          (a, b) =>
            Math.hypot(a.x - centre[0], a.z - centre[1]) -
              Math.hypot(b.x - centre[0], b.z - centre[1]) || compareIds(a.id, b.id),
        );
        conflicts.push({
          cell: [cx, cz],
          chunk: [Math.floor(cx / chunkCells), Math.floor(cz / chunkCells)],
          centre,
          capacity,
          raw: ids.map((l) => l.id),
          candidateRetained: ranked.slice(0, capacity).map((l) => l.id),
          candidateDropped: ranked.slice(capacity).map((l) => l.id),
        });
      }
    }
    s = e;
  }
  cellStarts.push(entries);

  // 6. Pages: non-empty chunks in (chunk z, chunk x) order.
  const chunkOf = (c: number) => Math.floor(c / chunkCells);
  const pageKeys = new Map<string, number>();
  const chunkList: [number, number][] = [];
  for (let c = 0; c < cellStarts.length - 1; c++) {
    const k = sorted[cellStarts[c]];
    const id = `${chunkOf(ex[k])},${chunkOf(ez[k])}`;
    if (!pageKeys.has(id)) {
      pageKeys.set(id, -1);
      chunkList.push([chunkOf(ex[k]), chunkOf(ez[k])]);
    }
  }
  chunkList.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  chunkList.forEach(([x, z], p) => pageKeys.set(`${x},${z}`, p));
  const pages = chunkList.length;
  let chunkX0 = 0,
    chunkZ0 = 0,
    chunkX1 = -1,
    chunkZ1 = -1;
  if (pages) {
    [chunkX0, chunkZ0] = chunkList[0];
    [chunkX1, chunkZ1] = chunkList[0];
    for (const [x, z] of chunkList) {
      chunkX0 = Math.min(chunkX0, x);
      chunkZ0 = Math.min(chunkZ0, z);
      chunkX1 = Math.max(chunkX1, x);
      chunkZ1 = Math.max(chunkZ1, z);
    }
  }
  const dirColumns = chunkX1 - chunkX0 + 1,
    dirRows = chunkZ1 - chunkZ0 + 1;
  const pageWidth = chunkCells * SLOT_TEXELS;
  const pagesPerRow = Math.max(1, Math.min(pages, Math.floor(maxTex / pageWidth)));
  const pageRows = Math.ceil(pages / pagesPerRow);
  const payloadWidth = Math.max(1, pagesPerRow * pageWidth),
    payloadHeight = Math.max(1, pageRows * chunkCells);
  const denseColumns = n ? Math.ceil(denseX1 - Math.floor(denseX0)) : 0,
    denseRows = n ? Math.ceil(denseZ1 - Math.floor(denseZ0)) : 0;
  const stats: IndexStats = {
    lamps: n,
    cellEntries: entries,
    nonEmptyCells: nonEmpty,
    maxRawOccupancy: maxRaw,
    maxRetainedOccupancy: conflictCount ? 0 : maxRaw,
    histogram,
    overflowCells: conflictCount,
    chunkCells,
    cellMetres: cell * M,
    pages,
    directory: { columns: dirColumns, rows: dirRows, bytes: Math.max(1, dirColumns * dirRows) * 4 },
    payload: {
      width: payloadWidth,
      height: payloadHeight,
      pagesPerRow,
      bytes: payloadWidth * payloadHeight * 16,
    },
    denseEquivalent: {
      columns: denseColumns,
      rows: denseRows,
      bytes: Math.max(1, denseColumns * SLOT_TEXELS) * Math.max(1, denseRows) * 16,
    },
  };
  if (conflictCount)
    return fail(
      [
        `${conflictCount} cell(s) exceed ${capacity} contributing lamps (max ${maxRaw}); no dropping policy is approved`,
      ],
      stats,
      conflicts,
      conflictCount,
    );
  const limits: string[] = [];
  if (dirColumns > maxTex || dirRows > maxTex)
    limits.push(`page directory ${dirColumns}×${dirRows} exceeds max texture size ${maxTex}`);
  if (payloadWidth > maxTex || payloadHeight > maxTex)
    limits.push(`page atlas ${payloadWidth}×${payloadHeight} exceeds max texture size ${maxTex}`);
  if (pages >= 2 ** 24) limits.push(`${pages} pages exceed exact float index range`);
  if (limits.length) return fail(limits, stats);

  // 7. Fill directory and atlas.
  const directory = new Float32Array(Math.max(1, dirColumns * dirRows)).fill(EMPTY_PAGE);
  for (const [x, z] of chunkList)
    directory[(z - chunkZ0) * dirColumns + (x - chunkX0)] = pageKeys.get(`${x},${z}`)!;
  const payload = new Float32Array(payloadWidth * payloadHeight * 4).fill(-1);
  for (let c = 0; c < cellStarts.length - 1; c++) {
    const first = sorted[cellStarts[c]];
    const cx = ex[first],
      cz = ez[first];
    const chx = chunkOf(cx),
      chz = chunkOf(cz);
    const p = pageKeys.get(`${chx},${chz}`)!;
    const col = ((p % pagesPerRow) * chunkCells + (cx - chx * chunkCells)) * SLOT_TEXELS,
      row = Math.floor(p / pagesPerRow) * chunkCells + (cz - chz * chunkCells);
    const base = (row * payloadWidth + col) * 4;
    for (let j = 0, s = cellStarts[c]; s < cellStarts[c + 1]; s++, j++)
      payload[base + j] = el[sorted[s]];
  }
  return {
    ok: true,
    index: {
      order: lamps.map((l) => l.id),
      cell,
      chunkCells,
      capacity,
      originX: chunkX0 * chunkCells * cell,
      originZ: chunkZ0 * chunkCells * cell,
      chunkX0,
      chunkZ0,
      directory,
      payload,
      stats,
    },
    errors: [],
    conflicts: [],
  };
}

/**
 * CPU emulation of the shader lookup (cityLights.ts FRAGMENT_MAIN) on the packed arrays: the lamp
 * indices (slot order) that a surface point at scene (x, z) evaluates. Tests only.
 */
export function lookupLamps(index: SparseLightIndex, x: number, z: number) {
  const { stats, chunkCells: C } = index;
  const cx = Math.floor((x - index.originX) / index.cell),
    cz = Math.floor((z - index.originZ) / index.cell);
  if (cx < 0 || cz < 0 || cx >= stats.directory.columns * C || cz >= stats.directory.rows * C)
    return [];
  const chx = Math.floor(cx / C),
    chz = Math.floor(cz / C);
  const page = index.directory[chz * stats.directory.columns + chx];
  if (page < 0) return [];
  const ppr = stats.payload.pagesPerRow;
  const col = ((page % ppr) * C + (cx - chx * C)) * SLOT_TEXELS,
    row = Math.floor(page / ppr) * C + (cz - chz * C);
  const out: number[] = [];
  for (let slot = 0; slot < index.capacity; slot++) {
    const id = index.payload[(row * stats.payload.width + col) * 4 + slot];
    if (id < 0) break;
    out.push(id);
  }
  return out;
}
