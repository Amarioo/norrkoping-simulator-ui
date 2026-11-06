/**
 * Aircraft Lights Phase E2: the exterior lights of the simulated aircraft (navigation, anti-collision
 * beacon, white strobes, landing and taxi lights). Pure model, no three.js: light sockets in the
 * aircraft's own frame, the visibility sector of each light, deterministic flash timing on the
 * simulation clock and the simulator's rule for which lights are on in which flight phase. Drawn by
 * aircraftLightsView.ts.
 *
 * Model frame (the drawn model in transportModels.ts, metres): +z forward (nose), +y up (gear contact
 * at y = 0), and therefore +x = the aircraft's LEFT (right-handed axes: left = up × forward). The
 * view places every socket under the same interpolated object transform as the body.
 *
 * Sources and estimates (docs/aircraft-lights-e2/data-provenance.md):
 * - Colours and sides: EASA CS-25.1385(b)/(c) (red left, green right, white as far aft as practicable).
 *   Sectors: CS-25.1387(b)–(d) (L and R 110° from dead ahead; A bounded by planes 70° either side of
 *   dead astern, i.e. 140° in all). Beyond a boundary, CS-25.1395 sets absolute caps (red/green: 10 cd
 *   10–20° beyond, 1 cd further; none in the first 10°). How much a real lamp spills there is an
 *   ESTIMATE (overlapWeight): full in the first 8–10°, 10 % up to 18–20°, nothing beyond.
 * - Flash frequency: CS-25.1401(c) requires 40–100 cycles per minute for the anti-collision system. The
 *   values chosen inside that range, the pulse lengths and the single-pulse pattern are ESTIMATES: the
 *   simulated aircraft is a fictional shuttle with no type documentation.
 * - Which lights are on per flight phase (PHASE_RULES) is a simulator rule informed by SERA.3215, not
 *   an airline SOP. Socket positions are read from the drawn model (ESTIMATE of a real airframe).
 */

export type Vec3 = [number, number, number];
export type LightGroup = 'navigation' | 'beacon' | 'strobe' | 'landing' | 'taxi';
export type LightKind =
  | 'navLeft'
  | 'navRight'
  | 'navTail'
  | 'beaconTop'
  | 'beaconBottom'
  | 'strobeLeft'
  | 'strobeRight'
  | 'strobeTail'
  | 'landingLeft'
  | 'landingRight'
  | 'taxi';

/** Where a light can be seen from, in the aircraft frame. */
export type Sector =
  /** Position light: azimuth interval, degrees measured to the LEFT of dead ahead (−180…180). */
  | { kind: 'azimuth'; from: number; to: number }
  /** Forward beam: full within `full` degrees of the beam axis, fading to zero at `edge`. ESTIMATE. */
  | { kind: 'beam'; axis: Vec3; full: number; edge: number }
  /** All directions (beacon, strobes); the own fuselage hides it through the depth test. */
  | { kind: 'all' };

export interface Socket {
  kind: LightKind;
  group: LightGroup;
  /** Metres in the model frame (+x left, +y up, +z forward). */
  position: Vec3;
  /** Linear RGB of the glow at full strength (values above 1 make it brighter, not larger). */
  rgb: Vec3;
  sector: Sector;
}

/** Aviation colours as drawn (linear RGB; perceptual, not chromaticity-matched). */
export const RGB = {
  red: [1, 0.06, 0.04] as Vec3,
  green: [0.08, 1, 0.42] as Vec3,
  white: [1, 0.96, 0.9] as Vec3,
  strobe: [1.6, 1.6, 1.7] as Vec3,
  landing: [1.5, 1.42, 1.25] as Vec3,
};

/** CS-25.1387 dihedral angles: L and R 110° from dead ahead, A 140° (70° each side of dead astern). */
export const NAV_SECTOR_DEG = 110;

/**
 * Light sockets of the drawn shuttle model (transportModels.ts): wing tips at x = ±11.5 m, y ≈ 2.9 m;
 * fuselage axis at y = 2 m, radius 1.02 m, tail cone at z = −9.5 m; wing leading edge at x = ±5 m near
 * z = 0.7 m; nose gear strut at z = 5.5 m. Positions are ESTIMATES of where such lights sit on a twin
 * turboprop (no airframe documentation for the fictional shuttle).
 */
