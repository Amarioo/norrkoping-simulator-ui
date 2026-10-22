// Measurement harness, excluded from npm test. Run with scripts/step6/vitest.config.ts.
import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Mesh, InstancedMesh, Scene, BufferGeometry } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import { createCityLighting } from '../../src/lib/lighting/controller';
import { PITCH } from '../../src/lib/stadium/spec';

test('records stadium and lighting buffer allocations separately', () => {
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    scene: new Scene(),
    renderer: { info: {} } as never,
  });
  const measure = (roots: import('three').Object3D[]) => {
    const geometries = new Set<BufferGeometry>();
    const arrays = new Set<ArrayBufferLike>();
    let meshes = 0,
      triangles = 0;
    for (const root of roots)
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        meshes++;
        const g = o.geometry;
        geometries.add(g);
        triangles +=
          ((g.index?.count ?? g.getAttribute('position').count) / 3) *
          (o instanceof InstancedMesh ? o.count : 1);
        const attributes = [...Object.values(g.attributes), g.index];
        if (o instanceof InstancedMesh) attributes.push(o.instanceMatrix, o.instanceColor);
        for (const a of attributes) {
          if (!a) continue;
          arrays.add(('array' in a ? a.array : a.data.array).buffer);
        }
      });
    return {
      meshes,
      geometries: geometries.size,
      triangles,
      bufferBytes: [...arrays].reduce((sum, a) => sum + a.byteLength, 0),
    };
  };
  const report = {
    stadium: measure([stadium.group, stadium.turf]),
    lighting: measure([lighting.group]),
    lampTextureBytes: lighting.uniforms.cityLampTex.value.image.data.byteLength,
    gridTextureBytes: lighting.uniforms.cityGridTex.value.image.data.byteLength,
    // paintTurf() uses 10 px/m, RGBA8; include mipmaps as an estimate, not driver allocation.
    turfTextureEstimatedBytes:
      (Math.round((PITCH.turf.x1 - PITCH.turf.x0) * 10) *
        Math.round((PITCH.turf.z1 - PITCH.turf.z0) * 10) *
        4 *
        4) /
      3,
    turfTextureNote:
      'Browser canvas excluded from Node buffers; RGBA8 including estimated mipmaps, not driver allocation.',
    stadiumReport: stadium.report,
    lightingState: lighting.describe(),
  };
  mkdirSync('work/step6/perf', { recursive: true });
  writeFileSync('work/step6/perf/resources.json', JSON.stringify(report, null, 2) + '\n');
  lighting.dispose();
  stadium.dispose();
});
