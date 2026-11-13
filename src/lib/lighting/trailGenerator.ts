/**
 * Phase C2: deterministic generator for the estimated lanterns of the Vrinnevi illuminated trail
 * (trailLighting.ts). Pure function of pinned inputs (no I/O, no randomness, no dependence on input
 * order):
 *   the loop's OSM ways (scripts/data/trail-c2-source.json) + the rendered map context (trail
 *   segments, roads, rails, buildings, water) + the lantern type + every earlier rendered fixture
 *   → fixtures (A1–A3 runtime shape, canonical-ID order), provenance, rejected candidates, per-way
 *     decisions, counts.
 *
 * Policy `lighting-c2-v1` (values in trailLighting.ts C2_POLICY; docs/trail-c2/):
 * 1. The loop's ways are joined end to end into one closed ring (shared end nodes). The walk starts
 *    with the lowest way ID, in that way's own direction; a set of ways that does not form one ring
 *    is an error.
 * 2. A way that already carries fixtures of an earlier rollout is left alone (Lighting Phase L2bc lit
 *    the highway=path ways). The remaining ways form RUNS: maximal stretches of consecutive ways
 *    without earlier fixtures. A way tagged lit=no ends a run and gets nothing.
 * 3. Each run gets stations at the trail spacing: N = round(length / spacing) at (i + ½)·length/N
 *    from the run's start, so short ways do not lose their lamps to rounding. A post stands beside
 *    the trail (drawn half width + edgeSetbackM from the centreline), right side in walking direction
 *    first, then left; on a conflict the station shifts along the trail (shiftsM). Conflicts: inside
 *    or < 0.6 m from a building, a carriageway, tram or rail clearance, water, outside the map.
 * 4. Seams: no earlier fixture is moved or re-created. A station within coverM of an earlier fixture
 *    is lit by it and dropped.
 * 5. Canonical IDs: estimate:lighting-c2-v1:way/<way the unshifted station lies on>:s<n>, n counting
 *    the stations on that way along the walk.
 * Occlusion: 16 sectors from the emitter to the first building wall (as A1–A3). Trees do not block
 * light in this model.
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
import type { TrailPolicy } from './trailLighting';

export interface TrailWay {
  type: 'way';
  id: number;
  version: number;
  timestamp: string;
  tags: Record<string, string>;
  nodes: number[];
  /** [lat, lon] per node. */
  geometry: [number, number][];
}
export interface TrailSource {
  meta: {
    osmBase: string;
    license: string;
    relation: { element: string; version: number; timestamp: string; members: number[] };
    [k: string]: unknown;
  };
  elements: TrailWay[];
}
export interface TrailInput {
  reference: SceneReference;
  source: TrailSource;
  map: GeneratorInput['map'];
  /** The lantern type, with the trail spacing. */
  type: { name: string; spec: TypeSpec };
  /** Every earlier rendered fixture (pilot, A1–A3, L2a, L2bc, L2d). */
  existing: ExistingFixture[];
}
export interface TrailSpec {
  generator: { script: string; version: string; seed: null };
  dataset: string;
  zone: { id: string; name: string; ring: readonly (readonly [number, number])[] };
  policy: TrailPolicy;
}
export interface TrailProvenance {
  id: string;
  rule: 'trail-run-beside';
  method: string;
  source: { dataset: string; element: string; version: number; timestamp: string; tags: Record<string, string> };
  station: {
    /** Run number along the walk, station index in the run and stations in the run. */
    run: number;
    index: number;
    of: number;
    /** Metres from the run's start, and from the start of the way. */
    runChainageM: number;
    wayChainageM: number;
    spacingM: number;
    side: 'right' | 'left';
    sideFallback: boolean;
    shiftM: number;
    offsetM: number;
  };
  uncertaintyM: number;
  observed: string[];
  inferred: string[];
}
export interface TrailWayDecision {
  way: number;
  highway: string;
  /** Position in the walk (0 = first way) and whether the way is walked against its node order. */
  order: number;
  reversed: boolean;
  lengthM: number;
  status: string;
  /** Fixtures of earlier rollouts on this way, and this phase's. */
  earlierFixtures: number;
  fixtures: number;
}
export interface TrailOutput {
  fixtures: A1Fixture[];
  provenance: TrailProvenance[];
  rejected: Rejection[];
  ways: TrailWayDecision[];
  runs: { run: number; ways: number[]; lengthM: number; stations: number; fixtures: number }[];
  counts: Record<string, number>;
}

type P = [number, number];
const SECTORS = 16;
const WAY_OF = /^estimate:[a-z0-9.-]+:way\/(\d+):s\d+$/;
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