export const SOCKETS: readonly Socket[] = [
  {
    kind: 'navLeft',
    group: 'navigation',
    position: [11.6, 2.9, -0.55],
    rgb: RGB.red,
    sector: { kind: 'azimuth', from: 0, to: NAV_SECTOR_DEG },
  },
  {
    kind: 'navRight',
    group: 'navigation',
    position: [-11.6, 2.9, -0.55],
    rgb: RGB.green,
    sector: { kind: 'azimuth', from: -NAV_SECTOR_DEG, to: 0 },
  },
  {
    kind: 'navTail',
    group: 'navigation',
    position: [0, 2.05, -9.6],
    rgb: RGB.white,
    sector: { kind: 'azimuth', from: NAV_SECTOR_DEG, to: 360 - NAV_SECTOR_DEG },
  },
  {
    kind: 'beaconTop',
    group: 'beacon',
    position: [0, 3.12, -1.2],
    rgb: RGB.red,
    sector: { kind: 'all' },
  },
  {
    kind: 'beaconBottom',
    group: 'beacon',
    position: [0, 0.9, -1.2],
    rgb: RGB.red,
    sector: { kind: 'all' },
  },
  {
    kind: 'strobeLeft',
    group: 'strobe',
    position: [11.6, 2.9, -0.95],
    rgb: RGB.strobe,
    sector: { kind: 'all' },
  },
  {
    kind: 'strobeRight',
    group: 'strobe',
    position: [-11.6, 2.9, -0.95],
    rgb: RGB.strobe,
    sector: { kind: 'all' },
  },
  {
    kind: 'strobeTail',
    group: 'strobe',
    position: [0, 2.35, -9.6],
    rgb: RGB.strobe,
    sector: { kind: 'all' },
  },
  {
    kind: 'landingLeft',
    group: 'landing',
    position: [5, 2.62, 0.78],
    rgb: RGB.landing,
    sector: { kind: 'beam', axis: [0, -0.05, 1], full: 12, edge: 40 },
  },
  {
    kind: 'landingRight',
    group: 'landing',
    position: [-5, 2.62, 0.78],
    rgb: RGB.landing,
    sector: { kind: 'beam', axis: [0, -0.05, 1], full: 12, edge: 40 },
  },
  {
    kind: 'taxi',
    group: 'taxi',
    position: [0, 1.55, 5.7],
    rgb: RGB.landing,
    sector: { kind: 'beam', axis: [0, -0.1, 1], full: 25, edge: 60 },
  },
];

/**
 * Flash pattern of a flashing group, simulation seconds. ESTIMATES inside the CS-25.1401 range of
 * 40–100 cycles per minute; single pulse per cycle; beacon and strobes not synchronised with each other.
 */
export interface FlashSpec {
  /** Cycle length, simulation seconds. */
  period: number;
  /** Length of the pulse, simulation seconds. */
  pulse: number;
}
export const FLASH: Record<'beacon' | 'strobe', FlashSpec> = {
  /** ESTIMATE: 50 cycles/min, 0.15 s pulse (rotating-beacon-like red flash). */
  beacon: { period: 1.2, pulse: 0.15 },
  /** ESTIMATE: 55 cycles/min, 0.08 s pulse (xenon/LED strobe-like short white flash). */
  strobe: { period: 60 / 55, pulse: 0.08 },
};
/** Flashing groups are drawn by day at this share of their night glow (anti-collision is a day light too). */
export const DAY_FLASH_LEVEL = 0.65;

/**
 * Simulator rule (not an airline SOP): which light groups are on in each flight phase of
 * RegionalFlight.kt. Informed by SERA.3215: navigation and anti-collision lights in flight at night
 * (a), navigation lights and engine-running lights on the movement area (b)(1), (b)(4), anti-collision
 * lights by day too (c), (d). The model's propellers turn in every phase, so engines count as running
 * and the beacon is on throughout. White strobes on the runway and in the air, off while taxiing (the
 * pilot may switch flashing lights off against dazzle, (e)). SERA.3215 does not require landing or
 * taxi lights: landing lights for takeoff, climb-out, approach and landing and the taxi light while
 * taxiing with the gear down are this simulator's rule.
 */
