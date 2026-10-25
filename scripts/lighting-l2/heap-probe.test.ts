// Lighting Phase L2: where does the JS heap of a 25 000-lamp set go? (diagnostic, prints only)
import { test } from 'vitest';
import fs from 'node:fs';
import { Scene, type WebGLRenderer } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import { createCityLighting, runtimeLightingRegistry } from '../../src/lib/lighting/controller';
import { corridorRegistry, mergeRegistries } from '../../src/lib/lighting/corridorRegistry';
import { prepareStreetLighting } from '../../src/lib/lighting/streetLighting';

const gc = (globalThis as { gc?: () => void }).gc!;
const heap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed / 1e6;
};
test('heap composition', () => {
  const keep: unknown[] = [];
  const h0 = heap();
  const data = JSON.parse(fs.readFileSync('work/lighting-city-l1/l0-stress-set.json', 'utf8'));
  const h1 = heap();
  const reg = mergeRegistries(
    runtimeLightingRegistry(terrain),
    corridorRegistry(data, terrain.data.reference, {
      dataset: 'l1-stress-set',
      generator: { script: 's', version: 'lighting-l1-stress-v0' },
    }),
  );
  keep.push(reg);
  const h2 = heap();
  const prepared = prepareStreetLighting(reg, terrain, { maxTextureSize: 16384 });
  keep.push(prepared);
  const h3 = heap();
  const stadium = createIdrottsparken(terrain);
  const renderer = { toneMappingExposure: 1, info: { programs: [] }, capabilities: { maxTextureSize: 16384 } } as unknown as WebGLRenderer;
  const l = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry: reg, strict: true });
  keep.push(l);
  const h4 = heap();
  fs.writeFileSync('work/lighting-city-l1/heap-probe.json', JSON.stringify({ gcAvailable: !!gc, json: h1 - h0, registry: h2 - h1, prepared: h3 - h2, controller: h4 - h3, ok: (prepared as { ok: boolean }).ok }, null, 1));
  console.log('written');
  console.log(keep.length, data.fixtures.length);
});
