/**
 * Lighting Phase 0 runtime registry: the street-lighting records the renderer may use, with
 * provenance, and a semantic validator that runs before any GPU allocation.
 *
 * Contract (docs/lighting-phase0/README.md, after docs/step62/registry.md):
 * - Horizontal position: SWEREF 99 TM / EPSG:3006, E/N metres. Pilot records are STORED in the scene
 *   frame (streetlights.json, scene units); E/N are derived from those exact values with the fixed
 *   affine scene reference (geo/sweref99tm.js) and rendering keeps using the stored scene values, so
 *   no fixture moves through a coordinate round trip.
 * - Vertical: absolute RH2000 heights only where known. No pilot fixture has a known pole elevation:
 *   `heightRh2000M` is null. The support surface is named instead; its height is derived at render
 *   time from the rendered terrain or bridge-deck profile (never stored as a surveyed elevation).
 * - Mounting height: metres above the support surface.
 * - Orientation: `gridAzimuthDeg` clockwise from grid north (EPSG:3006 +N), degrees in [0, 360);
 *   `sceneHeadingRad` is the Step 6 bracket heading (arm direction (sin h, cos h) in scene x east /
 *   z south). They describe the same direction: azimuth = atan2(sin h, −cos h). Null = unknown.
 * - Every field group carries a status: known (taken from a source; mapped, not surveyed), derived
 *   (computed from known data), estimated (pilot assumption), unknown (null value).
 * - Existence, geometry, illumination evidence, activation and runtime representation are separate
 *   fields; a record is a renderer fixture only when `role` is 'fixture'.
 *
 * Canonical IDs (stable under input reordering; docs/step62/registry.md convention):
 * - mapped OSM lamp:            osm:node/<node id>
 * - estimate along a lit way:   estimate:<generator version>:way/<way id>:s<station index>
 * - other pilot estimates:      estimate:<generator version>:<pilot>:<local key>
 * `runtimeId` keeps the Step 6 pilot ID (crosswalk; used by existing data, tests and evidence).
 */
import { sceneToSweref as toSweref } from '../geo/sweref99tm.js';

/** EPSG:3006 E/N of a scene point (geo/sweref99tm.js; only the affine part of the reference is used). */
const sceneToSweref = (r: SceneReferenceLike, x: number, z: number) =>
  toSweref(r as Parameters<typeof toSweref>[0], x, z);

export type FieldStatus = 'known' | 'derived' | 'estimated' | 'unknown';

/** The Step 6 pilot generator, identified by script, version label and (absent) seed. */
export const PILOT_GENERATOR = {
  script: 'scripts/step6/import-streetlights.mjs',
  version: 'step6-pilot-v1',
  /** The generator uses no random numbers; output depends only on its pinned inputs. */
  seed: null,
} as const;

/**
 * Supported-map envelope, EPSG:3006 (docs/step62/coverage-audit.md), with a 100 m margin. A record
 * outside it (including a default 0/0 position) is rejected instead of rendered at the origin.
 */
export const MAP_ENVELOPE = { e0: 561_704, e1: 575_456, n0: 6_490_894, n1: 6_501_906 };

export interface SceneReferenceLike {
  originEasting: number;
  originNorthing: number;
  gridScaleFactor: number;
  metresPerUnit: number;
}
export type Support =
  | { kind: 'ground'; surface: 'rendered-ground'; status: 'derived' }
  | {
      kind: 'bridge-deck';
      surface: 'bridge-deck-profile';
      status: 'derived';
      /** Map road segment of the deck (scene units, network reference heights) and station t. */
      segment: { way: number; a: number[]; b: number[]; yA: number; yB: number; t: number };
    };
