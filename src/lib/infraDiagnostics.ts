/**
 * Numerical infrastructure diagnostics (Step 3.5): how roads, rails, bridges, water and buildings
 * meet the rendered terrain. Pure computation on the same data and height rules as the city mesh,
 * so the tests (infrastructure.test.ts), the measurement harness (scripts/geo/infra-diagnose.test.ts)
 * and the dev-only inspection overlay (inspectInfra.ts, `?inspect=infra`) report identical numbers.
 *
 * Heights are compared in metres. Every issue carries a scene position (x, z) for the overlay.
 */
import { cityMap, type MapRoad, type Point } from './mapModel';
import { terrain, ROAD_SURFACE, spanHeight } from './terrain';
import { surfaceAt, networkPieces, buildingBase, fanWedge } from './cityMesh';
import { wheelHeight, railLift, trackKindOf, RouteTrack } from './trackProfile';
import { waterSurfaces, waterSurfaceAt, isFallEdge } from './waterReaches';
import { genericBridgeSegments, hasDetailedBridge } from './bridgeOwnership';

export type IssueKind =
  | 'below-terrain'
  | 'junction-step'
  | 'junction-fan'
  | 'steep-grade'
  | 'grade-break'
  | 'sag'
  | 'deck-near-water'
  | 'shore-below-water'
  | 'building-in-water'
  | 'missing-terrain'
  | 'duplicate-bridge'
  | 'cross-section'
  | 'vehicle-off-track'
  | 'terrain-spike';
export type Severity = 'warning' | 'error';
export interface InfraIssue {
  kind: IssueKind;
  x: number;
  z: number;
  /** Size of the defect in metres (depth, step, grade in percent for grades). */
  value: number;
  way?: number;
  detail: string;
  /** Set by classify(): warning = beyond the engineering limit, error = clearly unphysical. */
  severity?: Severity;
  /** A documented real structure that legitimately violates the generic rule (EXCEPTIONS). */
  exception?: string;
}
const M = terrain.data.reference.metresPerUnit;
const NETWORK = new Set(['road', 'path', 'rail', 'tram']);

/** Thresholds of the checks (metres unless stated). */
export const LIMITS = {
  belowTerrain: 0.05,
  junctionStep: 0.05,
  /** Longitudinal grade over 10 m, percent, per kind. */
  grade: { road: 12, tram: 8, rail: 4, path: 25 } as Record<string, number>,
  /** Change of grade between consecutive 10 m windows, percentage points. */
  gradeBreak: { road: 10, tram: 6, rail: 3, path: 25 } as Record<string, number>,
  sagDepth: 1.5,
  sagWindow: 25,
  deckClearance: 0.5,
  shoreBelowWater: 0.25,
  buildingWaterShare: 0.1,
  /**
   * Cross-section crease of a draped road: the drawn surface at the centreline minus the mean of both
   * edges. Real carriageways have a crown of ≈2.5 % (8 cm on a 6.6 m road) plus gutters, which the 1 m
   * DTM shows; 0.3 m is beyond any crown or gutter and marks a twisted surface (5 m mesh across walls,
   * terraces or an OSM width wider than the carriageway).
   */
  crease: 0.3,
  /** Wheel contact vs the drawn rail top (5 cm: visibly floating/sinking). */
  vehicleOffTrack: 0.05,
  /** A 5 m DTM node this far above/below all eight neighbours (no wall/quay class): spike or pit. */
  terrainSpike: 3,
} as const;

/**
 * Real structures that legitimately violate a generic rule. Each entry needs evidence (source).
 * Matched by OSM way id and issue kinds.
 */
export const EXCEPTIONS: { ways: number[]; kinds: IssueKind[]; reason: string }[] = [
  {
    ways: [270848680, 91356692, 270848411],
    kinds: ['steep-grade', 'grade-break'],
    reason:
      'P-hus Spiralen (E 569 240 N 6 494 839): helical multi-storey car-park ramps; OSM ramp ways, steep by design',
  },
];
/** Highway classes where a generic grade limit does not apply (stairs). */
const STEP_CLASSES = new Set(['steps']);

