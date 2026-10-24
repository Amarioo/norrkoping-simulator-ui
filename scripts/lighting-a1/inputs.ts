// Lighting Phase A1: loads the pinned generator inputs from the repository (tests and the writer).
import fs from 'node:fs';
import {
  A1_SPEC,
  type CorridorSpec,
  type GeneratorInput,
  type GeneratorOutput,
  type SourceExtract,
  type TypeSpec,
} from '../../src/lib/lighting/corridorGenerator';
import { A1_ROLLOUT } from '../../src/lib/lighting/corridorA1';
import { pilotRegistry, type PilotData } from '../../src/lib/lighting/registry';
import { inRing } from '../../src/lib/lighting/corridorA1';
import { terrain } from '../../src/lib/terrain';

const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const INPUT_FILES = {
  source: 'scripts/data/lighting-a1-source.json',
  map: 'src/lib/data/norrkoping-map.json',
  bridges: 'src/lib/data/city-bridges.json',
  places: 'src/lib/data/city-places.json',
  pilot: 'src/lib/data/streetlights.json',
  generator: 'src/lib/lighting/corridorGenerator.ts',
  corridor: 'src/lib/lighting/corridorA1.ts',
} as const;

/** How a corridor rollout's generated files describe themselves (default: Phase A1, unchanged). */
export interface RolloutFiles {
  spec: CorridorSpec;
  rollout: string;
  /** Corridor label in the source description ("the A1 corridor"). */
  label: string;
  sourceFile: string;
  provenanceFile: string;
}
export const A1_FILES: RolloutFiles = {
  spec: A1_SPEC,
  rollout: A1_ROLLOUT,
  label: 'A1',
  sourceFile: 'scripts/data/lighting-a1-source.json',
  provenanceFile: 'src/lib/data/streetlights-a1-provenance.json',
};

/** Runtime (bundled) and provenance (not bundled) files of a generator run. */
export function toFiles(
  out: GeneratorOutput,
  input: GeneratorInput,
  files: RolloutFiles = A1_FILES,
) {
  const { spec } = files;
  const meta = input.source.meta as SourceExtract['meta'] & {
    snapshot: { sha256: string; retrievedAt: string };
  };
  const sources = [
    {
      id: spec.dataset,
      dataset: `OpenStreetMap (Overpass API), Step 6.2 research snapshot clipped to the ${files.label} corridor`,
      license: 'ODbL-1.0 © OpenStreetMap contributors',
      osmBase: meta.osmBase,
    },
  ];
  const runtime = {
    meta: {
      generator: spec.generator,
      rollout: files.rollout,
      provenance: files.provenanceFile,
      sources,
      corridor: Object.fromEntries(
        Object.entries(spec.zones).map(([k, z]) => [k, { name: z.name, ringEN: z.ring }]),
      ),
      units:
        'x, z: scene units (1 = 25 m, SWEREF 99 TM scene frame); heights, ranges, occlusion: metres; corridor rings: EPSG:3006 E/N metres',
      counts: out.counts,
    },
    fixtures: out.fixtures,
  };
  const provenance = {
    meta: {
      generator: spec.generator,
      policy: spec.policy,
      source: {
        file: files.sourceFile,
        osmBase: meta.osmBase,
        snapshotSha256: meta.snapshot.sha256,
        retrievedAt: meta.snapshot.retrievedAt,
        license: 'ODbL-1.0 © OpenStreetMap contributors',
      },
      counts: out.counts,
    },
    fixtures: out.provenance,
    rejected: out.rejected,
    ways: out.ways,
    unknownWays: out.unknownWays,
  };
  return {
    runtime: JSON.stringify(runtime) + '\n',
    provenance: JSON.stringify(provenance, null, 1) + '\n',
  };
}

/** Minimum deck height above the surface below for an outline edge to occlude ground lamps (m). */
export const DECK_OCCLUDER_CLEARANCE_M = 2;
/**
 * Outline edges of the city bridges (city-bridges.json) that occlude ground lamps: every edge of a deck
 * with covered space under it, i.e. the rendered deck (bridge-profile height of the nearest bridge way
 * inside the outline) stands at least DECK_OCCLUDER_CLEARANCE_M above the rendered surface (ground or
 * water) somewhere inside the outline (2 m grid). A per-edge rule leaked through short end edges of
 * jagged outlines. Derived from the pinned terrain and bridge profiles.
 */
export function deckOccluders(
  bridges: GeneratorInput['bridges'],
  roads: GeneratorInput['map']['roads'],
) {
  const M = terrain.data.reference.metresPerUnit;
  const out: { bridge: number; a: number[]; b: number[] }[] = [];
  for (const br of [...bridges].sort((a, b) => a.id - b.id)) {
    const decks = roads.filter(
      (r) => r.bridge && inRing([(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2], br.ring),
    );
    if (!decks.length) continue;
    const deckTop = (x: number, z: number) => {
      let best: { d: number; y: number } | null = null;
      for (const r of decks) {
        const dx = r.b[0] - r.a[0],
          dz = r.b[1] - r.a[1],
          l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / l2));
        const d = Math.hypot(x - r.a[0] - t * dx, z - r.a[1] - t * dz);
        if (!best || d < best.d)
          best = {
            d,
            y: terrain.profileHeight([r.a[0], r.yA, r.a[1]], [r.b[0], r.yB, r.b[1]], t),
          };
      }
      return best!.y;
    };
    // Covered space under the deck: deck top ≥ the clearance above the rendered ground/water at any
    // point of a 2 m grid inside the outline. Then every outline edge occludes ground lamps.
    const xs = br.ring.map((p) => p[0]),
      zs = br.ring.map((p) => p[1]);
    let covered = false;
    for (let x = Math.min(...xs); x <= Math.max(...xs) && !covered; x += 2 / M)
      for (let z = Math.min(...zs); z <= Math.max(...zs) && !covered; z += 2 / M) {
        if (!inRing([x, z], br.ring)) continue;
        const below = Math.max(terrain.surfaceHeight(x, z), terrain.waterHeight(x, z));
        covered = (deckTop(x, z) - below) * M >= DECK_OCCLUDER_CLEARANCE_M;
      }
    if (!covered) continue;
    for (let i = 0; i < br.ring.length - 1; i++)
      if (Math.hypot(br.ring[i + 1][0] - br.ring[i][0], br.ring[i + 1][1] - br.ring[i][1]) > 1e-9)
        out.push({ bridge: br.id, a: br.ring[i], b: br.ring[i + 1] });
  }
  return out;
}

let cached: GeneratorInput | null = null;
export function loadInputs(): GeneratorInput {
  if (cached) return cached;
  const map = read(INPUT_FILES.map);
  const pilot = read(INPUT_FILES.pilot) as PilotData & {
    meta: { types: Record<string, TypeSpec> };
  };
  const reference = map.meta.reference;
  const registry = pilotRegistry(pilot, reference);
  const bridges = read(INPUT_FILES.bridges).bridges;
  cached = {
    reference,
    source: read(INPUT_FILES.source) as SourceExtract,
    map: { roads: map.roads, buildings: map.buildings, areas: map.areas },
    bridges,
    deckOccluders: deckOccluders(bridges, map.roads),
    platforms: read(INPUT_FILES.places).platforms,
    types: pilot.meta.types,
    existing: registry.fixtures.map((r) => ({
      id: r.id,
      x: r.position.scene.x,
      z: r.position.scene.z,
      type: r.photometry.fixtureType,
    })),
  };
  return cached;
}
