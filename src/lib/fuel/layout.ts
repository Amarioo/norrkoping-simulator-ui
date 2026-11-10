/**
 * Phase D2 — layout of the fuel-station canopies (pure; no three.js): the measured canopy outline and
 * height, and the estimated islands, dispensers, columns and downlights placed in it.
 *
 * Frame: GROUND METRES of the scene axes — X = scene x · metresPerUnit (east), Z = scene z ·
 * metresPerUnit (south) — and heights in RH2000 metres (scene y · metresPerUnit). Scene x/z are
 * SWEREF 99 TM minus the map origin over (25 · k) (src/lib/data/norrkoping-map.json meta.reference),
 * so these metres are grid metres / k (k = 0.99966: 0.03 % off, far below the outlines' accuracy).
 *
 * Each canopy gets a frame from the minimum-area rectangle of its OSM outline: +u along the long side,
 * +v across. Islands run across the canopy (cars drive along v), one per ISLAND.pitchM of length.
 */
import { cityMap } from '../mapModel';
import { terrain } from '../terrain';
import { COLUMN, DISPENSER, FUEL_DATA, ISLAND, LAMP, fasciaDepth } from './spec';

export type XZ = [number, number];
export interface OrientedBox {
  centre: XZ;
  /** Half extents along the canopy's u and v axes (metres). */
  halfU: number;
  halfV: number;
}
export interface CanopyLayout {
  id: string;
  station: string;
  name: string | null;
  /** OSM outline, open ring, ground metres. */
  ring: XZ[];
  centre: XZ;
  u: XZ;
  v: XZ;
  lengthM: number;
  widthM: number;
  /** [LIDAR] RH2000 of the top (median of the canopy cells). */
  topY: number;
  /** [EST] top − fasciaDepth(top − LiDAR ground). */
  undersideY: number;
  /** [LIDAR] RH2000 of the ground around the outline (median of the class-2 ring). */
  lidarGroundY: number;
  islands: OrientedBox[];
  dispensers: OrientedBox[];
  columns: OrientedBox[];
  /** Downlight positions (ground metres). */
  lamps: XZ[];
}

const dot = (a: XZ, b: XZ) => a[0] * b[0] + a[1] * b[1];
const sub = (a: XZ, b: XZ): XZ => [a[0] - b[0], a[1] - b[1]];

