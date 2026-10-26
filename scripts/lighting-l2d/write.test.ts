// Lighting Phase L2d: generates the site-lighting fixtures from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2d/vitest.config.ts write; $env:WRITE=$null
//
// Without WRITE it only checks that two generations are identical and that the committed files equal
// a fresh generation (byte for byte). Timing goes to ignored work/lighting-city-l2d/generate.json.
import { expect, test } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { L2D_OUTPUT_FILES, generateL2d, loadL2dInputs, toL2dFiles } from './inputs';

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
test('generate the L2d site-lighting fixtures', () => {
  const inputs = loadL2dInputs();
  const t0 = performance.now();
  const out = generateL2d(inputs);
  const ms = performance.now() - t0;
  const files = toL2dFiles(out, inputs);
  const again = toL2dFiles(generateL2d(inputs), inputs);
  expect(again).toEqual(files);
  const decoded = decodeCompactSet(JSON.parse(files.runtime) as CompactSet).fixtures;
  expect(decoded.length).toBe(out.fixtures.length);
  decoded.forEach((d, i) => expect(d).toEqual(out.fixtures[i]));
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/lighting-city-l2d/data', { recursive: true });
    fs.writeFileSync(L2D_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(L2D_OUTPUT_FILES.provenance, files.provenance);
    fs.writeFileSync(L2D_OUTPUT_FILES.stats, files.stats);
  }
  fs.mkdirSync('work/lighting-city-l2d', { recursive: true });
  fs.writeFileSync(
    'work/lighting-city-l2d/generate.json',
    JSON.stringify(
      {
        ms,
        counts: out.counts,
        bytes: { runtime: files.runtime.length, provenance: files.provenance.length, stats: files.stats.length },
        sha256: { runtime: hash(files.runtime), provenance: hash(files.provenance), stats: hash(files.stats), again: hash(again.runtime) },
      },
      null,
      1,
    ),
  );
  expect(fs.readFileSync(L2D_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(L2D_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  expect(fs.readFileSync(L2D_OUTPUT_FILES.stats, 'utf8')).toBe(files.stats);
});
