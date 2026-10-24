/**
 * Lighting Phase L0 — the citywide lighting rule `lighting-city-v1` (docs/lighting-city-l0/).
 *
 * Decides for every OSM highway way in the map whether it is lit, partly lit or dark, and why, then
 * places preliminary lamp stations along the lit parts. Pure and deterministic: no randomness, no
 * I/O, the result depends only on the input (ways sorted by id, polygons as given).
 *
 * Coordinates: EPSG:3006 (SWEREF 99 TM) easting/northing in metres throughout.
 *
 * Priority (higher wins), per way:
 * 1. OSM `lit` tag: `no`/`disused` → dark; any other value except `unknown` → lit (evidence: tag).
 * 2. Gap fill: a chain of untagged ways of the same street (same name, else same highway class and
 *    group), shorter than GAP_MAX_M in total, whose every open end meets a `lit`-tagged way of the
 *    same street → lit (evidence: inferred from the neighbours). Example: Norrtull.
 * 3. Norrköping's *Riktlinje för belysning* (2023-06-07) §2.4.1, as a rule (evidence: rule):
 *    - inside an SCB tätort: streets lit; footways/cycleways lit unless in forest, unpaved or
 *      informal; sidewalks, crossings and paths beside a lit street are lit by the street's lamps
 *      (no fixtures of their own); `highway=path` lit only if paved and designated for foot/bicycle;
 *      tracks, bridleways and private service roads (driveways, parking aisles …) dark;
 *    - outside a tätort: dark;
 *    - motorways without a `lit` tag: dark (state roads, not covered by the municipal guideline);
 *    - always lit (roads that are otherwise dark by rule, never against `lit=no`): roundabouts, and
 *      JUNCTION_M either side of traffic signals and pedestrian crossings and of a roundabout entry.
 *
 * Lamp stations are PRELIMINARY estimates for counting and capacity checks only: on the way
 * centreline, n = round(length / spacing) per lit range (at least one when the range is at least
 * half a spacing), evenly spaced, with the fixture type table of the Step 6 pilot. Kerb side,
 * offsets, building/water/rail rules and seams with existing fixtures are decided in Phase L2.
 * Stations inside the existing rollouts (pilot, A1–A3) are dropped: those fixtures stay as they are.
 */

