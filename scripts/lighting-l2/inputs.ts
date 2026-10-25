// Lighting Phase L2a: pinned generator inputs and the generated files.
//
// Same map context, deck occluders and type table as A1–A3 (scripts/lighting-a1/inputs.ts); the OSM
// source is the L2 extract (scripts/data/lighting-l2-source.json, from the pinned L0 snapshot); lit
// evidence is L0's classification; the existing fixtures are the rendered set before L2a (pilot + A1
// + A2 + A3) with evidence class and source element.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  generateCorridor,
  type GeneratorInput,
  type GeneratorOutput,
  type SourceExtract,
} from '../../src/lib/lighting/corridorGenerator';
import {
  L2_ROLLOUT,
  L2BC_ROLLOUT,
  l2Spec,
  l2bcSpec,
  type L0Classification,
} from '../../src/lib/lighting/corridorL2';
import type { CorridorSpec } from '../../src/lib/lighting/corridorGenerator';
import { decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { L2_IDENTITY_FOR_TESTS } from './identity';
import { encodeCompactSet } from '../../src/lib/lighting/compactSet';
import { loadInputs as loadA1Inputs } from '../lighting-a1/inputs';
import { existingBeforeA3 } from '../lighting-a3/inputs';
import { corridorRegistry, A3_IDENTITY, type A1Data } from '../../src/lib/lighting/corridorRegistry';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const L2_INPUT_FILES = {
  source: 'scripts/data/lighting-l2-source.json',
  classification: 'docs/lighting-city-l0/data/city-lighting-l0.json',
  map: 'src/lib/data/norrkoping-map.json',
  bridges: 'src/lib/data/city-bridges.json',
  places: 'src/lib/data/city-places.json',
  pilot: 'src/lib/data/streetlights.json',
  a1: 'src/lib/data/streetlights-a1.json',
  a2: 'src/lib/data/streetlights-a2.json',
  a3: 'src/lib/data/streetlights-a3.json',
  generator: 'src/lib/lighting/corridorGenerator.ts',
  corridor: 'src/lib/lighting/corridorL2.ts',
} as const;
export const L2_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-l2.json',
  provenance: 'docs/lighting-city-l2/data/streetlights-l2-provenance.json',
} as const;
/** Lighting Phase L2bc (paths, squares, junction ranges, motorways); existing = everything before. */
export const L2BC_INPUT_FILES = {
  ...L2_INPUT_FILES,
  source: 'scripts/data/lighting-l2bc-source.json',
  l2a: 'src/lib/data/streetlights-l2.json',
} as const;
export const L2BC_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-l2bc.json',
  provenance: 'docs/lighting-city-l2bc/data/streetlights-l2bc-provenance.json',
} as const;
interface RolloutConfig {
  spec: CorridorSpec;
  rollout: string;
  datasetText: string;
  inputFiles: Record<string, string> & { source: string; classification: string };
  outputs: { runtime: string; provenance: string };
}

let cached: { input: GeneratorInput; l0: L0Classification } | null = null;
export function loadL2Inputs() {
  if (cached) return cached;
  const a1 = loadA1Inputs();
  const l0 = read(L2_INPUT_FILES.classification) as L0Classification;
  // Existing = pilot + A1 + A2 (as for A3) plus A3 itself.
  const before = existingBeforeA3(a1.reference);
  const a3 = corridorRegistry(read(L2_INPUT_FILES.a3) as A1Data, a1.reference, A3_IDENTITY).fixtures.map((r) => ({
    id: r.id,
    x: r.position.scene.x,
    z: r.position.scene.z,
    type: r.photometry.fixtureType,
    placement: r.placement,
    element: r.source.element,
  }));
  cached = {
    input: { ...a1, source: read(L2_INPUT_FILES.source) as SourceExtract, existing: [...before, ...a3] },
    l0,
  };
  return cached;
}
export const generateL2 = (inputs = loadL2Inputs()) => generateCorridor(inputs.input, l2Spec(inputs.l0));
export const toL2Files = (out: GeneratorOutput, inputs = loadL2Inputs()) =>
  toRolloutFiles(out, inputs, {
    spec: l2Spec(inputs.l0),
    rollout: L2_ROLLOUT,
    datasetText: 'OpenStreetMap (Overpass API), Lighting Phase L0 snapshot: lit car-road ways of the whole map',
    inputFiles: L2_INPUT_FILES,
    outputs: L2_OUTPUT_FILES,
  });

let cachedBc: { input: GeneratorInput; l0: L0Classification } | null = null;
export function loadL2bcInputs() {
  if (cachedBc) return cachedBc;
  const l2 = loadL2Inputs();
  const l2a = corridorRegistry(
    decodeCompactSet(read(L2BC_INPUT_FILES.l2a) as CompactSet) as unknown as A1Data,
    l2.input.reference,
    L2_IDENTITY_FOR_TESTS,
  ).fixtures.map((r) => ({
    id: r.id,
    x: r.position.scene.x,
    z: r.position.scene.z,
    type: r.photometry.fixtureType,
    placement: r.placement,
    element: r.source.element,
  }));
  cachedBc = {
    input: {
      ...l2.input,
      source: read(L2BC_INPUT_FILES.source) as SourceExtract,
      existing: [...l2.input.existing, ...l2a],
    },
    l0: l2.l0,
  };
  return cachedBc;
}
export const generateL2bc = (inputs = loadL2bcInputs()) =>
  generateCorridor(inputs.input, l2bcSpec(inputs.l0));