/** Severity from physical limits; exceptions from EXCEPTIONS and stairs. */
export function classify(issue: InfraIssue, roadKind?: string, roadClass?: string): InfraIssue {
  const v = Math.abs(issue.value);
  const k = roadKind ?? 'road';
  const twice = (limit: number) => (v > 2 * limit ? 'error' : 'warning');
  let severity: Severity = 'warning';
  switch (issue.kind) {
    case 'below-terrain':
      severity = v > 0.5 ? 'error' : 'warning';
      break;
    case 'junction-step':
    case 'junction-fan':
      severity = v > 0.3 ? 'error' : 'warning';
      break;
    case 'steep-grade':
      severity = v > 1.5 * (LIMITS.grade[k] ?? 12) ? 'error' : 'warning';
      break;
    case 'grade-break':
      severity = twice(LIMITS.gradeBreak[k] ?? 10);
      break;
    case 'sag':
      severity = twice(LIMITS.sagDepth);
      break;
    case 'deck-near-water':
      severity = issue.value < 0 ? 'error' : 'warning';
      break;
    case 'shore-below-water':
      severity = v > 1 ? 'error' : 'warning';
      break;
    case 'cross-section':
      severity = v > 1 ? 'error' : 'warning';
      break;
    case 'vehicle-off-track':
      severity = v > 0.3 ? 'error' : 'warning';
      break;
    case 'terrain-spike':
      severity = twice(LIMITS.terrainSpike);
      break;
    case 'missing-terrain':
    case 'duplicate-bridge':
      severity = 'error';
      break;
  }
  const listed = EXCEPTIONS.find((e) => issue.way !== undefined && e.ways.includes(issue.way) && e.kinds.includes(issue.kind));
  const exception =
    listed?.reason ??
    (roadClass && STEP_CLASSES.has(roadClass) && (issue.kind === 'steep-grade' || issue.kind === 'grade-break')
      ? 'stairs (highway=steps)'
      : undefined);
  return { ...issue, severity, ...(exception ? { exception } : {}) };
}

/** Drawn running surface of a segment at parameter t (metres). */
function drawn(r: MapRoad, t: number) {
  const p: Point = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t];
  return (surfaceAt(r, t, p, ROAD_SURFACE) * M) as number;
}
const ground = (x: number, z: number) => terrain.surfaceHeight(x, z) * M;
const length = (r: MapRoad) => Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) * M;

/** Running surfaces below the rendered terrain (centreline and both edges, every 2 m). */
export function belowTerrain(roads = cityMap.roads): InfraIssue[] {
  const out: InfraIssue[] = [];
  for (const whole of roads) {
    if (!NETWORK.has(whole.kind) || whole.tunnel) continue;
    for (const r of networkPieces(whole)) {
      // Draped pieces lie on the terrain planes by construction; only decks and spans can sink.
      if (!r.linearProfile) continue;
      const L = length(r),
        n = Math.max(2, Math.ceil(L / 2));
      const dx = (r.b[0] - r.a[0]) / (L / M || 1),
        dz = (r.b[1] - r.a[1]) / (L / M || 1),
        half = Math.max(r.width, 0.06) / 2;
      let worst = 0,
        at: Point = r.a;
      for (let k = 0; k <= n; k++) {
        const t = k / n,
          h = drawn(r, t);
        for (const side of [0, -1, 1]) {
          const x = r.a[0] + (r.b[0] - r.a[0]) * t - dz * half * side,
            z = r.a[1] + (r.b[1] - r.a[1]) * t + dx * half * side;
          const d = ground(x, z) - h;
          if (d > worst) [worst, at] = [d, [x, z]];
        }
      }
      if (worst > LIMITS.belowTerrain)
        out.push({
          kind: 'below-terrain',
          x: at[0],
          z: at[1],
          value: worst,
          way: r.way,
          detail: `${r.kind}${r.bridge ? ' bridge' : ''} ${r.name ?? ''}`.trim(),
        });
    }
  }
  return out;
}

/** Different drawn heights of the segments meeting at one node. */
export function junctionSteps(roads = cityMap.roads): InfraIssue[] {
  const nodes = new Map<string, { p: Point; h: number[]; ways: Set<number | undefined> }>();
  for (const r of roads) {
    if (!NETWORK.has(r.kind)) continue;
    for (const [p, t] of [
      [r.a, 0],
      [r.b, 1],
    ] as [Point, number][]) {
      const key = `${p[0]},${p[1]}`;
      if (!nodes.has(key)) nodes.set(key, { p, h: [], ways: new Set() });
      const n = nodes.get(key)!;
      n.h.push(drawn(r, t));
      n.ways.add(r.way);
    }
  }
  const out: InfraIssue[] = [];
  for (const { p, h, ways } of nodes.values()) {
    if (h.length < 2) continue;
    const step = Math.max(...h) - Math.min(...h);
    if (step > LIMITS.junctionStep)
      out.push({ kind: 'junction-step', x: p[0], z: p[1], value: step, detail: `ways ${[...ways].join(', ')}` });
  }
  return out;
}

