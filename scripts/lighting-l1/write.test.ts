// Lighting Phase L1 harness (not part of `npm test`):
//
//   .\node_modules\.bin\vitest.cmd run -c scripts/lighting-l1/vitest.config.ts
//
// 1. Builds the stress set twice (must be byte-identical) and writes it to ignored
//    work/lighting-city-l1/l0-stress-set.json (≈ 25 000 fixtures; test load only).
// 2. Loads runtime set + stress set through the real controller (Node, fake renderer) and writes the
//    deterministic scale figures to docs/lighting-city-l1/data/scale.json (only with WRITE=1; without
//    it the committed file must equal a fresh run) and the measured CPU timings to
//    work/lighting-city-l1/timing.json.
import { expect, test } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { Scene, Vector3, type WebGLRenderer } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import { createCityLighting, runtimeLightingRegistry } from '../../src/lib/lighting/controller';
import { corridorRegistry, mergeRegistries } from '../../src/lib/lighting/corridorRegistry';
import { SCENE_REFERENCE, swerefToScene } from '../../src/lib/geo/sweref99tm.js';
import { STRESS_IDENTITY, STRESS_OUTPUT, buildStressSet } from './stress-set';

const SCALE = 'docs/lighting-city-l1/data/scale.json';
const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
/** Street-level and overview poses (EPSG:3006; camera 2 m above ground, or `h` metres). */
export const POSES: Record<string, { e: number; n: number; h?: number }> = {
  drottninggatan: { e: 568880, n: 6495420 },
  kungstorget: { e: 568445, n: 6495640 },
  soderstaden: { e: 569300, n: 6494600 },
  hageby: { e: 571050, n: 6492700 },
  klockaretorpet: { e: 566800, n: 6493300 },
  ingelsta: { e: 567500, n: 6498300 },
  overviewCentre: { e: 568900, n: 6495000, h: 600 },
};

test('stress set: deterministic, written to ignored scratch', () => {
  const a = JSON.stringify(buildStressSet());
  const b = JSON.stringify(buildStressSet());
  expect(b).toBe(a);
  fs.mkdirSync('work/lighting-city-l1', { recursive: true });
  fs.writeFileSync(STRESS_OUTPUT, a + '\n');
  console.log(STRESS_OUTPUT, a.length, sha(a + '\n'));
});

test('scale figures of runtime + stress set through the real controller', () => {
  const t0 = performance.now();
  const raw = fs.readFileSync(STRESS_OUTPUT, 'utf8');
  const t1 = performance.now();
  const data = JSON.parse(raw);
  const t2 = performance.now();
  const registry = mergeRegistries(
    runtimeLightingRegistry(terrain),
    corridorRegistry(data, terrain.data.reference, STRESS_IDENTITY),
  );
  const t3 = performance.now();
  const figures: Record<string, unknown> = {};
  const timing: Record<string, unknown> = {
    host: { cpu: os.cpus()[0]?.model, node: process.versions.node },
    readMs: t1 - t0,
    parseMs: t2 - t1,
    registryMs: t3 - t2,
  };
  for (const maxTextureSize of [16384, 4096]) {
    const stadium = createIdrottsparken(terrain);
    const renderer = {
      toneMappingExposure: 1,
      info: { programs: [] },
      capabilities: { maxTextureSize },
    } as unknown as WebGLRenderer;
    const c0 = performance.now();
    const lighting = createCityLighting({ terrain, stadium, renderer, scene: new Scene(), registry, strict: true });
    const createMs = performance.now() - c0;
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    const d = lighting.describe().streetLighting;
    const poses: Record<string, unknown> = {};
    const gatherMs: number[] = [];
    for (const [name, p] of Object.entries(POSES)) {
      const [x, z] = swerefToScene(SCENE_REFERENCE, p.e, p.n);
      const y = terrain.groundHeight(x, z) + (p.h ?? 2) / SCENE_REFERENCE.metresPerUnit;
      const g0 = performance.now();
      lighting.update(0.016, { position: new Vector3(x, y, z) } as never, 900);
      gatherMs.push(performance.now() - g0);
      const v = lighting.describe().streetLighting.visuals!;
      expect(v.droppedLastGather, name).toBe(0);
      poses[name] = {
        detailInstances: v.detailInstances,
        detailTriangles: v.detailTriangles,
        drawnMeshes: (() => {
          let k = 0;
          lighting.group.traverse((o) => {
            if ((o as { isInstancedMesh?: boolean }).isInstancedMesh && o.visible) k++;
          });
          return k;
        })(),
      };
    }
    // 400 random cameras over the whole map: no gathered instance may ever exceed its capacity.
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 400; k++) {
      const x = -290 + rnd() * 545, z = -265 + rnd() * 430;
      lighting.update(0.016, { position: new Vector3(x, terrain.groundHeight(x, z) + rnd() * 4, z) } as never, 900);
      expect(lighting.describe().streetLighting.visuals!.droppedLastGather).toBe(0);
    }
    const visuals = lighting.describe().streetLighting.visuals!;
    figures[`maxTextureSize${maxTextureSize}`] = {
      status: d.status,
      fixtures: d.emitters,
      rollouts: d.rollouts,
      index: d.index && {
        cellEntries: d.index.cellEntries,
        nonEmptyCells: d.index.nonEmptyCells,
        maxRawOccupancy: d.index.maxRawOccupancy,
        overflowCells: d.index.overflowCells,
        histogram: d.index.histogram,
        pages: d.index.pages.allocated,
        directory: d.index.directory,
        payload: d.index.payload,
        list: d.index.list,
        denseEquivalent: d.index.denseEquivalent,
      },
      textures: d.textures,
      bytes: d.bytes,
      visuals: {
        instancedMeshes: visuals.instancedMeshes,
        instanceCapacity: visuals.instances,
        tiles: visuals.tiles,
        halos: visuals.halos,
        instanceBytes: visuals.instanceBytes,
        geometryBytes: visuals.geometryBytes,
      },
      poses,
    };
    timing[`maxTextureSize${maxTextureSize}`] = {
      createControllerMs: createMs,
      prepareMs: d.timings.buildMs,
      gatherMs,
    };
    lighting.dispose();
    stadium.dispose();
  }
  const out = {
    note: 'Lighting Phase L1: runtime set (273) + stress set (L0 stations at an approximate kerb), through createCityLighting with a fake renderer in Node. Deterministic figures only; CPU timings are in work/lighting-city-l1/timing.json (machine-dependent).',
    stressSet: { file: STRESS_OUTPUT, bytes: Buffer.byteLength(raw), sha256: sha(raw), fixtures: data.fixtures.length, counts: data.meta.counts },
    poses: POSES,
    figures,
  };
  const text = JSON.stringify(out, null, 2) + '\n';
  if (process.env.WRITE === '1') {
    fs.mkdirSync('docs/lighting-city-l1/data', { recursive: true });
    fs.writeFileSync(SCALE, text);
  }
  fs.writeFileSync('work/lighting-city-l1/timing.json', JSON.stringify(timing, null, 2) + '\n');
  console.log(JSON.stringify({ figures: out.figures, timing }, null, 1).slice(0, 6000));
  expect(fs.readFileSync(SCALE, 'utf8')).toBe(text);
});