export const CITY_RULE = {
  version: 'lighting-city-v1',
  script: 'src/lib/lighting/cityRule.ts',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;

export type EN = [number, number];
export type Tags = Record<string, string>;
/** [osmWayId, tags, firstNodeId, lastNodeId, flat E/N, marks [vertexIndex, 's'|'c'|'r']]. */
export type SourceWay = [number, Tags, number, number, number[], [number, string][]];
/** A polygon as rings (the first is the outer ring, the rest holes); even–odd inside test. */
export type Polygon = EN[][];

export interface CityInput {
  ways: SourceWay[];
  /** SCB tätort polygons. */
  tatorter: Polygon[];
  /** Forest polygons (natural=wood / landuse=forest). */
  forest: Polygon[];
  /** Zones that already hold fixtures (pilot, A1–A3); no stations are added inside. */
  existingZones: Polygon[];
}

export type Group = 'motorway' | 'major' | 'minor' | 'service' | 'path' | 'track' | 'excluded';
export type Status = 'lit' | 'partial' | 'dark';
export type Evidence = 'tag' | 'gap' | 'rule';
export type Reason =
  | 'osm-lit-yes'
  | 'osm-lit-no'
  | 'gap-fill'
  | 'rule-street-in-tatort'
  | 'rule-sidewalk'
  | 'rule-path-along-street'
  | 'rule-path-in-tatort'
  | 'rule-roundabout'
  | 'rule-junction'
  | 'dark-outside-tatort'
  | 'dark-motorway-untagged'
  | 'dark-private-service'
  | 'dark-forest-path'
  | 'dark-unpaved-path'
  | 'dark-minor-path'
  | 'dark-track'
  | 'excluded';

export const REASONS: Reason[] = [
  'osm-lit-yes',
  'osm-lit-no',
  'gap-fill',
  'rule-street-in-tatort',
  'rule-sidewalk',
  'rule-path-along-street',
  'rule-path-in-tatort',
  'rule-roundabout',
  'rule-junction',
  'dark-outside-tatort',
  'dark-motorway-untagged',
  'dark-private-service',
  'dark-forest-path',
  'dark-unpaved-path',
  'dark-minor-path',
  'dark-track',
  'excluded',
];

export interface WayResult {
  id: number;
  group: Group;
  status: Status;
  reason: Reason;
  evidence: Evidence;
  /** Lit intervals along the way, metres from the first vertex. */
  ranges: [number, number][];
  /** Lit by a neighbouring street's lamps; gets no stations of its own. */
  covered: boolean;
  lengthM: number;
  inTatort: boolean;
}

/** Fixture types of the Step 6 pilot type table (src/lib/data/streetlights.json meta.types). */
export const STATION_TYPES = {
  'street-bracket-8m': { spacingM: 30, rangeM: 30 },
  'street-bracket-6m': { spacingM: 27, rangeM: 24 },
  'park-lantern-4m': { spacingM: 22, rangeM: 16 },
} as const;
export type StationType = keyof typeof STATION_TYPES;

export interface Station {
  e: number;
  n: number;
  type: StationType;
  way: number;
  evidence: Evidence;
}

export const GAP_MAX_M = 60;
export const JUNCTION_M = 50;
export const SIDEWALK_M = 12;
export const ALONG_SHARE = 0.7;
export const SAMPLE_M = 10;

const MOTORWAY = new Set(['motorway', 'motorway_link']);
const MAJOR = new Set([
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
]);
const MINOR = new Set(['residential', 'unclassified', 'living_street', 'road', 'busway', 'pedestrian']);
const PATHS = new Set(['footway', 'cycleway', 'path', 'steps', 'bridleway', 'platform']);
const UNPAVED = new Set([
  'unpaved',
  'gravel',
  'fine_gravel',
  'compacted',
  'dirt',
  'earth',
  'ground',
  'grass',
  'sand',
  'mud',
  'woodchips',
  'wood',
  'pebblestone',
  'rock',
  'grass_paver',
]);
const LIT_NO = new Set(['no', 'disused']);

export function groupOf(t: Tags): Group {
  const h = t.highway;
  if (t.indoor === 'yes') return 'excluded';
  if (MOTORWAY.has(h)) return 'motorway';
  if (MAJOR.has(h)) return 'major';
  if (MINOR.has(h)) return 'minor';
  if (h === 'service') return 'service';
  if (PATHS.has(h)) return 'path';
  if (h === 'track') return 'track';
  return 'excluded';
}

export function stationTypeOf(group: Group): StationType {
  if (group === 'motorway' || group === 'major') return 'street-bracket-8m';
  if (group === 'path') return 'park-lantern-4m';
  return 'street-bracket-6m';
}

/** The OSM `lit` value as yes / no / null (absent or `unknown`). */
export function litTag(t: Tags): 'yes' | 'no' | null {
  const v = t.lit?.trim().toLowerCase();
  if (!v || v === 'unknown') return null;
  return LIT_NO.has(v) ? 'no' : 'yes';
}

// --- geometry ------------------------------------------------------------------------------------

function points(flat: number[]): EN[] {
  const p: EN[] = [];
  for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
  return p;
}
function cumulative(p: EN[]) {
  const c = [0];
  for (let i = 1; i < p.length; i++)
    c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return c;
}
function pointAt(p: EN[], c: number[], s: number): EN {
  let i = 1;
  while (i < p.length - 1 && c[i] < s) i++;
  const l = c[i] - c[i - 1];
  const t = l > 0 ? Math.min(1, Math.max(0, (s - c[i - 1]) / l)) : 0;
  return [p[i - 1][0] + t * (p[i][0] - p[i - 1][0]), p[i - 1][1] + t * (p[i][1] - p[i - 1][1])];
}
/** Sample positions (segment pieces of ≤ SAMPLE_M), each with the length it represents. */
function samples(p: EN[], c: number[]): { at: EN; w: number }[] {
  const out: { at: EN; w: number }[] = [];
  const L = c[c.length - 1];
  if (L <= 0) return [{ at: p[0], w: 1 }];
  const n = Math.max(1, Math.ceil(L / SAMPLE_M));
  for (let k = 0; k < n; k++) out.push({ at: pointAt(p, c, ((k + 0.5) * L) / n), w: L / n });
  return out;
}

/** Point-in-polygon index: edges bucketed by 100 m northing rows; even–odd per polygon. */
export class PolygonIndex {
  private rows = new Map<number, [number, number, number, number, number][]>();
  private static ROW = 100;
  constructor(polygons: Polygon[]) {
    polygons.forEach((poly, id) => {
      for (const ring of poly)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          if (a[1] === b[1]) continue;
          const r0 = Math.floor(Math.min(a[1], b[1]) / PolygonIndex.ROW);
          const r1 = Math.floor(Math.max(a[1], b[1]) / PolygonIndex.ROW);
          for (let r = r0; r <= r1; r++) {
            let list = this.rows.get(r);
            if (!list) this.rows.set(r, (list = []));
            list.push([a[0], a[1], b[0], b[1], id]);
          }
        }
    });
  }
  contains([e, n]: EN): boolean {
    const list = this.rows.get(Math.floor(n / PolygonIndex.ROW));
    if (!list) return false;
    const odd = new Map<number, boolean>();
    for (const [ax, ay, bx, by, id] of list) {
      if (ay > n !== by > n && e < ax + ((n - ay) * (bx - ax)) / (by - ay))
        odd.set(id, !odd.get(id));
    }
    for (const v of odd.values()) if (v) return true;
    return false;
  }
}

