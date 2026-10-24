/**
 * Lighting Phase A1/A2: registry adapter for generated corridor records (src/lib/data/streetlights-a1.json,
 * streetlights-a2.json) and the merge with the Step 6 pilot. The corridor's dataset and generator are
 * passed in (default: A1), so A1 records are built exactly as before.
 *
 * Concepts stay separate (docs/lighting-phase-a1/data-provenance.md):
 * - identity: canonical `id` (= runtimeId; A1 has no legacy IDs);
 * - source: dataset / element / snapshot / licence;
 * - estimate provenance and rollout: `generator` (script, version `lighting-a1-v1`, method, station);
 * - visual grouping: `group` = fixed geographic chunk (corridorA1.groupKey), never the rollout name.
 * Pilot records are not modified: the pilot adapter (registry.ts) is used as is.
 * The merge never de-duplicates: two records with one canonical ID fail validation and the whole
 * set is rejected (the generator already excludes identities that exist in the pilot).
 */
import { sceneToSweref } from '../geo/sweref99tm.js';
import { A1_DATASET, A1_GENERATOR, groupKey, inRing } from './corridorA1';
import { A2_DATASET, A2_GENERATOR } from './corridorA2';
import type { A1Fixture } from './corridorGenerator';
import {
  headingToGridAzimuth,
  type LightingRegistry,
  type RegistryFixture,
  type SceneReferenceLike,
} from './registry';

export interface A1Data {
  meta: {
    sources: { id: string; dataset: string; license: string; osmBase: string }[];
  };
  fixtures: A1Fixture[];
}

const ELEMENT = /^(?:osm:(node)\/(\d+)|estimate:[a-z0-9.-]+:(way)\/(\d+):s(\d+))$/;

/** Identity of a corridor rollout in its registry records. */
export interface CorridorIdentity {
  dataset: string;
  generator: { script: string; version: string };
}
export const A1_IDENTITY: CorridorIdentity = { dataset: A1_DATASET, generator: A1_GENERATOR };
export const A2_IDENTITY: CorridorIdentity = { dataset: A2_DATASET, generator: A2_GENERATOR };

export function corridorRegistry(
  data: A1Data,
  reference: SceneReferenceLike,
  identity: CorridorIdentity = A1_IDENTITY,
): LightingRegistry {
  const source = data.meta.sources.find((s) => s.id === identity.dataset);
  const fixtures = data.fixtures.map((f): RegistryFixture & { zone: string } => {
    const m = ELEMENT.exec(f.id);
    const element = m ? (m[1] ? `node/${m[2]}` : `way/${m[4]}`) : null;
    const [e, n] = sceneToSweref(reference as never, f.x, f.z);
    return {
      id: f.id,
      runtimeId: f.id,
      role: 'fixture',
      parentId: null,
      group: groupKey(f.x, f.z),
      zone: f.zone,
      placement: f.placement,
      illumination: f.placement === 'mapped' ? 'mapped-lit' : 'estimated',
      source: {
        dataset: identity.dataset,
        element,
        snapshot: source?.osmBase ?? '',
        licence: source?.license ?? '',
      },
      generator: {
        script: identity.generator.script,
        version: identity.generator.version,
        seed: null,
        method: f.placement === 'mapped' ? 'osm-node' : 'lit-way-station',
        station: m?.[5] !== undefined ? Number(m[5]) : null,
      },
      position: {
        e,
        n,
        heightRh2000M: null,
        meaning: 'fixture-base',
        status: f.placement === 'mapped' ? 'known' : 'estimated',
        scene: { x: f.x, z: f.z },
      },
      support:
        f.mount.kind === 'bridge'
          ? {
              kind: 'bridge-deck',
              surface: 'bridge-deck-profile',
              status: 'derived',
              segment: f.mount.segment,
            }
          : { kind: 'ground', surface: 'rendered-ground', status: 'derived' },
      mountingHeightM: { value: f.heightM, status: 'estimated' },
      orientation:
        f.heading === null
          ? { sceneHeadingRad: null, gridAzimuthDeg: null, status: 'unknown' }
          : {
              sceneHeadingRad: f.heading,
              gridAzimuthDeg: headingToGridAzimuth(f.heading),
              status: 'estimated',
            },
      photometry: {
        fixtureType: f.type,
        cctK: f.cct,
        candela: f.candela,
        rangeM: f.rangeM,
        profile: f.profile,
        status: 'estimated',
      },
      occlusionM: { values: f.occlusionM, status: 'derived' },
      activation: { mode: 'solar-night', schedule: null, status: 'estimated' },
    };
  });
  return {
    version: 1,
    horizontalCrs: 'EPSG:3006',
    verticalDatum: 'RH2000',
    sources: data.meta.sources.map((s) => ({
      id: s.id,
      dataset: s.dataset,
      license: s.license,
      snapshot: s.osmBase,
    })),
    fixtures,
  };
}