/** Connected chains of one way's segments in data order. */
export function wayChains(roads = cityMap.roads) {
  const byWay = new Map<number | undefined, MapRoad[]>();
  for (const r of roads) {
    if (!NETWORK.has(r.kind)) continue;
    if (!byWay.has(r.way)) byWay.set(r.way, []);
    byWay.get(r.way)!.push(r);
  }
  const chains: MapRoad[][] = [];
  for (const list of byWay.values()) {
    let chain: MapRoad[] = [];
    for (const r of list) {
      const last = chain.at(-1);
      if (last && (last.b[0] !== r.a[0] || last.b[1] !== r.a[1])) {
        chains.push(chain);
        chain = [];
      }
      chain.push(r);
    }
    if (chain.length) chains.push(chain);
  }
  return chains;
}
/** The drawn longitudinal profile of a chain, sampled about every 2 m: [distance m, height m, x, z]. */
export function chainProfile(chain: MapRoad[]) {
  const s: number[] = [],
    h: number[] = [],
    x: number[] = [],
    z: number[] = [];
  let base = 0;
  for (const r of chain) {
    const L = length(r),
      n = Math.max(1, Math.ceil(L / 2));
    for (let k = s.length ? 1 : 0; k <= n; k++) {
      const t = k / n;
      s.push(base + L * t);
      h.push(drawn(r, t));
      x.push(r.a[0] + (r.b[0] - r.a[0]) * t);
      z.push(r.a[1] + (r.b[1] - r.a[1]) * t);
    }
    base += L;
  }
  return { s, h, x, z };
}

/** Decks (linear pieces) near a point and higher than `h` metres: the point lies under a bridge. */
function underDeck(roads: MapRoad[]) {
  const cells = new Map<number, MapRoad[]>();
  for (const whole of roads)
    for (const r of networkPieces(whole)) {
      if (!r.linearProfile || !NETWORK.has(r.kind)) continue;
      for (let i = Math.floor(Math.min(r.a[0], r.b[0])); i <= Math.floor(Math.max(r.a[0], r.b[0])); i++)
        for (let j = Math.floor(Math.min(r.a[1], r.b[1])); j <= Math.floor(Math.max(r.a[1], r.b[1])); j++) {
          const k = i * 100003 + j;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k)!.push(r);
        }
    }
  return (x: number, z: number, h: number) => {
    for (let i = Math.floor(x - 0.4); i <= Math.floor(x + 0.4); i++)
      for (let j = Math.floor(z - 0.4); j <= Math.floor(z + 0.4); j++)
        for (const r of cells.get(i * 100003 + j) ?? []) {
          const dx = r.b[0] - r.a[0],
            dz = r.b[1] - r.a[1],
            l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / l2));
          if (Math.hypot(x - r.a[0] - dx * t, z - r.a[1] - dz * t) * M < 10 && drawn(r, t) > h + 2) return true;
        }
    return false;
  };
}

/**
 * Longitudinal grades (10 m windows), grade breaks and sags of every way that is not a tunnel. A sag
 * under a bridge deck is a real underpass and not reported.
 */
