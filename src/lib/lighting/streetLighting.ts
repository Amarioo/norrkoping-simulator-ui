/**
 * Lighting Phase 0: registry → validated fixtures → shader lamps → sparse index, all on the CPU and
 * before any GPU allocation. The controller (controller.ts) uploads a prepared set atomically or
 * keeps its previous set when preparation is rejected.
 */
import type { TerrainService } from '../terrain';
import { lampLayout, packLampData, type ShaderLamp } from './cityLights';
import { FIXTURE_TYPES, fixtureLamps, type FixtureRecord } from './fixtures';
import {
  buildLightIndex,
  compareIds,
  type CellConflict,
  type IndexStats,
  type SparseLightIndex,
} from './lightIndex';
import {
  toPilotFixture,
  validateRegistry,
  type LightingRegistry,
  type RegistryIssue,
  type ValidationResult,
} from './registry';

export interface PreparedStreetLighting {
  ok: true;
  /** Fixtures in canonical-ID order; lamp i, fixture i and payload index i agree. */
  fixtures: FixtureRecord[];
  lamps: ShaderLamp[];
  index: SparseLightIndex;
  lampPack: ReturnType<typeof packLampData>;
  counts: ValidationResult['counts'];
  buildMs: number;
}
export interface RejectedStreetLighting {
  ok: false;
  stage: 'registry' | 'geometry' | 'device' | 'capacity';
  errors: (RegistryIssue | string)[];
  conflicts: CellConflict[];
  conflictCount: number;
  stats: IndexStats | null;
  counts: ValidationResult['counts'] | null;
  buildMs: number;
}
export interface PrepareOptions {
  maxTextureSize: number;
  chunkCells?: number;
  unlitElements?: ReadonlySet<string>;
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export function prepareStreetLighting(
  registry: LightingRegistry,
  terrain: TerrainService,
  options: PrepareOptions,
): PreparedStreetLighting | RejectedStreetLighting {
  const t0 = now();
  const metres = terrain.data.reference.metresPerUnit;
  const reject = (
    stage: RejectedStreetLighting['stage'],
    errors: RejectedStreetLighting['errors'],
    extra: Partial<RejectedStreetLighting> = {},
  ): RejectedStreetLighting => ({
    ok: false,
    stage,
    errors,
    conflicts: [],
    conflictCount: 0,
    stats: null,
    counts: null,
    ...extra,
    buildMs: now() - t0,
  });
  const validation = validateRegistry(registry, {
    reference: terrain.data.reference,
    supportedTypes: FIXTURE_TYPES,
    unlitElements: options.unlitElements,
  });
  if (!validation.ok) return reject('registry', validation.errors, { counts: validation.counts });
  const records = [...registry.fixtures].sort((a, b) => compareIds(a.id, b.id));
  const fixtures = records.map(toPilotFixture);
  const lamps = fixtureLamps(fixtures, terrain);
  const bad = lamps.flatMap((l, i) =>
    [l.x, l.y, l.z, l.baseY].every(Number.isFinite)
      ? []
      : [`${records[i].id}: non-finite emitter or support height`],
  );
  if (bad.length) return reject('geometry', bad, { counts: validation.counts });
  try {
    lampLayout(lamps.length, options.maxTextureSize);
  } catch (e) {
    return reject('device', [(e as Error).message], { counts: validation.counts });
  }
  const built = buildLightIndex(
    lamps.map((l, i) => ({ id: records[i].id, x: l.x, z: l.z, rangeM: l.rangeM })),
    {
      metresPerUnit: metres,
      maxTextureSize: options.maxTextureSize,
      chunkCells: options.chunkCells,
    },
  );
  if (!built.ok)
    return reject(built.conflictCount ? 'capacity' : 'device', built.errors, {
      conflicts: built.conflicts,
      conflictCount: built.conflictCount,
      stats: built.stats,
      counts: validation.counts,
    });
  if (built.index.order.some((id, i) => id !== records[i].id))
    return reject('capacity', ['index order differs from fixture order'], {
      counts: validation.counts,
    });
  return {
    ok: true,
    fixtures,
    lamps,
    index: built.index,
    lampPack: packLampData(lamps, options.maxTextureSize),
    counts: validation.counts,
    buildMs: now() - t0,
  };
}

/** One-line description of a rejection, with the first issues (console and errors). */
export function describeRejection(r: RejectedStreetLighting) {
  const first = r.errors
    .slice(0, 5)
    .map((e) => (typeof e === 'string' ? e : `${e.id} ${e.field}: ${e.message}`))
    .join('; ');
  const conflicts = r.conflicts
    .slice(0, 3)
    .map((c) => `cell ${c.cell.join(',')} has ${c.raw.length}: ${c.raw.join(' ')}`)
    .join('; ');
  return `street lighting rejected at ${r.stage} (${r.errors.length} issue(s)): ${first}${conflicts ? ` | ${conflicts}` : ''}`;
}