/** Concatenates registries (sources unique by ID). Never de-duplicates fixtures. */
export function mergeRegistries(...registries: LightingRegistry[]): LightingRegistry {
  const sources = new Map<string, LightingRegistry['sources'][number]>();
  for (const r of registries)
    for (const s of r.sources) if (!sources.has(s.id)) sources.set(s.id, s);
  return {
    version: 1,
    horizontalCrs: 'EPSG:3006',
    verticalDatum: 'RH2000',
    sources: [...sources.values()],
    fixtures: registries.flatMap((r) => r.fixtures),
  };
}

/** Rollout of a registry record (from its generator version; separate from source and group). */
export const rolloutOf = (r: RegistryFixture) => r.generator.version;

/**
 * Source precedence for overlapping datasets (pilot, OSM-mapped, estimates, a future municipal
 * register). Duplicates are decided by identity, never by distance:
 * 1. The same canonical ID in two records is an error (no silent de-duplication).
 * 2. A crosswalk entry {from, to, basis} records that `from` and `to` are the same physical fixture;
 *    `from` is superseded by `to`, which must have higher evidence precedence
 *    (authoritative > mapped > estimated). An entry whose ends are missing is an error.
 * 3. Inside an authoritative set's declared coverage (EPSG:3006 rings), estimates are superseded:
 *    the register is complete there. Mapped records there without a crosswalk entry are kept and
 *    reported for review (a nearby register point is not proof of identity).
 * Superseded records stay in the report with the reason; nothing is dropped silently.
 */
export interface SourceSet {
  name: string;
  registry: LightingRegistry;
  /** True for a licensed, complete register (e.g. municipal); its coverage rings are required. */
  authoritative?: boolean;
  coverageEN?: [number, number][][];
}
export interface CrosswalkEntry {
  from: string;
  to: string;
  basis: string;
}
export function reconcileSources(sets: SourceSet[], crosswalk: CrosswalkEntry[] = []) {
  const errors: string[] = [];
  const superseded: { id: string; by: string; reason: string }[] = [];
  const review: { id: string; reason: string }[] = [];
  const owner = new Map<string, { set: SourceSet; record: RegistryFixture }>();
  for (const set of sets)
    for (const r of set.registry.fixtures) {
      const prior = owner.get(r.id);
      if (prior) errors.push(`${r.id}: in both ${prior.set.name} and ${set.name}`);
      else owner.set(r.id, { set, record: r });
    }
  const rank = (o: { set: SourceSet; record: RegistryFixture }) =>
    o.set.authoritative ? 0 : o.record.placement === 'mapped' ? 1 : 2;
  const gone = new Set<string>();
  for (const c of [...crosswalk].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    const from = owner.get(c.from),
      to = owner.get(c.to);
    if (!from || !to) {
      errors.push(`crosswalk ${c.from} → ${c.to}: unresolved end`);
      continue;
    }
    if (rank(to) >= rank(from)) {
      errors.push(`crosswalk ${c.from} → ${c.to}: target does not have higher precedence`);
      continue;
    }
    gone.add(c.from);
    superseded.push({ id: c.from, by: c.to, reason: `crosswalk (${c.basis})` });
  }
  for (const set of sets.filter((s) => s.authoritative)) {
    if (!set.coverageEN?.length) {
      errors.push(`${set.name}: authoritative set without a coverage declaration`);
      continue;
    }
    for (const [id, o] of owner) {
      if (o.set === set || gone.has(id)) continue;
      const inside = set.coverageEN.some((ring) =>
        inRing([o.record.position.e, o.record.position.n], ring),
      );
      if (!inside) continue;
      if (o.record.placement === 'estimated') {
        gone.add(id);
        superseded.push({ id, by: set.name, reason: 'estimate inside authoritative coverage' });
      } else
        review.push({ id, reason: `mapped record inside ${set.name} coverage without crosswalk` });
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    superseded,
    review,
    registry: mergeRegistries(
      ...sets.map((s) => ({
        ...s.registry,
        fixtures: s.registry.fixtures.filter((r) => !gone.has(r.id)),
      })),
    ),
  };
}