export function profiles(roads = cityMap.roads) {
  const issues: InfraIssue[] = [];
  const under = underDeck(roads);
  const grades: Record<string, number[]> = {};
  for (const chain of wayChains(roads.filter((r) => !r.tunnel))) {
    const kind = chain[0].kind,
      way = chain[0].way,
      { s, h, x, z } = chainProfile(chain);
    const gradeAt: number[] = [];
    let j = 0;
    for (let i = 0; i < s.length; i++) {
      while (j < s.length && s[j] - s[i] < 10) j++;
      if (j >= s.length) break;
      gradeAt[i] = ((h[j] - h[i]) / (s[j] - s[i])) * 100;
      (grades[kind] ??= []).push(Math.abs(gradeAt[i]));
    }
    let worst: InfraIssue | null = null;
    for (let i = 0; i < gradeAt.length; i++) {
      const g = Math.abs(gradeAt[i]);
      if (g > LIMITS.grade[kind] && (!worst || g > worst.value))
        worst = { kind: 'steep-grade', x: x[i], z: z[i], value: g, way, detail: `${kind} ${chain[0].name ?? ''}`.trim() };
    }
    if (worst) issues.push(worst);
    // Grade break: the grade changes abruptly between the 10 m window ending here and the next one.
    let kink: InfraIssue | null = null;
    for (let i = 0, k = 0; i < gradeAt.length; i++) {
      while (k < gradeAt.length && s[k] - s[i] < 10) k++;
      if (k >= gradeAt.length) break;
      const d = Math.abs(gradeAt[k] - gradeAt[i]);
      if (d > LIMITS.gradeBreak[kind] && (!kink || d > kink.value))
        kink = { kind: 'grade-break', x: x[k], z: z[k], value: d, way, detail: `${kind} ${chain[0].name ?? ''}`.trim() };
    }
    if (kink) issues.push(kink);
    // Sag: a local minimum lower than the highest point on both sides within 25 m.
    let sag: InfraIssue | null = null;
    for (let i = 1; i < s.length - 1; i++) {
      if (h[i] > h[i - 1] || h[i] > h[i + 1]) continue;
      let left = -Infinity,
        right = -Infinity;
      for (let k = i - 1; k >= 0 && s[i] - s[k] <= LIMITS.sagWindow; k--) left = Math.max(left, h[k]);
      for (let k = i + 1; k < s.length && s[k] - s[i] <= LIMITS.sagWindow; k++) right = Math.max(right, h[k]);
      const d = Math.min(left, right) - h[i];
      if (d > LIMITS.sagDepth && (!sag || d > sag.value) && !under(x[i], z[i], h[i]))
        sag = { kind: 'sag', x: x[i], z: z[i], value: d, way, detail: `${kind} ${chain[0].name ?? ''}`.trim() };
    }
    if (sag) issues.push(sag);
  }
  return { issues, grades };
}

/** Bridge decks and spans closer than 0.5 m to (or below) the measured water surface. */
export function deckClearance(roads = cityMap.roads): InfraIssue[] {
  const out: InfraIssue[] = [];
  for (const whole of roads) {
    if (!NETWORK.has(whole.kind) || whole.tunnel) continue;
    for (const r of networkPieces(whole)) {
      if (!r.linearProfile) continue;
      const L = length(r),
        n = Math.max(2, Math.ceil(L / 2));
      let worst = Infinity,
        at: Point = r.a;
      for (let k = 0; k <= n; k++) {
        const t = k / n,
          x = r.a[0] + (r.b[0] - r.a[0]) * t,
          z = r.a[1] + (r.b[1] - r.a[1]) * t;
        const w = waterSurfaceAt(x, z);
        if (!w) continue;
        const c = drawn(r, t) - w.y * M;
        if (c < worst) [worst, at] = [c, [x, z]];
      }
      if (worst < LIMITS.deckClearance)
        out.push({
          kind: 'deck-near-water',
          x: at[0],
          z: at[1],
          value: worst,
          way: r.way,
          detail: `${r.kind} ${r.name ?? ''} clearance ${worst.toFixed(2)} m`.trim(),
        });
    }
  }
  return out;
}

/** Shoreline vertices where the rendered land is lower than the water drawn next to it. */
export function shorelines() {
  const out: InfraIssue[] = [];
  const gaps: number[] = [];
  for (const s of waterSurfaces)
    for (const ring of s.rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (isFallEdge(a, b)) continue;
        const d = (terrain.groundHeight(...a) - s.y) * M;
        gaps.push(d);
        if (d < -LIMITS.shoreBelowWater)
          out.push({
            kind: 'shore-below-water',
            x: a[0],
            z: a[1],
            value: -d,
            detail: `${s.area} reach ${s.reach.id} (${s.reach.levelMetres.toFixed(2)} m)`,
          });
      }
  return { issues: out, gaps };
}

/** Buildings whose footprint lies partly in measured water (sampled on a 2 m grid). */
export function buildingsInWater(): InfraIssue[] {
  const out: InfraIssue[] = [];
  const step = 2 / M;
  for (const b of cityMap.buildings) {
    const ring = b.rings[0];
    const xs = ring.map((p) => p[0]),
      zs = ring.map((p) => p[1]);
    let inside = 0,
      wet = 0,
      deepest = -Infinity,
      at: Point = ring[0];
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
        let ok = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
          if (ring[i][1] > z !== ring[j][1] > z && x < ((ring[j][0] - ring[i][0]) * (z - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0])
            ok = !ok;
        if (!ok) continue;
        inside++;
        const w = waterSurfaceAt(x, z);
        if (w) {
          wet++;
          if (w.y > deepest) [deepest, at] = [w.y, [x, z]];
        }
      }
    if (inside && wet / inside > LIMITS.buildingWaterShare)
      out.push({
        kind: 'building-in-water',
        x: at[0],
        z: at[1],
        value: wet / inside,
        detail: `${b.id} ${b.name ?? ''} ${Math.round((wet / inside) * 100)} % of footprint, base ${((buildingBase(b) - deepest) * M).toFixed(2)} m vs water`.trim(),
      });
  }
  return out;
}

