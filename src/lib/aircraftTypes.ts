/**
 * Air routes: the aircraft types of the fleet (backend `airKinds`), what the interface calls them and the
 * measures the drawn models and their lights are built from. No three.js here.
 *
 * SOURCE: overall length, wing span, tail height, fuselage width, wheel track and wheelbase are the
 * manufacturers' published figures (docs/air-routes/data-provenance.md). ESTIMATE: everything else
 * (wing position, sweep, chords, engine and light positions, colours). The liveries are invented; no
 * airline's colours, name or logo is drawn.
 *
 * Model frame, as the turboprop's (lighting/aircraftLights.ts): metres, +z forward (nose), +y up with the
 * wheels touching y = 0, and therefore +x = the aircraft's left. The origin is under the middle of the
 * fuselage.
 */

export type Vec3 = [number, number, number];

/** A twin-engined narrow-body jet with the engines under a low, swept wing. */
export interface JetSpec {
  /** Overall length, wing span, height of the fin's top above the ground. */
  length: number;
  span: number;
  tailHeight: number;
  /** Half the fuselage width. */
  radius: number;
  /** Distance between the two main gear legs, and from the nose gear back to them. */
  wheelTrack: number;
  wheelbase: number;
  /** Wing tip device: an upswept sharklet, or a split tip that also points down. */
  tip: 'sharklet' | 'split';
  /** Fin and engine colour of the invented livery. */
  livery: string;
}

export interface AircraftType {
  /** Name in the interface. */
  name: string;
  /** Short form for the list. */
  short: string;
  /** The drawn model: the turboprop of the earlier versions, or a jet built from its measures. */
  jet?: JetSpec;
}

export const AIRCRAFT_TYPES: Record<string, AircraftType> = {
  TP: { name: 'Turbopropplan', short: 'Turboprop' },
  A20N: {
    name: 'Airbus A320neo',
    short: 'A320neo',
    jet: {
      length: 37.57,
      span: 35.8,
      tailHeight: 11.76,
      radius: 1.975,
      wheelTrack: 7.59,
      wheelbase: 12.64,
      tip: 'sharklet',
      livery: '#1f6f8b',
    },
  },
  A21N: {
    name: 'Airbus A321neo',
    short: 'A321neo',
    jet: {
      length: 44.51,
      span: 35.8,
      tailHeight: 11.76,
      radius: 1.975,
      wheelTrack: 7.59,
      wheelbase: 16.9,
      tip: 'sharklet',
      livery: '#c8553d',
    },
  },
  B38M: {
    name: 'Boeing 737 MAX 8',
    short: '737 MAX 8',
    jet: {
      length: 39.52,
      span: 35.92,
      tailHeight: 12.3,
      radius: 1.88,
      wheelTrack: 5.72,
      wheelbase: 15.6,
      tip: 'split',
      livery: '#3f7fb5',
    },
  },
};

/** The type an aircraft is drawn as: its own, or the turboprop for an unknown or missing one. */
export const typeOf = (id?: string) => (id && AIRCRAFT_TYPES[id] ? id : 'TP');

/**
 * Where the parts of a jet sit in its model frame. ESTIMATES in the proportions of the type family
 * (wing a third of the way back, 25° of sweep, engines 5.75 m out), not read from drawings.
 */
export function jetLayout(s: JetSpec) {
  const half = s.length / 2;
  // Fuselage centre line: the belly clears the ground by the height of the gear.
  const centreY = s.radius + 1.55;
  const wingRootZ = half - s.length * 0.36; // leading edge at the root
  const rootChord = 6.2;
  const tipChord = 1.6;
  const tipX = s.span / 2;
  const tipZ = wingRootZ - (tipX - s.radius) * Math.tan((25 * Math.PI) / 180); // leading edge at the tip
  const wingRootY = centreY - s.radius * 0.55;
  const tipY = wingRootY + (tipX - s.radius) * Math.tan((5 * Math.PI) / 180);
  const mainGearZ = wingRootZ - rootChord * 0.62;
  return {
    half,
    centreY,
    wingRootZ,
    rootChord,
    tipChord,
    tipX,
    tipZ,
    wingRootY,
    tipY,
    engineX: 5.75,
    engineRadius: 1.05,
    engineLength: 4.6,
    // The nacelle hangs ahead of the leading edge where it meets the wing.
    engineZ: wingRootZ - (5.75 - s.radius) * Math.tan((25 * Math.PI) / 180) + 0.9,
    mainGearZ,
    noseGearZ: mainGearZ + s.wheelbase,
    tailplaneZ: -half + 5.6,
    tailplaneSpan: 12.4,
    finRootZ: -half + 8.4,
  };
}

export type LightPlace =
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

/** Positions of a jet's exterior lights in its model frame (ESTIMATES from the drawn model). */
export function jetLights(s: JetSpec): Record<LightPlace, Vec3> {
  const l = jetLayout(s);
  const tip = (side: number, dz: number): Vec3 => [
    side * (l.tipX + 0.05),
    l.tipY + 0.15,
    l.tipZ - l.tipChord * 0.5 + dz,
  ];
  const landingZ = l.wingRootZ + 0.1;
  return {
    navLeft: tip(1, 0.2),
    navRight: tip(-1, 0.2),
    navTail: [0, l.centreY + 0.5, -l.half + 0.12],
    beaconTop: [0, l.centreY + s.radius + 0.08, 1],
    beaconBottom: [0, l.centreY - s.radius - 0.08, 1],
    strobeLeft: tip(1, -0.3),
    strobeRight: tip(-1, -0.3),
    strobeTail: [0, l.centreY + 0.8, -l.half + 0.12],
    landingLeft: [s.radius + 1.3, l.wingRootY + 0.1, landingZ],
    landingRight: [-s.radius - 1.3, l.wingRootY + 0.1, landingZ],
    taxi: [0, 1.7, l.noseGearZ + 0.25],
  };
}
