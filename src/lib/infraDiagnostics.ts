/**
 * Numerical infrastructure diagnostics (Step 3.5): how roads, rails, bridges, water and buildings
 * meet the rendered terrain. Pure computation on the same data and height rules as the city mesh,
 * so the tests (infrastructure.test.ts), the measurement harness (scripts/geo/infra-diagnose.test.ts)
 * and the dev-only inspection overlay (inspectInfra.ts, `?inspect=infra`) report identical numbers.
 *
 * Heights are compared in metres. Every issue carries a scene position (x, z) for the overlay.
 */
import { cityMap, type MapRoad, type Point } from './mapModel';
import { terrain, ROAD_SURFACE } from './terrain';
import { surfaceAt, networkPieces, buildingBase } from './cityMesh';
import { waterSurfaces, waterSurfaceAt, isFallEdge } from './waterReaches';
import { genericBridgeSegments, hasDetailedBridge } from './bridgeOwnership';

export type IssueKind =
  | 'below-terrain'
  | 'junction-step'
  | 'steep-grade'
  | 'grade-break'
  | 'sag'
  | 'deck-near-water'
  | 'shore-below-water'
  | 'building-in-water'
  | 'missing-terrain'
  | 'duplicate-bridge';
export interface InfraIssue {
  kind: IssueKind;
  x: number;
  z: number;
  /** Size of the defect in metres (depth, step, grade in percent for grades). */
  value: number;
  way?: number;
  detail: string;
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
} as const;

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

/** All checks (a few seconds for the whole map). */
export function diagnoseInfrastructure() {
  const profile = profiles();
  const shore = shorelines();
  return {
    issues: [
      ...belowTerrain(),
      ...junctionSteps(),
      ...profile.issues,
      ...deckClearance(),
      ...shore.issues,
      ...buildingsInWater(),
      ...dataChecks(),
    ],
    grades: profile.grades,
    shoreGaps: shore.gaps,
  };
}

/** Height of the drawn water surface at (x, z) in scene units, or null outside drawn water. */
export function drawnWater(x: number, z: number) {
  return waterSurfaceAt(x, z)?.y ?? null;
}