export interface RegistryFixture {
  id: string;
  runtimeId: string;
  role: 'fixture';
  parentId: string | null;
  /** Visual grouping key (pilot area). */
  group: string;
  /** Existence/placement evidence class. */
  placement: 'mapped' | 'estimated';
  /** Illumination evidence: a mapped lamp node, or estimated from a lit=yes way. */
  illumination: 'mapped-lit' | 'estimated';
  source: {
    dataset: string;
    /** OSM element the record derives from; null when the runtime ID does not encode it. */
    element: string | null;
    /** Dataset revision (OSM base timestamp of the snapshot). */
    snapshot: string;
    licence: string;
  };
  generator: {
    script: string;
    version: string;
    seed: null;
    method: 'osm-node' | 'lit-way-station' | 'pilot-site';
    station: number | null;
  };
  position: {
    e: number;
    n: number;
    heightRh2000M: null;
    meaning: 'fixture-base';
    status: FieldStatus;
    /** Stored scene-frame value used for rendering (scene units). */
    scene: { x: number; z: number };
  };
  support: Support;
  mountingHeightM: { value: number; status: FieldStatus };
  orientation: {
    sceneHeadingRad: number | null;
    gridAzimuthDeg: number | null;
    status: FieldStatus;
  };
  photometry: {
    fixtureType: string;
    cctK: number;
    candela: number;
    rangeM: number;
    /** 0 full-cutoff street distribution (needs an orientation), 1 radial lantern. */
    profile: number;
    status: FieldStatus;
  };
  occlusionM: { values: number[]; status: FieldStatus };
  activation: { mode: 'solar-night'; schedule: null; status: FieldStatus };
}
export interface LightingRegistry {
  version: 1;
  horizontalCrs: 'EPSG:3006';
  verticalDatum: 'RH2000';
  sources: {
    id: string;
    dataset: string;
    license: string;
    snapshot: Record<string, string> | string;
  }[];
  fixtures: RegistryFixture[];
}

/** The runtime pilot fixture shape (streetlights.json, unchanged since Step 6). */
export interface PilotFixture {
  id: string;
  pilot: string;
  type: string;
  x: number;
  z: number;
  heading: number | null;
  mount:
    | { kind: 'ground' }
    | {
        kind: 'bridge';
        segment: { way: number; a: number[]; b: number[]; yA: number; yB: number; t: number };
      };
  placement: 'mapped' | 'estimated';
  heightM: number;
  cct: number;
  candela: number;
  rangeM: number;
  profile: number;
  occlusionM: number[];
}
export interface PilotData {
  meta: {
    sources: {
      id: string;
      dataset: string;
      license: string;
      osmBase: Record<string, string> | string;
    }[];
  };
  fixtures: PilotFixture[];
}

/** Grid azimuth (degrees clockwise from grid north) of a scene bracket heading (radians). */
export function headingToGridAzimuth(heading: number) {
  const az = (Math.atan2(Math.sin(heading), -Math.cos(heading)) * 180) / Math.PI;
  return az < 0 ? az + 360 : az >= 360 ? az - 360 : az;
}

const RUNTIME_ID = /^([a-z0-9-]+):(?:osm-node-(\d+)|est-way-(\d+)-(\d+)|est-([a-z]+-\d+))$/;
/** Canonical ID, method and source element encoded by a Step 6 pilot runtime ID; null if unsupported. */
export function canonicalPilotId(runtimeId: string) {
  const m = RUNTIME_ID.exec(runtimeId);
  if (!m) return null;
  const [, pilot, node, way, station, local] = m;
  const v = PILOT_GENERATOR.version;
  if (node)
    return {
      id: `osm:node/${node}`,
      method: 'osm-node' as const,
      element: `node/${node}`,
      station: null,
    };
  if (way)
    return {
      id: `estimate:${v}:way/${way}:s${station}`,
      method: 'lit-way-station' as const,
      element: `way/${way}`,
      station: Number(station),
    };
  return {
    id: `estimate:${v}:${pilot}:${local}`,
    method: 'pilot-site' as const,
    element: null,
    station: null,
  };
}

/**
 * Adapter: the bundled Step 6 pilot data → registry records. Pure; does not sort, round or move any
 * value. Records whose runtime ID is unsupported keep a sentinel ID and fail validation.
 */
