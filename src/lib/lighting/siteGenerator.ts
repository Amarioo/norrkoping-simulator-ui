/**
 * Lighting Phase L2d: deterministic generator for estimated SITE lighting (siteLighting.ts), a sister
 * of corridorGenerator.ts. Pure function of pinned inputs (no I/O, no randomness, no dependence on
 * input order):
 *   OSM site extract (scripts/data/lighting-l2d-source.json) + L0 street classification + rendered
 *   map context (roads, rails, trams, buildings, water, bridges, platforms) + the fixture-type table
 *   (Step 6 types + the two L2d types) + every earlier rendered fixture
 *   → fixtures (A1–A3 runtime shape, canonical-ID order), provenance, rejected candidates, per-site
 *     decisions, counts.
 *
 * Policy `lighting-l2d-v1` (values in siteLighting.ts L2D_POLICY; docs/lighting-city-l2d/):
 * 1. Lots: an amenity=parking outline (closed way) inside the map, open-air (not underground,
 *    multi-storey, rooftop, a building or covered), not street-side parking (lit by the street) and
 *    ≥ minLotAreaM2 gets site poles: a PERIMETER row (way-local stations N = round(perimeter /
 *    spacing) at (i + ½)·perimeter/N, lotInsetM inside the outline, arm pointing into the lot) and an
 *    interior GRID (spacing × spacing, aligned with the lot's longest edge, centred in its extent;
 *    only points ≥ lotGridEdgeFactor × spacing from the outline).
 * 2. Rail yard: railway=rail ways with service=yard|siding lying (≥ landShare of their length) on
 *    landuse=railway land, drawn in the rendered map, get yard masts beside the track (way-local
 *    stations at the mast spacing, yardOffsetM from the centreline, right side first), standing on
 *    the railway land.
 * 3. Site roads: highway=service ways (untagged service, parking aisles, drive-throughs) that L0 left
 *    dark, lying (≥ landShare) on industrial / port / retail / commercial / railway land and not
 *    inside a lit lot, drawn in the rendered map, get site poles on one side at the kerb (as A1–A3).
 * Everything else private stays dark (L0): driveways, untagged service roads outside site land,
 * parking aisles outside lots and site land, industrial spurs, tram yards.
 * Positions: a candidate may shift (rule-specific steps) to clear a conflict — inside or < 0.6 m
 * from a building, a carriageway (< half width + 0.4 m), tram (< 2.2 m) or rail (< 3.0 m)
 * centreline, a platform, water, under a bridge deck — and must stay inside its lot / on railway
 * land. Fixtures are ground-mounted only.
 * Seams: no earlier fixture is moved or re-created. A candidate within streetCoverM of an earlier
 * fixture (street, path, square lighting) is lit by it and dropped; any accepted fixture within 3 m
 * suppresses it; same-type L2d estimates keep 0.55 × spacing apart; another L2d type within the
 * candidate type's suppression radius suppresses it. Acceptance runs in rule order (yard, lot
 * perimeter, lot grid, site road), then canonical ID, so input order cannot change the outcome.
 * Occlusion: 16 sectors from the emitter to the first building wall or elevated deck edge (A1–A3).
 * Canonical IDs: estimate:lighting-l2d-v1:way/<lot | track | road way>:s<n>; lot grid points are
 * s(LOT_GRID_STATION_BASE + lattice index).
 */
import { geodeticToScene, sceneToSweref, swerefToScene } from '../geo/sweref99tm.js';
import { inRing } from './corridorA1';
import type {
  A1Fixture,
  ExistingFixture,
  GeneratorInput,
  MapRoad,
  Rejection,
  SceneReference,
  TypeSpec,
} from './corridorGenerator';
import { emitterPosition, type FixtureRecord } from './fixtures';
import {
  L2D_RULE_TYPE,
  L2D_RULES,
  LOT_GRID_STATION_BASE,
  type SitePolicy,
  type SiteRule,
} from './siteLighting';

