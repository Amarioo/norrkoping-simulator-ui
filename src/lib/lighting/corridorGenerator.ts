/**
 * Lighting Phase A1: deterministic geographic fixture generator for a bounded corridor.
 *
 * Pure function of pinned inputs (no I/O, no randomness, no dependence on input order):
 *   OSM extract (scripts/data/lighting-a1-source.json) + rendered map context (roads, buildings,
 *   water, bridges, platforms) + the Step 6 fixture-type table + existing (pilot) fixtures
 *   → fixtures (runtime shape, canonical-ID order), provenance, rejected candidates, way coverage.
 *
 * Placement policy `lighting-a1-v1` (docs/lighting-phase-a1/data-provenance.md):
 * 1. Mapped: every OSM highway=street_lamp node inside the corridor is a mapped fixture at its
 *    mapped (not surveyed) position. Type from the nearest way's class (as Step 6). It is rejected,
 *    never moved, when the position is impossible (inside a building, a carriageway or water).
 * 2. Estimated: only along ways tagged lit=yes. lit=no is excluded; a missing tag is unknown and gets
 *    nothing. Platforms (shelter/canopy luminaires are not modelled), pedestrian areas and sidewalks
 *    or paths within 10 m of a lit road (lit by that road's lighting, Step 6 rule) get none.
 * 3. Stations are way-local: N = round(length / class spacing) stations at (i + ½)·length/N, so the
 *    spacing follows each way's own geometry (between its ends), never a global grid, never jitter.
 * 4. Side: a carriageway of a dual road (one-way, an opposite-direction same-name one-way partner within 40 m) gets one
 *    row on its outer kerb; roundabouts on the outer kerb of the ring; other roads on the sidewalk
 *    side (default right of travel); paths beside the path. If every shift on that side conflicts,
 *    the opposite side is tried (recorded).
 * 5. Offsets: kerb setback 0.8 m behind the carriageway edge, 0.3 m on bridge decks, 1.2 m beside a
 *    path. A station may shift ≤ 4 m along the way to clear a conflict: building (inside or < 0.6 m
 *    from a wall), any carriageway (< half width + 0.4 m; on a deck the own deck way excepted), tram
 *    track (< 2.2 m from a track centreline), railway (< 3.0 m), rail/tram platform, water (ground
 *    support), under a bridge deck (ground support), off its deck (deck support).
 * 7. Occlusion: 16 horizontal sectors per fixture, measured from the emitter (the lens on a bracket
 *    arm, where the shader evaluates them; Step 6 measured from the pole base): distance to the first building wall and,
 *    for ground-supported fixtures, to the first ELEVATED edge of a bridge deck outline (deck ≥ 2 m
 *    above the surface below; input `deckOccluders`), so a lamp beside a deck does not light the
 *    water or quay under it through the deck. Deck fixtures already clip light below the deck.
 * 6. Duplicates are identities, not distances: a mapped node already in an existing (pilot) set is not
 *    re-imported; estimate IDs carry this generator's version. Proximity only *suppresses estimates*
 *    (never mapped or existing fixtures): an estimate yields to a mapped/existing fixture of the same
 *    class group within the type's suppression radius, to an already accepted estimate of its class
 *    group within 0.55 × spacing, and to any accepted fixture within 3 m. Acceptance runs in canonical
 *    priority order (class rank, then canonical ID), so input order cannot change the outcome.
 * Canonical IDs: osm:node/<id>; estimate:lighting-a1-v1:way/<id>:s<station index along the way>.
 *
 * Lighting Phase A2 runs the same generator with its own corridor spec (zones, generator version,
 * dataset; corridorA2.ts) and two seam rules that are off for A1 (its output is unchanged):
 * - existingEstimatesAsAccepted: estimates of earlier rollouts (pilot, A1) count like this run's own
 *   accepted estimates (0.55 × class spacing within the class group), so a way that continues across
 *   a rollout boundary keeps its spacing instead of getting a second, offset row at the seam;
 * - stationSlotFamilies: a station (way, index) that an earlier rollout with the same station rule
 *   already rendered is that rollout's fixture (identity), never a second record.
 * Earlier records are never moved, merged or removed; every skipped candidate is reported.
 */
import { geodeticToScene, sceneToSweref, swerefToScene } from '../geo/sweref99tm.js';
import { A1_DATASET, A1_GENERATOR, A1_ZONE_ORDER, A1_ZONES, inRing } from './corridorA1';
import { A2_DATASET, A2_GENERATOR, A2_ZONE_ORDER, A2_ZONES } from './corridorA2';
import { A3_DATASET, A3_GENERATOR, A3_ZONE_ORDER, A3_ZONES } from './corridorA3';
import { emitterPosition, type FixtureRecord } from './fixtures';

export interface SceneReference {
  originEasting: number;
  originNorthing: number;
  gridScaleFactor: number;
  metresPerUnit: number;
}
export interface SourceElement {
  type: 'way' | 'node';
  id: number;
  version: number;
  timestamp: string;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: [number, number][];
}
export interface SourceExtract {
  meta: { osmBase: string; license: string; [k: string]: unknown };
  elements: SourceElement[];
}
export interface MapRoad {
  a: number[];
  b: number[];
  kind: string;
  width: number;
  class: string;
  name: string;
  bridge: boolean;
  way: number;
  yA: number;
  yB: number;
}
export interface TypeSpec {
  heightM: number;
  armM: number;
  cct: number;
  candela: number;
  rangeM: number;
  profile: number;
  spacingM: number;
  suppressM: number;
}
export interface ExistingFixture {
  /** Canonical ID (registry.ts). */
  id: string;
  x: number;
  z: number;
  type: string;
  /** Evidence class (Phase A2 seam rule; absent = treated as a mapped/existing fixture). */
  placement?: 'mapped' | 'estimated';
  /** Source element, e.g. way/123 (Phase A2 diagnostics). */
  element?: string | null;
}
export interface GeneratorInput {
  reference: SceneReference;
  source: SourceExtract;
  map: {
    roads: MapRoad[];
    buildings: { id: string; rings: number[][][] }[];
    areas: { id: string; kind?: string; rings: number[][][] }[];
  };
  bridges: { id: number; name: string; ring: number[][] }[];
  platforms: { id: number; name: string; kind: string; ring: number[][] }[];
  types: Record<string, TypeSpec>;
  existing: ExistingFixture[];
  /** Elevated bridge-deck outline edges (deck ≥ 2 m above the surface below), scene units. */
  deckOccluders?: { bridge: number; a: number[]; b: number[] }[];
}
export type Mount =
  | { kind: 'ground' }
  | {
      kind: 'bridge';
      segment: { way: number; a: number[]; b: number[]; yA: number; yB: number; t: number };
    };
