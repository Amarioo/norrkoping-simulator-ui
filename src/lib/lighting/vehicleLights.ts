/**
 * Vehicle Lights Phase F1: headlights and tail lights of simulated cars, trucks and buses at night.
 *
 * Two parts, both fixed-cost:
 * 1. Lenses: the existing headlamp / tail-lamp materials of the vehicle models get a night emissive
 *    level (transportModels.ts, publicTransport.ts). Lenses are part of the instanced vehicle meshes,
 *    so they follow every vehicle's smoothed pose each frame, for every vehicle.
 * 2. Beam: a low-beam light cone on the road, walls and other vehicles in front of the VEHICLE_MAX
 *    vehicles nearest to the camera. They are uniforms of the existing lighting shader patch
 *    (cityLights.ts, like the stadium emitters): no three.js lights, no new program variant when the
 *    number of vehicles changes. Selection is deterministic: vehicles whose beam reach (BEAM_RANGE_M
 *    around the emitter) lies wholly outside the view frustum are skipped (they cannot light a
 *    visible pixel); the rest are ordered by squared distance to the camera, ties by vehicle id; the
 *    last selected vehicles fade out as the next one approaches (no popping).
 *
 * Everything here is an ESTIMATE (no vehicle photometry data): lamp positions come from the drawn
 * models, the beam shape is a generic European low-beam pattern (sharp cut-off just above the
 * horizontal, wide horizontal spread), and the intensity is an assumed typical peak. See
 * docs/vehicle-lights-f1/data-provenance.md.
 */

/** Most vehicles whose beam is evaluated in the shader (uniform array size; fixed for the session). */
export const VEHICLE_MAX = 16;
/** vec4 entries per vehicle in the `vehicleLights` uniform array. */
export const VEHICLE_VEC4 = 2;
/** Vehicles farther than this from the camera (metres) never get a beam: it would not be visible. */
export const VEHICLE_MAX_DISTANCE_M = 600;
/** Share of the cut-off distance over which the last selected vehicles fade out. */
export const VEHICLE_FADE = 0.25;
/** Beam reach (metres): the light fades smoothly to zero here (estimate, typical low-beam reach). */
export const BEAM_RANGE_M = 60;
/**
 * Assumed peak luminous intensity of BOTH low-beam lamps together, candela. ESTIMATE: ≈ 2 × 15 000 cd,
 * a typical order of magnitude for a dipped-beam hot spot; not taken from any vehicle model or
 * regulation table, and no regulation compliance is claimed.
 */
export const BEAM_CANDELA = 30000;
/** Linear RGB tint of the beam (estimate: neutral-warm white of LED/halogen headlamps). */
export const BEAM_COLOR: [number, number, number] = [1, 0.95, 0.86];
/** Night emissive gain of the lenses (perceptual; added to the models' day emissive level). */
export const HEADLAMP_NIGHT_GAIN = 3.2;
export const TAILLAMP_NIGHT_GAIN = 2.2;

export type LitVehicleKind = 'compact' | 'estate' | 'truck' | 'bus';
/**
 * Lamp geometry per vehicle kind, metres in the model frame (+z forward, y up from the wheel contact),
 * read from the drawn models (transportModels.ts, publicTransport.ts): front face of the headlamp
 * lenses and their height. The beam emitter is the midpoint of the two headlamps, 0.1 m ahead.
 */
export const VEHICLE_LAMPS: Record<LitVehicleKind, { front: number; height: number }> = {
  compact: { front: 4.05 / 2 + 0.04, height: 0.82 },
  estate: { front: 4.75 / 2 + 0.04, height: 0.82 },
  truck: { front: 5.38, height: 0.93 },
  bus: { front: 12 / 2 + 0.085, height: 0.84 },
};
export const isLitVehicleKind = (kind: string): kind is LitVehicleKind => kind in VEHICLE_LAMPS;

/** One vehicle's smoothed render pose (scene units; heading 0 = +z, as the vehicle models). */
export interface VehiclePose {
  id: number;
  kind: LitVehicleKind;
  x: number;
  y: number;
  z: number;
  heading: number;
}
export interface SelectedVehicle {
  pose: VehiclePose;
  /** Distance to the camera, metres. */
  distanceM: number;
  /** 0…1 fade weight (1 unless the vehicle is near the selection cut-off). */
  weight: number;
}

/** Forward unit vector (x, z) of a heading: the models' +z axis rotated about y. */
export const headingForward = (heading: number): [number, number] => [
  Math.sin(heading),
  Math.cos(heading),
];

/**
 * The `max` vehicles nearest to the camera (horizontal + vertical distance), deterministic: ordered by
 * squared distance, ties by vehicle id. Vehicles beyond `maxDistanceM` are ignored. The selected
 * vehicles fade out over the last VEHICLE_FADE of the cut-off distance, which is the distance of the
 * first vehicle NOT selected (or maxDistanceM), so a vehicle entering or leaving the set changes the
 * picture continuously. `inView(pose)` (optional) drops vehicles whose beam cannot reach the view.
 */