/** Segment grid for "within d metres of a lit street" tests. */
class SegmentGrid {
  private cells = new Map<string, [number, number, number, number][]>();
  constructor(private cell: number) {}
  add(a: EN, b: EN) {
    const c = this.cell;
    const x0 = Math.floor(Math.min(a[0], b[0]) / c),
      x1 = Math.floor(Math.max(a[0], b[0]) / c);
    const y0 = Math.floor(Math.min(a[1], b[1]) / c),
      y1 = Math.floor(Math.max(a[1], b[1]) / c);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push([a[0], a[1], b[0], b[1]]);
      }
  }
  /** True if some segment is within d (≤ cell) of p. */
  near(p: EN, d: number): boolean {
    const cx = Math.floor(p[0] / this.cell),
      cy = Math.floor(p[1] / this.cell);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const [ax, ay, bx, by] of this.cells.get(`${x},${y}`) ?? []) {
          const dx = bx - ax,
            dy = by - ay,
            l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
          if (Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy) <= d) return true;
        }
    return false;
  }
}

function mergeRanges(r: [number, number][]): [number, number][] {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
const round1 = (v: number) => Math.round(v * 10) / 10;

// --- the rule ------------------------------------------------------------------------------------

export function classifyCity(input: CityInput): {
  ways: WayResult[];
  stations: Station[];
  droppedInExisting: number;
  /** Stations not placed because they fall inside an existing rollout zone. */
  dropped: Station[];
} {
  const tatort = new PolygonIndex(input.tatorter);
  const forest = new PolygonIndex(input.forest);
  const existing = new PolygonIndex(input.existingZones);
  const ways = [...input.ways].sort((a, b) => a[0] - b[0]);

  interface Work {
    src: SourceWay;
    tags: Tags;
    group: Group;
    pts: EN[];
    cum: number[];
    len: number;
    smp: { at: EN; w: number }[];
    inTatort: boolean;
    inForest: boolean;
    lit: 'yes' | 'no' | null;
    res?: Omit<WayResult, 'id' | 'group' | 'lengthM' | 'inTatort'>;
  }
  const work: Work[] = ways.map((src) => {
    const tags = src[1];
    const pts = points(src[4]);
    const cum = cumulative(pts);
    const smp = samples(pts, cum);
    const len = cum[cum.length - 1];
    const share = (idx: PolygonIndex) => {
      let w = 0,
        tot = 0;
      for (const s of smp) {
        tot += s.w;
        if (idx.contains(s.at)) w += s.w;
      }
      return tot ? w / tot : 0;
    };
    return {
      src,
      tags,
      group: groupOf(tags),
      pts,
      cum,
      len,
      smp,
      inTatort: share(tatort) >= 0.5,
      inForest: share(forest) >= 0.5,
      lit: litTag(tags),
    };
  });
  const whole = (w: Work): [number, number][] => [[0, w.len]];
  const set = (w: Work, status: Status, reason: Reason, evidence: Evidence, covered = false, ranges?: [number, number][]) => {
    w.res = {
      status,
      reason,
      evidence,
      covered,
      ranges: status === 'dark' ? [] : (ranges ?? whole(w)),
    };
  };
  const isRoad = (w: Work) => ['motorway', 'major', 'minor', 'service'].includes(w.group);
  const isSidewalk = (t: Tags) =>
    ['sidewalk', 'crossing', 'traffic_island'].includes(t.footway) ||
    ['crossing', 'sidewalk'].includes(t.cycleway) ||
    t.highway === 'platform';

  // 1. Excluded classes and tags.
  for (const w of work) {
    if (w.group === 'excluded') set(w, 'dark', 'excluded', 'rule');
    else if (w.lit === 'no') set(w, 'dark', 'osm-lit-no', 'tag');
    else if (w.lit === 'yes') set(w, 'lit', 'osm-lit-yes', 'tag');
  }

  // 2. Gap fill along the same street.
  const key = (w: Work) => (w.tags.name ? `n:${w.tags.name}|${w.group === 'path' ? 'p' : 'r'}` : `h:${w.tags.highway}`);
  const byNode = new Map<number, Work[]>();
  for (const w of work)
    for (const node of [w.src[2], w.src[3]]) {
      let l = byNode.get(node);
      if (!l) byNode.set(node, (l = []));
      l.push(w);
    }
  const seen = new Set<Work>();
  for (const w of work) {
    if (w.res || seen.has(w) || w.group === 'track') continue;
    const k = key(w);
    const chain: Work[] = [];
    const stack = [w];
    seen.add(w);
    while (stack.length) {
      const c = stack.pop()!;
      chain.push(c);
      for (const node of [c.src[2], c.src[3]])
        for (const o of byNode.get(node) ?? [])
          if (!o.res && !seen.has(o) && o.group !== 'track' && o.group !== 'excluded' && key(o) === k) {
            seen.add(o);
            stack.push(o);
          }
    }
    const total = chain.reduce((s, c) => s + c.len, 0);
    if (total >= GAP_MAX_M) continue;
    const count = new Map<number, number>();
    for (const c of chain) for (const node of [c.src[2], c.src[3]]) count.set(node, (count.get(node) ?? 0) + 1);
    const ends = [...count.entries()].filter(([, n]) => n === 1).map(([node]) => node);
    if (ends.length < 2) continue;
    const litEnd = (node: number) =>
      (byNode.get(node) ?? []).some((o) => !chain.includes(o) && o.lit === 'yes' && key(o) === k);
    if (ends.every(litEnd)) for (const c of chain) set(c, 'lit', 'gap-fill', 'gap');
  }

  // 3a. Roads by rule.
  const roundaboutVertex = new Set<string>();
  for (const w of work)
    if (isRoad(w) && ['roundabout', 'circular'].includes(w.tags.junction))
      for (const p of w.pts) roundaboutVertex.add(`${p[0]},${p[1]}`);
  for (const w of work) {
    if (w.res || !isRoad(w)) continue;
    const roundabout = ['roundabout', 'circular'].includes(w.tags.junction);
    if (w.group === 'service' && w.tags.service !== 'alley') {
      if (roundabout) set(w, 'lit', 'rule-roundabout', 'rule');
      else set(w, 'dark', 'dark-private-service', 'rule');
      continue;
    }
    if (w.group !== 'motorway' && w.inTatort) {
      set(w, 'lit', 'rule-street-in-tatort', 'rule');
      continue;
    }
    if (roundabout) {
      set(w, 'lit', 'rule-roundabout', 'rule');
      continue;
    }
    // Otherwise dark, except near signals, crossings and roundabout entries.
    const r: [number, number][] = [];
    for (const [i, kind] of w.src[5])
      if (kind === 's' || kind === 'c') r.push([w.cum[i] - JUNCTION_M, w.cum[i] + JUNCTION_M]);
    const first = w.pts[0],
      last = w.pts[w.pts.length - 1];
    if (roundaboutVertex.has(`${first[0]},${first[1]}`)) r.push([0, JUNCTION_M]);
    if (roundaboutVertex.has(`${last[0]},${last[1]}`)) r.push([w.len - JUNCTION_M, w.len]);
    const ranges = mergeRanges(r.map(([a, b]) => [Math.max(0, a), Math.min(w.len, b)] as [number, number])).filter(
      ([a, b]) => b > a,
    );
    const darkReason: Reason = w.group === 'motorway' ? 'dark-motorway-untagged' : 'dark-outside-tatort';
    if (!ranges.length) set(w, 'dark', darkReason, 'rule');
    else if (ranges.length === 1 && ranges[0][0] <= 0 && ranges[0][1] >= w.len)
      set(w, 'lit', 'rule-junction', 'rule');
    else set(w, 'partial', 'rule-junction', 'rule', false, ranges);
  }

  // 3b. Paths: lit streets cover sidewalks and paths alongside.
  const litStreets = new SegmentGrid(SIDEWALK_M + 1);
  for (const w of work)
    if (isRoad(w) && w.res && w.res.status !== 'dark')
      for (const [a, b] of w.res.ranges) {
        // Add the segments of the lit range (a little generous at range ends: whole segments).
        for (let i = 1; i < w.pts.length; i++)
          if (w.cum[i] >= a && w.cum[i - 1] <= b) litStreets.add(w.pts[i - 1], w.pts[i]);
      }
  for (const w of work) {
    if (w.group !== 'path') continue;
    let along = 0,
      tot = 0;
    for (const s of w.smp) {
      tot += s.w;
      if (litStreets.near(s.at, SIDEWALK_M)) along += s.w;
    }
    const beside = isSidewalk(w.tags) || (tot > 0 && along / tot >= ALONG_SHARE);
    if (w.res) {
      // Tagged or gap-filled paths beside a lit street are lit by the street's lamps.
      if (w.res.status !== 'dark' && beside) w.res.covered = true;
      continue;
    }
    if (!w.inTatort) set(w, 'dark', 'dark-outside-tatort', 'rule');
    else if (isSidewalk(w.tags)) set(w, 'lit', 'rule-sidewalk', 'rule', true);
    else if (beside) set(w, 'lit', 'rule-path-along-street', 'rule', true);
    else if (w.inForest) set(w, 'dark', 'dark-forest-path', 'rule');
    else if (w.tags.informal === 'yes' || w.tags.highway === 'bridleway')
      set(w, 'dark', 'dark-minor-path', 'rule');
    else if (UNPAVED.has(w.tags.surface)) set(w, 'dark', 'dark-unpaved-path', 'rule');
    else if (
      w.tags.highway === 'path' &&
      !(w.tags.surface && ['designated'].some((v) => w.tags.bicycle === v || w.tags.foot === v))
    )
      set(w, 'dark', 'dark-minor-path', 'rule');
    else set(w, 'lit', 'rule-path-in-tatort', 'rule');
  }

  // 3c. Tracks.
  for (const w of work) if (!w.res) set(w, 'dark', 'dark-track', 'rule');

  // 4. Preliminary stations.
  const stations: Station[] = [];
  const dropped: Station[] = [];
  for (const w of work) {
    const r = w.res!;
    if (r.status === 'dark' || r.covered) continue;
    const type = stationTypeOf(w.group);
    const spacing = STATION_TYPES[type].spacingM;
    for (const [a, b] of r.ranges) {
      const L = b - a;
      const n = L >= spacing / 2 ? Math.max(1, Math.round(L / spacing)) : 0;
      for (let k = 0; k < n; k++) {
        const p = pointAt(w.pts, w.cum, a + ((k + 0.5) * L) / n);
        const st: Station = { e: round1(p[0]), n: round1(p[1]), type, way: w.src[0], evidence: r.evidence };
        (existing.contains(p) ? dropped : stations).push(st);
      }
    }
  }

  return {
    ways: work.map((w) => ({
      id: w.src[0],
      group: w.group,
      lengthM: round1(w.len),
      inTatort: w.inTatort,
      ...w.res!,
      ranges: w.res!.ranges.map(([a, b]) => [round1(a), round1(b)] as [number, number]),
    })),
    stations,
    droppedInExisting: dropped.length,
    dropped,
  };
}
