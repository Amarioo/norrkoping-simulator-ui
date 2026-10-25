// Lighting Phase L2a: generates the citywide street fixtures from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l2/vitest.config.ts write; $env:WRITE=$null
//
// Without WRITE it only checks that the committed files equal a fresh generation (byte for byte).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { L2_OUTPUT_FILES, generateL2, loadL2Inputs, toL2Files } from './inputs';

test('generate the L2a street fixtures', () => {
  const inputs = loadL2Inputs();
  const t0 = performance.now();
  const out = generateL2(inputs);
  const ms = performance.now() - t0;
  const files = toL2Files(out, inputs);
  // Deterministic: a second run gives the same bytes.
  expect(toL2Files(generateL2(inputs), inputs)).toEqual(files);
  // The compact runtime decodes to the generator records (heading quantised to 1e-6 rad).
  const decoded = decodeCompactSet(JSON.parse(files.runtime) as CompactSet).fixtures;
  expect(decoded.length).toBe(out.fixtures.length);
  decoded.forEach((d, i) => {
    const f = out.fixtures[i];
    expect({ ...d, heading: null }).toEqual({ ...f, heading: null });
    if (f.heading === null) expect(d.heading).toBeNull();
    else expect(Math.abs(d.heading! - f.heading)).toBeLessThanOrEqual(5e-7);
  });
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/lighting-city-l2/data', { recursive: true });
    fs.writeFileSync(L2_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(L2_OUTPUT_FILES.provenance, files.provenance);
  }
  fs.mkdirSync('work/lighting-city-l2', { recursive: true });
  fs.writeFileSync(
    'work/lighting-city-l2/generate.json',
    JSON.stringify({ ms, counts: out.counts, runtimeBytes: files.runtime.length, provenanceBytes: files.provenance.length }, null, 1),
  );
  expect(fs.readFileSync(L2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(L2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
});
