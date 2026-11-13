// Phase C2 (Vrinnevi illuminated trail): generates the trail lanterns from the pinned inputs.
//
//   $env:WRITE='1'; .\node_modules\.bin\vitest.cmd run -c scripts/trail-c2/vitest.config.ts write; $env:WRITE=$null
//
// Without WRITE it only checks that two generations are identical and that the committed files equal
// a fresh generation (byte for byte). Hashes go to ignored work/trail-c2/generate.json.
import { expect, test } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { C2_OUTPUT_FILES, generateC2, loadC2Inputs, toC2Files } from './inputs';

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
test('generate the C2 trail lanterns', () => {
  const input = loadC2Inputs();
  const out = generateC2(input);
  const files = toC2Files(out, input);
  // Input order must not matter.
  const shuffled = {
    ...input,
    source: { ...input.source, elements: [...input.source.elements].reverse() },
    existing: [...input.existing].reverse(),
  };
  const again = toC2Files(generateC2(shuffled), input);
  expect(again).toEqual(files);
  const decoded = decodeCompactSet(JSON.parse(files.runtime) as CompactSet).fixtures;
  expect(decoded.length).toBe(out.fixtures.length);
  decoded.forEach((d, i) => expect(d).toEqual(out.fixtures[i]));
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/trail-c2/data', { recursive: true });
    fs.writeFileSync(C2_OUTPUT_FILES.runtime, files.runtime);
    fs.writeFileSync(C2_OUTPUT_FILES.provenance, files.provenance);
    fs.writeFileSync(C2_OUTPUT_FILES.stats, files.stats);
  }
  fs.mkdirSync('work/trail-c2', { recursive: true });
  fs.writeFileSync(
    'work/trail-c2/generate.json',
    JSON.stringify(
      {
        counts: out.counts,
        runs: out.runs,
        bytes: { runtime: files.runtime.length, provenance: files.provenance.length, stats: files.stats.length },
        sha256: { runtime: hash(files.runtime), provenance: hash(files.provenance), stats: hash(files.stats), again: hash(again.runtime) },
      },
      null,
      1,
    ),
  );
  expect(fs.readFileSync(C2_OUTPUT_FILES.runtime, 'utf8')).toBe(files.runtime);
  expect(fs.readFileSync(C2_OUTPUT_FILES.provenance, 'utf8')).toBe(files.provenance);
  expect(fs.readFileSync(C2_OUTPUT_FILES.stats, 'utf8')).toBe(files.stats);
});
