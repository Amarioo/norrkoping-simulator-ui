/**
 * Lighting Phase 0 sparse index: capacity, determinism, boundaries, sparsity, device limits and
 * sentinel integrity. The independent reference for cell membership is the unchanged Step 6 dense
 * grid (legacyGrid.ts) or a direct closed-square distance test written here.
 */
import { describe, expect, test } from 'vitest';
import {
  LAMP_TEXELS,
  lampLayout,
  MAX_PER_CELL,
  packLampData,
  SLOT_TEXELS,
  type ShaderLamp,
} from './cityLights';
import { buildLightGrid } from './legacyGrid';
import {
  buildLightIndex,
  EMPTY_PAGE,
  lookupLamps,
  MAX_REPORTED_CONFLICTS,
  type IndexLamp,
  type IndexOptions,
  type SparseLightIndex,
} from './lightIndex';

const M = 25;
const opts: IndexOptions = { metresPerUnit: M, maxTextureSize: 4096 };
const lamp = (id: string, x: number, z: number, rangeM = 30): IndexLamp => ({ id, x, z, rangeM });
const build = (lamps: IndexLamp[], o: Partial<IndexOptions> = {}) =>
  buildLightIndex(lamps, { ...opts, ...o });
const accepted = (lamps: IndexLamp[], o: Partial<IndexOptions> = {}) => {
  const r = build(lamps, o);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.index;
};
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const shuffle = <T>(a: T[], seed: number) => {
  const r = rng(seed),
    out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** Direct reference: lamp touches cell (cx, cz) if the closed unit square is within its range. */
const touches = (l: IndexLamp, cx: number, cz: number) =>
  Math.hypot(
    Math.max(cx, Math.min(l.x, cx + 1)) - l.x,
    Math.max(cz, Math.min(l.z, cz + 1)) - l.z,
  ) <=
  l.rangeM / M;
const idsAt = (index: SparseLightIndex, x: number, z: number) =>
  lookupLamps(index, x, z).map((i) => index.order[i]);
/** Structural invariants of the packed arrays. */
function checkIntegrity(index: SparseLightIndex) {
  const { stats, directory, payload } = index;
  const pages = new Set<number>();
  for (const v of directory) {
    expect(v === EMPTY_PAGE || (Number.isInteger(v) && v >= 0 && v < stats.pages)).toBe(true);
    if (v >= 0) {
      expect(pages.has(v)).toBe(false);
      pages.add(v);
    }
  }
  expect(pages.size).toBe(stats.pages);
  expect(payload.length).toBe(stats.payload.width * stats.payload.height * 4);
  for (let c = 0; c < payload.length; c += MAX_PER_CELL) {
    let ended = false;
    const seen = new Set<number>();
    for (let s = 0; s < MAX_PER_CELL; s++) {
      const v = payload[c + s];
      if (v < 0) {
        expect(v).toBe(-1);
        ended = true;
      } else {
        expect(ended).toBe(false); // no lamp after the first empty slot
        expect(Number.isInteger(v) && v < index.order.length).toBe(true);
        expect(seen.has(v)).toBe(false); // no lamp twice in a cell
        seen.add(v);
      }
    }
  }
}

describe('capacity', () => {
  test('0 lamps: an empty, valid index', () => {
    const index = accepted([]);
    expect(index.stats).toMatchObject({ lamps: 0, pages: 0, nonEmptyCells: 0, maxRawOccupancy: 0 });
    expect(idsAt(index, 0.5, 0.5)).toEqual([]);
    expect(Array.from(index.directory)).toEqual([EMPTY_PAGE]);
  });
  test('1 lamp: exactly the cells within its range', () => {
    const l = lamp('a', 3.3, -2.7);
    const index = accepted([l]);
    let cells = 0;
    for (let cz = -6; cz < 2; cz++)
      for (let cx = -1; cx < 8; cx++) {
        expect(idsAt(index, cx + 0.5, cz + 0.5)).toEqual(touches(l, cx, cz) ? ['a'] : []);
        if (touches(l, cx, cz)) cells++;
      }
    expect(index.stats.nonEmptyCells).toBe(cells);
    checkIntegrity(index);
  });
  test('16 co-located lamps are accepted; 17 are rejected with a complete conflict report', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, k) => lamp(`lamp-${String(k).padStart(2, '0')}`, 0.5, 0.5));
    const ok = accepted(many(16));
    expect(ok.stats.maxRawOccupancy).toBe(16);
    expect(idsAt(ok, 0.5, 0.5)).toHaveLength(16);
    const r = build(many(17));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/exceed 16 contributing lamps.*no dropping policy/);
    expect(r.conflictCount).toBe(r.stats!.overflowCells);
    expect(r.conflictCount).toBe(r.stats!.histogram[17]);
    for (const c of r.conflicts) {
      expect(c.raw).toEqual(many(17).map((l) => l.id));
      // Equidistant co-located lamps: the review candidate split falls back to the canonical ID.
      expect(c.candidateDropped).toEqual(['lamp-16']);
      expect(c.candidateRetained).toEqual(c.raw.slice(0, 16));
    }
    expect(r.stats!.maxRetainedOccupancy).toBe(0);
  });
  test('equidistant ring: the candidate split is distance first, canonical ID second, never input order', () => {
    const ring = Array.from({ length: 17 }, (_, k) => {
      const a = (k / 17) * Math.PI * 2;
      return lamp(
        `r${String((k * 7) % 17).padStart(2, '0')}`,
        10.5 + Math.cos(a) * 0.2,
        10.5 + Math.sin(a) * 0.2,
        5,
      );
    });
    const centreConflict = (lamps: IndexLamp[]) => {
      const r = build(lamps);
      if (r.ok) throw new Error('expected conflict');
      return r.conflicts.find((c) => c.cell[0] === 10 && c.cell[1] === 10)!;
    };
    const a = centreConflict(ring);
    for (const seed of [1, 2, 3]) expect(centreConflict(shuffle(ring, seed))).toEqual(a);
    expect(centreConflict([...ring].reverse())).toEqual(a);
  });
  test('large crowded sets: every overflowing cell is counted; the listed report is bounded', () => {
    const r = rng(5);
    const lamps = Array.from({ length: 2000 }, (_, k) => lamp(`c${k}`, r() * 30, r() * 30, 30));
    const res = build(lamps);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const overflowing = res.stats!.histogram.slice(MAX_PER_CELL + 1).reduce((s, v) => s + v, 0);
    expect(res.conflictCount).toBe(overflowing);
    expect(res.conflicts.length).toBe(Math.min(overflowing, MAX_REPORTED_CONFLICTS));
    expect(res.stats!.maxRawOccupancy).toBeGreaterThan(2 * MAX_PER_CELL);
  });
});

