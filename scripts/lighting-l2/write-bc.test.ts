// Lighting Phase L2bc: generates paths, squares, junction ranges and motorways from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2/vitest.config.ts write-bc; $env:WRITE=$null
//
// Without WRITE it only checks that the committed files equal a fresh generation (byte for byte).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { L2BC_OUTPUT_FILES, generateL2bc, loadL2bcInputs, toL2bcFiles } from './inputs';

test('generate the L2bc fixtures', () => {
  const inputs = loadL2bcInputs();
  const t0 = performance.now();
  const out = generateL2bc(inputs);
  const ms = performance.now() - t0;
  const files = toL2bcFiles(out, inputs);
  expect(toL2bcFiles(generateL2bc(inputs), inputs)).toEqual(files);
  const decoded = decodeCompactSet(JSON.parse(files.runtime) as CompactSet).fixtures;
  expect(decoded.length).toBe(out.fixtures.length);
  decoded.forEach((d, i) => {
    const f = out.fixtures[i];
    expect({ ...d, heading: null }).toEqual({ ...f, heading: null });
  });
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/lighting-city-l2bc/data', { recursive: true });
    fs.writeFileSync(L2BC_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(L2BC_OUTPUT_FILES.provenance, files.provenance);
  }
  fs.mkdirSync('work/lighting-city-l2bc', { recursive: true });
  fs.writeFileSync(
    'work/lighting-city-l2bc/generate.json',
    JSON.stringify({ ms, counts: out.counts, runtimeBytes: files.runtime.length, provenanceBytes: files.provenance.length }, null, 1),
  );
  expect(fs.readFileSync(L2BC_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(L2BC_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
});
