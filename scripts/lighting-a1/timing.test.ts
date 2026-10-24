// Lighting Phase A1: CPU timings (Node, this machine) of generation and of the pre-upload pipeline
// (validation + emitters + sparse index + lamp packing) for the pilot and the combined set.
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a1/vitest.config.ts timing
//
// Prints medians of 15 runs; not written to the docs automatically (timings vary between machines).
import { test } from 'vitest';
import { terrain } from '../../src/lib/terrain';
// Phase A2: 'combined' here is the A1 state (pilot + A1); A2 timings: scripts/lighting-a2/timing.test.ts.
import {
  a1RuntimeLightingRegistry as runtimeLightingRegistry,
  pilotLightingRegistry,
} from '../../src/lib/lighting/controller';
import { generateCorridor } from '../../src/lib/lighting/corridorGenerator';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';
import { loadInputs } from './inputs';

const median = (f: () => void, n = 15) => {
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    f();
    t.push(performance.now() - s);
  }
  return Number(t.sort((a, b) => a - b)[Math.floor(n / 2)].toFixed(2));
};
test('timings', () => {
  const input = loadInputs();
  const prep = (r: ReturnType<typeof pilotLightingRegistry>) => () =>
    prepareStreetLighting(r, terrain, { maxTextureSize: 2048 });
  console.log(
    JSON.stringify({
      generateA1Ms: median(() => generateCorridor(input)),
      preparePilotMs: median(prep(pilotLightingRegistry(terrain))),
      prepareCombinedMs: median(prep(runtimeLightingRegistry(terrain))),
    }),
  );
});