export const PHASE_RULES: Record<string, readonly LightGroup[]> = {
  PARKED: ['navigation', 'beacon'],
  TAXI_OUT: ['navigation', 'beacon', 'taxi'],
  TAKEOFF: ['navigation', 'beacon', 'strobe', 'landing'],
  CLIMB: ['navigation', 'beacon', 'strobe', 'landing'],
  CRUISE: ['navigation', 'beacon', 'strobe'],
  APPROACH: ['navigation', 'beacon', 'strobe', 'landing'],
  LANDING: ['navigation', 'beacon', 'strobe', 'landing'],
  TAXI_IN: ['navigation', 'beacon', 'taxi'],
};
/** Unknown phase: navigation and beacon only (a conservative default). */
export function groupsOn(phase: string, gear: boolean): Set<LightGroup> {
  const on = new Set(PHASE_RULES[phase] ?? (['navigation', 'beacon'] as const));
  if (!gear) on.delete('taxi');
  return on;
}

/** 32-bit FNV-1a of a string, as a fraction 0…1 (deterministic seed for flash phases). */
export function seedFraction(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}
/** Phase offset (simulation seconds) of one aircraft's flash group: seeded by its id. */
export const flashOffset = (aircraftId: string, group: 'beacon' | 'strobe') =>
  seedFraction(aircraftId + '|' + group) * FLASH[group].period;

/** Is the light on at simulation time t (seconds)? Pulse at the start of each cycle. */
export function flashOn(t: number, spec: FlashSpec, offset: number): boolean {
  const p = (((t + offset) % spec.period) + spec.period) % spec.period;
  return p < spec.pulse;
}
/** Accumulated on-time from cycle 0 up to t (for exact averages over a time window). */
function onTime(t: number, spec: FlashSpec, offset: number) {
  const u = t + offset;
  const cycles = Math.floor(u / spec.period);
  return cycles * spec.pulse + Math.min(u - cycles * spec.period, spec.pulse);
}
/**
 * Share of the window [t0, t1] (simulation seconds, one rendered frame) during which the light is on.
 * A zero-length window (paused) gives the state at t1. Averaging over the frame means no pulse is
 * skipped at high time scales: at a window longer than the cycle it tends to pulse / period.
 */
export function flashLevel(t0: number, t1: number, spec: FlashSpec, offset: number): number {
  if (!(t1 > t0)) return flashOn(t1, spec, offset) ? 1 : 0;
  return Math.min(
    1,
    Math.max(0, (onTime(t1, spec, offset) - onTime(t0, spec, offset)) / (t1 - t0)),
  );
}

const DEG = 180 / Math.PI;
/**
 * Weight of a position light seen `beyond` degrees outside its own sector. CS-25.1395 sets no limit in the
 * first 10° (real lamps are seen there at about full strength) and caps 10–20° (Area A) and beyond
 * (Area B) at a few candela. ESTIMATE of a real lamp: full to 8°, 10 % from 10° to 18°, nothing from
 * 20°, with short linear ramps so a light never pops on or off.
 */
export function overlapWeight(beyond: number): number {
  if (beyond <= 8) return 1;
  if (beyond <= 10) return 1 - 0.9 * ((beyond - 8) / 2);
  if (beyond <= 18) return 0.1;
  if (beyond < 20) return 0.1 * ((20 - beyond) / 2);
  return 0;
}
/** Azimuth (degrees, positive to the LEFT of dead ahead, −180…180) of a model-frame direction. */
export const azimuthLeft = (d: Vec3) => Math.atan2(d[0], d[2]) * DEG;

/**
 * Visibility weight 0…1 of a socket seen along `toViewer` (model frame, from the light towards the
 * viewer; need not be normalised).
 */
