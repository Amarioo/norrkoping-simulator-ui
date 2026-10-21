/**
 * Canonical rail track contract (Batch A). Mirrored by the backend's RailTraffic.kt and verified by the
 * shared fixture src/lib/geo/rail-track-control.json (scripts/geo/infra-profile-control.test.ts).
 *
 * One track geometry serves the drawn rails (cityMesh.ts) and the vehicles (RailTraffic.kt):
 * - horizontal: the OSM track polyline; transit route points ARE the drawn track's nodes;
 * - vertical: the network reference of that polyline (terrain.profileHeight: deck profiles, engineered
 *   spans, approaches, terrain), keyed by the track node's own legacy level;
 * - plus a rail-head height above the drawn running surface per track kind (below);
 * - vehicles rest on their two bogies: both bogie centres are on the rail top, the body pitches.
 *
 * Absolute heights are RH2000 (via the terrain); everything here is a local offset in metres.
 */
import { terrain, ROAD_SURFACE } from './terrain';

const M = terrain.data.reference.metresPerUnit;
/**
 * Top of rail above the drawn running surface, metres.
 * - rail: ballasted track; the ballast is drawn at the running surface (sleeper top). A 60E1 rail is
 *   172 mm high, plus rail pad/base plate: ~0.18 m.
 * - tram: Norrköping's tram track is mostly embedded grooved rail, flush with the street.
 */
export const RAIL_HEAD_METRES = { rail: 0.18, tram: 0 } as const;
/** Standard gauge (Trafikverket and Norrköpings spårväg), metres between rail running edges. */
export const TRACK_GAUGE_METRES = 1.435;
/** Drawn rail centrelines from the track centreline, scene units: gauge/2 + half a 72 mm rail head. */
export const RAIL_OFFSET = (TRACK_GAUGE_METRES / 2 + 0.036) / M;
/** Rail vehicle model contract: bogie centres ± from the section centre and section pitch, metres. */
export const VEHICLE_GEOMETRY = {
  /** Östgötapendeln X61 car, 19.5 m body (publicTransport.ts). */
  train: { bogieHalf: 6.24, sectionSpacing: 20, sections: 4 },
  /** Tram module, 6.12 m body. */
  tram: { bogieHalf: 1.8, sectionSpacing: 6.4, sections: 5 },
} as const;

export type TrackKind = keyof typeof RAIL_HEAD_METRES;
/** Height of the rail top above the network reference (scene units). */
export function railLift(kind: TrackKind) {
  return ROAD_SURFACE + RAIL_HEAD_METRES[kind] / M;
}
export const trackKindOf = (vehicle: string): TrackKind => (vehicle === 'train' ? 'rail' : 'tram');

export type RoutePoint = number[];
/** Rail-top (wheel-contact) height at parameter t of route segment i (scene units). */
export function wheelHeight(points: RoutePoint[], i: number, t: number, kind: TrackKind) {
  return terrain.profileHeight(points[i], points[i + 1], t) + railLift(kind);
}

/** A looped transit route as a continuous track: position and pose by distance (scene units). */
export class RouteTrack {
  readonly cumulative: number[];
  constructor(
    readonly points: RoutePoint[],
    readonly kind: TrackKind,
  ) {
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++)
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
  }
  get length() {
    return this.cumulative.at(-1)!;
  }
  /** Segment index and parameter at a distance (wrapped onto the loop). */
  locate(distance: number): [number, number] {
    const L = this.length,
      d = ((distance % L) + L) % L,
      c = this.cumulative;
    let lo = 0,
      hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid] <= d) lo = mid;
      else hi = mid;
    }
    const i = Math.min(lo, c.length - 2);
    return [i, Math.max(0, Math.min(1, (d - c[i]) / Math.max(c[i + 1] - c[i], 1e-5)))];
  }
  /** Rail-top point [x, y, z] at a distance. */
  position(distance: number): [number, number, number] {
    const [i, t] = this.locate(distance),
      a = this.points[i],
      b = this.points[i + 1];
    return [a[0] + (b[0] - a[0]) * t, wheelHeight(this.points, i, t, this.kind), a[2] + (b[2] - a[2]) * t];
  }
  /**
   * Pose of a vehicle section centred at `distance` whose bogie centres are `bogieHalf` (scene units)
   * ahead and behind: both bogies on the rail top, the body on the chord between them.
   */
  pose(distance: number, bogieHalf: number) {
    const f = this.position(distance + bogieHalf),
      r = this.position(distance - bogieHalf);
    const dx = f[0] - r[0],
      dz = f[2] - r[2],
      horizontal = Math.hypot(dx, dz);
    return {
      pos: [(f[0] + r[0]) / 2, (f[1] + r[1]) / 2, (f[2] + r[2]) / 2] as [number, number, number],
      heading: Math.atan2(dx, dz),
      pitch: Math.atan2(f[1] - r[1], horizontal),
      bogies: [f, r],
    };
  }
}