export function selectNearestVehicles(
  poses: readonly VehiclePose[],
  camera: { x: number; y: number; z: number },
  metresPerUnit: number,
  max = VEHICLE_MAX,
  maxDistanceM = VEHICLE_MAX_DISTANCE_M,
  inView?: (pose: VehiclePose) => boolean,
): SelectedVehicle[] {
  const limit2 = (maxDistanceM / metresPerUnit) ** 2;
  const candidates: { pose: VehiclePose; d2: number }[] = [];
  for (const pose of poses) {
    if (inView && !inView(pose)) continue;
    const dx = pose.x - camera.x,
      dy = pose.y - camera.y,
      dz = pose.z - camera.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= limit2) candidates.push({ pose, d2 });
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.pose.id - b.pose.id);
  const cutM =
    candidates.length > max ? Math.sqrt(candidates[max].d2) * metresPerUnit : maxDistanceM;
  return candidates.slice(0, max).map(({ pose, d2 }) => {
    const distanceM = Math.sqrt(d2) * metresPerUnit;
    const fadeStart = cutM * (1 - VEHICLE_FADE);
    const weight = cutM > fadeStart ? Math.min(1, Math.max(0, (cutM - distanceM) / (cutM - fadeStart))) : 1;
    return { pose, distanceM, weight };
  });
}

/** Beam emitter of a pose: scene-unit position and forward unit vector (x, z). */
export function beamEmitter(pose: VehiclePose, metresPerUnit: number) {
  const lamp = VEHICLE_LAMPS[pose.kind];
  const [fx, fz] = headingForward(pose.heading);
  const ahead = (lamp.front + 0.1) / metresPerUnit;
  return {
    x: pose.x + fx * ahead,
    y: pose.y + lamp.height / metresPerUnit,
    z: pose.z + fz * ahead,
    fx,
    fz,
  };
}

/** Uniform slots the shader reads (cityLights.ts `vehicleLights`, `vehicleCount`). */
export interface VehicleUniforms {
  vehicleLights: { value: { set(x: number, y: number, z: number, w: number): unknown }[] };
  vehicleCount: { value: number };
}
/**
 * Writes the selected vehicles' beams into the uniforms. `level` is the street-lighting night level
 * (env.artificial): at day (level 0) the count is 0 and the shader loop does no vehicle work.
 * Layout per vehicle k: [2k] = emitter x, y, z (scene units), range (m); [2k + 1] = forward x, z,
 * intensity (cd × level × fade), 0. Returns the active count.
 */
export function writeVehicleUniforms(
  uniforms: VehicleUniforms,
  selected: readonly SelectedVehicle[],
  level: number,
  metresPerUnit: number,
  candela = BEAM_CANDELA,
) {
  let n = 0;
  if (level > 0.0005)
    for (const s of selected) {
      if (n >= VEHICLE_MAX) break;
      const intensity = candela * level * s.weight;
      if (intensity <= 0) continue;
      const e = beamEmitter(s.pose, metresPerUnit);
      uniforms.vehicleLights.value[n * 2].set(e.x, e.y, e.z, BEAM_RANGE_M);
      uniforms.vehicleLights.value[n * 2 + 1].set(e.fx, e.fz, intensity, 0);
      n++;
    }
  uniforms.vehicleCount.value = n;
  return n;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Beam shape constants shared with the GLSL (cityLights.ts), so the reference below matches it. */
export const BEAM_SHAPE = {
  /** Horizontal: cos of the outer / inner half-angle (≈ 40° / 15°). */
  cosOuter: 0.766,
  cosInner: 0.966,
  /** Vertical (sine of elevation seen from the lamp): full below cutLow, dark above cutHigh. */
  cutLow: -0.005,
  cutHigh: 0.035,
  /** Fade towards the ground just ahead of the bumper: from floorLow (dark) to floorHigh (full). */
  floorLow: -0.25,
  floorHigh: -0.015,
};
/**
 * Reference (CPU) evaluation of the GLSL beam: candela-weighted shape factor × range window / d²
 * (lux on a surface facing the lamp, before the surface's own cosine). For tests and documentation.
 */
export function beamIlluminance(
  emitter: { x: number; y: number; z: number; fx: number; fz: number },
  intensity: number,
  point: { x: number; y: number; z: number },
  metresPerUnit: number,
  rangeM = BEAM_RANGE_M,
) {
  const lx = (point.x - emitter.x) * metresPerUnit,
    ly = (point.y - emitter.y) * metresPerUnit,
    lz = (point.z - emitter.z) * metresPerUnit;
  const d2 = Math.max(lx * lx + ly * ly + lz * lz, 0.25);
  const d = Math.sqrt(d2);
  const hd = Math.max(Math.hypot(lx, lz), 1e-3);
  const cosH = (lx * emitter.fx + lz * emitter.fz) / hd;
  const e = ly / d;
  const horizontal = smoothstep(BEAM_SHAPE.cosOuter, BEAM_SHAPE.cosInner, cosH);
  const floor = smoothstep(BEAM_SHAPE.floorLow, BEAM_SHAPE.floorHigh, e);
  const vertical = floor * floor * (1 - smoothstep(BEAM_SHAPE.cutLow, BEAM_SHAPE.cutHigh, e));
  const r = Math.min(d / rangeM, 1);
  const window = 1 - r * r * r * r;
  return (intensity * horizontal * vertical * window * window) / d2;
}
