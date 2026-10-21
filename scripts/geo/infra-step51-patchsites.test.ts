/**
 * Step 5.1: cross-section issues lying on breakline patches, as a SITES file for infra-step51-measure.test.ts
 * (measured on the Step 5 baseline too: is a crease on a patch new, or measured relief kept honestly?).
 * Writes OUT (default work/step51/patch-sites.json).
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { crossSections } from '../../src/lib/infraDiagnostics';
import { terrain } from '../../src/lib/terrain';

it('lists creases on patches', () => {
  const candidates = crossSections()
    .filter((i) => terrain.surface!.patchedAt(i.x, i.z))
    .map((i) => {
      const [E, N] = terrain.toSweref(i.x, i.z);
      return { kind: 'cross-section', E: Math.round(E), N: Math.round(N), way: i.way, drawn: +i.value.toFixed(3) };
    });
  writeFileSync(process.env.OUT ?? 'work/step51/patch-sites.json', JSON.stringify({ candidates }));
});