export const toL2bcFiles = (out: GeneratorOutput, inputs = loadL2bcInputs()) =>
  toRolloutFiles(out, inputs, {
    spec: l2bcSpec(inputs.l0),
    rollout: L2BC_ROLLOUT,
    datasetText:
      'OpenStreetMap (Overpass API), Lighting Phase L0 snapshot: lit paths, squares, partly lit roads and lit motorways of the whole map',
    inputFiles: L2BC_INPUT_FILES,
    outputs: L2BC_OUTPUT_FILES,
  });

function toRolloutFiles(
  out: GeneratorOutput,
  inputs: { input: GeneratorInput; l0: L0Classification },
  cfg: RolloutConfig,
) {
  const spec = cfg.spec;
  const meta = inputs.input.source.meta as SourceExtract['meta'] & {
    snapshot: { sha256: string; retrievedAt: string };
  };
  const types = Object.fromEntries(
    Object.entries(inputs.input.types).map(([k, t]) => [
      k,
      { heightM: t.heightM, cct: t.cct, candela: t.candela, rangeM: t.rangeM, profile: t.profile },
    ]),
  );
  const sources = [
    {
      id: spec.dataset,
      dataset: cfg.datasetText,
      license: 'ODbL-1.0 © OpenStreetMap contributors',
      osmBase: meta.osmBase,
    },
  ];
  const compact = encodeCompactSet(out.fixtures, {
    generator: spec.generator,
    rollout: cfg.rollout,
    provenance: cfg.outputs.provenance,
    zone: 'L2',
    sources,
    types,
    corridor: { L2: { name: spec.zones.L2.name, ringEN: spec.zones.L2.ring } },
    lit: `Phase L0 classification ${inputs.l0.meta.rule.version} (${cfg.inputFiles.classification}): OSM lit=yes, gap fill or municipal guideline rule`,
    units:
      'x, z: scene units (1 = 25 m, SWEREF 99 TM scene frame) × 1e4; heading: rad × 1e6; occlusion: cm; corridor ring: EPSG:3006 E/N metres',
    counts: out.counts,
  });
  // Compact provenance: one row per fixture, way facts (version, timestamp, tags) once per way.
  const sourceWays: Record<string, { version: number; timestamp: string; tags: Record<string, string> }> = {};
  const rows = out.provenance.map((p) => {
    sourceWays[p.source.element] ??= { version: p.source.version, timestamp: p.source.timestamp, tags: p.source.tags };
    const s = p.station;
    return [
      p.id,
      p.rule,
      p.observed.join('; '),
      s?.index ?? null,
      s?.of ?? null,
      s?.chainageM ?? null,
      s?.wayLengthM ?? null,
      s?.spacingM ?? null,
      s?.side ?? null,
      s?.sideFallback ? 1 : 0,
      s?.shiftM ?? null,
      s?.offsetM ?? null,
      p.mapDeviationM,
      p.uncertaintyM,
    ];
  });
  const inferred = [...new Set(out.provenance.map((p) => p.inferred.join('; ')))].sort();
  const provenance = {
    meta: {
      generator: spec.generator,
      policy: spec.policy,
      lit: compact.meta.lit,
      format: {
        fixtures:
          '[id, rule, observed, station index, stations on the way, chainage m, way length m, effective spacing m, side, side fallback 0|1, shift m, offset from centreline m, map deviation m, position uncertainty m]',
        sourceWays: 'OSM way → version, timestamp and lighting-relevant tags of the snapshot',
        inferred: 'every estimate infers these fields (per-fixture lists in the A1–A3 format)',
      },
      inferred,
      inputs: Object.fromEntries(
        Object.entries(cfg.inputFiles).map(([k, f]) => [k, { file: f, sha256: sha(f) }]),
      ),
      source: {
        file: cfg.inputFiles.source,
        osmBase: meta.osmBase,
        snapshotSha256: meta.snapshot.sha256,
        retrievedAt: meta.snapshot.retrievedAt,
        license: 'ODbL-1.0 © OpenStreetMap contributors',
      },
      counts: out.counts,
    },
    fixtures: rows,
    sourceWays: Object.fromEntries(Object.entries(sourceWays).sort(([a], [b]) => (a < b ? -1 : 1))),
    rejected: out.rejected,
    ways: out.ways,
    unknownWays: out.unknownWays,
  };
  return {
    runtime: JSON.stringify(compact) + '\n',
    provenance: JSON.stringify(provenance) + '\n',
  };
}
