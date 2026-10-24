// Lighting Phase A2: writes the generated corridor data (runtime + provenance) from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a2/vitest.config.ts write; Remove-Item Env:WRITE
//
// Without WRITE it only checks that the committed files equal a fresh generation (the same check runs
// in the main suite: src/lib/lighting/corridorA2.test.ts).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import { A2_OUTPUT_FILES, generateA2, loadA2Inputs, toA2Files } from './inputs';

test('generate the A2 corridor data', () => {
  const input = loadA2Inputs();
  const out = generateA2(input);
  const files = toA2Files(out, input);
  if (process.env.WRITE === '1') {
    fs.writeFileSync(A2_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(A2_OUTPUT_FILES.provenance, files.provenance);
  }
  console.log(JSON.stringify(out.counts));
  expect(fs.readFileSync(A2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(A2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
});
