// Lighting Phase L0: writes the review outputs from the pinned extract.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-city/vitest.config.ts write; $env:WRITE=$null
//
// Without WRITE it only checks that the committed files equal a fresh build (byte for byte).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { L0_OUTPUT_FILES, buildL0 } from './build';

test('build the L0 lighting map and data', () => {
  const t0 = performance.now();
  const out = buildL0();
  const again = buildL0();
  const keys = Object.keys(L0_OUTPUT_FILES) as (keyof typeof L0_OUTPUT_FILES)[];
  for (const k of keys) expect(again.files[k], `${k} deterministic`).toBe(out.files[k]);
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/lighting-city-l0/data', { recursive: true });
    for (const k of keys) fs.writeFileSync(L0_OUTPUT_FILES[k], out.files[k]);
  }
  console.log(
    JSON.stringify({
      ms: Math.round((performance.now() - t0) / 2),
      stations: out.stats.stations,
      byStatus: out.stats.byStatus,
      litKmByEvidence: out.stats.litKmByEvidence,
      norrtull: out.stats.norrtull,
      capacity: { ok: out.capacity.ok, stats: out.capacity.stats, conflicts: out.capacity.conflictCount },
      satellite: { rho: out.satellite.spearmanRho, sat: out.satellite.saturatedPixels, n: out.satellite.pixels, bmd: out.satellite.brightButModelDark, dml: out.satellite.darkButModelLit },
      sizes: Object.fromEntries(keys.map((k) => [k, out.files[k].length])),
    }, null, 1),
  );
  for (const k of keys) expect(fs.readFileSync(L0_OUTPUT_FILES[k], 'utf8'), k).toBe(out.files[k]);
});