/** Network points without DTM coverage, and segments owned by both a detailed and a generic bridge. */
export function dataChecks(roads = cityMap.roads): InfraIssue[] {
  const out: InfraIssue[] = [];
  for (const r of roads) {
    if (!NETWORK.has(r.kind)) continue;
    for (const p of [r.a, r.b])
      if (!terrain.sample(p[0], p[1]))
        out.push({ kind: 'missing-terrain', x: p[0], z: p[1], value: 0, way: r.way, detail: 'no DTM sample' });
  }
  for (const s of genericBridgeSegments)
    if (hasDetailedBridge(s))
      out.push({ kind: 'duplicate-bridge', x: s.a[0], z: s.a[1], value: 0, way: s.way, detail: 'generic and detailed' });
  return out;
}

/** Drawn rail tops (both rails, scene units) of a map track segment at t; same rule as cityMesh. */
export function drawnRails(r: MapRoad, t: number) {
  // Rails are drawn level across the gauge at the centreline profile (cityMesh profileStrip).
  const c: Point = [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t],
    h = surfaceAt(r, t, c, railLift(r.kind === 'rail' ? 'rail' : 'tram'));
  return [h, h];
}
/** Map track segments by their end nodes (either direction), for matching route segments. */
function trackIndex(roads = cityMap.roads) {
  const key = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const index = new Map<string, { r: MapRoad; reversed: boolean }>();
  for (const r of roads) {
    if (r.kind !== 'rail' && r.kind !== 'tram') continue;
    index.set(key(r.a) + '|' + key(r.b), { r, reversed: false });
    if (!index.has(key(r.b) + '|' + key(r.a))) index.set(key(r.b) + '|' + key(r.a), { r, reversed: true });
  }
  return (a: number[], b: number[]) => index.get(key(a) + '|' + key(b));
}
export interface RailSample {
  route: string;
  x: number;
  z: number;
  /** Wheel contact minus the drawn rail top (mean of both rails), metres. */
  deviation: number;
  kind: 'deck' | 'span' | 'ground' | 'no-track';
  way?: number;
}
/**
 * Vehicle-to-track alignment: every ~2 m along each transit route, the vehicle's wheel-contact height
 * (trackProfile.ts, the backend contract) against the rails drawn for the same map segment.
 */
export function railAlignment(routes = cityMap.transitRoutes, roads = cityMap.roads, step = 2) {
  const track = trackIndex(roads);
  const samples: RailSample[] = [];
  for (const route of routes) {
    const P = route.points;
    for (let i = 0; i + 1 < P.length; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][2] - P[i][2]) * M;
      const n = Math.max(1, Math.ceil(L / step));
      const hit = track([P[i][0], P[i][2]], [P[i + 1][0], P[i + 1][2]]);
      for (let k = 0; k < n; k++) {
        const t = k / n,
          x = P[i][0] + (P[i + 1][0] - P[i][0]) * t,
          z = P[i][2] + (P[i + 1][2] - P[i][2]) * t;
        const wheel = wheelHeight(P, i, t, trackKindOf(route.kind));
        if (!hit) {
          samples.push({ route: route.id, x, z, deviation: NaN, kind: 'no-track' });
          continue;
        }
        const tr = hit.reversed ? 1 - t : t,
          rails = drawnRails(hit.r, tr),
          top = (rails[0] + rails[1]) / 2;
        const kind = spanHeight(hit.r.spans, tr) !== undefined ? 'span' : hit.r.linearProfile ? 'deck' : 'ground';
        samples.push({ route: route.id, x, z, deviation: (wheel - top) * M, kind, way: hit.r.way });
      }
    }
  }
  const stats = (v: number[]) => {
    const a = v.map(Math.abs).sort((p, q) => p - q);
    return {
      n: v.length,
      mean: v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN,
      rmse: v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) : NaN,
      p95: a.length ? a[Math.floor(0.95 * (a.length - 1))] : NaN,
      max: a.length ? a.at(-1)! : NaN,
      over5cm: a.filter((x) => x > 0.05).length,
    };
  };
  const rows: Record<string, unknown>[] = [];
  for (const route of routes)
    for (const kind of ['all', 'ground', 'deck', 'span'] as const) {
      const v = samples
        .filter((s) => s.route === route.id && s.kind !== 'no-track' && (kind === 'all' || s.kind === kind))
        .map((s) => s.deviation);
      const noTrack = kind === 'all' ? samples.filter((s) => s.route === route.id && s.kind === 'no-track').length : 0;
      rows.push({ route: route.id, kind, ...stats(v), noTrack });
    }
  // Worst sample per 50 m cluster.
  const worst: RailSample[] = [];
  for (const s of [...samples].filter((s) => Number.isFinite(s.deviation)).sort((p, q) => Math.abs(q.deviation) - Math.abs(p.deviation))) {
    if (Math.abs(s.deviation) <= 0.05) break;
    if (worst.some((w) => Math.hypot(w.x - s.x, w.z - s.z) * M < 50)) continue;
    worst.push(s);
    if (worst.length >= 60) break;
  }
  return { routes: rows, worst, samples };
}