describe('determinism', () => {
  const r = rng(9);
  const lamps = Array.from({ length: 300 }, (_, k) =>
    lamp(`id-${(k * 7919) % 1000}`, -40 + r() * 80, -30 + r() * 60, 10 + r() * 20),
  );
  test('any input order gives identical order, directory and payload bytes', () => {
    const a = accepted(lamps);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const b = accepted(shuffle(lamps, seed));
      expect(b.order).toEqual(a.order);
      expect(Buffer.from(b.directory.buffer).equals(Buffer.from(a.directory.buffer))).toBe(true);
      expect(Buffer.from(b.payload.buffer).equals(Buffer.from(a.payload.buffer))).toBe(true);
      expect(b.stats).toEqual(a.stats);
    }
    expect(a.order).toEqual([...a.order].sort());
  });
  test('cell membership equals the legacy dense grid (independent implementation) everywhere', () => {
    const index = accepted(lamps);
    const legacy = buildLightGrid(
      lamps.map(
        (l) =>
          ({
            ...l,
            y: 0,
            color: [1, 1, 1],
            candela: 1,
            profile: 0,
            baseY: 0,
            clipBelow: false,
            occlusionM: [],
          }) as ShaderLamp,
      ),
      M,
      1,
    );
    expect(legacy.overflow).toBe(0);
    let compared = 0;
    legacy.cells.forEach((list, k) => {
      const cx = legacy.originX + (k % legacy.columns),
        cz = legacy.originZ + Math.floor(k / legacy.columns);
      expect(idsAt(index, cx + 0.5, cz + 0.5).sort()).toEqual(list.map((i) => lamps[i].id).sort());
      compared++;
    });
    expect(compared).toBe(legacy.columns * legacy.rows);
    checkIntegrity(index);
  });
  test('rejection reports are order-independent too', () => {
    const crowded = [
      ...lamps,
      ...Array.from({ length: 20 }, (_, k) => lamp(`z${k}`, 0.5, 0.5, 30)),
    ];
    const a = build(crowded),
      b = build(shuffle(crowded, 4));
    expect(a.ok || b.ok).toBe(false);
    expect(b).toEqual(a);
  });
});

