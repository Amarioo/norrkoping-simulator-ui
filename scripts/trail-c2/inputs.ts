// Phase C2 (Vrinnevi illuminated trail): pinned generator inputs and the generated files.
//
// Same map context and Step 6 type table as A1–L2d (scripts/lighting-a1/inputs.ts); the OSM source is
// the trail extract (scripts/data/trail-c2-source.json, from the pinned L0 snapshot 2026-10-24 and the
// route relation fetched for Phase C1); the existing fixtures are the rendered set before C2 (pilot +
// A1–A3 + L2a + L2bc + L2d).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { encodeCompactSet, decodeCompactSet, type CompactSet } from '../../src/lib/lighting/compactSet';
import { corridorRegistry, type A1Data } from '../../src/lib/lighting/corridorRegistry';
import { L2D_DATASET, L2D_GENERATOR } from '../../src/lib/lighting/siteLighting';
import {
  generateTrail,
  type TrailInput,
  type TrailOutput,
  type TrailSource,
  type TrailSpec,
} from '../../src/lib/lighting/trailGenerator';
import {
  C2_CATEGORY,
  C2_DATASET,
  C2_GENERATOR,
  C2_POLICY,
  C2_ROLLOUT,
  C2_TYPE,
  C2_ZONE,
  TRAIL_SCHEDULE,
  trailType,
} from '../../src/lib/lighting/trailLighting';
import { L2D_INPUT_FILES, L2D_OUTPUT_FILES, loadL2dInputs } from '../lighting-l2d/inputs';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const C2_INPUT_FILES = {
  source: 'scripts/data/trail-c2-source.json',
  relation: 'scripts/vegetation-c1/trail-osm.json',
  map: L2D_INPUT_FILES.map,
  pilot: L2D_INPUT_FILES.pilot,
  a1: L2D_INPUT_FILES.a1,
  a2: L2D_INPUT_FILES.a2,
  a3: L2D_INPUT_FILES.a3,
  l2a: L2D_INPUT_FILES.l2a,
  l2bc: L2D_INPUT_FILES.l2bc,
  l2d: L2D_OUTPUT_FILES.runtime,
  generator: 'src/lib/lighting/trailGenerator.ts',
  rule: 'src/lib/lighting/trailLighting.ts',
  schedule: 'src/lib/lighting/trailSchedule.ts',
} as const;
export const C2_OUTPUT_FILES = {
  runtime: 'src/lib/data/streetlights-c2.json',
  provenance: 'docs/trail-c2/data/streetlights-c2-provenance.json',
  stats: 'docs/trail-c2/data/stats.json',
} as const;
export const C2_SPEC: TrailSpec = {
  generator: C2_GENERATOR,
  dataset: C2_DATASET,
  zone: C2_ZONE,
  policy: C2_POLICY,
};

let cached: TrailInput | null = null;
export function loadC2Inputs(): TrailInput {
  if (cached) return cached;
  const d = loadL2dInputs().input;
  const l2d = corridorRegistry(
    decodeCompactSet(read(C2_INPUT_FILES.l2d) as CompactSet) as unknown as A1Data,
    d.reference,
    { dataset: L2D_DATASET, generator: L2D_GENERATOR },
  ).fixtures.map((r) => ({
    id: r.id,
    x: r.position.scene.x,
    z: r.position.scene.z,
    type: r.photometry.fixtureType,
    placement: r.placement,
    element: r.source.element,
  }));
  cached = {
    reference: d.reference,
    source: read(C2_INPUT_FILES.source) as TrailSource,
    map: d.map,
    type: { name: C2_TYPE, spec: trailType(d.types) },
    existing: [...d.existing, ...l2d],
  };
  return cached;
}
export const generateC2 = (input = loadC2Inputs()) => generateTrail(input, C2_SPEC);

