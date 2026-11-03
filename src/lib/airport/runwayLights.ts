/**
 * Airport Lighting Phase E1: the aeronautical ground lights of Norrköping-Kungsängen (ESSP), RWY 09/27.
 *
 * Pure layout (no three.js): where each light stands, how high, and which colour it shows in which
 * direction. Scene frame as everywhere (SWEREF 99 TM, x east, z south, 1 unit = 25 m; see
 * src/lib/geo/sweref99tm.js). Heights are metres above the rendered ground.
 *
 * Sources, in this order (docs/airport-lighting-e1/data-provenance.md):
 * - SOURCE (AIP): LFV eAIP Sweden, AIRAC AIP AMDT 6/2026 (effective 2026-10-29), ES-AD 2 ESSP
 *   §2.12 (runway 2205 × 45 m, threshold coordinates) and §2.14/2.15 (lighting): Calvert CAT I approach
 *   lights 540 m (RWY 09) and 900 m (RWY 27), green threshold, PAPI left side 3.00° (MEHT 56 ft), edge
 *   lights 2205 m / 60 m white with a yellow caution zone, red end lights, no centreline, TDZ, wing bar
 *   or stopway lights; taxiway edge lights on TWY B and C only; RWY 11/29 (grass) unlit.
 * - SOURCE (OSM): the runway and taxiway geometry of the map (its RWY 09/27 ends lie on the AIP
 *   threshold coordinates within 0.05 m).
 * - ESTIMATE (ICAO Annex 14 Vol I design rules, not a survey of this airport): everything the AIP
 *   does not give — lights per row, lateral offsets, the caution-zone length, the approach barrettes
 *   and crossbar, the PAPI distance, unit spacing and angle settings, mounting heights, taxiway light
 *   spacing. Every such value is named ESTIMATE below and in the provenance file.
 * Not placed (no positions published or acquired): runway guard lights, the lit windsock and
 * anemometer, apron floodlights. No beacon is listed in the AIP, so none is added.
 */
import type { Point } from '../mapModel';

export const E1_RULE = 'airport-lighting-e1-v1';
export const AIP_EDITION = {
  issue: 'AIRAC AIP AMDT 6/2026',
  effective: '2026-10-29',
  chapter: 'ES-AD 2 ESSP NORRKÖPING-KUNGSÄNGEN',
} as const;

/** SOURCE (AIP §2.12, §2.14). */
export const ESSP_RWY = {
  lengthM: 2205,
  widthM: 45,
  edgeSpacingM: 60,
  approachLengthM: { '09': 540, '27': 900 },
  papiDegrees: 3,
  papiMehtFt: 56,
} as const;

/** ESTIMATE: ICAO Annex 14 rules and typical values where the AIP gives nothing. */
export const ESTIMATES = {
  /** Edge lights stand at most 3 m outside the runway edge (Annex 14 5.3.9.4). */
  edgeOffsetM: 1.5,
  /** Yellow caution zone: the last 600 m or a third of the runway, whichever is less (5.3.9.7). */
  cautionZoneM: 600,
  /** Threshold and end lights: across the runway at intervals of at most 3 m (5.3.10.4, 5.3.12.3). */
  rowSpacingM: 3,
  /** Approach centreline barrettes every 30 m, at least 4 m long (5.3.4.10–5.3.4.14). */
  approachSpacingM: 30,
  barretteLights: 5,
  barretteLengthM: 4,
  /** One crossbar 300 m from the threshold, 30 m long (precision approach CAT I, 5.3.4.10). */
  crossbarAtM: 300,
  crossbarLengthM: 30,
  crossbarSpacingM: 2,
  /** PAPI: distance from the threshold so that MEHT is met at the lowest on-slope angle (5.3.5). */
  papiUnitSettingsDeg: [3.5, 3 + 1 / 6, 2 + 5 / 6, 2.5],
  papiInnerOffsetM: 15,
  papiUnitSpacingM: 9,
  /** Taxiway edge lights: at most 60 m apart on straight sections (5.3.18), about 1 m off the edge. */
  taxiwayEdgeSpacingM: 60,
  taxiwayEdgeOffsetM: 1,
  heightM: { edge: 0.35, threshold: 0.3, approach: 0.8, papi: 0.9, taxiway: 0.3 },
  /**
   * Side spill: share of a directional light's brightness seen outside its main beam (on its own
   * side), so the runway reads from the side and from above, as elevated fittings do. PAPI: none.
   */
  spill: { edge: 0.35, threshold: 0.25, approach: 0.15, papi: 0, taxiway: 0 },
} as const;

