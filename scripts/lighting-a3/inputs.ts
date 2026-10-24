// Lighting Phase A3: pinned generator inputs. Same map context, deck occluders and type table as A1/A2
// (scripts/lighting-a1/inputs.ts); the OSM source is the A3 extract and the existing fixtures are the
// accepted rendered set before A3 (Step 6 pilot + Phase A1 + Phase A2), with evidence class and
// source element.
import fs from 'node:fs';
import {
  A3_SPEC,
  generateCorridor,
  type GeneratorInput,
  type SourceExtract,
} from '../../src/lib/lighting/corridorGenerator';
import { A3_ROLLOUT } from '../../src/lib/lighting/corridorA3';
import {
  A2_IDENTITY,
  corridorRegistry,
  mergeRegistries,
  type A1Data,
} from '../../src/lib/lighting/corridorRegistry';
import { pilotRegistry, type PilotData } from '../../src/lib/lighting/registry';
import { loadInputs as loadA1Inputs, toFiles, type RolloutFiles } from '../lighting-a1/inputs';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const A3_INPUT_FILES = {
  source: 'scripts/data/lighting-a3-source.json',
  map: 'src/lib/data/norrkoping-map.json',
  bridges: 'src/lib/data/city-bridges.json',
  places: 'src/lib/data/city-places.json',
  pilot: 'src/lib/data/streetlights.json',
  a1: 'src/lib/data/streetlights-a1.json',
  a2: 'src/lib/data/streetlights-a2.json',
  generator: 'src/lib/lighting/corridorGenerator.ts',
  corridor: 'src/lib/lighting/corridorA3.ts',
} as const;
export const A3_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-a3.json',
  provenance: 'src/lib/data/streetlights-a3-provenance.json',
} as const;
export const A3_FILES: RolloutFiles = {
  spec: A3_SPEC,
  rollout: A3_ROLLOUT,
  label: 'A3',
  sourceFile: A3_INPUT_FILES.source,
  provenanceFile: A3_OUTPUT_FILES.provenance,
};

/** The accepted rendered set before A3 (pilot + A1 + A2) as generator "existing" fixtures. */
export function existingBeforeA3(reference: GeneratorInput['reference']) {
  const registry = mergeRegistries(
    pilotRegistry(read(A3_INPUT_FILES.pilot) as PilotData, reference),
    corridorRegistry(read(A3_INPUT_FILES.a1) as A1Data, reference),
    corridorRegistry(read(A3_INPUT_FILES.a2) as A1Data, reference, A2_IDENTITY),
  );
  return registry.fixtures.map((r) => ({
    id: r.id,
    x: r.position.scene.x,
    z: r.position.scene.z,
    type: r.photometry.fixtureType,
    placement: r.placement,
    element: r.source.element,
  }));
}

let cached: GeneratorInput | null = null;
export function loadA3Inputs(): GeneratorInput {
  if (cached) return cached;
  const a1 = loadA1Inputs();
  cached = {
    ...a1,
    source: read(A3_INPUT_FILES.source) as SourceExtract,
    existing: existingBeforeA3(a1.reference),
  };
  return cached;
}
export const generateA3 = (input: GeneratorInput = loadA3Inputs()) =>
  generateCorridor(input, A3_SPEC);
export const toA3Files = (out: ReturnType<typeof generateA3>, input: GeneratorInput) =>
  toFiles(out, input, A3_FILES);