/** Even-odd point in polygon. */
export function inside(ring: readonly XZ[], p: XZ) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i],
      [xj, zj] = ring[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** Distance from p to the ring's boundary. */
export function edgeDistance(ring: readonly XZ[], p: XZ) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      ab = sub(ring[i], a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1e-12)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]));
  }
  return best;
}
/** Minimum-area enclosing rectangle (rotating calipers over the hull edges; first minimum wins). */
export function minAreaRect(ring: readonly XZ[]) {
  const hull = convexHull(ring);
  let best: { area: number; centre: XZ; u: XZ; v: XZ; lengthM: number; widthM: number } | null =
    null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const e: XZ = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
      n: XZ = [-e[1], e[0]];
    let e0 = Infinity,
      e1 = -Infinity,
      n0 = Infinity,
      n1 = -Infinity;
    for (const p of hull) {
      const pe = dot(p, e),
        pn = dot(p, n);
      e0 = Math.min(e0, pe);
      e1 = Math.max(e1, pe);
      n0 = Math.min(n0, pn);
      n1 = Math.max(n1, pn);
    }
    const area = (e1 - e0) * (n1 - n0);
    if (best && area >= best.area - 1e-9) continue;
    const ce = (e0 + e1) / 2,
      cn = (n0 + n1) / 2;
    const centre: XZ = [e[0] * ce + n[0] * cn, e[1] * ce + n[1] * cn];
    let [u, v, lengthM, widthM] =
      e1 - e0 >= n1 - n0 ? [e, n, e1 - e0, n1 - n0] : [n, e, n1 - n0, e1 - e0];
    // Deterministic signs: +u points east (or south when exactly north–south); +v = u rotated +90°.
    if (u[0] < -1e-12 || (Math.abs(u[0]) <= 1e-12 && u[1] < 0)) u = [-u[0], -u[1]];
    v = [-u[1], u[0]];
    best = { area, centre, u, v, lengthM, widthM };
  }
  if (!best) throw new Error('Degenerate canopy outline');
  return best;
}
function convexHull(points: readonly XZ[]): XZ[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XZ, a: XZ, b: XZ) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XZ[] = [],
    upper: XZ[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Canopy frame point (u, v metres) → ground metres. */
const at = (c: { centre: XZ; u: XZ; v: XZ }, su: number, sv: number): XZ => [
  c.centre[0] + c.u[0] * su + c.v[0] * sv,
  c.centre[1] + c.u[1] * su + c.v[1] * sv,
];
/** Evenly spaced stations covering [−half, +half] at most `spacing` apart (one in the middle if short). */
function stations(half: number, spacing: number) {
  if (half <= 0) return [0];
  const n = Math.max(1, Math.round((2 * half) / spacing) + 1);
  return n === 1 ? [0] : Array.from({ length: n }, (_, k) => -half + (2 * half * k) / (n - 1));
}

/**
 * Outline of a canopy in ground metres: the OSM building's ring from the map, or (a LiDAR-measured
 * outline, `ringSweref`, SWEREF 99 TM) converted like the map: scene = (SWEREF − origin) / (25 · k).
 */
export function canopyRing(c: { id: string; ringSweref?: number[][] }, metres: number): XZ[] {
  if (c.ringSweref) {
    const r = terrain.data.reference;
    const unit = r.metresPerUnit * r.gridScaleFactor;
    return c.ringSweref.map(
      ([e, n]) =>
        [((e - r.originEasting) / unit) * metres, ((r.originNorthing - n) / unit) * metres] as XZ,
    );
  }
  const building = cityMap.buildings.find((b) => b.id === c.id);
  if (!building) throw new Error(`Fuel canopy ${c.id} missing from the map`);
  return building.rings[0].map(([x, z]) => [x * metres, z * metres] as XZ);
}

/** Layouts of every accepted canopy, in FUEL_CANOPY_IDS order. `metres` = metres per scene unit. */
export function canopyLayouts(metres: number): CanopyLayout[] {
  const stationName = new Map(FUEL_DATA.stations.map((s) => [s.id, s.name] as const));
  return FUEL_DATA.canopies
    .filter((c) => c.accepted)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => {
      const ring = canopyRing(c, metres);
      if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1])
        ring.pop();
      const rect = minAreaRect(ring);
      const frame = { centre: rect.centre, u: rect.u, v: rect.v };
      const topY = c.topRh2000.p50;
      // Islands across the canopy; kept only when all four corners lie inside the outline.
      const count = Math.min(
        ISLAND.maxCount,
        Math.max(1, Math.round(rect.lengthM / ISLAND.pitchM)),
      );
      const islandLength = Math.min(
        ISLAND.maxLengthM,
        Math.max(ISLAND.minLengthM, rect.widthM - 2 * ISLAND.clearM),
      );
      const islands: OrientedBox[] = [],
        dispensers: OrientedBox[] = [],
        columns: OrientedBox[] = [];
      for (let k = 0; k < count; k++) {
        const su = ((k + 0.5) / count - 0.5) * rect.lengthM;
        const hu = ISLAND.widthM / 2,
          hv = islandLength / 2;
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([a, b]) => at(frame, su + a * hu, b * hv));
        if (!corners.every((p) => inside(ring, p) && edgeDistance(ring, p) >= ISLAND.insideM))
          continue;
        islands.push({ centre: at(frame, su, 0), halfU: hu, halfV: hv });
        dispensers.push({
          centre: at(frame, su, 0),
          halfU: DISPENSER.acrossM / 2,
          halfV: DISPENSER.alongM / 2,
        });
        columns.push({
          centre: at(frame, su, hv - COLUMN.fromEndM),
          halfU: COLUMN.sideM / 2,
          halfV: COLUMN.sideM / 2,
        });
      }
      const lamps: XZ[] = [];
      for (const sv of stations(rect.widthM / 2 - LAMP.insetM, LAMP.spacingM))
        for (const su of stations(rect.lengthM / 2 - LAMP.insetM, LAMP.spacingM)) {
          const p = at(frame, su, sv);
          if (inside(ring, p) && edgeDistance(ring, p) >= LAMP.edgeM) lamps.push(p);
        }
      return {
        id: c.id,
        station: c.station,
        name: stationName.get(c.station) ?? null,
        ring,
        centre: rect.centre,
        u: rect.u,
        v: rect.v,
        lengthM: rect.lengthM,
        widthM: rect.widthM,
        topY,
        undersideY: topY - fasciaDepth(topY - c.groundRh2000),
        lidarGroundY: c.groundRh2000,
        islands,
        dispensers,
        columns,
        lamps,
      };
    });
}