export type LightGroup = 'edge' | 'threshold' | 'approach' | 'papi' | 'taxiway';
/** Which runway direction must be in use for a face to be lit ('both' = always with the system on). */
export type InUse = '09' | '27' | 'both';
export type LightColor = 'white' | 'yellow' | 'green' | 'red' | 'blue';
export interface LightFace {
  /** Horizontal unit vector the light shines towards (scene x, z); null = all around. */
  towards: Point | null;
  color: LightColor;
  inUse: InUse;
  /**
   * PAPI only: the unit's angle setting (degrees). Seen from above it the face is white, below it red.
   */
  papiDeg?: number;
  /** ESTIMATE: brightness share outside the main beam, on the face's own side (0…1). */
  spill?: number;
}
export interface RunwayLight {
  id: string;
  group: LightGroup;
  position: Point;
  heightM: number;
  faces: LightFace[];
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (a: Point) => Math.hypot(a[0], a[1]);

interface Airway {
  kind: string;
  ref: string;
  width: number;
  points: Point[];
  historic: boolean;
}

/**
 * Lays out the ESSP RWY 09/27 lights. `metresPerUnit` is the scene scale (25). Returns no lights when
 * the map has no current asphalt runway 09/27.
 */
export function esspRunwayLights(airways: Airway[], metresPerUnit = 25): RunwayLight[] {
  const runway = airways.find(
    (a) => a.kind === 'runway' && a.ref === '09/27' && !a.historic && a.points.length > 1,
  );
  if (!runway) return [];
  const m = (metres: number) => metres / metresPerUnit;
  // OSM draws RWY 09/27 from threshold 09 (west) to threshold 27 (east), on the AIP coordinates.
  const thr09 = runway.points[0],
    thr27 = runway.points.at(-1)!;
  const axis = sub(thr27, thr09);
  const L = len(axis) * metresPerUnit;
  const u: Point = [axis[0] / len(axis), axis[1] / len(axis)];
  // Left-hand normal of a direction in scene x/z (z points south): flying east (1, 0), left is north
  // (0, −1). Left of an aircraft landing on 09 (along +u) is the north side.
  const leftOf = (dir: Point): Point => [dir[1], -dir[0]];
  const west: Point = [-u[0], -u[1]],
    east: Point = u;
  const at = (alongM: number, acrossM: number): Point => {
    const n = leftOf(u); // north side positive
    return [
      thr09[0] + u[0] * m(alongM) + n[0] * m(acrossM),
      thr09[1] + u[1] * m(alongM) + n[1] * m(acrossM),
    ];
  };
  const lights: RunwayLight[] = [];
  const add = (
    group: LightGroup,
    key: string,
    position: Point,
    faces: LightFace[],
    heightM = ESTIMATES.heightM[group],
  ) =>
    lights.push({
      id: `${E1_RULE}:${group}:${key}`,
      group,
      position,
      heightM,
      faces: faces.map((f) =>
        f.towards && f.papiDeg === undefined && ESTIMATES.spill[group] > 0
          ? { ...f, spill: ESTIMATES.spill[group] }
          : f,
      ),
    });

  // Edge lights (SOURCE: 60 m spacing, white, yellow caution zone; ESTIMATE: offset, zone length).
  // Uniform spacing of at most 60 m between the threshold rows; both directions lit. Pilots landing
  // on 09 look west-to-east (they see the faces pointing west); the caution zone is the last 600 m
  // before their far end.
  const half = ESSP_RWY.widthM / 2 + ESTIMATES.edgeOffsetM;
  const intervals = Math.ceil(L / ESSP_RWY.edgeSpacingM);
  for (let i = 1; i < intervals; i++) {
    const d = (i * L) / intervals;
    for (const side of [1, -1] as const)
      add('edge', `${side > 0 ? 'n' : 's'}${i}`, at(d, side * half), [
        {
          towards: west,
          color: d > L - ESTIMATES.cautionZoneM ? 'yellow' : 'white',
          inUse: 'both',
        },
        { towards: east, color: d < ESTIMATES.cautionZoneM ? 'yellow' : 'white', inUse: 'both' },
      ]);
  }
  // Threshold / end rows (SOURCE: green threshold, red end; ESTIMATE: 3 m spacing across the full
  // width, combined units). West row: threshold 09 (green towards the 09 approach) and runway end for
  // 27 (red towards the runway). East row mirrored.
  const across = Math.round(ESSP_RWY.widthM / ESTIMATES.rowSpacingM);
  for (let k = 0; k <= across; k++) {
    const c = -ESSP_RWY.widthM / 2 + (k * ESSP_RWY.widthM) / across;
    add('threshold', `09-${k}`, at(0, c), [
      { towards: west, color: 'green', inUse: '09' },
      { towards: east, color: 'red', inUse: '27' },
    ]);
    add('threshold', `27-${k}`, at(L, c), [
      { towards: east, color: 'green', inUse: '27' },
      { towards: west, color: 'red', inUse: '09' },
    ]);
  }
  // Approach lights (SOURCE: Calvert CAT I, 540 m for 09 west of its threshold, 900 m for 27 east of
  // its threshold, white; ESTIMATE: ICAO CAT I pattern — the Calvert crossbar layout of this airport
  // is not published in the AIP text).
  for (const [rwy, sign] of [
    ['09', -1],
    ['27', 1],
  ] as const) {
    const base = rwy === '09' ? 0 : L,
      towards = rwy === '09' ? west : east;
    const face: LightFace = { towards, color: 'white', inUse: rwy };
    for (let d = ESTIMATES.approachSpacingM; d <= ESSP_RWY.approachLengthM[rwy] + 1e-6; d += 30)
      for (let b = 0; b < ESTIMATES.barretteLights; b++) {
        const c =
          -ESTIMATES.barretteLengthM / 2 +
          (b * ESTIMATES.barretteLengthM) / (ESTIMATES.barretteLights - 1);
        add('approach', `${rwy}-${d}-${b}`, at(base + sign * d, c), [face]);
      }
    for (
      let c = -ESTIMATES.crossbarLengthM / 2;
      c <= ESTIMATES.crossbarLengthM / 2 + 1e-6;
      c += ESTIMATES.crossbarSpacingM
    )
      if (Math.abs(c) > ESTIMATES.barretteLengthM / 2 + 0.5)
        add('approach', `${rwy}-x${c}`, at(base + sign * ESTIMATES.crossbarAtM, c), [face]);
  }
  // PAPI (SOURCE: left side, 3.00°, MEHT 56 ft; ESTIMATE: 4 units, angle settings, offsets). The
  // distance from the threshold puts the eye height MEHT at the lowest on-slope angle (unit C setting).
  const meht = ESSP_RWY.papiMehtFt * 0.3048;
  const lowestOnSlope = ESTIMATES.papiUnitSettingsDeg[2];
  const papiD = meht / Math.tan((lowestOnSlope * Math.PI) / 180);
  for (const rwy of ['09', '27'] as const) {
    const towards = rwy === '09' ? west : east;
    // Left of the landing direction: 09 lands towards +u (left = north = +across), 27 towards −u.
    const side = rwy === '09' ? 1 : -1;
    const d = rwy === '09' ? papiD : L - papiD;
    ESTIMATES.papiUnitSettingsDeg.forEach((deg, k) => {
      const c =
        side * (ESSP_RWY.widthM / 2 + ESTIMATES.papiInnerOffsetM + k * ESTIMATES.papiUnitSpacingM);
      add('papi', `${rwy}-${'ABCD'[k]}`, at(d, c), [
        { towards, color: 'white', inUse: rwy, papiDeg: deg },
      ]);
    });
  }
  // Taxiway edge lights, TWY B and C only (SOURCE: AIP §2.15; geometry OSM; ESTIMATE: spacing,
  // offset). Blue, all around; none inside the runway strip where a taxiway joins the runway.
  const onRunway = (p: Point) => {
    const r = sub(p, thr09);
    const along = (r[0] * u[0] + r[1] * u[1]) * metresPerUnit;
    const acrossM = Math.abs(r[0] * u[1] - r[1] * u[0]) * metresPerUnit;
    return along > -5 && along < L + 5 && acrossM < ESSP_RWY.widthM / 2 + 5;
  };
  for (const taxi of airways.filter(
    (a) => a.kind === 'taxiway' && ['B', 'C'].includes(a.ref) && !a.historic,
  )) {
    const offset = (taxi.width * metresPerUnit) / 2 + ESTIMATES.taxiwayEdgeOffsetM;
    for (let i = 1; i < taxi.points.length; i++) {
      const a = taxi.points[i - 1],
        b = taxi.points[i],
        segM = len(sub(b, a)) * metresPerUnit;
      if (segM < 0.1) continue;
      const t: Point = [(b[0] - a[0]) / len(sub(b, a)), (b[1] - a[1]) / len(sub(b, a))];
      const n = leftOf(t);
      const steps = Math.max(1, Math.ceil(segM / ESTIMATES.taxiwayEdgeSpacingM));
      // Every node and evenly spaced points between (the last node only on the last segment).
      for (let s = 0; s < steps + (i === taxi.points.length - 1 ? 1 : 0); s++) {
        const f = s / steps;
        const p: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        for (const sideSign of [1, -1]) {
          const q: Point = [p[0] + n[0] * m(offset) * sideSign, p[1] + n[1] * m(offset) * sideSign];
          if (onRunway(q)) continue;
          add('taxiway', `${taxi.ref}-${i}-${s}-${sideSign > 0 ? 'l' : 'r'}`, q, [
            { towards: null, color: 'blue', inUse: 'both' },
          ]);
        }
      }
    }
  }
  return lights;
}

/** Display colours (linear RGB, approximate; the ICAO chromaticity boxes are not modelled). */
export const LIGHT_RGB: Record<LightColor, [number, number, number]> = {
  white: [1, 0.92, 0.78],
  yellow: [1, 0.68, 0.12],
  green: [0.1, 1, 0.42],
  red: [1, 0.06, 0.04],
  blue: [0.12, 0.3, 1],
};

/**
 * How bright a face looks from `view` (unit vector from the light to the observer, horizontal x/z,
 * plus the observer's elevation angle in degrees above the light). Main beam ±30° around `towards`,
 * fading to the face's side spill at ±60° (0 without spill; the spill itself fades out behind the
 * light); all-around faces always 1. PAPI faces only within ±10° (their azimuth spread) and only seen
 * from above the ground. Returns [weight, colour].
 */
export function faceSeen(face: LightFace, view: Point, elevationDeg: number): [number, LightColor] {
  if (!face.towards) return [1, face.color];
  const cos = face.towards[0] * view[0] + face.towards[1] * view[1];
  if (face.papiDeg !== undefined) {
    if (cos < Math.cos((10 * Math.PI) / 180) || elevationDeg < 0) return [0, 'red'];
    return [1, elevationDeg > face.papiDeg ? 'white' : 'red'];
  }
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const beam = smooth(Math.cos(Math.PI / 3), Math.cos(Math.PI / 6), cos);
  const side = (face.spill ?? 0) * smooth(-0.15, 0.25, cos);
  return [Math.max(beam, side), face.color];
}