export interface SiteElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  version: number;
  timestamp: string;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: [number, number][];
  outer?: [number, number][][];
  inner?: [number, number][][];
}
export interface SiteSource {
  meta: { osmBase: string; license: string; [k: string]: unknown };
  elements: SiteElement[];
}
export interface SiteInput {
  reference: SceneReference;
  source: SiteSource;
  map: GeneratorInput['map'];
  bridges: GeneratorInput['bridges'];
  platforms: GeneratorInput['platforms'];
  /** Step 6 types plus the L2d types. */
  types: Record<string, TypeSpec>;
  /** Every earlier rendered fixture (pilot, A1–A3, L2a, L2bc). */
  existing: ExistingFixture[];
  deckOccluders?: GeneratorInput['deckOccluders'];
}
export interface SiteSpec {
  generator: { script: string; version: string; seed: null };
  dataset: string;
  zone: { id: string; name: string; ring: readonly (readonly [number, number])[] };
  policy: SitePolicy;
  /** L0 decision of a highway way ('lit' | 'partial' | 'dark' and the reason), null if unknown. */
  l0: (way: number) => { status: string; reason: string } | null;
}
export interface SiteProvenance {
  id: string;
  rule: SiteRule;
  method: string;
  source: {
    dataset: string;
    element: string;
    version: number;
    timestamp: string;
    tags: Record<string, string>;
  };
  /** The lot or land the fixture belongs to (lot rules: the lot itself). */
  site: string | null;
  station: {
    index: number;
    of: number;
    /** Metres along the way / perimeter (null for grid points). */
    chainageM: number | null;
    /** Lattice indices along / across the lot's main axis (grid points only). */
    grid: [number, number] | null;
    spacingM: number;
    side: 'inner' | 'right' | 'left' | null;
    sideFallback: boolean;
    shiftM: number | [number, number];
    offsetM: number;
  };
  uncertaintyM: number;
  observed: string[];
  inferred: string[];
}
export interface SiteDecision {
  element: string;
  kind: 'lot' | 'yard-track' | 'service-road';
  name: string;
  status: string;
  /** Lot area (m²) or way length (m) inside the map. */
  size: number;
  land: string | null;
  fixtures: number;
}
export interface SiteOutput {
  fixtures: A1Fixture[];
  provenance: SiteProvenance[];
  rejected: Rejection[];
  sites: SiteDecision[];
  counts: Record<string, number>;
}

type P = [number, number];
const SECTORS = 16;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round = (v: number, d: number) => Number(v.toFixed(d));
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p: readonly number[], a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const ringDist = (p: readonly number[], ring: readonly P[]) => {
  let d = Infinity;
  for (let i = 1; i < ring.length; i++) d = Math.min(d, segDist(p, ring[i - 1], ring[i]));
  return d;
};
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
const polygonArea = (ring: readonly P[]) => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
};
/** Uniform grid of item bounding boxes; queries return ascending item indices (scan order kept). */
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