export function sectorWeight(sector: Sector, toViewer: Vec3): number {
  if (sector.kind === 'all') return 1;
  if (sector.kind === 'beam') {
    const [ax, ay, az] = sector.axis;
    const la = Math.hypot(ax, ay, az),
      lv = Math.hypot(...toViewer);
    if (!lv) return 1;
    const cos = (ax * toViewer[0] + ay * toViewer[1] + az * toViewer[2]) / (la * lv);
    const angle = Math.acos(Math.min(1, Math.max(-1, cos))) * DEG;
    if (angle <= sector.full) return 1;
    if (angle >= sector.edge) return 0;
    const s = (sector.edge - angle) / (sector.edge - sector.full);
    return s * s;
  }
  // Horizontal sector only (vertical spread of the position lights is not modelled).
  if (Math.hypot(toViewer[0], toViewer[2]) < 1e-9) return 1;
  const a = azimuthLeft(toViewer);
  const width = (((sector.to - sector.from) % 360) + 360) % 360;
  const rel = (((a - sector.from) % 360) + 360) % 360;
  if (rel <= width) return 1;
  // Degrees beyond the nearer boundary.
  const beyond = Math.min(rel - width, 360 - rel);
  return overlapWeight(beyond);
}

/**
 * Interpolated simulation clock for the flash timing. The backend publishes snapshots (10 per real
 * second) with their simulation time; between snapshots the clock runs on at the time scale, at most
 * MAX_EXTRAPOLATION real seconds past the last snapshot, and stands still when paused. It never runs
 * backwards except after a simulation reset (time jumps back by more than a second).
 */
export const MAX_EXTRAPOLATION = 0.25;
export interface ClockInput {
  sequence: number;
  simulationTime: number;
  paused: boolean;
  timeScale: number;
}
export function createSimClock() {
  let sequence = -1,
    base = 0,
    since = 0,
    now = 0,
    previous = 0,
    started = false;
  return {
    /** Advances by one rendered frame of `dtReal` real seconds; returns the frame's window. */
    advance(input: ClockInput, dtReal: number) {
      let reset = !started;
      if (input.sequence !== sequence) {
        if (input.simulationTime < now - 1) reset = true;
        sequence = input.sequence;
        base = input.simulationTime;
        since = 0;
      } else since += Math.max(0, dtReal);
      const ahead = input.paused ? 0 : Math.min(since, MAX_EXTRAPOLATION) * input.timeScale;
      const target = base + ahead;
      previous = reset ? target : now;
      now = reset ? target : Math.max(now, target);
      started = true;
      return { t0: previous, t1: now };
    },
    get time() {
      return now;
    },
  };
}

/** The lights one aircraft shows this frame. */
export interface LightState {
  socket: Socket;
  /** Logical state: switched on by the phase rule (flashing lights: on during their pulse). */
  on: boolean;
  /** 0…1: flash level over the frame × sector weight towards the viewer. */
  weight: number;
}
/**
 * Every socket's state for one aircraft: phase rule, flash timing over the frame window [t0, t1] and the
 * sector towards the viewer. `viewer` is the camera position in the aircraft's model frame (metres).
 */
export function aircraftLightStates(
  aircraftId: string,
  phase: string,
  gear: boolean,
  t0: number,
  t1: number,
  viewer: Vec3,
): LightState[] {
  const on = groupsOn(phase, gear);
  const flash = {
    beacon: flashLevel(t0, t1, FLASH.beacon, flashOffset(aircraftId, 'beacon')),
    strobe: flashLevel(t0, t1, FLASH.strobe, flashOffset(aircraftId, 'strobe')),
  };
  return SOCKETS.map((socket) => {
    if (!on.has(socket.group)) return { socket, on: false, weight: 0 };
    const level = socket.group === 'beacon' || socket.group === 'strobe' ? flash[socket.group] : 1;
    const p = socket.position;
    const w = sectorWeight(socket.sector, [viewer[0] - p[0], viewer[1] - p[1], viewer[2] - p[2]]);
    return { socket, on: level > 0, weight: level * w };
  });
}