export function generateTrail(input: TrailInput, spec: TrailSpec): TrailOutput {
  const POL = spec.policy;
  const ref = input.reference as unknown as Parameters<typeof sceneToSweref>[0];
  const M = input.reference.metresPerUnit;
  const T = input.type.spec;
  const toEN = (x: number, z: number): [number, number] => {
    const [e, n] = sceneToSweref(ref, x, z);
    return [round(e, 2), round(n, 2)];
  };
  const zoneRing = spec.zone.ring.map(([e, n]) => swerefToScene(ref, e, n) as P);
  const ZONE = spec.zone.id;

  // ---- Map context, fixed order. ----
  const roadKey = (r: MapRoad) => [r.way, r.a[0], r.a[1], r.b[0], r.b[1]].join(',');
  const roads = [...input.map.roads].sort((a, b) => cmp(roadKey(a), roadKey(b)));
  const buildings = [...input.map.buildings].sort((a, b) => cmp(a.id, b.id));
  const water = input.map.areas.filter((a) => a.kind === 'water').sort((a, b) => cmp(a.id, b.id));
  const existing = [...input.existing].sort((a, b) => cmp(a.id, b.id));

  // ---- The loop's ways in scene coordinates, joined into one ring. ----
  const ways = [...input.source.elements].sort((a, b) => a.id - b.id);
  if (!ways.length) throw new Error('trail: no ways');
  const pointsOf = new Map(ways.map((w) => [w.id, w.geometry.map(([la, lo]) => geodeticToScene(ref, la, lo) as P)]));
  const walk: { way: TrailWay; reversed: boolean; pts: P[] }[] = [];
  {
    const left = new Map(ways.map((w) => [w.id, w]));
    let way: TrailWay = ways[0];
    let reversed = false;
    for (;;) {
      left.delete(way.id);
      const pts = pointsOf.get(way.id)!;
      walk.push({ way, reversed, pts: reversed ? [...pts].reverse() : pts });
      const end: number = reversed ? way.nodes[0] : way.nodes[way.nodes.length - 1];
      const next: TrailWay[] = [...left.values()].filter((w) => w.nodes[0] === end || w.nodes[w.nodes.length - 1] === end);
      if (!next.length) break;
      if (next.length > 1) throw new Error(`trail: the loop branches at node ${end}`);
      way = next[0];
      reversed = way.nodes[0] !== end;
    }
    const first = walk[0].way.nodes[0];
    const last = walk[walk.length - 1];
    const lastEnd = last.reversed ? last.way.nodes[0] : last.way.nodes[last.way.nodes.length - 1];
    if (left.size || lastEnd !== first) throw new Error('trail: the ways do not form one closed loop');
  }
  const lengthM = (pts: P[]) => {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]) * M;
    return l;
  };

  // ---- Earlier fixtures per way, and the drawn trail. ----
  const earlier = new Map<number, number>();
  for (const f of existing) {
    const m = WAY_OF.exec(f.id);
    if (m) earlier.set(Number(m[1]), (earlier.get(Number(m[1])) ?? 0) + 1);
  }
  const drawn = new Map<number, MapRoad[]>();
  for (const r of roads) {
    const l = drawn.get(r.way);
    if (l) l.push(r);
    else drawn.set(r.way, [r]);
  }
  const decisions: TrailWayDecision[] = walk.map(({ way, reversed, pts }, order) => ({
    way: way.id,
    highway: way.tags.highway ?? '',
    order,
    reversed,
    lengthM: round(lengthM(pts), 1),
    status: '',
    earlierFixtures: earlier.get(way.id) ?? 0,
    fixtures: 0,
  }));
  const open = walk.map(({ way, pts }, i) => {
    const d = decisions[i];
    if (way.tags.lit === 'no') return void (d.status = 'explicit-unlit (lit=no): excluded'), false;
    if (d.earlierFixtures) return void (d.status = `lit by an earlier rollout (${d.earlierFixtures} fixtures): left as it is`), false;
    const segs = drawn.get(way.id) ?? [];
    if (!segs.length) return void (d.status = 'not in the rendered map: alignment cannot be verified (no fixture)'), false;
    let dev = 0;
    for (const p of pts) {
      let best = Infinity;
      for (const s of segs) best = Math.min(best, segDist(p, s.a, s.b));
      dev = Math.max(dev, best * M);
    }
    if (dev > POL.maxMapDeviationM)
      return void (d.status = `source geometry differs from the drawn trail by ${dev.toFixed(2)} m (no fixture)`), false;
    d.status = 'estimated';
    return true;
  });

  // ---- Runs: maximal stretches of consecutive open ways along the ring. ----
  const n = walk.length;
  const runs: number[][] = [];
  if (open.every(Boolean)) runs.push(walk.map((_, i) => i));
  else {
    // Start right after a closed way, so no run wraps around the start.
    const start = (open.findIndex((o) => !o) + 1) % n;
    let current: number[] = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (open[i]) current.push(i);
      else if (current.length) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length) runs.push(current);
  }

  // ---- Conflicts. ----
  const edges: [number[], number[]][] = [];
  for (const b of buildings)
    for (const ring of b.rings) for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i], ring[i + 1]]);
  const inPolygon = (p: readonly number[], rings: number[][][]) =>
    rings.length > 0 && rings[0].length >= 3 && inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r));
  const conflict = (p: readonly number[]) => {
    if (!inRing(p, zoneRing)) return 'outside the map';
    for (const b of buildings) if (inPolygon(p, b.rings)) return `building ${b.id}`;
    for (const [a, b] of edges) if (segDist(p, a, b) < POL.buildingClearanceM / M) return 'building wall clearance';
    for (const r of roads) {
      const d = segDist(p, r.a, r.b);
      if (r.kind === 'road' && d < r.width / 2 + POL.carriagewayClearanceM / M) return `carriageway way/${r.way}`;
      if (r.kind === 'tram' && d < POL.tramClearanceM / M) return `tram clearance way/${r.way}`;
      if (r.kind === 'rail' && d < POL.railClearanceM / M) return `rail clearance way/${r.way}`;
    }
    for (const w of water) if (inPolygon(p, w.rings)) return `water ${w.id}`;
    return null;
  };
  const coveredBy = (p: P) => {
    let best: { f: ExistingFixture; d: number } | null = null;
    for (const f of existing) {
      const d = dist(p, [f.x, f.z]) * M;
      if (d < POL.coverM && (!best || d < best.d)) best = { f, d };
    }
    return best;
  };
  const occlusion = (p: P, rangeM: number) => {
    const local = edges.filter(([a, b]) => segDist(p, a, b) <= rangeM / M + 1e-9);
    return Array.from({ length: SECTORS }, (_, s) => {
      let m = rangeM;
      for (const f of [-1 / 3, 0, 1 / 3]) {
        const a = ((s + 0.5 + f) / SECTORS) * Math.PI * 2 - Math.PI;
        m = Math.min(m, rayHit(p, [Math.cos(a), Math.sin(a)], local, rangeM / M) * M);
      }
      return round(m, 2);
    });
  };

  // ---- Stations. ----
  const fixtures: A1Fixture[] = [];
  const provenance: TrailProvenance[] = [];
  const rejected: Rejection[] = [];
  const runStats: TrailOutput['runs'] = [];
  const INFERRED = ['pole position', 'spacing', 'fixture type', 'mounting height', 'colour temperature', 'light output', 'distribution'];
  runs.forEach((run, runIndex) => {
    // The run as one polyline, with the way each vertex interval belongs to.
    const pts: P[] = [];
    const wayAt: number[] = []; // walk index of segment i (pts[i] → pts[i + 1])
    const wayStart: number[] = []; // run chainage where each way of the run starts
    let acc = 0;
    for (const i of run) {
      wayStart.push(acc);
      const wp = walk[i].pts;
      for (let k = pts.length ? 1 : 0; k < wp.length; k++) {
        if (pts.length) wayAt.push(i);
        pts.push(wp[k]);
      }
      acc += lengthM(wp);
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]) * M);
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
      return {
        p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as P,
        dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as P,
        walkIndex: wayAt[i - 1],
      };
    };
    const perWay = new Map<number, number>();
    let placedInRun = 0;
    for (let i = 0; i < N; i++) {
      const chain = ((i + 0.5) * L) / N;
      const base = at(chain);
      const w = walk[base.walkIndex].way;
      const k = perWay.get(w.id) ?? 0;
      perWay.set(w.id, k + 1);
      const id = `estimate:${spec.generator.version}:way/${w.id}:s${k}`;
      const halfWidthM = ((drawn.get(w.id)?.[0]?.width ?? 0) * M) / 2;
      const offsetM = halfWidthM + POL.edgeSetbackM;
      const unshifted: P = [base.p[0] - (base.dir[1] * offsetM) / M, base.p[1] + (base.dir[0] * offsetM) / M];
      const reject = (reason: string, detail: string) =>
        rejected.push({ candidate: id, element: `way/${w.id}`, zone: ZONE, reason, detail, en: toEN(unshifted[0], unshifted[1]) });
      const tryPlace = (s: 1 | -1) => {
        let last: string | null = null;
        for (const shift of POL.shiftsM) {
          const c = chain + shift;
          if (c < 0 || c > L) continue;
          const { p: b, dir } = at(c);
          const nrm: P = [-dir[1] * s, dir[0] * s];
          const p: P = [b[0] + (nrm[0] * offsetM) / M, b[1] + (nrm[1] * offsetM) / M];
          const why = conflict(p);
          if (!why) return { p, nrm, shift };
          last = last ?? why;
        }
        return { fail: last ?? 'no valid station' };
      };
      // Scene x east, z south: the right-hand side of direction (dx, dz) is (−dz, dx).
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
        reject('no-valid-position', placed.fail ?? 'no valid station');
        continue;
      }
      const cover = coveredBy(placed.p);
      if (cover) {
        reject('covered-by-earlier-fixture', `${cover.f.id} at ${cover.d.toFixed(1)} m`);
        continue;
      }
      const x = round(placed.p[0], 4),
        z = round(placed.p[1], 4);
      // The lantern is radial; the heading points back to the trail, as L2bc's lanterns do.
      const heading = round(Math.atan2(-placed.nrm[0], -placed.nrm[1]), 6);
      const [ex, , ez] = emitterPosition({ type: input.type.name, x, z, heading } as FixtureRecord, 0, M);
      fixtures.push({
        id,
        zone: ZONE,
        type: input.type.name,
        x,
        z,
        heading,
        mount: { kind: 'ground' },
        placement: 'estimated',
        heightM: T.heightM,
        cct: T.cct,
        candela: T.candela,
        rangeM: T.rangeM,
        profile: T.profile,
        occlusionM: occlusion([ex, ez], T.rangeM),
      });
      const side = fallback ? 'left' : 'right';
      const wayChain = chain - wayStart[run.indexOf(base.walkIndex)];
      provenance.push({
        id,
        rule: 'trail-run-beside',
        method: `illuminated trail, way/${w.id} (highway=${w.tags.highway}, lit=yes): run ${runIndex + 1}, station ${i + 1}/${N}, effective spacing ${(L / N).toFixed(1)} m (policy ${T.spacingM} m), ${side} side${fallback ? ' (preferred side blocked)' : ''}, ${offsetM.toFixed(2)} m from the centreline`,
        source: { dataset: spec.dataset, element: `way/${w.id}`, version: w.version, timestamp: w.timestamp, tags: w.tags },
        station: {
          run: runIndex + 1,
          index: i,
          of: N,
          runChainageM: round(chain, 2),
          wayChainageM: round(wayChain, 2),
          spacingM: round(L / N, 2),
          side,
          sideFallback: fallback,
          shiftM: placed.shift,
          offsetM: round(offsetM, 3),
        },
        uncertaintyM: round(T.spacingM / 2, 1),
        observed: ['the way is lit (lit=yes)', `the way belongs to the running route ${input.source.meta.relation.element}`],
        inferred: INFERRED,
      });
      decisions[base.walkIndex].fixtures++;
      placedInRun++;
    }
    runStats.push({ run: runIndex + 1, ways: run.map((i) => walk[i].way.id), lengthM: round(L, 1), stations: N, fixtures: placedInRun });
  });

  const order = (a: { id: string }, b: { id: string }) => cmp(a.id, b.id);
  fixtures.sort(order);
  provenance.sort(order);
  rejected.sort((a, b) => cmp(a.candidate, b.candidate) || cmp(a.reason, b.reason));
  const loopM = decisions.reduce((s, d) => s + d.lengthM, 0);
  const counts: Record<string, number> = {
    fixtures: fixtures.length,
    mapped: 0,
    estimated: fixtures.length,
    stations: runStats.reduce((s, r) => s + r.stations, 0),
    rejected: rejected.length,
    ways: decisions.length,
    waysEstimated: decisions.filter((d) => d.status === 'estimated').length,
    waysEarlier: decisions.filter((d) => d.earlierFixtures > 0).length,
    loopLengthM: round(loopM, 1),
    estimatedLengthM: round(runStats.reduce((s, r) => s + r.lengthM, 0), 1),
    earlierFixturesOnLoop: decisions.reduce((s, d) => s + d.earlierFixtures, 0),
    loopFixtures: fixtures.length + decisions.reduce((s, d) => s + d.earlierFixtures, 0),
  };
  for (const r of rejected) counts[`rejected:${r.reason}`] = (counts[`rejected:${r.reason}`] ?? 0) + 1;
  return { fixtures, provenance, rejected, ways: decisions, runs: runStats, counts };
}