/**
 * Track gradients as the vehicles ride them (RouteTrack rail tops, 20 m chord, every 1 m), per route.
 * Limits: Trafikverket mainline design grades are normally at most 12.5 ‰ (25 ‰ exceptionally, e.g.
 * short freight-free links); Södra stambanan's steepest gradient anywhere is 25 ‰; tramways are built up
 * to about 6–8 %. A 20 m window spans a full X61 car. Step 5.1: sampled every 1 m (every 5 m missed the
 * worst chord: Pendeln max 3.79 % reported, 4.80 % ridden).
 */
export const RAIL_GRADE_LIMIT = { train: 2.5, tram: 8 } as const;
export function railGrades(routes = cityMap.transitRoutes) {
  const out: { route: string; n: number; p50: number; p95: number; p99: number; max: number }[] = [];
  const issues: InfraIssue[] = [];
  for (const route of routes) {
    const kind = route.kind === 'train' ? 'train' : 'tram',
      track = new RouteTrack(route.points, trackKindOf(route.kind)),
      w = 20 / M,
      step = 1 / M;
    const grades: number[] = [];
    let worst: InfraIssue | null = null;
    for (let d = 0; d < track.length; d += step) {
      // Grade along the track (the 20 m the vehicle travels), not over the straight chord: at the reversal of
      // an out-and-back route (Pendeln, E 565 331 N 6 496 714) both chord ends lie 10 m back down the line,
      // and dividing by their small horizontal distance reported 3.4 % on 1 % track (Step 5.1).
      const a = track.position(d - w / 2),
        b = track.position(d + w / 2),
        g = (Math.abs(b[1] - a[1]) / w) * 100;
      grades.push(g);
      if (g > RAIL_GRADE_LIMIT[kind]) {
        const p = track.position(d);
        if (!worst || Math.hypot(p[0] - worst.x, p[2] - worst.z) * M > 100) {
          if (worst) issues.push(worst);
          worst = { kind: 'steep-grade', x: p[0], z: p[2], value: g, detail: `${route.id} vehicle grade` };
        } else if (g > worst.value) Object.assign(worst, { x: p[0], z: p[2], value: g });
      }
    }
    if (worst) issues.push(worst);
    const s = [...grades].sort((p, q) => p - q),
      at = (f: number) => s[Math.floor(f * (s.length - 1))];
    out.push({ route: route.id, n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1)! });
  }
  return { routes: out, issues };
}

/**
 * Twisted cross-sections of draped roads (every 2 m): centreline minus the mean of both edges beyond
 * LIMITS.crease. One issue per way and 50 m cluster (the worst sample).
 */