/** Runtime record (src/lib/data/streetlights-a1.json): the pilot shape with canonical ID and zone. */
export interface A1Fixture {
  id: string;
  /** Corridor zone (A1: A/B/C, A2: D/E). */
  zone: string;
  type: string;
  x: number;
  z: number;
  heading: number | null;
  mount: Mount;
  placement: 'mapped' | 'estimated';
  heightM: number;
  cct: number;
  candela: number;
  rangeM: number;
  profile: number;
  occlusionM: number[];
}
export interface A1Provenance {
  id: string;
  zone: string;
  method: string;
  rule: string;
  source: {
    dataset: string;
    element: string;
    version: number;
    timestamp: string;
    tags: Record<string, string>;
  };
  station: null | {
    index: number;
    of: number;
    chainageM: number;
    wayLengthM: number;
    spacingM: number;
    side: 'outer' | 'inner' | 'right' | 'left';
    sideFallback: boolean;
    shiftM: number;
    offsetM: number;
  };
  orientation: 'unknown' | 'estimated';
  mapDeviationM: number | null;
  uncertaintyM: number;
  observed: string[];
  inferred: string[];
}
export interface Rejection {
  candidate: string;
  element: string;
  zone: string;
  reason: string;
  detail: string;
  /** EPSG:3006 E/N of the unshifted candidate, 0.01 m. */
  en: [number, number];
}
export interface WayCoverage {
  way: number;
  name: string;
  highway: string;
  lit: string;
  zones: string[];
  lengthInsideM: number;
  status: string;
  fixtures: number;
}
export interface GeneratorOutput {
  fixtures: A1Fixture[];
  provenance: A1Provenance[];
  rejected: Rejection[];
  ways: WayCoverage[];
  /** Rendered map ways inside the corridor with no lit tag in the snapshot (unknown illumination). */
  unknownWays: { way: number; name: string; class: string; lengthInsideM: number }[];
  counts: Record<string, number>;
}

export const A1_POLICY = {
  version: A1_GENERATOR.version,
  kerbSetbackM: 0.8,
  deckSetbackM: 0.3,
  pathOffsetM: 1.2,
  shiftsM: [0, 1.5, -1.5, 3, -3, 4, -4],
  buildingClearanceM: 0.6,
  carriagewayClearanceM: 0.4,
  tramClearanceM: 2.2,
  railClearanceM: 3.0,
  partnerSearchM: 40,
  partnerParallelCos: 0.7,
  roadCoverM: 10,
  estimateSeparationFactor: 0.55,
  anySeparationM: 3,
  maxMapDeviationM: 1,
  staggerWidthM: 9,
  extraSetbacksM: [0, 0.5, 1, 1.5, 2],
} as const;
/** Placement policy of a corridor run (A1_POLICY plus the Phase A2 seam rules, off when absent). */
export type CorridorPolicy = Omit<typeof A1_POLICY, 'version'> & {
  version: string;
  existingEstimatesAsAccepted?: boolean;
  stationSlotFamilies?: readonly string[];
};
/** A bounded corridor rollout: zones (EPSG:3006), generator identity, dataset and policy. */
export interface CorridorSpec {
  generator: { script: string; version: string; seed: null };
  dataset: string;
  zones: Record<string, { name: string; ring: [number, number][] }>;
  zoneOrder: readonly string[];
  policy: CorridorPolicy;
  /**
   * Phase L2: evidence that a way is lit, replacing "lit=yes" (A1–A3, the default): 'tag' (OSM
   * lit=yes), 'gap' (gap fill between lit pieces) or 'rule' (municipal guideline), else null. The
   * OSM tags themselves are never changed; lit=no always excludes the way.
   */
  litEvidence?: (way: SourceElement) => LitEvidence | null;
}
export type LitEvidence = 'tag' | 'gap' | 'rule';
const LIT_OBSERVED: Record<LitEvidence, string> = {
  tag: 'the way is lit (lit=yes)',
  gap: 'the way lies between lit pieces of the same street (gap fill, Phase L0)',
  rule: 'the way is lit by the municipal lighting guideline (rule, Phase L0)',
};
export const A1_SPEC: CorridorSpec = {
  generator: A1_GENERATOR,
  dataset: A1_DATASET,
  zones: A1_ZONES,
  zoneOrder: A1_ZONE_ORDER,
  policy: A1_POLICY,
};
/**
 * Placement policy `lighting-a2-v1`: A1's rules and values unchanged, plus the two seam rules (header).
 * Station-slot identity applies to A1 records (same station rule); the Step 6 pilot used a different
 * station walk, so its estimates take part through the spacing rule only.
 */
export const A2_POLICY: CorridorPolicy = {
  ...A1_POLICY,
  version: A2_GENERATOR.version,
  existingEstimatesAsAccepted: true,
  stationSlotFamilies: [A1_GENERATOR.version],
};
export const A2_SPEC: CorridorSpec = {
  generator: A2_GENERATOR,
  dataset: A2_DATASET,
  zones: A2_ZONES,
  zoneOrder: A2_ZONE_ORDER,
  policy: A2_POLICY,
};
/**
 * Placement policy `lighting-a3-v1` (Lighting Phase A3, the rest of the Kungstorget ring): A2's rules
 * and values unchanged; station-slot identity now also covers A2 records (same station rule as A1).
 */
