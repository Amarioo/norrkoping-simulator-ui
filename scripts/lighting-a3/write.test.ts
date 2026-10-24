// Lighting Phase A3: writes the generated corridor data (runtime + provenance) from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts write; Remove-Item Env:WRITE
//
// Without WRITE it only checks that the committed files equal a fresh generation (the same check runs
// in the main suite: src/lib/lighting/corridorA3.test.ts).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { A3_OUTPUT_FILES, generateA3, loadA3Inputs, toA3Files } from './inputs';

test('generate the A3 corridor data', () => {
  const input = loadA3Inputs();
  const out = generateA3(input);
  const files = toA3Files(out, input);
  if (process.env.WRITE === '1') {
    fs.writeFileSync(A3_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(A3_OUTPUT_FILES.provenance, files.provenance);
  }
  console.log(JSON.stringify(out.counts));
  expect(fs.readFileSync(A3_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(A3_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
});