export function crossSections(roads = cityMap.roads): InfraIssue[] {
  const out: InfraIssue[] = [];
  for (const whole of roads) {
    if (whole.kind !== 'road' || whole.tunnel) continue;
    for (const r of networkPieces(whole)) {
      if (r.linearProfile) continue;
      const dx = r.b[0] - r.a[0],
        dz = r.b[1] - r.a[1],
        len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const half = r.width / 2,
        n = Math.max(1, Math.ceil((len * M) / 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n,
          c: Point = [r.a[0] + dx * t, r.a[1] + dz * t];
        const side = (s: number): Point => [c[0] - (dz / len) * half * s, c[1] + (dx / len) * half * s];
        const crease = ((surfaceAt(r, t, side(1), 0) + surfaceAt(r, t, side(-1), 0)) / 2 - surfaceAt(r, t, c, 0)) * M;
        if (Math.abs(crease) <= LIMITS.crease) continue;
        const near = out.find((o) => o.way === r.way && Math.hypot(o.x - c[0], o.z - c[1]) * M < 50);
        if (near) {
          if (Math.abs(crease) > Math.abs(near.value)) Object.assign(near, { x: c[0], z: c[1], value: crease });
        } else
          out.push({ kind: 'cross-section', x: c[0], z: c[1], value: crease, way: r.way, detail: `road ${r.name ?? ''} width ${(r.width * M).toFixed(1)} m`.trim() });
      }
    }
  }
  return out;
}

/**
 * Junction fans (cityMesh.ts buildNetwork) against the strips they join (Step 5). A fan wedge spans the
 * gap between two incident road edges at a node; it shares its two edges node -> corner with the strips'
 * end edges. Measured as drawn (FAN_RULE): 'flat' is the rule before Step 5 (the whole fan at the node
 * level once any incident piece is linear), 'corners' the current one (corners from the strips, linear
 * wedges planar, mixed wedges draped with interpolated offsets). Value: the largest |fan - strip| at the
 * corners and edge midpoints of a node, metres.
 */
export function junctionFans(roads = cityMap.roads, rule: 'flat' | 'corners' = 'corners'): InfraIssue[] {
  const out: InfraIssue[] = [];
  type End = { r: MapRoad; t: number; linear: boolean };
  const nodes = new Map<string, { point: Point; y: number; ends: End[] }>();
  for (const r of roads) {
    if (r.kind !== 'road') continue;
    for (const [point, node, t] of [
      [r.a, r.yA, 0],
      [r.b, r.yB, 1],
    ] as [Point, number, number][]) {
      const span = spanHeight(r.spans, t),
        y = span ?? node;
      const key = point.join(',') + ',' + y;
      if (!nodes.has(key)) nodes.set(key, { point, y, ends: [] });
      nodes.get(key)!.ends.push({ r, t, linear: !!r.linearProfile || span !== undefined });
    }
  }
  const S = ROAD_SURFACE;
  for (const { point, y, ends } of nodes.values()) {
    if (ends.length < 2) continue;
    const g = terrain.groundHeight(...point);
    const anyLinear = ends.some((e) => e.linear);
    const corners = ends
      .flatMap((e) => {
        const dx = e.r.b[0] - e.r.a[0],
          dz = e.r.b[1] - e.r.a[1],
          len = Math.hypot(dx, dz) || 1;
        return [-1, 1].map((side) => ({ x: ((-dz / len) * e.r.width * side) / 2, z: ((dx / len) * e.r.width * side) / 2, e }));
      })
      .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    let worst = 0,
      at: Point = point;
    for (let i = 0; i < corners.length; i++) {
      const A = corners[i],
        B = corners[(i + 1) % corners.length];
      if (Math.abs(A.x * B.z - A.z * B.x) < 1e-8) continue;
      const cB: Point = [point[0] + B.x, point[1] + B.z],
        cA: Point = [point[0] + A.x, point[1] + A.z];
      const strip = (e: End, p: Point) => surfaceAt(e.r, e.t, p, S);
      let fan: (p: Point) => number;
      if (rule === 'flat') fan = (p) => y + S + (anyLinear ? 0 : terrain.groundHeight(...p) - g);
      else if (!anyLinear) fan = (p) => y + S + terrain.groundHeight(...p) - g;
      else {
        const wedge = fanWedge(point, y, g, A, B);
        fan = (p) => wedge.at(...p);
      }
      for (const [e, c] of [
        [B.e, cB],
        [A.e, cA],
      ] as [End, Point][])
        for (const f of [0.5, 1]) {
          const p: Point = [point[0] + (c[0] - point[0]) * f, point[1] + (c[1] - point[1]) * f];
          const d = Math.abs(fan(p) - strip(e, p)) * M;
          if (d > worst) [worst, at] = [d, p];
        }
    }
    if (worst > LIMITS.junctionStep)
      out.push({
        kind: 'junction-fan',
        x: at[0],
        z: at[1],
        value: worst,
        way: ends[0].r.way,
        detail: `${anyLinear ? 'mixed' : 'draped'} junction, ways ${[...new Set(ends.map((e) => e.r.way))].join(', ')}`,
      });
  }
  return out;
}

/**
 * Isolated spikes and pits of the 5 m DTM grid: a node more than LIMITS.terrainSpike above (below) all
 * eight neighbours. Walls and quays make steps, not isolated peaks, so these are candidates for LiDAR
 * artefacts or removed structures; each needs checking against the native 1 m DTM and imagery.
 */
export function terrainSpikes(): InfraIssue[] {
  const tile = terrain.tiles.find((t) => t.kind === 'DTM');
  if (!tile) return [];
  const h = tile.heights as Float32Array,
    C = tile.columns,
    out: InfraIssue[] = [];
  for (let r = 1; r < tile.rows - 1; r++)
    for (let c = 1; c < C - 1; c++) {
      const v = h[r * C + c];
      if (!Number.isFinite(v)) continue;
      let lo = Infinity,
        hi = -Infinity,
        ok = true;
      for (let dr = -1; dr <= 1 && ok; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const u = h[(r + dr) * C + c + dc];
          if (!Number.isFinite(u)) {
            ok = false;
            break;
          }
          lo = Math.min(lo, u);
          hi = Math.max(hi, u);
        }
      if (!ok) continue;
      const spike = v - hi,
        pit = lo - v;
      if (spike > LIMITS.terrainSpike || pit > LIMITS.terrainSpike)
        out.push({
          kind: 'terrain-spike',
          x: tile.x + c * tile.step,
          z: tile.z + r * tile.step,
          value: spike > pit ? spike : -pit,
          detail: spike > pit ? 'DTM node above all neighbours' : 'DTM node below all neighbours',
        });
    }
  return out;
}

/** All checks (a few seconds for the whole map), classified by severity with documented exceptions. */
export function diagnoseInfrastructure() {
  const profile = profiles();
  const shore = shorelines();
  const rail = railAlignment();
  const grades = railGrades();
  const ways = new Map<number | undefined, MapRoad>();
  for (const r of cityMap.roads) if (!ways.has(r.way)) ways.set(r.way, r);
  const issues = [
    ...belowTerrain(),
    ...junctionSteps(),
    ...junctionFans(),
    ...profile.issues,
    ...deckClearance(),
    ...shore.issues,
    ...buildingsInWater(),
    ...dataChecks(),
    ...crossSections(),
    ...terrainSpikes(),
    ...rail.worst.map(
      (w): InfraIssue => ({ kind: 'vehicle-off-track', x: w.x, z: w.z, value: w.deviation, way: w.way, detail: `${w.route} on ${w.kind}` }),
    ),
    ...grades.issues,
  ].map((i) => {
    const r = ways.get(i.way);
    const kind = i.detail.startsWith('pendeln') ? 'rail' : i.detail.startsWith('tram-') ? 'tram' : r?.kind;
    return classify(i, kind, r?.class);
  });
  return {
    issues,
    grades: profile.grades,
    shoreGaps: shore.gaps,
    railRoutes: rail.routes,
    railGrades: grades.routes,
  };
}

/**
 * Road and rail locations that call for geometric refinement (Step 5.1): twisted cross-sections, road grade
 * and grade-break issues, running surfaces below the terrain (roads and rails, not paths), junction fans and
 * rail vehicle grade peaks. Each is marked whether its ground is already a breakline patch. This is the
 * rendered side; scripts/geo/refinement_targets.py adds the native-DTM evidence that separates vertical
 * defects of our geometry from horizontal (OSM alignment/width) problems and measured relief, and selects
 * the corrections (scripts/data/geometry-refinement-targets.json).
 */
export interface RefinementSite extends InfraIssue {
  /** A rail vehicle grade peak (route detail), else a road/rail map segment issue. */
  rail: boolean;
  /** The ground at the site is a breakline patch (scripts/geo/road_patches.py). */
  patched: boolean;
}
export function refinementCandidates(issues: InfraIssue[] = diagnoseInfrastructure().issues): RefinementSite[] {
  const out: RefinementSite[] = [];
  for (const i of issues) {
    if (i.exception) continue;
    const rail = i.kind === 'steep-grade' && i.detail.endsWith('vehicle grade');
    const road = /^(road|rail|tram)\b/.test(i.detail);
    const wanted =
      rail ||
      i.kind === 'junction-fan' ||
      (road && (i.kind === 'cross-section' || i.kind === 'steep-grade' || i.kind === 'grade-break' || i.kind === 'below-terrain'));
    if (wanted) out.push({ ...i, rail, patched: terrain.surface?.patchedAt(i.x, i.z) ?? false });
  }
  return out;
}

/** Height of the drawn water surface at (x, z) in scene units, or null outside drawn water. */
export function drawnWater(x: number, z: number) {
  return waterSurfaceAt(x, z)?.y ?? null;
}