describe('sparsity and boundaries', () => {
  test('two widely separated lamps allocate two small pages, not the empty rectangle between them', () => {
    const index = accepted([lamp('a', 0, 0), lamp('b', 540, 430)]);
    const s = index.stats;
    expect(s.denseEquivalent.columns * s.denseEquivalent.rows).toBeGreaterThan(230_000);
    expect(s.denseEquivalent.bytes).toBeGreaterThan(14_000_000);
    expect(s.pages).toBeLessThanOrEqual(8);
    expect(s.payload.bytes).toBe(s.pages * index.chunkCells ** 2 * MAX_PER_CELL * 4);
    expect(s.payload.bytes).toBeLessThanOrEqual(8 * 1024);
    // The directory is the only rectangle-sized structure: 4 bytes per 4 × 4-cell chunk instead of
    // 64 bytes per cell, i.e. 1/256 of the dense grid (≈ 59 KB for this 13.5 × 10.8 km span).
    expect(s.directory.bytes).toBe(s.directory.columns * s.directory.rows * 4);
    expect(s.directory.bytes).toBeLessThan(s.denseEquivalent.bytes / 250);
    expect(idsAt(index, 270, 215)).toEqual([]);
    expect(idsAt(index, 0.2, 0.2)).toEqual(['a']);
    expect(idsAt(index, 540.2, 430.2)).toEqual(['b']);
    checkIntegrity(index);
  });
  test('negative coordinates, exact cell/chunk edges and corners: no gap, no duplicate', () => {
    // Lamps at a chunk corner (−8, −4 with 4-cell chunks), on a cell edge and deep in negative space.
    const lamps = [
      lamp('corner', -8, -4, 45),
      lamp('edge', -13, -9.5, 20),
      lamp('neg', -100.25, -77.75, 30),
    ];
    const index = accepted(lamps);
    for (const l of lamps) {
      const r = l.rangeM / M;
      for (let x = Math.floor(l.x - r) - 1; x <= Math.ceil(l.x + r) + 1; x += 0.25)
        for (let z = Math.floor(l.z - r) - 1; z <= Math.ceil(l.z + r) + 1; z += 0.25)
          for (const [dx, dz] of [
            [0, 0],
            [-1e-9, -1e-9],
            [1e-9, 1e-9],
          ]) {
            const px = x + dx,
              pz = z + dz;
            const expected = lamps
              .filter((q) => touches(q, Math.floor(px), Math.floor(pz)))
              .map((q) => q.id)
              .sort();
            expect(idsAt(index, px, pz).sort(), `${px},${pz}`).toEqual(expected);
          }
    }
    // The corner lamp spans four chunks around (−8, −4); each holds it in its own page.
    const chunks = new Set<string>();
    for (const [x, z] of [
      [-8.5, -4.5],
      [-7.5, -4.5],
      [-8.5, -3.5],
      [-7.5, -3.5],
    ]) {
      expect(idsAt(index, x, z)).toContain('corner');
      chunks.add(`${Math.floor(Math.floor(x) / 4)},${Math.floor(Math.floor(z) / 4)}`);
    }
    expect(chunks.size).toBe(4);
    checkIntegrity(index);
  });
  test('influence crossing several pages: an emitter far outside a page still lights its cells', () => {
    const l = lamp('wide', 2.01, 2.01, 95); // 3.8 cells: reaches pages left/right/up/down
    const index = accepted([l]);
    expect(index.stats.pages).toBeGreaterThanOrEqual(4);
    // Receivers in another chunk than the emitter.
    for (const [x, z] of [
      [5.6, 2],
      [-1.5, 2],
      [2, -1.6],
      [2, 5.7],
    ])
      expect(idsAt(index, x, z)).toEqual(['wide']);
  });
  test('empty chunks inside the directory read as the explicit empty sentinel', () => {
    const index = accepted([lamp('a', 0.5, 0.5, 5), lamp('b', 40.5, 40.5, 5)]);
    const empties = Array.from(index.directory).filter((v) => v === EMPTY_PAGE).length;
    expect(index.stats.pages).toBe(2);
    expect(empties).toBe(index.directory.length - 2);
    expect(idsAt(index, 20.5, 20.5)).toEqual([]);
    expect(idsAt(index, -500, 0)).toEqual([]);
  });
  test('chunk size changes storage, never membership', () => {
    const r = rng(3);
    const lamps = Array.from({ length: 120 }, (_, k) =>
      lamp(`k${k}`, -30 + r() * 60, -30 + r() * 60, 8 + r() * 25),
    );
    const reference = accepted(lamps, { chunkCells: 4 });
    for (const chunkCells of [1, 2, 3, 8, 10]) {
      const index = accepted(lamps, { chunkCells });
      for (let k = 0; k < 500; k++) {
        const x = -32 + r() * 64,
          z = -32 + r() * 64;
        expect(idsAt(index, x, z)).toEqual(idsAt(reference, x, z));
      }
      checkIntegrity(index);
    }
  });
});