export function generateSites(input: SiteInput, spec: SiteSpec): SiteOutput {
  const POL = spec.policy;
  const ref = input.reference as unknown as Parameters<typeof sceneToSweref>[0];
  const M = input.reference.metresPerUnit;
  const toScene = (lat: number, lon: number) => geodeticToScene(ref, lat, lon) as P;
  const toEN = (x: number, z: number): [number, number] => {
    const [e, n] = sceneToSweref(ref, x, z);
    return [round(e, 2), round(n, 2)];
  };
  const zoneRing = spec.zone.ring.map(([e, n]) => swerefToScene(ref, e, n) as P);
  const inZone = (p: readonly number[]) => inRing(p, zoneRing);
  const ZONE = spec.zone.id;

  // ---- Map context, fixed order (input order never matters). ----
  const roadKey = (r: MapRoad) => [r.way, r.a[0], r.a[1], r.b[0], r.b[1]].join(',');
  const roads = [...input.map.roads].sort((a, b) => cmp(roadKey(a), roadKey(b)));
  const carRoads = roads.filter((r) => r.kind === 'road');
  const trams = roads.filter((r) => r.kind === 'tram');
  const rails = roads.filter((r) => r.kind === 'rail');
  const buildings = [...input.map.buildings].sort((a, b) => cmp(a.id, b.id));
  const edges: [number[], number[]][] = [];
  for (const b of buildings)
    for (const ring of b.rings) for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i], ring[i + 1]]);
  const water = input.map.areas.filter((a) => a.kind === 'water').sort((a, b) => cmp(a.id, b.id));
  const bridges = [...input.bridges].sort((a, b) => a.id - b.id);
  const platforms = [...input.platforms].sort((a, b) => a.id - b.id);
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
  const bridgeGrid = new BoxGrid(GRID);
  bridges.forEach((b, i) => b.ring.length && bridgeGrid.add(i, ...bboxOf(b.ring)));
  const nearby = (g: BoxGrid, p: readonly number[], r = 0) => g.query(p[0] - r, p[1] - r, p[0] + r, p[1] + r);
  const inPolygon = (p: readonly number[], rings: number[][][]) =>
    rings.length > 0 && inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r));
  /** First placement conflict of a ground fixture position, or null. */
  const conflict = (p: readonly number[]) => {
    for (const i of nearby(buildingGrid, p)) {
      const b = buildings[i];
      if (b.rings[0].length >= 3 && inPolygon(p, b.rings)) return `building ${b.id}`;
    }
    for (const i of nearby(edgeGrid, p, POL.buildingClearanceM / M)) {
      const [a, b] = edges[i];
      if (segDist(p, a, b) < POL.buildingClearanceM / M) return 'building wall clearance';
    }
    for (const i of nearby(carGrid, p)) {
      const r = carRoads[i];
      if (segDist(p, r.a, r.b) < r.width / 2 + POL.carriagewayClearanceM / M) return `carriageway way/${r.way}`;
    }
    for (const i of nearby(tramGrid, p)) {
      const r = trams[i];
      if (segDist(p, r.a, r.b) < POL.tramClearanceM / M) return `tram clearance way/${r.way}`;
    }
    for (const i of nearby(railGrid, p)) {
      const r = rails[i];
      if (segDist(p, r.a, r.b) < POL.railClearanceM / M) return `rail clearance way/${r.way}`;
    }
    for (const i of nearby(platformGrid, p)) {
      const pl = platforms[i];
      if (inRing(p, pl.ring)) return `${pl.kind} platform ${pl.id}`;
    }
    for (const i of nearby(waterGrid, p)) {
      const w = water[i];
      if (inPolygon(p, w.rings)) return `water ${w.id}`;
    }
    for (const i of nearby(bridgeGrid, p)) {
      const br = bridges[i];
      if (inRing(p, br.ring)) return `under bridge deck ${br.name}`;
    }
    return null;
  };
  const deckEdges = (input.deckOccluders ?? [])
    .map((o) => [o.a, o.b] as [number[], number[]])
    .sort((u, v) => cmp(u.join(), v.join()));
  const occlusion = (p: P, rangeM: number) => {
    const near = nearby(edgeGrid, p, rangeM / M + 1e-9).map((i) => edges[i]);
    const local = [...near, ...deckEdges].filter(([a, b]) => segDist(p, a, b) <= rangeM / M + 1e-9);
    return Array.from({ length: SECTORS }, (_, s) => {
      let m = rangeM;
      for (const f of [-1 / 3, 0, 1 / 3]) {
        const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
        m = Math.min(m, rayHit(p, [Math.cos(a), Math.sin(a)], local, rangeM / M) * M);
      }
      return round(m, 2);
    });
  };
  const fixtureOf = (type: string, id: string, p: P, heading: number | null): A1Fixture => {
    const t = input.types[type];
    const x = round(p[0], 4),
      z = round(p[1], 4);
    const [ex, , ez] = emitterPosition({ type, x, z, heading } as FixtureRecord, 0, M);
    return {
      id,
      zone: ZONE,
      type,
      x,
      z,
      heading: heading === null ? null : round(heading, 6),
      mount: { kind: 'ground' },
      placement: 'estimated',
      heightM: t.heightM,
      cct: t.cct,
      candela: t.candela,
      rangeM: t.rangeM,
      profile: t.profile,
      occlusionM: occlusion([ex, ez], t.rangeM),
    };
  };
  const rejected: Rejection[] = [];
  const reject = (candidate: string, element: string, reason: string, detail: string, p: readonly number[]) =>
    rejected.push({ candidate, element, zone: ZONE, reason, detail, en: toEN(p[0], p[1]) });

  // ---- Source elements, scene geometry. ----
  const elements = [...input.source.elements].sort((a, b) =>
    a.type !== b.type ? cmp(a.type, b.type) : a.id - b.id,
  );
  const ringOf = (g: [number, number][]) => g.map(([la, lo]) => toScene(la, lo));
  const closedWay = (e: SiteElement) =>
    e.type === 'way' && !!e.nodes && e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1];
  // Site land (landuse polygons), with outer and inner rings.
  interface Land {
    element: string;
    landuse: string;
    name: string;
    outer: P[][];
    inner: P[][];
  }
  const lands: Land[] = [];
  for (const e of elements) {
    const lu = e.tags.landuse;
    if (!lu) continue;
    if (e.type === 'way' && closedWay(e))
      lands.push({ element: `way/${e.id}`, landuse: lu, name: e.tags.name ?? '', outer: [ringOf(e.geometry!)], inner: [] });
    else if (e.type === 'relation' && e.outer?.length)
      lands.push({
        element: `relation/${e.id}`,
        landuse: lu,
        name: e.tags.name ?? '',
        outer: e.outer.map(ringOf),
        inner: (e.inner ?? []).map(ringOf),
      });
  }
  const landGrid = new BoxGrid(GRID * 4);
  lands.forEach((l, i) => landGrid.add(i, ...bboxOf(l.outer.flat())));
  const inLand = (p: readonly number[], l: Land) =>
    l.outer.some((r) => inRing(p, r)) && !l.inner.some((r) => inRing(p, r));
  /** Land polygons (of the given kinds) containing p, in element order. */
  const landsAt = (p: readonly number[], kinds: readonly string[]) =>
    nearby(landGrid, p)
      .map((i) => lands[i])
      .filter((l) => kinds.includes(l.landuse) && inLand(p, l));
  /** Share of a polyline's length on land of the given kinds, and the first such land by length. */
  const landShare = (pts: P[], kinds: readonly string[]) => {
    let total = 0,
      on = 0;
    const by = new Map<string, number>();
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i]);
      total += l;
      const mid: P = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
      const at = landsAt(mid, kinds);
      if (at.length) {
        on += l;
        by.set(at[0].element, (by.get(at[0].element) ?? 0) + l);
      }
    }
    let best: string | null = null;
    for (const [k, v] of by) if (best === null || v > by.get(best)!) best = k;
    return { share: total ? on / total : 0, land: best ? lands.find((l) => l.element === best)! : null };
  };
  const lengthM = (pts: P[]) => {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]) * M;
    return l;
  };
  // Rendered map segments per OSM way (alignment check, road widths).
  const mapSegments = new Map<number, MapRoad[]>();
  for (const r of roads) {
    const l = mapSegments.get(r.way);
    if (l) l.push(r);
    else mapSegments.set(r.way, [r]);
  }
  const deviationM = (pts: P[], segs: MapRoad[]) => {
    let dev = 0;
    for (const p of pts) {
      let d = Infinity;
      for (const s of segs) d = Math.min(d, segDist(p, s.a, s.b));
      dev = Math.max(dev, d * M);
    }
    return dev;
  };

  // ---- Earlier fixtures: identity and the street-cover rule. ----
  const existing = [...input.existing].sort((a, b) => cmp(a.id, b.id));
  const existingIds = new Set(existing.map((f) => f.id));
  const existingGrid = new BoxGrid(GRID);
  existing.forEach((f, i) => existingGrid.add(i, f.x, f.z, f.x, f.z));
  const coveredBy = (p: P) => {
    let best: { f: ExistingFixture; d: number } | null = null;
    for (const i of nearby(existingGrid, p, POL.streetCoverM / M + 1e-9)) {
      const f = existing[i];
      const d = dist(p, [f.x, f.z]) * M;
      if (d < POL.streetCoverM && (!best || d < best.d)) best = { f, d };
    }
    return best;
  };

  interface Candidate {
    id: string;
    rule: SiteRule;
    type: string;
    p: P;
    heading: number | null;
    prov: SiteProvenance;
  }
  const candidates: Candidate[] = [];
  const sites: SiteDecision[] = [];
  const sourceOf = (e: SiteElement, keys: string[]) => ({
    dataset: spec.dataset,
    element: `${e.type}/${e.id}`,
    version: e.version,
    timestamp: e.timestamp,
    tags: Object.fromEntries(keys.filter((k) => e.tags[k] !== undefined).map((k) => [k, e.tags[k]])),
  });
  const INFERRED = ['pole position', 'spacing', 'fixture type', 'mounting height', 'colour temperature', 'light output', 'distribution', 'that the site is lit at all'];
  const litObserved = (e: SiteElement, what: string) =>
    e.tags.lit === 'yes' ? [`${what} is tagged lit=yes`] : [];
  /** Common checks of a candidate position before acceptance; returns false when rejected. */
  const admit = (id: string, element: string, p: P) => {
    if (existingIds.has(id)) {
      reject(id, element, 'identity-in-existing-set', 'already rendered by an earlier rollout', p);
      return false;
    }
    const cover = coveredBy(p);
    if (cover) {
      reject(id, element, 'covered-by-street-lighting', `${cover.f.id} at ${cover.d.toFixed(1)} m`, p);
      return false;
    }
    return true;
  };

  // ---- 1. Parking lots. ----
  const litLots: { element: string; ring: P[] }[] = [];
  const lotType = L2D_RULE_TYPE['lot-perimeter'];
  const LT = input.types[lotType];
  for (const e of elements) {
    if (e.tags.amenity !== 'parking') continue;
    const t = e.tags;
    const decision: SiteDecision = {
      element: `${e.type}/${e.id}`,
      kind: 'lot',
      name: t.name ?? '',
      status: '',
      size: 0,
      land: null,
      fixtures: 0,
    };
    const keep = () => sites.push(decision);
    if (e.type !== 'way' || !closedWay(e)) {
      decision.status = 'no outline (mapped as a point or an open way): no position can be derived';
      if (e.type === 'node' && !inZone(toScene(e.lat!, e.lon!))) continue;
      keep();
      continue;
    }
    const ring = ringOf(e.geometry!);
    const areaM2 = polygonArea(ring) * M * M;
    decision.size = round(areaM2, 0);
    const c = ring.slice(0, -1).reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    const centre: P = [c[0] / (ring.length - 1), c[1] / (ring.length - 1)];
    if (!inZone(centre)) continue;
    decision.land = landsAt(centre, POL.siteLanduse)[0]?.element ?? null;
    keep();
    if (t.lit === 'no') {
      decision.status = 'explicit-unlit (lit=no): excluded';
      continue;
    }
    if ((POL.lotExcludedParking as readonly string[]).includes(t.parking ?? '') || t.building || t.covered === 'yes' || /underground|roof/.test(t.location ?? '')) {
      decision.status = `not an open-air lot (parking=${t.parking ?? '-'}${t.building ? ', building' : ''}${t.covered ? `, covered=${t.covered}` : ''}): no fixture`;
      continue;
    }
    if ((POL.lotStreetSide as readonly string[]).includes(t.parking ?? '')) {
      decision.status = `street-side parking (parking=${t.parking}): lit by the street lighting`;
      continue;
    }
    if (areaM2 < POL.minLotAreaM2) {
      decision.status = `smaller than ${POL.minLotAreaM2} m²: no fixture of its own`;
      continue;
    }
    decision.status = 'lit lot';
    litLots.push({ element: decision.element, ring });
    const tags = sourceOf(e, ['amenity', 'parking', 'access', 'lit', 'name', 'surface', 'operator']);
    // Perimeter.
    const cum = [0];
    for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + dist(ring[i - 1], ring[i]) * M);
    const L = cum[cum.length - 1];
    const S = LT.spacingM;
    const N = Math.round(L / S);
    if (N >= LOT_GRID_STATION_BASE) throw new Error(`${decision.element}: ${N} perimeter stations`);
    const at = (chain: number) => {
      const cc = ((chain % L) + L) % L;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < cc) i++;
      const segLen = cum[i] - cum[i - 1];
      const f = segLen > 0 ? (cc - cum[i - 1]) / segLen : 0;
      const a = ring[i - 1],
        b = ring[i];
      const l = dist(a, b) || 1;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as P, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as P };
    };
    for (let i = 0; i < N; i++) {
      const id = `estimate:${spec.generator.version}:way/${e.id}:s${i}`;
      const chain = ((i + 0.5) * L) / N;
      const base0 = at(chain);
      const inward = (b: P, dir: P, off: number): P => {
        const n: P = [-dir[1], dir[0]];
        const probe: P = [b[0] + (n[0] * POL.lotInsetM) / M, b[1] + (n[1] * POL.lotInsetM) / M];
        const s = inRing(probe, ring) ? 1 : -1;
        return [n[0] * s * off, n[1] * s * off];
      };
      const unshiftedOff = inward(base0.p, base0.dir, POL.lotInsetM);
      const unshifted: P = [base0.p[0] + unshiftedOff[0] / M, base0.p[1] + unshiftedOff[1] / M];
      let placed: { p: P; nIn: P; shift: number; extra: number } | null = null;
      let last = 'no valid station';
      outer: for (const extra of POL.lotExtraInsetsM)
        for (const shift of POL.shiftsM) {
          const { p: b, dir } = at(chain + shift);
          const off = inward(b, dir, POL.lotInsetM + extra);
          const p: P = [b[0] + off[0] / M, b[1] + off[1] / M];
          // At a corner the inward offset of one edge lands on the next edge: keep the inset.
          if (!inRing(p, ring) || ringDist(p, ring) * M < POL.lotInsetM - 0.25) {
            last = 'outside the lot or on its outline';
            continue;
          }
          if (!inZone(p)) {
            last = 'outside the map';
            continue;
          }
          const why = conflict(p);
          if (why) {
            last = why;
            continue;
          }
          const len = Math.hypot(off[0], off[1]) || 1;
          placed = { p, nIn: [off[0] / len, off[1] / len], shift, extra };
          break outer;
        }
      if (!placed) {
        reject(id, decision.element, 'no-valid-position', last, unshifted);
        continue;
      }
      if (!admit(id, decision.element, placed.p)) continue;
      candidates.push({
        id,
        rule: 'lot-perimeter',
        type: lotType,
        p: placed.p,
        heading: Math.atan2(placed.nIn[0], placed.nIn[1]),
        prov: {
          id,
          rule: 'lot-perimeter',
          method: `parking lot ${decision.element}${t.name ? ` (${t.name})` : ''}, ${Math.round(areaM2)} m²: perimeter station ${i + 1}/${N}, effective spacing ${(L / N).toFixed(1)} m (type ${S} m), ${(POL.lotInsetM + placed.extra).toFixed(2)} m inside the outline`,
          source: tags,
          site: decision.element,
          station: {
            index: i,
            of: N,
            chainageM: round(chain, 2),
            grid: null,
            spacingM: round(L / N, 2),
            side: 'inner',
            sideFallback: false,
            shiftM: placed.shift,
            offsetM: round(POL.lotInsetM + placed.extra, 3),
          },
          uncertaintyM: round(S / 2, 1),
          observed: ['the parking lot outline (OSM amenity=parking)', ...litObserved(e, 'the lot')],
          inferred: INFERRED,
        },
      });
    }
    // Interior grid, aligned with the longest edge.
    if (!POL.lotGrid) continue;
    let longest = 0,
      axis: P = [1, 0];
    for (let i = 1; i < ring.length; i++) {
      const l = dist(ring[i - 1], ring[i]);
      if (l > longest + 1e-12) {
        longest = l;
        axis = [(ring[i][0] - ring[i - 1][0]) / l, (ring[i][1] - ring[i - 1][1]) / l];
      }
    }
    const across: P = [-axis[1], axis[0]];
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    for (const p of ring) {
      const u = p[0] * axis[0] + p[1] * axis[1],
        v = p[0] * across[0] + p[1] * across[1];
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const nu = Math.max(1, Math.round(((u1 - u0) * M) / S)),
      nv = Math.max(1, Math.round(((v1 - v0) * M) / S));
    const point = (u: number, v: number): P => [u * axis[0] + v * across[0], u * axis[1] + v * across[1]];
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const k = j * nu + i;
        const u = u0 + ((i + 0.5) * (u1 - u0)) / nu,
          v = v0 + ((j + 0.5) * (v1 - v0)) / nv;
        const p0 = point(u, v);
        if (!inRing(p0, ring) || ringDist(p0, ring) * M < POL.lotGridEdgeFactor * S) continue;
        const id = `estimate:${spec.generator.version}:way/${e.id}:s${LOT_GRID_STATION_BASE + k}`;
        let placed: { p: P; shift: [number, number] } | null = null;
        let last = 'no valid station';
        for (const [du, dv] of POL.gridShiftsM) {
          const p = point(u + du / M, v + dv / M);
          if (!inRing(p, ring) || ringDist(p, ring) * M < POL.lotInsetM) {
            last = 'outside the lot';
            continue;
          }
          if (!inZone(p)) {
            last = 'outside the map';
            continue;
          }
          const why = conflict(p);
          if (why) {
            last = why;
            continue;
          }
          placed = { p, shift: [du, dv] };
          break;
        }
        if (!placed) {
          reject(id, decision.element, 'no-valid-position', last, p0);
          continue;
        }
        if (!admit(id, decision.element, placed.p)) continue;
        candidates.push({
          id,
          rule: 'lot-grid',
          type: lotType,
          p: placed.p,
          heading: Math.atan2(axis[0], axis[1]),
          prov: {
            id,
            rule: 'lot-grid',
            method: `parking lot ${decision.element}${t.name ? ` (${t.name})` : ''}, ${Math.round(areaM2)} m²: interior grid point (${i}, ${j}) of ${nu} × ${nv}, ${S} m lattice along the longest edge`,
            source: tags,
            site: decision.element,
            station: {
              index: k,
              of: nu * nv,
              chainageM: null,
              grid: [i, j],
              spacingM: S,
              side: null,
              sideFallback: false,
              shiftM: placed.shift,
              offsetM: 0,
            },
            uncertaintyM: round(S / 2, 1),
            observed: ['the parking lot outline (OSM amenity=parking)', ...litObserved(e, 'the lot')],
            inferred: INFERRED,
          },
        });
      }
  }
  const lotGrid = new BoxGrid(GRID * 2);
  litLots.forEach((l, i) => lotGrid.add(i, ...bboxOf(l.ring)));
  const inLitLot = (p: readonly number[]) => nearby(lotGrid, p).some((i) => inRing(p, litLots[i].ring));

  // ---- Way stations (yard tracks, site roads). ----
  const wayStations = (
    e: SiteElement,
    pts: P[],
    rule: 'yard-track-mast' | 'site-road-one-side',
    decision: SiteDecision,
    land: Land | null,
    opts: { offsetM: number; extras: readonly number[]; shifts: readonly number[]; mustStay?: (p: P) => boolean; observed: string[]; describe: string },
  ) => {
    const type = L2D_RULE_TYPE[rule];
    const T = input.types[type];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]) * M);
    const L = cum[cum.length - 1];
    const N = Math.round(L / T.spacingM);
    const at = (c: number) => {
      const cc = Math.max(0, Math.min(L, c));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < cc) i++;
      const segLen = cum[i] - cum[i - 1];
      const f = segLen > 0 ? (cc - cum[i - 1]) / segLen : 0;
      const a = pts[i - 1],
        b = pts[i];
      const l = dist(a, b) || 1;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as P, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as P };
    };
    if (!N) decision.status = `${decision.status}; shorter than half the ${T.spacingM} m spacing (no station)`;
    const tags = sourceOf(e, ['highway', 'service', 'railway', 'lit', 'name', 'access', 'surface']);
    for (let i = 0; i < N; i++) {
      const id = `estimate:${spec.generator.version}:way/${e.id}:s${i}`;
      const chain = ((i + 0.5) * L) / N;
      const base0 = at(chain);
      const unshifted: P = [base0.p[0] - (base0.dir[1] * opts.offsetM) / M, base0.p[1] + (base0.dir[0] * opts.offsetM) / M];
      const tryPlace = (s: 1 | -1) => {
        let last: string | null = null;
        for (const extra of opts.extras)
          for (const shift of opts.shifts) {
            const c = chain + shift;
            if (c < 0 || c > L) continue;
            const { p: b, dir } = at(c);
            const nrm: P = [-dir[1] * s, dir[0] * s];
            const off = opts.offsetM + extra;
            const p: P = [b[0] + (nrm[0] * off) / M, b[1] + (nrm[1] * off) / M];
            if (!inZone(p)) {
              last = last ?? 'outside the map';
              continue;
            }
            if (opts.mustStay && !opts.mustStay(p)) {
              last = last ?? 'off the site land';
              continue;
            }
            const why = conflict(p);
            if (!why) return { p, nrm, shift, extra };
            last = why;
          }
        return { fail: last ?? 'no valid station' };
      };
      let placed = tryPlace(1);
      let fallback = false;
      if ('fail' in placed) {
        const other = tryPlace(-1);
        if (!('fail' in other)) {
          placed = other;
          fallback = true;
        }
      }
      if ('fail' in placed) {
        reject(id, decision.element, 'no-valid-position', placed.fail ?? 'no valid station', unshifted);
        continue;
      }
      if (!admit(id, decision.element, placed.p)) continue;
      const side = fallback ? 'left' : 'right';
      candidates.push({
        id,
        rule,
        type,
        p: placed.p,
        // Masts are symmetric (no arm); site poles' arms point back to the road.
        heading: rule === 'yard-track-mast' ? null : Math.atan2(-placed.nrm[0], -placed.nrm[1]),
        prov: {
          id,
          rule,
          method: `${opts.describe} ${decision.element}${e.tags.name ? ` (${e.tags.name})` : ''}${land ? ` on ${land.landuse} land ${land.element}${land.name ? ` (${land.name})` : ''}` : ''}: station ${i + 1}/${N}, effective spacing ${(L / N).toFixed(1)} m (type ${T.spacingM} m), ${side} side${fallback ? ' (preferred side blocked)' : ''}, ${(opts.offsetM + placed.extra).toFixed(2)} m from the centreline`,
          source: tags,
          site: land?.element ?? null,
          station: {
            index: i,
            of: N,
            chainageM: round(chain, 2),
            grid: null,
            spacingM: round(L / N, 2),
            side,
            sideFallback: fallback,
            shiftM: placed.shift,
            offsetM: round(opts.offsetM + placed.extra, 3),
          },
          uncertaintyM: round(T.spacingM / 2, 1),
          observed: opts.observed,
          inferred: INFERRED,
        },
      });
    }
  };

  // ---- 2. Rail yard. ----
  for (const e of elements) {
    const t = e.tags;
    if (e.type !== 'way' || !t.railway || !/^(yard|siding|spur)$/.test(t.service ?? '')) continue;
    const pts = ringOf(e.geometry!);
    const inside = pts.filter(inZone).length;
    if (!inside) continue;
    const { share, land } = landShare(pts, ['railway']);
    const decision: SiteDecision = {
      element: `way/${e.id}`,
      kind: 'yard-track',
      name: t.name ?? '',
      status: '',
      size: round(lengthM(pts), 1),
      land: land?.element ?? landShare(pts, POL.siteLanduse).land?.element ?? null,
      fixtures: 0,
    };
    sites.push(decision);
    if (t.railway !== 'rail') {
      decision.status = `railway=${t.railway}: not an active main-line track (no fixture)`;
      continue;
    }
    if (t.lit === 'no') {
      decision.status = 'explicit-unlit (lit=no): excluded';
      continue;
    }
    if (!(POL.yardServices as readonly string[]).includes(t.service)) {
      decision.status = `service=${t.service}: industrial spur, not a yard (no fixture)`;
      continue;
    }
    if (share < POL.landShare) {
      decision.status = `${Math.round(share * 100)} % on landuse=railway land: not part of a rail yard (no fixture)`;
      continue;
    }
    const segs = (mapSegments.get(e.id) ?? []).filter((s) => s.kind === 'rail');
    if (!segs.length) {
      decision.status = 'not in the rendered map snapshot: alignment cannot be verified (no fixture)';
      continue;
    }
    const dev = deviationM(pts, segs);
    if (dev > POL.maxMapDeviationM) {
      decision.status = `source geometry differs from the rendered track by ${dev.toFixed(2)} m (no fixture)`;
      continue;
    }
    decision.status = 'lit yard track';
    const rail = lands.filter((l) => l.landuse === 'railway');
    wayStations(e, pts, 'yard-track-mast', decision, land, {
      offsetM: POL.yardOffsetM,
      extras: POL.yardExtraOffsetsM,
      shifts: POL.yardShiftsM,
      mustStay: (p) => rail.some((l) => inLand(p, l)),
      observed: [`a yard track (railway=rail, service=${t.service}) on landuse=railway land`, ...litObserved(e, 'the track')],
      describe: `yard track (service=${t.service})`,
    });
  }

  // ---- 3. Private site roads. ----
  for (const e of elements) {
    const t = e.tags;
    if (e.type !== 'way' || t.highway !== 'service') continue;
    const pts = ringOf(e.geometry!);
    if (!pts.some(inZone)) continue;
    const service = t.service ?? '';
    const l0 = spec.l0(e.id);
    const { share, land } = landShare(pts, POL.siteLanduse);
    const decision: SiteDecision = {
      element: `way/${e.id}`,
      kind: 'service-road',
      name: t.name ?? '',
      status: '',
      size: round(lengthM(pts), 1),
      land: share >= POL.landShare ? land?.element ?? null : null,
      fixtures: 0,
    };
    const mid = pts[Math.floor(pts.length / 2)];
    if (l0 && l0.status !== 'dark') continue; // street lighting (L0 lit / partly lit): not this category
    sites.push(decision);
    if (t.lit === 'no') {
      decision.status = 'explicit-unlit (lit=no): excluded';
      continue;
    }
    if (!(POL.roadServices as readonly string[]).includes(service)) {
      decision.status = `service=${service}: private access, stays dark (L0)`;
      continue;
    }
    if (service === 'parking_aisle' && inLitLot(mid)) {
      decision.status = 'parking aisle inside a lit lot: lit by the lot';
      continue;
    }
    if (share < POL.landShare) {
      decision.status =
        service === 'parking_aisle'
          ? 'parking aisle outside mapped lots and site land: stays dark (L0)'
          : 'outside industrial / port / retail / commercial / railway land: stays dark (L0)';
      continue;
    }
    if (t.bridge === 'yes' || t.tunnel === 'yes') {
      decision.status = `${t.bridge === 'yes' ? 'bridge' : 'tunnel'}: not modelled for site lighting (no fixture)`;
      continue;
    }
    const segs = (mapSegments.get(e.id) ?? []).filter((s) => s.kind === 'road');
    if (!segs.length) {
      decision.status = 'not in the rendered map snapshot: alignment cannot be verified (no fixture)';
      continue;
    }
    const dev = deviationM(pts, segs);
    if (dev > POL.maxMapDeviationM) {
      decision.status = `source geometry differs from the rendered road by ${dev.toFixed(2)} m (no fixture)`;
      continue;
    }
    decision.status = 'lit site road';
    wayStations(e, pts, 'site-road-one-side', decision, land, {
      offsetM: (segs[0].width * M) / 2 + POL.kerbSetbackM,
      extras: POL.extraSetbacksM,
      shifts: POL.shiftsM,
      observed: [
        `a private service road (highway=service${service ? `, service=${service}` : ''}) on ${land!.landuse} land (OSM landuse)`,
        ...litObserved(e, 'the road'),
      ],
      describe: `site road (service=${service || 'untagged'})`,
    });
  }

  // ---- 4. Order-independent acceptance (rule order, then canonical ID). ----
  const rank = (r: SiteRule) => L2D_RULES.indexOf(r);
  candidates.sort((a, b) => rank(a.rule) - rank(b.rule) || cmp(a.id, b.id));
  interface Accepted {
    id: string;
    p: P;
    type: string;
  }
  const accepted: Accepted[] = [];
  const acceptedGrid = new BoxGrid(GRID);
  const reachM = Math.max(
    POL.anySeparationM,
    ...Object.values(input.types).flatMap((t) => [t.suppressM, POL.estimateSeparationFactor * t.spacingM]),
  );
  const fixtures: A1Fixture[] = [];
  const provenance: SiteProvenance[] = [];
  const perSite = new Map<string, number>();
  for (const c of candidates) {
    const T = input.types[c.type];
    const element = c.prov.source.element;
    const by = nearby(acceptedGrid, c.p, reachM / M + 1e-9)
      .map((k) => accepted[k])
      .find((a) => {
        const d = dist(a.p, c.p) * M;
        return (
          d < POL.anySeparationM ||
          (a.type === c.type && d < POL.estimateSeparationFactor * T.spacingM) ||
          (a.type !== c.type && d < T.suppressM)
        );
      });
    if (by) {
      reject(c.id, element, 'suppressed-by-estimate', `${by.id} at ${(dist(by.p, c.p) * M).toFixed(1)} m`, c.p);
      continue;
    }
    accepted.push({ id: c.id, p: c.p, type: c.type });
    acceptedGrid.add(accepted.length - 1, c.p[0], c.p[1], c.p[0], c.p[1]);
    fixtures.push(fixtureOf(c.type, c.id, c.p, c.heading));
    provenance.push(c.prov);
    perSite.set(element, (perSite.get(element) ?? 0) + 1);
  }
  for (const s of sites) s.fixtures = perSite.get(s.element) ?? 0;

  const order = (a: { id: string }, b: { id: string }) => cmp(a.id, b.id);
  fixtures.sort(order);
  provenance.sort(order);
  rejected.sort((a, b) => cmp(a.candidate, b.candidate) || cmp(a.reason, b.reason));
  sites.sort((a, b) => cmp(a.element, b.element));
  const counts: Record<string, number> = {
    fixtures: fixtures.length,
    mapped: 0,
    estimated: fixtures.length,
    candidates: candidates.length,
    rejected: rejected.length,
  };
  for (const r of L2D_RULES) counts[`rule:${r}`] = provenance.filter((p) => p.rule === r).length;
  for (const f of fixtures) counts[`type:${f.type}`] = (counts[`type:${f.type}`] ?? 0) + 1;
  for (const r of rejected) counts[`rejected:${r.reason}`] = (counts[`rejected:${r.reason}`] ?? 0) + 1;
  for (const s of sites) {
    const k = `${s.kind}:${s.status.replace(/(?<![A-Za-z])-?\d[\d.]*/g, '#')}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { fixtures, provenance, rejected, sites, counts };
}
