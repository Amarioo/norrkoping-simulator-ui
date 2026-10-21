/** Step 5: network build time with and without the breakline patches (same process, same data). */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { LAYER_BUILDERS } from '../../src/lib/cityMesh';
import { terrain } from '../../src/lib/terrain';
it('times the network with and without patches', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const surface = terrain.surface as any, patches = surface.patches;
  const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
  const out: Record<string, number[]> = { withPatches: [], withoutPatches: [] };
  time(LAYER_BUILDERS.buildNetwork);
  for (let i = 0; i < 3; i++) {
    surface.patches = patches; out.withPatches.push(time(LAYER_BUILDERS.buildNetwork));
    surface.patches = null; out.withoutPatches.push(time(LAYER_BUILDERS.buildNetwork));
  }
  surface.patches = patches;
  writeFileSync('work/step5/perf-network.json', JSON.stringify(out));
});