describe('validation before allocation and device limits', () => {
  test('non-finite, oversized and duplicate inputs are rejected', () => {
    const cases: [IndexLamp[], RegExp][] = [
      [[lamp('a', Number.NaN, 0)], /non-finite position/],
      [[lamp('a', 0, Number.POSITIVE_INFINITY)], /non-finite position/],
      [[lamp('a', 1e6, 0)], /outside/],
      [[lamp('a', 0, 0, Number.NaN)], /range must be finite/],
      [[lamp('a', 0, 0, 0)], /range must be finite and > 0/],
      [[lamp('a', 0, 0, -5)], /range must be finite and > 0/],
      [[lamp('a', 0, 0, 1000)], /exceeds 100 m/],
      [[lamp('a', 0, 0), lamp('a', 3, 3)], /duplicate id/],
      [[lamp('', 0, 0)], /missing id/],
    ];
    for (const [lamps, message] of cases) {
      const r = build(lamps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toMatch(message);
    }
    expect(build([lamp('a', 0, 0)], { capacity: 32 }).ok).toBe(false);
    expect(build([lamp('a', 0, 0)], { chunkCells: 0 }).ok).toBe(false);
  });
  test('the cell-entry budget is checked before any per-cell allocation', () => {
    const r = build([lamp('a', 0, 0, 99)], { maxCellEntries: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatch(/candidate cell entries exceed 10/);
      expect(r.stats).toBeNull();
    }
    const tooMany = Object.assign([], { length: 2 ** 24 }) as IndexLamp[];
    const big = build(tooMany);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors[0]).toMatch(/exact float index range/);
  });
  test('small device limits: multi-row page atlas still resolves every cell; impossible layouts are rejected', () => {
    const r = rng(17);
    const lamps = Array.from({ length: 200 }, (_, k) =>
      lamp(`p${k}`, -20 + r() * 40, -20 + r() * 40, 20),
    );
    const wide = accepted(lamps);
    const narrow = accepted(lamps, { maxTextureSize: 8 * 4 * SLOT_TEXELS }); // 8 pages per row
    expect(narrow.stats.payload.pagesPerRow).toBe(8);
    expect(narrow.stats.pages).toBeGreaterThan(16);
    expect(narrow.stats.payload.height).toBe(Math.ceil(narrow.stats.pages / 8) * narrow.chunkCells);
    for (let k = 0; k < 1000; k++) {
      const x = -25 + r() * 50,
        z = -25 + r() * 50;
      expect(idsAt(narrow, x, z)).toEqual(idsAt(wide, x, z));
    }
    checkIntegrity(narrow);
    // Directory wider than the device allows: rejected, not allocated.
    const spread = build([lamp('a', 0, 0), lamp('b', 400, 0)], { maxTextureSize: 64 });
    expect(spread.ok).toBe(false);
    if (!spread.ok)
      expect(spread.errors[0]).toMatch(/page directory .* exceeds max texture size 64/);
    // Page atlas taller than the device allows.
    const tall = build(lamps, { maxTextureSize: 16 });
    expect(tall.ok).toBe(false);
    if (!tall.ok) expect(tall.errors.join()).toMatch(/exceeds max texture size 16/);
  });
  test('lamp atlas wraps into column blocks beyond the device height with exact indices', () => {
    const lamps: ShaderLamp[] = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      y: i + 0.5,
      z: -i,
      rangeM: 10 + i,
      color: [1, 0.5, 0.25],
      candela: 100 + i,
      profile: i % 2,
      heading: i * 0.1,
      baseY: i * 0.01,
      clipBelow: i % 3 === 0,
      occlusionM: Array.from({ length: 16 }, (_, s) => s + i),
    }));
    expect(lampLayout(20, 4096)).toEqual({ rows: 20, width: LAMP_TEXELS, height: 20 });
    const { data, width, rows } = packLampData(lamps, 16);
    expect([width, rows]).toEqual([2 * LAMP_TEXELS, 16]);
    // Shader addressing: block = i / rows, texel (block · 8 + k, i − block · rows).
    lamps.forEach((l, i) => {
      const block = Math.floor(i / rows),
        base = ((i - block * rows) * width + block * LAMP_TEXELS) * 4;
      expect([data[base], data[base + 1], data[base + 2], data[base + 3]]).toEqual(
        [l.x, l.y, l.z, l.rangeM].map(Math.fround),
      );
      expect(data[base + 7]).toBe(l.profile);
      expect(data[base + 12 + 15]).toBe(15 + i);
    });
    expect(() => lampLayout(100, 16)).toThrow(/exceed the lamp atlas limit/);
  });
});
