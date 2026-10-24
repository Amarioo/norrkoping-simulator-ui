// Lighting Phase A3: CPU timings (Node, this machine) of generation, registry construction and the
// pre-upload pipeline (validation + emitters + sparse index + lamp packing) for the accepted A2 state
// (pilot + A1 + A2) and the combined set (pilot + A1 + A2 + A3). Alternating, warm, medians of 25 runs.
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-a3/vitest.config.ts timing
//
// Prints one JSON line; optionally writes it to $env:TIMING_OUT. Timings vary between machines.
import { test } from 'vitest';
import fs from 'node:fs';
import { terrain } from '../../src/lib/terrain';
import {
  a2RuntimeLightingRegistry,
  runtimeLightingRegistry,
} from '../../src/lib/lighting/controller';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';
import { generateA3, loadA3Inputs } from './inputs';

test('timings', () => {
  const input = loadA3Inputs();
  const runs: Record<string, number[]> = {
    generateA3: [],
    registryA2State: [],
    registryCombined: [],
    prepareA2State: [],
    prepareCombined: [],
  };
  const time = (k: string, f: () => unknown) => {
    const s = performance.now();
    f();
    runs[k].push(performance.now() - s);
  };
  for (let i = 0; i < 30; i++) {
    const order = i % 2 ? ['A2State', 'Combined'] : ['Combined', 'A2State'];
    for (const which of order) {
      const reg = which === 'A2State' ? a2RuntimeLightingRegistry : runtimeLightingRegistry;
      let r: ReturnType<typeof reg> | null = null;
      time(`registry${which}`, () => (r = reg(terrain)));
      time(`prepare${which}`, () => prepareStreetLighting(r!, terrain, { maxTextureSize: 2048 }));
    }
    time('generateA3', () => generateA3(input));
  }
  const median = (v: number[]) => {
    const w = v.slice(5).sort((a, b) => a - b); // first 5 = warm-up
    return Number(w[Math.floor(w.length / 2)].toFixed(3));
  };
  const out = Object.fromEntries(Object.entries(runs).map(([k, v]) => [`${k}Ms`, median(v)]));
  const line = JSON.stringify({ node: process.version, runs: 25, ...out });
  console.log(line);
  if (process.env.TIMING_OUT) fs.writeFileSync(process.env.TIMING_OUT, line + '\n');
});