export function toC2Files(out: TrailOutput, input = loadC2Inputs()) {
  const meta = input.source.meta as TrailSource['meta'] & { snapshot: { sha256: string; retrievedAt: string } };
  const t = input.type.spec;
  const types = { [C2_TYPE]: { heightM: t.heightM, cct: t.cct, candela: t.candela, rangeM: t.rangeM, profile: t.profile } };
  const sources = [
    {
      id: C2_DATASET,
      dataset: 'OpenStreetMap (Overpass API), Lighting Phase L0 snapshot: the ways of the Vrinnevi illuminated trail (route relation 5703856)',
      license: 'ODbL-1.0 © OpenStreetMap contributors',
      osmBase: meta.osmBase,
    },
  ];
  const lit =
    'Phase C2 rule lighting-c2-v1 (estimates): the ways of the running route relation 5703856 tagged lit=yes that no earlier rollout lit (highway=track and one short footway), stations every 25 m along each run';
  const compact = encodeCompactSet(out.fixtures, {
    generator: C2_GENERATOR,
    rollout: C2_ROLLOUT,
    category: C2_CATEGORY,
    provenance: C2_OUTPUT_FILES.provenance,
    zone: C2_ZONE.id,
    sources,
    types,
    corridor: { [C2_ZONE.id]: { name: C2_ZONE.name, ringEN: C2_ZONE.ring } },
    lit,
    schedule: TRAIL_SCHEDULE,
    units:
      'x, z: scene units (1 = 25 m, SWEREF 99 TM scene frame) × 1e4; heading: rad × 1e6; occlusion: cm; corridor ring: EPSG:3006 E/N metres',
    counts: out.counts,
  });
  const sourceWays: Record<string, { version: number; timestamp: string; tags: Record<string, string> }> = {};
  for (const w of [...input.source.elements].sort((a, b) => a.id - b.id))
    sourceWays[`way/${w.id}`] = { version: w.version, timestamp: w.timestamp, tags: w.tags };
  const rows = out.provenance.map((p) => {
    const s = p.station;
    return [p.id, p.rule, s.run, s.index, s.of, s.runChainageM, s.wayChainageM, s.spacingM, s.side, s.sideFallback ? 1 : 0, s.shiftM, s.offsetM, p.uncertaintyM];
  });
  const ref = input.reference;
  const provenance = {
    meta: {
      generator: C2_GENERATOR,
      category: 'illuminated recreational trail (elljusspår), not street lighting',
      policy: C2_POLICY,
      type: { [C2_TYPE]: { ...t, status: 'existing Step 6 type; its use on the trail, and the spacing, are estimates' } },
      lit,
      schedule: TRAIL_SCHEDULE,
      coordinates: {
        data: 'EPSG:3006 (SWEREF 99 TM)',
        scene: `x = (E − ${ref.originEasting}) / (${ref.metresPerUnit} × k), z = −(N − ${ref.originNorthing}) / (${ref.metresPerUnit} × k), k = ${ref.gridScaleFactor}; x east, z south, 1 unit = ${ref.metresPerUnit} m on the ground; heights from the terrain (RH 2000)`,
      },
      format: {
        fixtures:
          '[id, rule, run, station index in the run, stations in the run, chainage from the run start m, chainage from the way start m, effective spacing m, side in walking direction, side fallback 0|1, shift m, offset from centreline m, position uncertainty m]',
        positions: '[id, E, N] EPSG:3006 metres (0.01 m) of the post base',
        sourceWays: 'OSM way → version, timestamp and tags of the snapshot (all 14 ways of the loop)',
        ways: 'the walk around the loop: way, class, order, direction, length, decision, earlier fixtures, fixtures of this phase',
      },
      observed: [...new Set(out.provenance.flatMap((p) => p.observed))].sort(),
      inferred: [...new Set(out.provenance.flatMap((p) => p.inferred))].sort(),
      inputs: Object.fromEntries(Object.entries(C2_INPUT_FILES).map(([k, f]) => [k, { file: f, sha256: sha(f) }])),
      source: {
        file: C2_INPUT_FILES.source,
        osmBase: meta.osmBase,
        snapshotSha256: meta.snapshot.sha256,
        retrievedAt: meta.snapshot.retrievedAt,
        relation: meta.relation,
        license: 'ODbL-1.0 © OpenStreetMap contributors',
      },
      counts: out.counts,
    },
    fixtures: rows,
    positions: out.fixtures.map((f) => {
      const e = ref.originEasting + f.x * ref.metresPerUnit * ref.gridScaleFactor;
      const n = ref.originNorthing - f.z * ref.metresPerUnit * ref.gridScaleFactor;
      return [f.id, Math.round(e * 100) / 100, Math.round(n * 100) / 100];
    }),
    sourceWays,
    ways: out.ways,
    runs: out.runs,
    rejected: out.rejected,
  };
  const stats = {
    rule: C2_GENERATOR.version,
    snapshot: { osmBase: meta.osmBase, sha256: meta.snapshot.sha256 },
    schedule: TRAIL_SCHEDULE,
    counts: out.counts,
    runs: out.runs,
    ways: out.ways,
    rejected: out.rejected,
  };
  return {
    runtime: JSON.stringify(compact) + '\n',
    provenance: JSON.stringify(provenance, null, 1) + '\n',
    stats: JSON.stringify(stats, null, 1) + '\n',
  };
}