export const A3_POLICY: CorridorPolicy = {
  ...A1_POLICY,
  version: A3_GENERATOR.version,
  existingEstimatesAsAccepted: true,
  stationSlotFamilies: [A1_GENERATOR.version, A2_GENERATOR.version],
};
export const A3_SPEC: CorridorSpec = {
  generator: A3_GENERATOR,
  dataset: A3_DATASET,
  zones: A3_ZONES,
  zoneOrder: A3_ZONE_ORDER,
  policy: A3_POLICY,
};
const SECTORS = 16;
const ROAD = new Set([
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
]);
const MINOR = new Set(['residential', 'living_street', 'unclassified', 'service', 'pedestrian']);
const PATH = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway']);
type ClassGroup = 'road' | 'minor' | 'path';
const classGroup = (highway: string): ClassGroup | null =>
  ROAD.has(highway) ? 'road' : MINOR.has(highway) ? 'minor' : PATH.has(highway) ? 'path' : null;
const TYPE_OF: Record<ClassGroup, string> = {
  road: 'street-bracket-8m',
  minor: 'street-bracket-6m',
  path: 'park-lantern-4m',
};
const RANK: Record<ClassGroup, number> = { road: 0, minor: 1, path: 2 };
const groupOfType = (type: string): ClassGroup =>
  type === 'street-bracket-8m' ? 'road' : type === 'street-bracket-6m' ? 'minor' : 'path';
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type P = [number, number];
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p: readonly number[], a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz), t };
}
function polylineDist(p: readonly number[], pts: readonly P[]) {
  let best = { d: Infinity, q: pts[0] as P, dir: [1, 0] as P };
  for (let i = 1; i < pts.length; i++) {
    const { d, t } = segDist(p, pts[i - 1], pts[i]);
    if (d < best.d) {
      const l = dist(pts[i - 1], pts[i]) || 1;
      best = {
        d,
        q: [
          pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
          pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
        ],
        dir: [(pts[i][0] - pts[i - 1][0]) / l, (pts[i][1] - pts[i - 1][1]) / l],
      };
    }
  }
  return best;
}
/** Distance along a ray to the first edge, or `max` (Step 6 occlusion helper). */
function rayHit(o: P, dir: P, edges: [number[], number[]][], max: number) {
  let best = max;
  for (const [a, b] of edges) {
    const ex = b[0] - a[0],
      ez = b[1] - a[1];
    const den = dir[0] * ez - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
    if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}
const round = (v: number, d: number) => Number(v.toFixed(d));

/**
 * Uniform-grid index of items by axis-aligned bounding box (Lighting Phase L2: citywide runs). A
 * query returns the indices of every item whose box overlaps the query box, ascending, so a scan
 * over the result visits items in their original order: filters that only drop items which cannot
 * pass a distance/containment test give exactly the same first match / minimum as a full scan.
 */
class BoxGrid {
  private cells = new Map<string, number[]>();
  constructor(private cell: number) {}
  add(i: number, x0: number, z0: number, x1: number, z1: number) {
    const c = this.cell;
    for (let x = Math.floor(x0 / c); x <= Math.floor(x1 / c); x++)
      for (let z = Math.floor(z0 / c); z <= Math.floor(z1 / c); z++) {
        const k = `${x},${z}`;
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(i);
      }
  }
  query(x0: number, z0: number, x1: number, z1: number): number[] {
    const c = this.cell,
      out = new Set<number>();
    for (let x = Math.floor(x0 / c); x <= Math.floor(x1 / c); x++)
      for (let z = Math.floor(z0 / c); z <= Math.floor(z1 / c); z++)
        for (const i of this.cells.get(`${x},${z}`) ?? []) out.add(i);
    return [...out].sort((a, b) => a - b);
  }
}
const bboxOf = (pts: readonly (readonly number[])[]) => {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]);
    z1 = Math.max(z1, p[1]);
  }
  return [x0, z0, x1, z1] as const;
};
/** Horizontal emitter position (scene units) of a fixture (fixtures.ts lens offset along the arm). */
function emitterXZ(type: string, x: number, z: number, heading: number | null, metres: number): P {
  const [ex, , ez] = emitterPosition({ type, x, z, heading } as FixtureRecord, 0, metres);
  return [ex, ez];
}

