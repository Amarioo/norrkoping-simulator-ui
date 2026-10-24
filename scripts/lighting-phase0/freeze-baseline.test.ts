// Freezes the accepted Step 6.1b lighting output (commit bf5f726) as an independent parity reference.
//
//   FREEZE=1 node_modules/.bin/vitest run -c scripts/lighting-phase0/vitest.config.ts freeze-baseline
//
// Run ONCE against the unmodified baseline code. The written file is checked in and the Phase 0
// parity tests (src/lib/lighting/phase0.test.ts) compare the new registry/sparse index with it.
// Re-running against changed code would only reproduce the new behaviour; it is disabled unless
// FREEZE=1 and refuses to overwrite an existing file.
import { test } from 'vitest';
import fs from 'node:fs';
import { InstancedMesh, Matrix4, Scene } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import { createCityLighting } from '../../src/lib/lighting/controller';
import { FIXTURES } from '../../src/lib/lighting/fixtures';

const OUT = 'src/lib/lighting/testdata/pilot-baseline.json';

test.runIf(process.env.FREEZE === '1')('freeze baseline lighting output', () => {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} exists; refusing to overwrite a frozen baseline`);
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    scene: new Scene(),
    renderer: { toneMappingExposure: 1, info: { programs: [] } } as never,
  });
  const ids = FIXTURES.map((f) => f.id);
  const lampData = lighting.uniforms.cityLampTex.value.image.data as Float32Array;
  const lampRows: Record<string, number[]> = {};
  ids.forEach((id, i) => (lampRows[id] = Array.from(lampData.subarray(i * 32, i * 32 + 32))));
  const g = lighting.grid;
  const cells: Record<string, string[]> = {};
  g.cells.forEach((list, k) => {
    if (!list.length) return;
    const cx = g.originX + (k % g.columns) * g.cell,
      cz = g.originZ + Math.floor(k / g.columns) * g.cell;
    cells[`${cx},${cz}`] = list.map((i) => ids[i]);
  });
  const visuals: Record<string, unknown>[] = [];
  const m = new Matrix4();
  lighting.group.traverse((o) => {
    if (!(o instanceof InstancedMesh)) return;
    const instances: number[][] = [];
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      instances.push(Array.from(m.elements));
    }
    visuals.push({
      parent: o.parent?.name,
      material: o.material.type,
      vertices: o.geometry.getAttribute('position').count,
      count: o.count,
      fixtureIds: o.userData.fixtureIds ?? null,
      instances,
      colors: o.instanceColor ? Array.from(o.instanceColor.array as Float32Array) : null,
    });
  });
  const d = lighting.describe();
  const out = {
    note: 'Frozen output of the accepted Step 6.1b lighting implementation (UI commit bf5f726), before Lighting Phase 0. Scene units; lamp rows are the packed RGBA32F texture rows (32 floats per lamp) of cityLights.packLamps.',
    commit: 'bf5f7263390794a625ea273ef9c7e77c6e494498',
    frozen: new Date().toISOString(),
    fixtureOrder: ids,
    lampRows,
    grid: {
      originX: g.originX,
      originZ: g.originZ,
      cell: g.cell,
      columns: g.columns,
      rows: g.rows,
      overflow: g.overflow,
      maxPerCell: d.grid.maxPerCell,
      gridTextureBytes: (lighting.uniforms.cityGridTex.value.image.data as Float32Array).byteLength,
      lampTextureBytes: lampData.byteLength,
      cells,
    },
    visuals,
  };
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  lighting.dispose();
  stadium.dispose();
});
