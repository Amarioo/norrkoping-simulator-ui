// Lighting Phase 0: synthetic citywide load for sizing the sparse index. NOT a lamp inventory and
// never rendered: hypothetical emitters every pilot-type spacing along the centreline of each OSM
// lit=yes way in the pinned Step 6.2 research snapshot (work/step62/osm-research.json, base
// 2026-10-23T09:05:06Z; hash in docs/step62/evidence/source-manifest.json), with the pilot type
// ranges. Real fixture positions, sides, staggering and ranges are unknown (municipal register gap).
//
//   node_modules/.bin/vitest run -c scripts/lighting-phase0/vitest.config.ts synthetic-city
//
// Writes docs/lighting-phase0/measurements/synthetic-city.json.
import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { geodeticToScene, sceneToSweref, SCENE_REFERENCE } from '../../src/lib/geo/sweref99tm.js';
import { buildLightIndex, type IndexLamp } from '../../src/lib/lighting/lightIndex';

const SOURCE = 'work/step62/osm-research.json';
const M = 25;
const ROAD = new Set([
  'primary',
  'secondary',
  'tertiary',
  'primary_link',
  'secondary_link',
  'tertiary_link',
  'trunk',
  'trunk_link',
]);
const MINOR = new Set(['residential', 'living_street', 'unclassified', 'service']);
const PATH = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway']);
const typeOf = (h: string) =>
  ROAD.has(h)
    ? { spacingM: 30, rangeM: 30 }
    : MINOR.has(h)
      ? { spacingM: 27, rangeM: 24 }
      : PATH.has(h)
        ? { spacingM: 22, rangeM: 16 }
        : null;
// Supported map envelope in scene units (docs/step62/coverage-audit.md), E/N → scene.
const unit = SCENE_REFERENCE.metresPerUnit * SCENE_REFERENCE.gridScaleFactor;
const X0 = (561804.869 - 569030) / unit,
  X1 = (575355.539 - 569030) / unit,
  Z0 = (6494989 - 6501805.721) / unit,
  Z1 = (6494989 - 6490994.115) / unit;

test.runIf(fs.existsSync(SOURCE))('size the sparse index for a synthetic citywide load', () => {
  const raw = fs.readFileSync(SOURCE);
  const osm = JSON.parse(raw.toString('utf8')) as {
    osm3s: { timestamp_osm_base: string };
    elements: {
      type: string;
      id: number;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
    }[];
  };
  const lamps: IndexLamp[] = [];
  let ways = 0,
    skippedClass = 0;
  for (const w of osm.elements) {
    if (w.type !== 'way' || w.tags?.lit !== 'yes' || !w.geometry) continue;
    const t = typeOf(w.tags.highway ?? '');
    if (!t) {
      skippedClass++;
      continue;
    }
    ways++;
    const pts = w.geometry.map((g) => geodeticToScene(SCENE_REFERENCE, g.lat, g.lon));
    let carried = t.spacingM / M / 2,
      k = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1],
        [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      let s = carried;
      for (; s <= len; s += t.spacingM / M, k++) {
        const x = ax + ((bx - ax) * s) / len,
          z = az + ((bz - az) * s) / len;
        if (x >= X0 && x <= X1 && z >= Z0 && z <= Z1)
          lamps.push({ id: `synthetic:way/${w.id}:s${k}`, x, z, rangeM: t.rangeM });
      }
      carried = s - len;
    }
  }
  const runs: Record<string, unknown>[] = [];
  let reference = '';
  for (const chunkCells of [1, 2, 4, 8, 10]) {
    const t0 = performance.now();
    const r = buildLightIndex(lamps, { metresPerUnit: M, maxTextureSize: 16384, chunkCells });
    const ms = performance.now() - t0;
    const stats = r.ok ? r.index.stats : r.stats!;
    runs.push({
      chunkCells,
      chunkMetres: chunkCells * M,
      accepted: r.ok,
      buildMs: Number(ms.toFixed(1)),
      pages: stats.pages,
      payloadBytes: stats.payload.bytes,
      payloadTexture: [stats.payload.width, stats.payload.height],
      directoryBytes: stats.directory.bytes,
      directoryTexture: [stats.directory.columns, stats.directory.rows],
      pageFill: Number(
        (stats.nonEmptyCells / Math.max(1, stats.pages * chunkCells * chunkCells)).toFixed(3),
      ),
    });
    if (chunkCells === 4) {
      // Same input, shuffled: identical outcome (accepted bytes or rejection report).
      const shuffled = [...lamps].reverse();
      const again = buildLightIndex(shuffled, {
        metresPerUnit: M,
        maxTextureSize: 16384,
        chunkCells,
      });
      expect(JSON.stringify(again)).toBe(JSON.stringify(r));
      reference = createHash('sha256')
        .update(JSON.stringify(r.ok ? r.index.stats : r))
        .digest('hex');
    }
  }
  const r4 = buildLightIndex(lamps, { metresPerUnit: M, maxTextureSize: 16384, chunkCells: 4 });
  const stats = r4.ok ? r4.index.stats : r4.stats!;
  const conflicts = r4.ok ? [] : r4.conflicts;
  const toEN = (x: number, z: number) =>
    sceneToSweref(SCENE_REFERENCE, x, z).map((v: number) => Number(v.toFixed(1)));
  const report = {
    note: 'SYNTHETIC LOAD for index sizing only: hypothetical centreline emitters along OSM lit=yes ways at pilot spacing/range. Not a fixture inventory; not rendered; positions, sides, staggering and photometry of real lamps are unknown.',
    source: {
      file: SOURCE,
      sha256: createHash('sha256').update(raw).digest('hex'),
      osmBase: osm.osm3s.timestamp_osm_base,
    },
    rules: {
      road: { spacingM: 30, rangeM: 30 },
      minor: { spacingM: 27, rangeM: 24 },
      path: { spacingM: 22, rangeM: 16 },
      clip: 'supported-map envelope (rectangle)',
    },
    ways,
    waysOfOtherClasses: skippedClass,
    lamps: lamps.length,
    cellEntries: stats.cellEntries,
    nonEmptyCells: stats.nonEmptyCells,
    histogram: stats.histogram,
    maxRawOccupancy: stats.maxRawOccupancy,
    overflowCells: stats.overflowCells,
    denseEquivalent: stats.denseEquivalent,
    lampTextureBytes: lamps.length * 128,
    byChunkSize: runs,
    determinismSha256: reference,
    conflictSample: conflicts.slice(0, 12).map((c) => ({
      cell: c.cell,
      centreEN: toEN(...c.centre),
      raw: c.raw.length,
      ways: [...new Set(c.raw.map((id) => id.split(':')[1]))].length,
    })),
  };
  fs.mkdirSync('docs/lighting-phase0/measurements', { recursive: true });
  fs.writeFileSync(
    'docs/lighting-phase0/measurements/synthetic-city.json',
    JSON.stringify(report, null, 1) + '\n',
  );
  console.log(
    JSON.stringify(
      { lamps: lamps.length, overflow: stats.overflowCells, max: stats.maxRawOccupancy, runs },
      null,
      1,
    ),
  );
});
