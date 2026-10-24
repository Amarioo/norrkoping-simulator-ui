// Lighting Phase A1: writes the generated corridor data (runtime + provenance) from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a1/vitest.config.ts write
//
// Without WRITE it only checks that the committed files equal a fresh generation (the same check runs
// in the main suite: src/lib/lighting/corridor.test.ts).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { generateCorridor } from '../../src/lib/lighting/corridorGenerator';
import { loadInputs, toFiles } from './inputs';

export const OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-a1.json',
  provenance: 'src/lib/data/streetlights-a1-provenance.json',
};

test('generate the A1 corridor data', () => {
  const input = loadInputs();
  const files = toFiles(generateCorridor(input), input);
  if (process.env.WRITE === '1') {
    fs.writeFileSync(OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(OUTPUT_FILES.provenance, files.provenance);
  }
  expect(fs.readFileSync(OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
});