export function generateCorridor(
  input: GeneratorInput,
  spec: CorridorSpec = A1_SPEC,
): GeneratorOutput {
  const POL = spec.policy;
  const litOf = (e: SourceElement): LitEvidence | null =>
    e.tags.lit === 'no'
      ? null
      : spec.litEvidence
        ? spec.litEvidence(e)
        : e.tags.lit === 'yes'
          ? 'tag'
          : null;
  // Only the affine part of the reference is used (geo/sweref99tm.js).
  const ref = input.reference as unknown as Parameters<typeof sceneToSweref>[0];
  const M = input.reference.metresPerUnit;
  const toScene = (lat: number, lon: number) => geodeticToScene(ref, lat, lon) as P;
  const toEN = (x: number, z: number): [number, number] => {
    const [e, n] = sceneToSweref(ref, x, z);
    return [round(e, 2), round(n, 2)];
  };
  // Zones in scene units (derived once from the canonical E/N rings).
  const zones = spec.zoneOrder.map((z) => ({
    zone: z,
    ring: spec.zones[z].ring.map(([e, n]) => swerefToScene(ref, e, n) as P),
  }));
  const zoneOf = (p: readonly number[]): string | null =>
    zones.find((z) => inRing(p, z.ring))?.zone ?? null;
  const all = zones.flatMap((z) => z.ring);
  const bx0 = Math.min(...all.map((p) => p[0])) - 3,
    bx1 = Math.max(...all.map((p) => p[0])) + 3,
    bz0 = Math.min(...all.map((p) => p[1])) - 3,
    bz1 = Math.max(...all.map((p) => p[1])) + 3;
  const inBox = (p: readonly number[]) => p[0] >= bx0 && p[0] <= bx1 && p[1] >= bz0 && p[1] <= bz1;

  // Map context near the corridor, in a fixed order (input order never matters).
  const roadKey = (r: MapRoad) => [r.way, r.a[0], r.a[1], r.b[0], r.b[1]].join(',');
  const roads = input.map.roads
    .filter((r) => inBox(r.a) || inBox(r.b))
    .sort((a, b) => cmp(roadKey(a), roadKey(b)));
  const carRoads = roads.filter((r) => r.kind === 'road');
  const trams = roads.filter((r) => r.kind === 'tram');
  const rails = roads.filter((r) => r.kind === 'rail');
  const buildings = input.map.buildings
    .filter((b) => b.rings[0]?.some(inBox))
    .sort((a, b) => cmp(a.id, b.id));
  const edges: [number[], number[]][] = [];
  for (const b of buildings)
    for (const ring of b.rings)
      for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i], ring[i + 1]]);
  const water = input.map.areas
    .filter((a) => a.kind === 'water' && a.rings[0]?.some(inBox))
    .sort((a, b) => cmp(a.id, b.id));
  const bridges = [...input.bridges].sort((a, b) => a.id - b.id);
  const platforms = input.platforms.filter((p) => p.ring.some(inBox)).sort((a, b) => a.id - b.id);
  const elements = [...input.source.elements].sort((a, b) =>
    a.type !== b.type ? cmp(a.type, b.type) : a.id - b.id,
  );
  // Every rendered segment of each source way (not only those near the corridor), fixed order.
  const sourceIds = new Set(elements.filter((e) => e.type === 'way').map((e) => e.id));
  const mapSegments = new Map<number, MapRoad[]>();
  for (const r of input.map.roads)
    if (sourceIds.has(r.way)) mapSegments.set(r.way, [...(mapSegments.get(r.way) ?? []), r]);
  for (const list of mapSegments.values()) list.sort((a, b) => cmp(roadKey(a), roadKey(b)));
  const ways = elements
    .filter((e) => e.type === 'way' && e.tags.highway && e.geometry?.length)
    .map((e) => ({ e, pts: e.geometry!.map(([la, lo]) => toScene(la, lo)) }));
  const existingIds = new Set(input.existing.map((f) => f.id));

  // Spatial indexes (Phase L2). Each query returns candidates in their original order and only drops
  // items that cannot pass the test that follows, so results equal a full scan (A1–A3 unchanged).
  const GRID = 2; // scene units (50 m)
  const buildingGrid = new BoxGrid(GRID);
  buildings.forEach((b, i) => b.rings[0]?.length && buildingGrid.add(i, ...bboxOf(b.rings[0])));
  const edgeGrid = new BoxGrid(GRID);
  edges.forEach(([a, b], i) => edgeGrid.add(i, ...bboxOf([a, b])));
  const segmentGrid = (list: MapRoad[], pad: (r: MapRoad) => number) => {
    const g = new BoxGrid(GRID);
    list.forEach((r, i) => {
      const [x0, z0, x1, z1] = bboxOf([r.a, r.b]);
      const m = pad(r);
      g.add(i, x0 - m, z0 - m, x1 + m, z1 + m);
    });
    return g;
  };
  const carGrid = segmentGrid(carRoads, (r) => r.width / 2 + POL.carriagewayClearanceM / M);
  const tramGrid = segmentGrid(trams, () => POL.tramClearanceM / M);
  const railGrid = segmentGrid(rails, () => POL.railClearanceM / M);
  const waterGrid = new BoxGrid(GRID);
  water.forEach((w, i) => w.rings[0]?.length && waterGrid.add(i, ...bboxOf(w.rings[0])));
  const platformGrid = new BoxGrid(GRID);
  platforms.forEach((pl, i) => pl.ring.length && platformGrid.add(i, ...bboxOf(pl.ring)));
  const deckRoads = roads.filter((r) => r.bridge && r.kind !== 'tram' && r.kind !== 'rail');
  const nearby = (g: BoxGrid, p: readonly number[], r = 0) => g.query(p[0] - r, p[1] - r, p[0] + r, p[1] + r);

  const inPolygon = (p: readonly number[], rings: number[][][]) =>
    rings.length > 0 && inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r));
  const onBridgeRing = (p: readonly number[]) => bridges.find((b) => inRing(p, b.ring)) ?? null;
  /** Deck segment under a point: own way first, else the nearest bridge road segment (Step 6). */
  const deckAt = (p: readonly number[], way: number | null) => {
    let best: { d: number; r: MapRoad; t: number } | null = null;
    for (const r of deckRoads) {
      const { d, t } = segDist(p, r.a, r.b);
      const own = way !== null && r.way === way;
      if (d > r.width / 2 + 1.0 / M) continue;
      if (!best || (own && best.r.way !== way) || (own === (best.r.way === way) && d < best.d))
        best = { d, r, t };
    }
    if (!best) return null;
    const { r, t } = best;
    return { way: r.way, a: r.a, b: r.b, yA: r.yA, yB: r.yB, t: round(t, 4) };
  };
  /** First placement conflict of a fixture position, or null. */
  const conflict = (p: readonly number[], support: 'ground' | 'deck', ownWay: number | null) => {
    for (const i of nearby(buildingGrid, p)) {
      const b = buildings[i];
      if (b.rings[0].length >= 3 && inPolygon(p, b.rings)) return `building ${b.id}`;
    }
    for (const i of nearby(edgeGrid, p, POL.buildingClearanceM / M)) {
      const [a, b] = edges[i];
      if (segDist(p, a, b).d < POL.buildingClearanceM / M) return 'building wall clearance';
    }
    for (const i of nearby(carGrid, p)) {
      const r = carRoads[i];
      if (support === 'deck' && r.way === ownWay) continue;
      if (segDist(p, r.a, r.b).d < r.width / 2 + POL.carriagewayClearanceM / M)
        return `carriageway way/${r.way}`;
    }
    for (const i of nearby(tramGrid, p)) {
      const r = trams[i];
      if (segDist(p, r.a, r.b).d < POL.tramClearanceM / M) return `tram clearance way/${r.way}`;
    }
    for (const i of nearby(railGrid, p)) {
      const r = rails[i];
      if (segDist(p, r.a, r.b).d < POL.railClearanceM / M) return `rail clearance way/${r.way}`;
    }
    for (const i of nearby(platformGrid, p)) {
      const pl = platforms[i];
      if (inRing(p, pl.ring)) return `${pl.kind} platform ${pl.id}`;
    }
    if (support === 'ground') {
      for (const i of nearby(waterGrid, p)) {
        const w = water[i];
        if (inPolygon(p, w.rings)) return `water ${w.id}`;
      }
      const br = onBridgeRing(p);
      if (br) return `under bridge deck ${br.name}`;
    } else {
      // A deck fixture must stand on a deck outline when the bridge has one (never floating).
      const seg = deckAt(p, ownWay);
      if (!seg) return 'off the bridge deck';
    }
    return null;
  };
  const deckEdges = (input.deckOccluders ?? [])
    .map((o) => [o.a, o.b] as [number[], number[]])
    .sort((u, v) => cmp(u.join(), v.join()));
  const occlusion = (p: P, rangeM: number, ground: boolean) => {
    const near = nearby(edgeGrid, p, rangeM / M + 1e-9).map((i) => edges[i]);
    const local = (ground ? [...near, ...deckEdges] : near).filter(
      ([a, b]) => segDist(p, a, b).d <= rangeM / M + 1e-9,
    ) as [number[], number[]][];
    return Array.from({ length: SECTORS }, (_, s) => {
      let m = rangeM;
      for (const f of [-1 / 3, 0, 1 / 3]) {
        const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
        m = Math.min(m, rayHit(p, [Math.cos(a), Math.sin(a)], local, rangeM / M) * M);
      }
      return round(m, 2);
    });
  };
  const fixtureOf = (
    f: Omit<A1Fixture, 'heightM' | 'cct' | 'candela' | 'rangeM' | 'profile' | 'occlusionM'>,
  ): A1Fixture => {
    const t = input.types[f.type];
    return {
      ...f,
      x: round(f.x, 4),
      z: round(f.z, 4),
      heightM: t.heightM,
      cct: t.cct,
      candela: t.candela,
      rangeM: t.rangeM,
      profile: t.profile,
      // Measured from the emitter (lens on the bracket arm), where the shader evaluates the sectors.
      occlusionM: occlusion(
        emitterXZ(f.type, f.x, f.z, f.heading, M),
        t.rangeM,
        f.mount.kind === 'ground',
      ),
    };
  };
  const rejected: Rejection[] = [];
  const reject = (
    candidate: string,
    element: string,
    zone: string,
    reason: string,
    detail: string,
    p: readonly number[],
  ) => rejected.push({ candidate, element, zone, reason, detail, en: toEN(p[0], p[1]) });

  // Lengths inside the corridor and per-way coverage bookkeeping.
  const insideInfo = (pts: P[]) => {
    let len = 0;
    const zs = new Set<string>();
    for (let i = 1; i < pts.length; i++) {
      const mid: P = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2];
      const z = zoneOf(mid);
      if (z) {
        len += dist(pts[i], pts[i - 1]) * M;
        zs.add(z);
      }
    }
    for (const p of pts) {
      const z = zoneOf(p);
      if (z) zs.add(z);
    }
    return { len, zones: spec.zoneOrder.filter((z) => zs.has(z)) };
  };
  const coverage = new Map<number, WayCoverage>();
  const fixtureCount = new Map<number, number>();

  // Lit roads (centrelines) for the "covered by road lighting" path rule.
  const litRoadLines = ways
    .filter(
      ({ e }) => litOf(e) !== null && ['road', 'minor'].includes(classGroup(e.tags.highway) ?? ''),
    )
    .map(({ pts }) => pts);
  // Segments of the lit roads in a grid: the nearest one within roadCoverM is exactly the nearest
  // overall whenever that distance matters (the rule only compares it with roadCoverM).
  const litSegments: [P, P][] = [];
  for (const pts of litRoadLines) for (let i = 1; i < pts.length; i++) litSegments.push([pts[i - 1], pts[i]]);
  const litGrid = new BoxGrid(GRID);
  litSegments.forEach((s, i) => litGrid.add(i, ...bboxOf(s)));
  const nearestLitRoad = (p: P) => {
    let d = Infinity;
    for (const i of nearby(litGrid, p, POL.roadCoverM / M)) {
      const [a, b] = litSegments[i];
      d = Math.min(d, segDist(p, a, b).d);
    }
    return d;
  };

  // ---- 1. Mapped lamps. ----
  interface Accepted {
    id: string;
    p: P;
    group: ClassGroup;
    /** existing-estimate: an earlier rollout's estimate under the A2 seam rule (counts as accepted). */
    kind: 'mapped' | 'existing' | 'existing-estimate' | 'estimated';
    element: string | null;
  }
  // Canonical-ID order, so the reported suppressor never depends on input order.
  const accepted: Accepted[] = [...input.existing]
    .sort((a, b) => cmp(a.id, b.id))
    .map((f) => ({
      id: f.id,
      p: [f.x, f.z],
      group: groupOfType(f.type),
      kind:
        POL.existingEstimatesAsAccepted && f.placement === 'estimated'
          ? 'existing-estimate'
          : 'existing',
      element: f.element ?? null,
    }));
  // Accepted fixtures in a grid (insertion order = index), queried within the largest suppression
  // radius: the first match in insertion order equals Array.find over the whole list.
  const acceptedGrid = new BoxGrid(GRID);
  const reachM = Math.max(
    POL.anySeparationM,
    ...Object.values(input.types).flatMap((t) => [
      t.suppressM,
      POL.estimateSeparationFactor * t.spacingM,
    ]),
  );
  const indexAccepted = (k: number) =>
    acceptedGrid.add(k, accepted[k].p[0], accepted[k].p[1], accepted[k].p[0], accepted[k].p[1]);
  accepted.forEach((_, k) => indexAccepted(k));
  const accept = (a: Accepted) => {
    accepted.push(a);
    indexAccepted(accepted.length - 1);
  };
  const fixtures: A1Fixture[] = [];
  const provenance: A1Provenance[] = [];
  for (const n of elements) {
    if (n.type !== 'node' || n.tags.highway !== 'street_lamp') continue;
    const p = toScene(n.lat!, n.lon!);
    const zone = zoneOf(p);
    if (!zone) continue;
    const id = `osm:node/${n.id}`;
    if (existingIds.has(id)) {
      reject(
        id,
        `node/${n.id}`,
        zone,
        'identity-in-existing-set',
        'already in an earlier rollout',
        p,
      );
      continue;
    }
    let near: { d: number; q: P; e: SourceElement } | null = null;
    for (const { e, pts } of ways) {
      if (!classGroup(e.tags.highway)) continue;
      const r = polylineDist(p, pts);
      if (!near || r.d < near.d) near = { ...r, e };
    }
    const group: ClassGroup = near ? classGroup(near.e.tags.highway)! : 'minor';
    const type = TYPE_OF[group];
    const deck = deckAt(p, null);
    // Real positions are never moved; impossible ones are rejected with the reason.
    const c = conflict(p, deck ? 'deck' : 'ground', deck?.way ?? null);
    if (c && /^(building |carriageway|water|under bridge)/.test(c)) {
      reject(id, `node/${n.id}`, zone, 'mapped-position-conflict', c, p);
      continue;
    }
    const heading =
      input.types[type].profile === 0 && near
        ? Math.atan2(near.q[0] - p[0], near.q[1] - p[1])
        : null;
    fixtures.push(
      fixtureOf({
        id,
        zone,
        type,
        x: p[0],
        z: p[1],
        heading,
        mount: deck ? { kind: 'bridge', segment: deck } : { kind: 'ground' },
        placement: 'mapped',
      }),
    );
    provenance.push({
      id,
      zone,
      method: `OSM node position; type from nearest way ${near ? `way/${near.e.id} (highway=${near.e.tags.highway}, ${(near.d * M).toFixed(1)} m)` : '(none)'}`,
      rule: 'mapped-osm-node',
      source: {
        dataset: spec.dataset,
        element: `node/${n.id}`,
        version: n.version,
        timestamp: n.timestamp,
        tags: n.tags,
      },
      station: null,
      orientation: heading === null ? 'unknown' : 'estimated',
      mapDeviationM: null,
      uncertaintyM: 3,
      observed: ['position (mapped, not surveyed)', 'presence of a street lamp'],
      inferred: [
        'fixture type',
        'mounting height',
        'colour temperature',
        'light output',
        'distribution',
        ...(heading === null ? [] : ['orientation']),
        ...(c ? [`clearance warning: ${c}`] : []),
      ],
    });
    accept({ id, p, group, kind: 'mapped', element: `node/${n.id}` });
  }

  // ---- 2. Estimate candidates along lit=yes ways. ----
  interface Candidate {
    id: string;
    zone: string;
    group: ClassGroup;
    type: string;
    p: P;
    heading: number;
    mount: Mount;
    prov: A1Provenance;
  }
  const candidates: Candidate[] = [];
  const nameKey = (e: SourceElement) => e.tags.name ?? '';
  const isRing = (e: SourceElement) => /^(roundabout|circular)$/.test(e.tags.junction ?? '');
  // Roundabout centre: mean vertex of all ring ways of the same name (ways are in ID order).
  const ringSum = new Map<string, { x: number; z: number; n: number }>();
  for (const { e, pts } of ways)
    if (isRing(e)) {
      const k = nameKey(e) || `way/${e.id}`;
      const s = ringSum.get(k) ?? { x: 0, z: 0, n: 0 };
      for (const p of pts) {
        s.x += p[0];
        s.z += p[1];
        s.n++;
      }
      ringSum.set(k, s);
    }
  const centreOf = (e: SourceElement): P => {
    const s = ringSum.get(nameKey(e) || `way/${e.id}`)!;
    return [s.x / s.n, s.z / s.n];
  };
  for (const { e, pts } of ways) {
    const { len: lenIn, zones: wz } = insideInfo(pts);
    if (!wz.length) continue;
    const t = e.tags;
    const cov: WayCoverage = {
      way: e.id,
      name: t.name ?? '',
      highway: t.highway,
      lit: t.lit ?? 'unknown',
      zones: wz,
      lengthInsideM: round(lenIn, 1),
      status: '',
      fixtures: 0,
    };
    coverage.set(e.id, cov);
    const group = classGroup(t.highway);
    if (t.lit === 'no') {
      cov.status = 'explicit-unlit (lit=no): excluded';
      continue;
    }
    const lit = litOf(e);
    if (!lit) {
      cov.status = `lit=${t.lit ?? '(none)'}: not treated as lit`;
      continue;
    }
    if (t.highway === 'platform') {
      cov.status = 'lit platform: shelter/canopy luminaires not modelled (no fixture)';
      continue;
    }
    if (t.area === 'yes') {
      cov.status = 'lit area (square): positions cannot be derived from the outline (no fixture)';
      continue;
    }
    if (!group) {
      cov.status = `highway=${t.highway}: class not supported`;
      continue;
    }
    const segs = mapSegments.get(e.id);
    if (!segs?.length) {
      cov.status = 'not in the rendered map snapshot: alignment cannot be verified (no fixture)';
      continue;
    }
    // Source geometry must coincide with the rendered road (same OSM nodes, one week apart).
    let deviation = 0;
    for (const p of pts) {
      let d = Infinity;
      for (const s of segs) d = Math.min(d, segDist(p, s.a, s.b).d);
      deviation = Math.max(deviation, d * M);
    }
    if (deviation > POL.maxMapDeviationM) {
      cov.status = `source geometry differs from the rendered road by ${deviation.toFixed(2)} m (no fixture)`;
      continue;
    }
    if (group === 'path' && ['sidewalk', 'crossing'].includes(t.footway ?? '')) {
      cov.status = `covered by road lighting (footway=${t.footway})`;
      continue;
    }
    const type = TYPE_OF[group];
    const T = input.types[type];
    const width = segs[0].width;
    const bridge = t.bridge === 'yes' && segs.some((s) => s.bridge);
    const oneway = t.oneway === 'yes' || isRing(e);
    const partners =
      group !== 'path' && t.oneway === 'yes' && !isRing(e) && t.name
        ? ways.filter(
            (o) =>
              o.e.id !== e.id &&
              o.e.tags.oneway === 'yes' &&
              o.e.tags.name === t.name &&
              !isRing(o.e) &&
              litOf(o.e) !== null,
          )
        : [];
    const stagger = group !== 'path' && !oneway && !bridge && width * M >= POL.staggerWidthM;
    const offsetM =
      group === 'path'
        ? POL.pathOffsetM
        : (width * M) / 2 + (bridge ? POL.deckSetbackM : POL.kerbSetbackM);
    // Chainage table.
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]) * M);
    const L = cum[cum.length - 1];
    const spacing = stagger ? T.spacingM / 2 : T.spacingM;
    const N = Math.round(L / spacing);
    cov.status = N ? 'estimated' : `shorter than half the ${spacing} m spacing (no station)`;
    const at = (c: number) => {
      const cc = Math.max(0, Math.min(L, c));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < cc) i++;
      const segLen = cum[i] - cum[i - 1];
      const f = segLen > 0 ? (cc - cum[i - 1]) / segLen : 0;
      const a = pts[i - 1],
        b = pts[i];
      const l = dist(a, b) || 1;
      return {
        p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as P,
        dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as P,
      };
    };
    for (let i = 0; i < N; i++) {
      const id = `estimate:${spec.generator.version}:way/${e.id}:s${i}`;
      const chain = ((i + 0.5) * L) / N;
      const base0 = at(chain);
      // Preferred side (+1 = right of travel; normal (-dz, dx) in scene x east / z south).
      let side: 1 | -1 = 1,
        sideName: 'outer' | 'right' | 'left' = 'right';
      if (stagger) {
        side = i % 2 ? 1 : -1;
        sideName = side > 0 ? 'right' : 'left';
      } else if (isRing(e)) {
        const c = centreOf(e);
        const nrm = [-base0.dir[1], base0.dir[0]];
        side = (base0.p[0] - c[0]) * nrm[0] + (base0.p[1] - c[1]) * nrm[1] >= 0 ? 1 : -1;
        sideName = 'outer';
      } else if (partners.length) {
        // The partner is the nearest same-name one-way carriageway running alongside in the opposite
        // direction (cos ≤ −0.7): not the way's own continuation, not a same-name way across a junction.
        let near: { d: number; q: P } | null = null;
        for (const o of partners) {
          const r = polylineDist(base0.p, o.pts);
          if (r.dir[0] * base0.dir[0] + r.dir[1] * base0.dir[1] > -POL.partnerParallelCos) continue;
          if (!near || r.d < near.d) near = r;
        }
        if (near && near.d * M <= POL.partnerSearchM) {
          const nrm = [-base0.dir[1], base0.dir[0]];
          side = (near.q[0] - base0.p[0]) * nrm[0] + (near.q[1] - base0.p[1]) * nrm[1] > 0 ? -1 : 1;
          sideName = 'outer';
        }
      } else if ((t.sidewalk ?? t['sidewalk:both'] ?? '') === 'left') {
        side = -1;
        sideName = 'left';
      }
      const tryPlace = (s: 1 | -1) => {
        let last: string | null = null;
        // Standard setback with every shift first; then a deeper setback (ground only), e.g. to
        // stand outside a tram envelope; only then the other side (caller).
        for (const extra of bridge ? [0] : POL.extraSetbacksM)
          for (const shift of POL.shiftsM) {
            const c = chain + shift;
            if (c < 0 || c > L) continue;
            const { p: base, dir } = at(c);
            const nrm: P = [-dir[1] * s, dir[0] * s];
            const off = offsetM + extra;
            const p: P = [base[0] + (nrm[0] * off) / M, base[1] + (nrm[1] * off) / M];
            if (!zoneOf(p)) {
              last = last ?? 'outside the corridor';
              continue;
            }
            const why = conflict(p, bridge ? 'deck' : 'ground', e.id);
            if (!why) return { p, nrm, shift, extra };
            last = why;
          }
        return { fail: last ?? 'no valid station' };
      };
      const unshifted: P = (() => {
        const nrm: P = [-base0.dir[1] * side, base0.dir[0] * side];
        return [base0.p[0] + (nrm[0] * offsetM) / M, base0.p[1] + (nrm[1] * offsetM) / M];
      })();
      const zone0 = zoneOf(unshifted);
      if (!zone0) continue; // station outside the corridor: not a candidate of this rollout
      // Station-slot identity (A2): the same station of the same way under the same station rule,
      // already rendered by an earlier rollout, is that rollout's fixture.
      const slot = (POL.stationSlotFamilies ?? [])
        .map((v) => `estimate:${v}:way/${e.id}:s${i}`)
        .find((s) => existingIds.has(s));
      if (slot) {
        reject(
          id,
          `way/${e.id}`,
          zone0,
          'identity-in-existing-set',
          `station slot already rendered as ${slot}`,
          unshifted,
        );
        continue;
      }
      // A path station within 10 m of a lit road centreline is lit by that road (Step 6 rule,
      // applied per station: sidewalk-like stretches get none, park stretches get lanterns).
      if (group === 'path') {
        const d = nearestLitRoad(base0.p) * M;
        if (d < POL.roadCoverM) {
          reject(
            id,
            `way/${e.id}`,
            zone0,
            'covered-by-road-lighting',
            `${d.toFixed(1)} m from a lit road centreline`,
            unshifted,
          );
          continue;
        }
      }
      let placed = tryPlace(side);
      let fallback = false;
      if ('fail' in placed && !stagger) {
        const other = tryPlace(side === 1 ? -1 : 1);
        if (!('fail' in other)) {
          placed = other;
          fallback = true;
        }
      }
      const placedSide: NonNullable<A1Provenance['station']>['side'] = !fallback
        ? sideName
        : sideName === 'outer'
          ? 'inner'
          : side === 1
            ? 'left'
            : 'right';
      if ('fail' in placed) {
        reject(id, `way/${e.id}`, zone0, 'no-valid-position', placed.fail ?? '', unshifted);
        continue;
      }
      const { p, nrm, shift, extra } = placed;
      const zone = zoneOf(p)!;
      const mount: Mount = bridge
        ? { kind: 'bridge', segment: deckAt(p, e.id)! }
        : { kind: 'ground' };
      candidates.push({
        id,
        zone,
        group,
        type,
        p,
        // The bracket arm points back to the way (towards the carriageway), as in Step 6.
        heading: Math.atan2(-nrm[0], -nrm[1]),
        mount,
        prov: {
          id,
          zone,
          method: `${lit === 'tag' ? 'lit=yes' : `lit by ${lit}`} on way/${e.id} (highway=${t.highway}${bridge ? ', bridge' : ''}${t.name ? `, ${t.name}` : ''}); station ${i + 1}/${N}, effective spacing ${(L / N).toFixed(1)} m (class ${spacing} m), ${placedSide} side${fallback ? ' (preferred side blocked)' : ''}, ${(offsetM + extra).toFixed(2)} m from the centreline${extra ? ` (setback +${extra} m)` : ''}`,
          rule: stagger
            ? 'lit-way-staggered'
            : isRing(e)
              ? 'lit-way-roundabout-outer'
              : partners.length && sideName === 'outer'
                ? 'lit-way-dual-carriageway-outer'
                : group === 'path'
                  ? 'lit-path-beside'
                  : 'lit-way-one-side',
          source: {
            dataset: spec.dataset,
            element: `way/${e.id}`,
            version: e.version,
            timestamp: e.timestamp,
            tags: Object.fromEntries(
              ['highway', 'lit', 'name', 'oneway', 'junction', 'bridge', 'sidewalk', 'footway']
                .filter((k) => t[k] !== undefined)
                .map((k) => [k, t[k]]),
            ),
          },
          station: {
            index: i,
            of: N,
            chainageM: round(chain, 2),
            wayLengthM: round(L, 2),
            spacingM: round(L / N, 2),
            side: placedSide,
            sideFallback: fallback,
            shiftM: shift,
            offsetM: round(offsetM + extra, 3),
          },
          orientation: 'estimated',
          mapDeviationM: round(deviation, 3),
          uncertaintyM: round(spacing / 2, 1),
          observed: [LIT_OBSERVED[lit]],
          inferred: [
            'pole position',
            'spacing',
            'side',
            'fixture type',
            'mounting height',
            'colour temperature',
            'light output',
          ],
        },
      });
    }
  }

  // ---- 3. Order-independent acceptance (class rank, then canonical ID). ----
  candidates.sort((a, b) => RANK[a.group] - RANK[b.group] || cmp(a.id, b.id));
  for (const c of candidates) {
    const T = input.types[c.type];
    const element = c.prov.source.element;
    const asEstimate = (a: Accepted) => a.kind === 'estimated' || a.kind === 'existing-estimate';
    const by = nearby(acceptedGrid, c.p, reachM / M + 1e-9)
      .map((k) => accepted[k])
      .find(
        (a) =>
          (!asEstimate(a) && a.group === c.group && dist(a.p, c.p) * M < T.suppressM) ||
          (asEstimate(a) &&
            a.group === c.group &&
            dist(a.p, c.p) * M < POL.estimateSeparationFactor * T.spacingM) ||
          dist(a.p, c.p) * M < POL.anySeparationM,
      );
    if (by) {
      const reason =
        by.kind === 'mapped'
          ? 'suppressed-by-mapped'
          : by.kind === 'existing' || by.kind === 'existing-estimate'
            ? 'suppressed-by-existing'
            : 'suppressed-by-estimate';
      const sameWay = by.kind === 'existing-estimate' && by.element === element;
      reject(
        c.id,
        element,
        c.zone,
        reason,
        `${by.id} at ${(dist(by.p, c.p) * M).toFixed(1)} m${sameWay ? ' (same source way, earlier rollout)' : ''}`,
        c.p,
      );
      continue;
    }
    accept({ id: c.id, p: c.p, group: c.group, kind: 'estimated', element });
    fixtures.push(
      fixtureOf({
        id: c.id,
        zone: c.zone,
        type: c.type,
        x: c.p[0],
        z: c.p[1],
        heading: c.heading,
        mount: c.mount,
        placement: 'estimated',
      }),
    );
    provenance.push(c.prov);
    const w = Number(element.slice(4));
    fixtureCount.set(w, (fixtureCount.get(w) ?? 0) + 1);
  }
  for (const [w, n] of fixtureCount) coverage.get(w)!.fixtures = n;

  // ---- 4. Rendered ways inside the corridor without lit evidence in the snapshot. ----
  const sourceWays = new Set(ways.map(({ e }) => e.id));
  const unknown = new Map<
    number,
    { way: number; name: string; class: string; lengthInsideM: number }
  >();
  for (const r of roads) {
    if (r.kind !== 'road' && r.kind !== 'path') continue;
    if (sourceWays.has(r.way)) continue;
    const mid: P = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
    if (!zoneOf(mid)) continue;
    const u = unknown.get(r.way) ?? { way: r.way, name: r.name, class: r.class, lengthInsideM: 0 };
    u.lengthInsideM += dist(r.a, r.b) * M;
    unknown.set(r.way, u);
  }

  const order = (a: { id: string }, b: { id: string }) => cmp(a.id, b.id);
  fixtures.sort(order);
  provenance.sort(order);
  rejected.sort((a, b) => cmp(a.candidate, b.candidate));
  const wayList = [...coverage.values()].sort((a, b) => a.way - b.way);
  const counts: Record<string, number> = {
    fixtures: fixtures.length,
    mapped: fixtures.filter((f) => f.placement === 'mapped').length,
    estimated: fixtures.filter((f) => f.placement === 'estimated').length,
    candidates: candidates.length,
    rejected: rejected.length,
    deck: fixtures.filter((f) => f.mount.kind === 'bridge').length,
  };
  for (const z of spec.zoneOrder) counts[`zone${z}`] = fixtures.filter((f) => f.zone === z).length;
  for (const r of rejected)
    counts[`rejected:${r.reason}`] = (counts[`rejected:${r.reason}`] ?? 0) + 1;
  return {
    fixtures,
    provenance,
    rejected,
    ways: wayList,
    unknownWays: [...unknown.values()]
      .map((u) => ({ ...u, lengthInsideM: round(u.lengthInsideM, 1) }))
      .sort((a, b) => a.way - b.way),
    counts,
  };
}