export function pilotRegistry(data: PilotData, reference: SceneReferenceLike): LightingRegistry {
  const snapshot = data.meta.sources.find((s) => s.id === 'osm-lighting-snapshot');
  const fixtures = data.fixtures.map((f): RegistryFixture => {
    const c = canonicalPilotId(f.id);
    const [e, n] = sceneToSweref(reference, f.x, f.z);
    const base =
      typeof snapshot?.osmBase === 'object' ? snapshot.osmBase[f.pilot] : snapshot?.osmBase;
    return {
      id: c?.id ?? `unsupported:${f.id}`,
      runtimeId: f.id,
      role: 'fixture',
      parentId: null,
      group: f.pilot,
      placement: f.placement,
      illumination: f.placement === 'mapped' ? 'mapped-lit' : 'estimated',
      source: {
        dataset: 'osm-lighting-snapshot',
        element: c?.element ?? null,
        snapshot: base ?? '',
        licence: snapshot?.license ?? '',
      },
      generator: {
        ...PILOT_GENERATOR,
        method: c?.method ?? 'pilot-site',
        station: c?.station ?? null,
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

/** Registry record → the runtime fixture shape used by fixtures.ts (stored scene values, unchanged). */
export function toPilotFixture(r: RegistryFixture): PilotFixture & { canonicalId: string } {
  return {
    id: r.runtimeId,
    canonicalId: r.id,
    pilot: r.group,
    type: r.photometry.fixtureType,
    x: r.position.scene.x,
    z: r.position.scene.z,
    heading: r.orientation.sceneHeadingRad,
    mount:
      r.support.kind === 'bridge-deck'
        ? { kind: 'bridge', segment: r.support.segment }
        : { kind: 'ground' },
    placement: r.placement,
    heightM: r.mountingHeightM.value,
    cct: r.photometry.cctK,
    candela: r.photometry.candela,
    rangeM: r.photometry.rangeM,
    profile: r.photometry.profile,
    occlusionM: r.occlusionM.values,
  };
}

export interface RegistryIssue {
  id: string;
  field: string;
  message: string;
}
export interface ValidationOptions {
  reference: SceneReferenceLike;
  /** Fixture types the renderer has geometry for (fixtures.ts FIXTURE_TYPES). */
  supportedTypes: readonly string[];
  /** Source elements explicitly mapped unlit (e.g. OSM lit=no ways): no fixture may derive from them. */
  unlitElements?: ReadonlySet<string>;
  maxRangeM?: number;
}
export interface ValidationResult {
  ok: boolean;
  errors: RegistryIssue[];
  counts: {
    records: number;
    fixtures: number;
    mapped: number;
    estimated: number;
    byGroup: Record<string, { mapped: number; estimated: number }>;
    bySupport: Record<string, number>;
  };
}
const SECTORS = 16;
const finite = (...v: unknown[]) => v.every((x) => typeof x === 'number' && Number.isFinite(x));
const CANONICAL = /^(osm:(node|way)\/\d+|estimate:[a-z0-9.-]+:[a-z0-9/:.-]+)$/;

/** Semantic validation of a registry (structure, units, provenance, references, bounds). */
export function validateRegistry(
  registry: LightingRegistry,
  options: ValidationOptions,
): ValidationResult {
  const errors: RegistryIssue[] = [];
  const err = (id: string, field: string, message: string) => errors.push({ id, field, message });
  if (registry.version !== 1) err('*', 'version', `unsupported version ${registry.version}`);
  if (registry.horizontalCrs !== 'EPSG:3006') err('*', 'horizontalCrs', 'must be EPSG:3006');
  if (registry.verticalDatum !== 'RH2000') err('*', 'verticalDatum', 'must be RH2000');
  const sources = new Set(registry.sources.map((s) => s.id));
  const ids = new Set<string>(),
    runtimeIds = new Set<string>();
  const maxRange = options.maxRangeM ?? 100;
  const counts: ValidationResult['counts'] = {
    records: registry.fixtures.length,
    fixtures: 0,
    mapped: 0,
    estimated: 0,
    byGroup: {},
    bySupport: {},
  };
  for (const r of registry.fixtures) {
    const id = typeof r.id === 'string' && r.id ? r.id : '(missing id)';
    if (!CANONICAL.test(id)) err(id, 'id', 'not a supported canonical ID');
    if (ids.has(id)) err(id, 'id', 'duplicate canonical ID');
    ids.add(id);
    if (runtimeIds.has(r.runtimeId)) err(id, 'runtimeId', `duplicate runtime ID ${r.runtimeId}`);
    runtimeIds.add(r.runtimeId);
    if (r.role !== 'fixture') err(id, 'role', `role ${r.role} is not a renderer fixture`);
    if (
      r.parentId !== null &&
      (r.parentId === id || !registry.fixtures.some((p) => p.id === r.parentId))
    )
      err(id, 'parentId', `unresolved parent ${r.parentId}`);
    // Provenance.
    if (!sources.has(r.source?.dataset))
      err(id, 'source.dataset', `unknown dataset ${r.source?.dataset}`);
    if (!r.source?.snapshot) err(id, 'source.snapshot', 'missing dataset revision');
    if (!r.source?.licence) err(id, 'source.licence', 'missing licence');
    if (!r.generator?.script || !r.generator?.version)
      err(id, 'generator', 'missing generator script/version');
    const expected =
      r.placement === 'mapped'
        ? { illumination: 'mapped-lit', method: 'osm-node', position: 'known', prefix: 'osm:' }
        : r.placement === 'estimated'
          ? { illumination: 'estimated', method: null, position: 'estimated', prefix: 'estimate:' }
          : null;
    if (!expected) err(id, 'placement', `unknown placement ${r.placement}`);
    else {
      if (r.illumination !== expected.illumination)
        err(id, 'illumination', `${r.placement} record labelled ${r.illumination}`);
      if (
        expected.method ? r.generator.method !== expected.method : r.generator.method === 'osm-node'
      )
        err(id, 'generator.method', `${r.generator.method} inconsistent with ${r.placement}`);
      if (r.position && r.position.status !== expected.position)
        err(id, 'position.status', `${r.placement} position labelled ${r.position.status}`);
      if (!id.startsWith(expected.prefix)) err(id, 'id', `${r.placement} record with ID ${id}`);
    }
    if (r.generator?.method === 'lit-way-station' && !/^way\/\d+$/.test(r.source?.element ?? ''))
      err(id, 'source.element', 'lit-way estimate without its source way');
    if (r.generator?.method === 'osm-node' && `osm:${r.source?.element}` !== id)
      err(id, 'source.element', `mapped node ID does not match element ${r.source?.element}`);
    if (r.source?.element && options.unlitElements?.has(r.source.element))
      err(id, 'illumination', `derived from explicitly unlit ${r.source.element}`);
    // Geometry and coordinate contract.
    const p = r.position;
    if (!p || !finite(p.e, p.n) || !p.scene || !finite(p.scene.x, p.scene.z))
      err(id, 'position', 'missing or non-finite geometry (not rendered)');
    else {
      if (
        p.e < MAP_ENVELOPE.e0 ||
        p.e > MAP_ENVELOPE.e1 ||
        p.n < MAP_ENVELOPE.n0 ||
        p.n > MAP_ENVELOPE.n1
      )
        err(id, 'position', `E/N ${p.e.toFixed(1)}/${p.n.toFixed(1)} outside the supported map`);
      const [e, n] = sceneToSweref(options.reference, p.scene.x, p.scene.z);
      if (Math.abs(e - p.e) > 1e-6 || Math.abs(n - p.n) > 1e-6)
        err(id, 'position', 'E/N inconsistent with the stored scene coordinates');
      if (p.heightRh2000M !== null && !finite(p.heightRh2000M))
        err(id, 'position.heightRh2000M', 'non-finite');
      if (p.meaning !== 'fixture-base')
        err(id, 'position.meaning', `unsupported meaning ${p.meaning}`);
    }
    const s = r.support;
    if (s?.kind === 'bridge-deck') {
      const g = s.segment;
      if (
        !g ||
        !finite(g.way, g.yA, g.yB, g.t, ...(g.a ?? []), ...(g.b ?? [])) ||
        g.a.length !== 2 ||
        g.b.length !== 2
      )
        err(id, 'support.segment', 'invalid bridge-deck segment');
      else if (g.t < 0 || g.t > 1) err(id, 'support.segment', `station t=${g.t} outside [0, 1]`);
    } else if (s?.kind !== 'ground') err(id, 'support', 'unknown support surface');
    // Physical parameters.
    const h = r.mountingHeightM?.value;
    if (!finite(h) || h <= 0 || h > 30) err(id, 'mountingHeightM', `invalid ${h}`);
    const ph = r.photometry;
    if (!ph || !options.supportedTypes.includes(ph.fixtureType))
      err(id, 'photometry.fixtureType', `unsupported fixture type ${ph?.fixtureType}`);
    if (!finite(ph?.candela) || ph.candela <= 0 || ph.candela > 100_000)
      err(id, 'photometry.candela', `invalid ${ph?.candela}`);
    if (!finite(ph?.rangeM) || ph.rangeM <= 0 || ph.rangeM > maxRange)
      err(id, 'photometry.rangeM', `invalid ${ph?.rangeM}`);
    if (!finite(ph?.cctK) || ph.cctK < 1000 || ph.cctK > 20_000)
      err(id, 'photometry.cctK', `invalid ${ph?.cctK}`);
    if (ph?.profile !== 0 && ph?.profile !== 1)
      err(id, 'photometry.profile', `unsupported ${ph?.profile}`);
    const o = r.orientation;
    if (o?.sceneHeadingRad === null) {
      if (o.gridAzimuthDeg !== null || o.status !== 'unknown')
        err(id, 'orientation', 'null heading must be unknown');
      if (ph?.profile === 0)
        err(id, 'orientation', 'directional street distribution without an orientation');
    } else if (!o || !finite(o.sceneHeadingRad, o.gridAzimuthDeg))
      err(id, 'orientation', 'non-finite');
    else if (Math.abs(headingToGridAzimuth(o.sceneHeadingRad!) - o.gridAzimuthDeg!) > 1e-9)
      err(id, 'orientation', 'grid azimuth inconsistent with scene heading');
    const occ = r.occlusionM?.values;
    if (
      !Array.isArray(occ) ||
      occ.length !== SECTORS ||
      !occ.every((v) => finite(v) && v >= 0 && v <= (ph?.rangeM ?? 0) + 1e-9)
    )
      err(id, 'occlusionM', `needs ${SECTORS} finite distances within the range`);
    if (r.activation?.mode !== 'solar-night' || r.activation.schedule !== null)
      err(id, 'activation', 'unsupported activation');
    if (r.role === 'fixture') {
      counts.fixtures++;
      if (r.placement === 'mapped') counts.mapped++;
      if (r.placement === 'estimated') counts.estimated++;
      const g = (counts.byGroup[r.group] ??= { mapped: 0, estimated: 0 });
      if (r.placement === 'mapped') g.mapped++;
      else g.estimated++;
      counts.bySupport[r.support?.kind] = (counts.bySupport[r.support?.kind] ?? 0) + 1;
    }
  }
  return { ok: errors.length === 0, errors, counts };
}

/** Provenance detail of one pilot fixture (src/lib/data/streetlights-provenance.json; not bundled). */
export interface PilotProvenance {
  id: string;
  method: string;
  uncertaintyM: number;
  source: {
    dataset: string;
    element: string;
    version?: number;
    timestamp?: string;
    tags?: Record<string, string>;
  };
  observed: string[];
  inferred: string[];
}
/**
 * Import-time join of the full provenance file (tests, manifest): fills elements the runtime ID does
 * not encode and checks that every encoded element matches. Returns the joined records and issues.
 */
export function attachProvenance(registry: LightingRegistry, provenance: PilotProvenance[]) {
  const byRuntime = new Map(provenance.map((p) => [p.id, p]));
  const issues: RegistryIssue[] = [];
  const fixtures = registry.fixtures.map((r) => {
    const p = byRuntime.get(r.runtimeId);
    if (!p) {
      issues.push({ id: r.id, field: 'provenance', message: 'missing provenance record' });
      return { record: r, provenance: null };
    }
    if (r.source.element !== null && r.source.element !== p.source.element)
      issues.push({
        id: r.id,
        field: 'source.element',
        message: `${r.source.element} ≠ provenance ${p.source.element}`,
      });
    if (p.source.dataset !== r.source.dataset)
      issues.push({
        id: r.id,
        field: 'source.dataset',
        message: `provenance dataset ${p.source.dataset}`,
      });
    const observed = p.observed.join(' ');
    if (r.placement === 'mapped' && !/mapped, not surveyed/.test(observed))
      issues.push({
        id: r.id,
        field: 'placement',
        message: 'mapped record without mapped-position evidence',
      });
    if (r.placement === 'estimated' && !p.inferred.some((x) => /position/.test(x)))
      issues.push({
        id: r.id,
        field: 'placement',
        message: 'estimated record whose position is not inferred',
      });
    return {
      record: { ...r, source: { ...r.source, element: r.source.element ?? p.source.element } },
      provenance: p,
    };
  });
  for (const p of provenance)
    if (!registry.fixtures.some((r) => r.runtimeId === p.id))
      issues.push({ id: p.id, field: 'provenance', message: 'provenance without registry record' });
  return { fixtures, issues };
}
