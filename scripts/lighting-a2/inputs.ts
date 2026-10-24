// Lighting Phase A2: pinned generator inputs. Same map context, deck occluders and type table as A1
// (scripts/lighting-a1/inputs.ts); the OSM source is the A2 extract and the existing fixtures are the
// accepted rendered set before A2 (Step 6 pilot + Phase A1), with evidence class and source element.
import fs from 'node:fs';
import {
  A2_SPEC,
  generateCorridor,
  type GeneratorInput,
  type SourceExtract,
} from '../../src/lib/lighting/corridorGenerator';
import { A2_ROLLOUT } from '../../src/lib/lighting/corridorA2';
import {
  corridorRegistry,
  mergeRegistries,
  type A1Data,
} from '../../src/lib/lighting/corridorRegistry';
import { pilotRegistry, type PilotData } from '../../src/lib/lighting/registry';
import { loadInputs as loadA1Inputs, toFiles, type RolloutFiles } from '../lighting-a1/inputs';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const A2_INPUT_FILES = {
  source: 'scripts/data/lighting-a2-source.json',
  map: 'src/lib/data/norrkoping-map.json',
  bridges: 'src/lib/data/city-bridges.json',
  places: 'src/lib/data/city-places.json',
  pilot: 'src/lib/data/streetlights.json',
  a1: 'src/lib/data/streetlights-a1.json',
  generator: 'src/lib/lighting/corridorGenerator.ts',
  corridor: 'src/lib/lighting/corridorA2.ts',
} as const;
export const A2_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-a2.json',
  provenance: 'src/lib/data/streetlights-a2-provenance.json',
} as const;
export const A2_FILES: RolloutFiles = {
  spec: A2_SPEC,
  rollout: A2_ROLLOUT,
  label: 'A2',
  sourceFile: A2_INPUT_FILES.source,
  provenanceFile: A2_OUTPUT_FILES.provenance,
};

/** The accepted rendered set before A2 (pilot + A1) as generator "existing" fixtures. */
export function existingBeforeA2(reference: GeneratorInput['reference']) {
  const registry = mergeRegistries(
    pilotRegistry(read(A2_INPUT_FILES.pilot) as PilotData, reference),
    corridorRegistry(read(A2_INPUT_FILES.a1) as A1Data, reference),
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
export function loadA2Inputs(): GeneratorInput {
  if (cached) return cached;
  const a1 = loadA1Inputs();
  cached = {
    ...a1,
    source: read(A2_INPUT_FILES.source) as SourceExtract,
    existing: existingBeforeA2(a1.reference),
  };
  return cached;
}
export const generateA2 = (input: GeneratorInput = loadA2Inputs()) =>
  generateCorridor(input, A2_SPEC);
export const toA2Files = (out: ReturnType<typeof generateA2>, input: GeneratorInput) =>
  toFiles(out, input, A2_FILES);
