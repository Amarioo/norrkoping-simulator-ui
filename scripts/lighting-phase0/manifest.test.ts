// Lighting Phase 0: pinned-input manifest and compact registry evidence for the 105-fixture pilot.
//
//   node_modules/.bin/vitest run -c scripts/lighting-phase0/vitest.config.ts manifest
//
// Writes docs/lighting-phase0/measurements/registry-manifest.json (input SHA-256 / git blob IDs,
// output hashes, counts, crosswalk, explicit-unlit exclusions) and
// docs/lighting-phase0/evidence/pilot-registry.json (one compact line of provenance per fixture).
// src/lib/lighting/phase0.test.ts fails when the runtime output no longer matches the manifest.
import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Scene } from 'three';
import { terrain } from '../../src/lib/terrain';
import { createIdrottsparken } from '../../src/lib/stadium/idrottsparken';
import { createCityLighting, pilotLightingRegistry } from '../../src/lib/lighting/controller';
import { FIXTURE_TYPES } from '../../src/lib/lighting/fixtures';
import {
  attachProvenance,
  validateRegistry,
  type PilotProvenance,
} from '../../src/lib/lighting/registry';
import provenanceData from '../../src/lib/data/streetlights-provenance.json';
import source from '../data/norrkoping-lighting-source.json';

const INPUTS = [
  'src/lib/data/streetlights.json',
  'src/lib/data/streetlights-provenance.json',
  'scripts/data/norrkoping-lighting-source.json',
  'src/lib/data/norrkoping-map.json',
  'src/lib/data/terrain.json',
  'src/lib/data/bridge-profiles.json',
  'scripts/step6/import-streetlights.mjs',
  'scripts/step6/pilots.mjs',
  'src/lib/geo/sweref99tm.js',
];
const CODE = [
  'src/lib/lighting/registry.ts',
  'src/lib/lighting/streetLighting.ts',
  'src/lib/lighting/lightIndex.ts',
  'src/lib/lighting/cityLights.ts',
  'src/lib/lighting/fixtures.ts',
  'src/lib/lighting/controller.ts',
];
const file = (path: string) => {
  const bytes = fs.readFileSync(path);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  };
};
const sha = (a: Float32Array) =>
  createHash('sha256')
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex');

/** OSM ways explicitly tagged lit=no in each pilot snapshot (no fixture may derive from them). */
export function pilotUnlitWays() {
  const out: Record<string, string[]> = {};
  for (const [pilot, p] of Object.entries(
    source.pilots as unknown as Record<
      string,
      { elements: { type: string; id: number; tags?: Record<string, string> }[] }
    >,
  ))
    out[pilot] = p.elements
      .filter((e) => e.type === 'way' && e.tags?.lit === 'no')
      .map((e) => `way/${e.id}`)
      .sort();
  return out;
}

test('write the pilot registry manifest', () => {
  const registry = pilotLightingRegistry(terrain);
  const unlit = pilotUnlitWays();
  const unlitSet = new Set(Object.values(unlit).flat());
  const validation = validateRegistry(registry, {
    reference: terrain.data.reference,
    supportedTypes: FIXTURE_TYPES,
    unlitElements: unlitSet,
  });
  expect(validation.errors).toEqual([]);
  const joined = attachProvenance(registry, provenanceData.fixtures as PilotProvenance[]);
  expect(joined.issues).toEqual([]);
  const stadium = createIdrottsparken(terrain);
  const lighting = createCityLighting({
    terrain,
    stadium,
    scene: new Scene(),
    renderer: { toneMappingExposure: 1, info: { programs: [] } } as never,
    // Phase A1: the default set is pilot + A1; this manifest describes the pilot alone.
    registry,
  });
  const u = lighting.uniforms;
  const records = [...joined.fixtures].sort((a, b) => (a.record.id < b.record.id ? -1 : 1));
  const compact = records.map(({ record: r, provenance: p }) => ({
    id: r.id,
    runtimeId: r.runtimeId,
    group: r.group,
    placement: r.placement,
    illumination: r.illumination,
    source: {
      ...r.source,
      version: p?.source.version ?? null,
      timestamp: p?.source.timestamp ?? null,
      tags: p?.source.tags ?? null,
    },
    generator: r.generator,
    method: p?.method ?? null,
    uncertaintyM: p?.uncertaintyM ?? null,
    position: {
      e: Number(r.position.e.toFixed(3)),
      n: Number(r.position.n.toFixed(3)),
      status: r.position.status,
      heightRh2000M: r.position.heightRh2000M,
      scene: r.position.scene,
    },
    support:
      r.support.kind === 'bridge-deck'
        ? {
            kind: r.support.kind,
            way: r.support.segment.way,
            t: r.support.segment.t,
            status: r.support.status,
          }
        : { kind: r.support.kind, status: r.support.status },
    mountingHeightM: r.mountingHeightM,
    orientation: {
      gridAzimuthDeg:
        r.orientation.gridAzimuthDeg === null
          ? null
          : Number(r.orientation.gridAzimuthDeg.toFixed(4)),
      status: r.orientation.status,
    },
    photometry: r.photometry,
    activation: r.activation,
  }));
  const registryJson = JSON.stringify(compact);
  const manifest = {
    note: 'Lighting Phase 0 pilot registry manifest. Inputs are pinned by SHA-256 and git blob ID; outputs are the packed runtime arrays. Regenerate only deliberately (scripts/lighting-phase0/manifest.test.ts).',
    registry: {
      version: registry.version,
      horizontalCrs: registry.horizontalCrs,
      verticalDatum: registry.verticalDatum,
      generator: registry.fixtures[0].generator,
      sources: registry.sources,
      counts: validation.counts,
      compactRegistrySha256: createHash('sha256').update(registryJson).digest('hex'),
    },
    inputs: INPUTS.map(file),
    code: CODE.map(file),
    terrainRevision: (terrain.data as unknown as { revision?: string }).revision ?? null,
    explicitUnlitWays: unlit,
    outputs: {
      hashes: {
        lampTexture: sha(u.cityLampTex.value.image.data as Float32Array),
        pagePayload: sha(u.cityGridTex.value.image.data as Float32Array),
        pageDirectory: sha(u.cityPageTex.value.image.data as Float32Array),
        canonicalOrder: createHash('sha256').update(lighting.index!.order.join('\n')).digest('hex'),
      },
      index: lighting.describe().streetLighting.index,
      textures: lighting.describe().streetLighting.textures,
    },
    crosswalk: records.map(({ record: r }) => [r.id, r.runtimeId]),
  };
  fs.mkdirSync('docs/lighting-phase0/measurements', { recursive: true });
  fs.mkdirSync('docs/lighting-phase0/evidence', { recursive: true });
  fs.writeFileSync(
    'docs/lighting-phase0/measurements/registry-manifest.json',
    JSON.stringify(manifest, null, 1) + '\n',
  );
  fs.writeFileSync(
    'docs/lighting-phase0/evidence/pilot-registry.json',
    '[\n' + compact.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n',
  );
  lighting.dispose();
  stadium.dispose();
});
