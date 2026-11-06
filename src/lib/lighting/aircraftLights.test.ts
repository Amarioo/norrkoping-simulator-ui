import { describe, expect, it } from 'vitest';
import { Color, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import {
  aircraftLightStates,
  azimuthLeft,
  createSimClock,
  FLASH,
  flashLevel,
  flashOffset,
  flashOn,
  groupsOn,
  MAX_EXTRAPOLATION,
  overlapWeight,
  PHASE_RULES,
  sectorWeight,
  seedFraction,
  SOCKETS,
  type LightKind,
  type Vec3,
} from './aircraftLights';
import { createTransportModels } from '../transportModels';
import type { Aircraft } from '../city.svelte';

const socket = (kind: LightKind) => SOCKETS.find((s) => s.kind === kind)!;
const weightFrom = (kind: LightKind, azLeftDeg: number, distance = 1000): number => {
  const s = socket(kind);
  const a = (azLeftDeg * Math.PI) / 180;
  const viewer: Vec3 = [
    s.position[0] + Math.sin(a) * distance,
    s.position[1],
    s.position[2] + Math.cos(a) * distance,
  ];
  return sectorWeight(s.sector, [
    viewer[0] - s.position[0],
    viewer[1] - s.position[1],
    viewer[2] - s.position[2],
  ]);
};
const aircraft = (over: Partial<Aircraft>): Aircraft => ({
  id: 'NK-01',
  pos: [100, 5, -40],
  heading: 0,
  pitch: 0,
  bank: 0,
  phase: 'APPROACH',
  origin: 'Kungsängen',
  destination: 'Bråvalla',
  speed: 200,
  gear: true,
  ...over,
});

describe('Aircraft Lights E2: sockets and colours (CS-25.1385)', () => {
  it('red on the left (+x of the model), green on the right, white at the tail', () => {
    expect(socket('navLeft').position[0]).toBeGreaterThan(10);
    expect(socket('navLeft').rgb[0]).toBeGreaterThan(socket('navLeft').rgb[1] * 5);
    expect(socket('navRight').position[0]).toBeLessThan(-10);
    expect(socket('navRight').rgb[1]).toBeGreaterThan(socket('navRight').rgb[0] * 5);
    const tail = socket('navTail');
    expect(tail.position[2]).toBeLessThan(-9);
    expect(Math.min(...tail.rgb)).toBeGreaterThan(0.85);
    // The model's +x is its left: up × forward = (0,1,0) × (0,0,1) = (1,0,0).
    expect(new Vector3(0, 1, 0).cross(new Vector3(0, 0, 1)).toArray()).toEqual([1, 0, 0]);
  });

  // The real model and transform: the lights sit under the drawn body's matrix; seen by a camera behind
  // the aircraft looking along its nose (head up), the left wing tip is on the left of the picture, and
  // from in front on the right. All headings, banking and pitch.
  it('left/right handedness through the drawn aircraft transform, all headings, bank and pitch', () => {
    const transport = createTransportModels();
    const camera = new PerspectiveCamera(50, 1.5, 0.01, 1000);
    let checked = 0;
    for (let h = 0; h < 360; h += 15)
      for (const bank of [-0.35, 0, 0.35])
        for (const pitch of [-0.12, 0, 0.12]) {
          const heading = (h * Math.PI) / 180;
          const a = aircraft({ heading, bank, pitch });
          transport.update([], [a], 1, 0);
          // Converge the smoothed position onto the target.
          for (let i = 0; i < 5; i++) transport.update([], [a], 10, 0);
          const pose = transport.aircraftPoses()[0];
          expect(pose.id).toBe('NK-01');
          const m = pose.matrix;
          const at = (p: Vec3) => new Vector3(...p).applyMatrix4(m);
          const centre = at([0, 2, 0]);
          const nose = at([0, 2, 10]).sub(centre).normalize();
          const up = at([0, 12, 0]).sub(centre).normalize();
          const left = at(socket('navLeft').position),
            right = at(socket('navRight').position);
          for (const [side, expectLeftOnScreen] of [
            [-1, true],
            [1, false],
          ] as const) {
            // side −1: 2 km behind, looking forward; side 1: 2 km ahead, looking back.
            camera.position.copy(centre).addScaledVector(nose, (side * 2000) / 25);
            camera.up.copy(up);
            camera.lookAt(centre);
            camera.updateMatrixWorld();
            const l = left.clone().project(camera).x,
              r = right.clone().project(camera).x;
            expect(l < r).toBe(expectLeftOnScreen);
          }
          checked++;
        }
    expect(checked).toBe(24 * 9);
    transport.dispose();
  });

  it('the drawn lenses: red lens on the left wing tip, green on the right (fixed in E2)', () => {
    const transport = createTransportModels();
    transport.update([], [aircraft({ heading: 0 })], 1, 0);
    const centreOf = (hex: string) => {
      let found: Vector3 | null = null;
      transport.airplane.traverse((o) => {
        const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
        if (!mat?.color || mat.color.getHex() !== new Color(hex).getHex()) return;
        (o as Mesh).geometry.computeBoundingBox();
        found = (o as Mesh).geometry.boundingBox!.getCenter(new Vector3());
      });
      return found as Vector3 | null;
    };
    expect(centreOf('#ce3229')!.x).toBeGreaterThan(11);
    expect(centreOf('#4fb27e')!.x).toBeLessThan(-11);
    transport.dispose();
  });
});

describe('Aircraft Lights E2: visibility sectors (CS-25.1387, overlap ESTIMATE)', () => {
  it('position lights: 110° left / right of dead ahead, white 70° either side of dead astern', () => {
    expect(azimuthLeft([1, 0, 0])).toBeCloseTo(90);
    expect(weightFrom('navLeft', 45)).toBe(1);
    expect(weightFrom('navLeft', 109)).toBe(1);
    expect(weightFrom('navRight', 45)).toBe(0);
    expect(weightFrom('navTail', 45)).toBe(0);
    expect(weightFrom('navRight', -60)).toBe(1);
    expect(weightFrom('navLeft', -60)).toBe(0);
    expect(weightFrom('navTail', 180)).toBe(1);
    expect(weightFrom('navTail', 111)).toBe(1);
    expect(weightFrom('navTail', -111)).toBe(1);
    expect(weightFrom('navLeft', 180)).toBe(0);
    expect(weightFrom('navRight', 180)).toBe(0);
    // Dead ahead both forward lights are seen (on their common boundary).
    expect(weightFrom('navLeft', 0)).toBe(1);
    expect(weightFrom('navRight', 0)).toBe(1);
  });
  it('overlap beyond a boundary: full to 8°, 10 % from 10° to 18°, none from 20° (ESTIMATE within CS-25.1395)', () => {
    expect(weightFrom('navLeft', -5)).toBe(1);
    expect(weightFrom('navLeft', -9)).toBeCloseTo(0.55);
    expect(weightFrom('navLeft', -10)).toBeCloseTo(0.1);
    expect(weightFrom('navLeft', -15)).toBeCloseTo(0.1);
    expect(weightFrom('navLeft', -19)).toBeCloseTo(0.05);
    expect(weightFrom('navLeft', -20)).toBe(0);
    expect(weightFrom('navLeft', -90)).toBe(0);
    expect(weightFrom('navLeft', 125)).toBeCloseTo(0.1);
    expect(weightFrom('navTail', 95)).toBeCloseTo(0.1);
    // Continuous: no step larger than 0.5 per degree.
    for (let b = 0; b < 25; b += 0.25)
      expect(Math.abs(overlapWeight(b + 0.25) - overlapWeight(b))).toBeLessThan(0.15);
    for (let a = -180; a < 180; a += 1) {
      // Every direction sees at least one light at full strength; exactly one more than 8° away from
      // the boundaries (0°, ±110°), at most two (the overlap) near them.
      const full = (['navLeft', 'navRight', 'navTail'] as const).filter(
        (k) => weightFrom(k, a + 0.5) === 1,
      );
      const nearBoundary = [0, 110, -110].some((b) => Math.abs(a + 0.5 - b) <= 8);
      if (nearBoundary) expect(full.length).toBeGreaterThanOrEqual(1);
      else expect(full.length).toBe(1);
      expect(full.length).toBeLessThanOrEqual(2);
    }
  });
  it('landing and taxi lights: forward beams only; beacons and strobes all round', () => {
    expect(weightFrom('landingLeft', 0)).toBe(1);
    expect(weightFrom('landingLeft', 30)).toBeGreaterThan(0);
    expect(weightFrom('landingLeft', 30)).toBeLessThan(0.3);
    expect(weightFrom('landingLeft', 60)).toBe(0);
    expect(weightFrom('landingRight', 180)).toBe(0);
    expect(weightFrom('taxi', 20)).toBe(1);
    expect(weightFrom('taxi', 90)).toBe(0);
    for (const a of [0, 90, 180, -90]) {
      expect(weightFrom('beaconTop', a)).toBe(1);
      expect(weightFrom('strobeTail', a)).toBe(1);
    }
  });
});

describe('Aircraft Lights E2: flash timing (CS-25.1401 range, values ESTIMATE)', () => {
  it('40–100 cycles per minute, pulse shorter than the cycle', () => {
    for (const spec of Object.values(FLASH)) {
      expect(60 / spec.period).toBeGreaterThanOrEqual(40);
      expect(60 / spec.period).toBeLessThanOrEqual(100);
      expect(spec.pulse).toBeGreaterThan(0);
      expect(spec.pulse).toBeLessThan(spec.period / 4);
    }
  });
  it('seeded by aircraft id: deterministic, different aircraft not synchronised', () => {
    expect(seedFraction('NK-01')).toBe(seedFraction('NK-01'));
    expect(flashOffset('NK-01', 'beacon')).toBe(flashOffset('NK-01', 'beacon'));
    const offsets = ['NK-01', 'NK-02', 'NK-03', 'NK-04', 'SE-ABC'].map((id) =>
      flashOffset(id, 'beacon'),
    );
    expect(new Set(offsets.map((o) => o.toFixed(4))).size).toBe(offsets.length);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(FLASH.beacon.period);
    }
    expect(flashOffset('NK-01', 'beacon')).not.toBeCloseTo(flashOffset('NK-01', 'strobe'), 3);
  });
  it('pulse at the start of each cycle, periodic, also for negative times', () => {
    const spec = FLASH.beacon;
    expect(flashOn(0, spec, 0)).toBe(true);
    expect(flashOn(spec.pulse * 0.99, spec, 0)).toBe(true);
    expect(flashOn(spec.pulse * 1.01, spec, 0)).toBe(false);
    for (const t of [0.05, 0.4, 1.1, 37.3, -2.2])
      expect(flashOn(t + spec.period * 7, spec, 0.3)).toBe(flashOn(t, spec, 0.3));
  });
  it('frame windows: exact share of on-time, additive, paused = instantaneous', () => {
    const spec = FLASH.strobe,
      off = 0.123;
    expect(flashLevel(10, 10 + spec.period, spec, off)).toBeCloseTo(spec.pulse / spec.period, 12);
    expect(flashLevel(10, 10 + 50 * spec.period, spec, off)).toBeCloseTo(
      spec.pulse / spec.period,
      12,
    );
    // Two halves of a window average to the whole.
    const a = flashLevel(3, 3.05, spec, off),
      b = flashLevel(3.05, 3.1, spec, off);
    expect((a + b) / 2).toBeCloseTo(flashLevel(3, 3.1, spec, off), 12);
    // A zero-length window (paused) gives the state at that moment.
    const t = 4.567;
    expect(flashLevel(t, t, spec, off)).toBe(flashOn(t, spec, off) ? 1 : 0);
    // High time scale: a 0.33 s window (time scale 20 at 60 fps) never skips a pulse unseen.
    let sum = 0;
    for (let i = 0; i < 600; i++) sum += flashLevel(i / 3, (i + 1) / 3, spec, off) / 3;
    expect(sum).toBeCloseTo((200 / spec.period) * spec.pulse, 1);
  });
});

describe('Aircraft Lights E2: flight-phase rule (simulator rule)', () => {
  const phases = [
    'PARKED',
    'TAXI_OUT',
    'TAKEOFF',
    'CLIMB',
    'CRUISE',
    'APPROACH',
    'LANDING',
    'TAXI_IN',
  ];
  it('covers every phase of RegionalFlight.kt', () => {
    expect(Object.keys(PHASE_RULES).sort()).toEqual([...phases].sort());
  });
  it('navigation and beacon always; strobes on the runway and airborne; landing and taxi lights by phase', () => {
    for (const p of phases) {
      const on = groupsOn(p, true);
      expect(on.has('navigation')).toBe(true);
      expect(on.has('beacon')).toBe(true);
      expect(on.has('strobe')).toBe(!['PARKED', 'TAXI_OUT', 'TAXI_IN'].includes(p));
      expect(on.has('landing')).toBe(['TAKEOFF', 'CLIMB', 'APPROACH', 'LANDING'].includes(p));
      expect(on.has('taxi')).toBe(['TAXI_OUT', 'TAXI_IN'].includes(p));
      // Never a taxi light with the gear up.
      expect(groupsOn(p, false).has('taxi')).toBe(false);
    }
    expect([...groupsOn('SOMETHING_NEW', true)].sort()).toEqual(['beacon', 'navigation']);
  });
  it('states: off lights have weight 0; on approach the landing lights face the viewer ahead', () => {
    const ahead: Vec3 = [0, 0, 2000],
      behind: Vec3 = [0, 2, -2000];
    const s = aircraftLightStates('NK-01', 'APPROACH', true, 0, 0, ahead);
    const by = (k: LightKind, list = s) => list.find((x) => x.socket.kind === k)!;
    expect(by('landingLeft').weight).toBe(1);
    expect(by('taxi').weight).toBe(0);
    expect(by('navTail').weight).toBe(0);
    const back = aircraftLightStates('NK-01', 'APPROACH', true, 0, 0, behind);
    expect(by('navTail', back).weight).toBe(1);
    expect(by('landingLeft', back).weight).toBe(0);
    const taxi = aircraftLightStates('NK-01', 'TAXI_OUT', true, 0, 0, ahead);
    expect(by('taxi', taxi).weight).toBe(1);
    expect(by('landingLeft', taxi).weight).toBe(0);
    expect(by('strobeLeft', taxi).weight).toBe(0);
  });
});

describe('Aircraft Lights E2: interpolated simulation clock', () => {
  const snap = (sequence: number, simulationTime: number, paused = false, timeScale = 3) => ({
    sequence,
    simulationTime,
    paused,
    timeScale,
  });
  it('runs on at the time scale between snapshots, capped, and never backwards', () => {
    const c = createSimClock();
    expect(c.advance(snap(1, 10), 0.016)).toEqual({ t0: 10, t1: 10 });
    const w = c.advance(snap(1, 10), 0.05);
    expect(w.t0).toBe(10);
    expect(w.t1).toBeCloseTo(10.15, 12);
    // Long stall: capped at MAX_EXTRAPOLATION real seconds.
    c.advance(snap(1, 10), 5);
    expect(c.time).toBeCloseTo(10 + MAX_EXTRAPOLATION * 3, 12);
    // A new snapshot behind the extrapolation holds the clock (no backwards step).
    const held = c.time;
    c.advance(snap(2, 10.3), 0.016);
    expect(c.time).toBe(held);
    c.advance(snap(3, 11), 0.016);
    expect(c.time).toBe(11);
  });
  it('stands still while paused (zero window), and restarts after a simulation reset', () => {
    const c = createSimClock();
    c.advance(snap(1, 50), 0.016);
    c.advance(snap(2, 50.3, true), 0.016);
    const w1 = c.advance(snap(2, 50.3, true), 0.5),
      w2 = c.advance(snap(2, 50.3, true), 0.5);
    expect(w1.t1).toBe(50.3);
    expect(w2).toEqual({ t0: 50.3, t1: 50.3 });
    const reset = c.advance(snap(3, 0.1), 0.016);
    expect(reset).toEqual({ t0: 0.1, t1: 0.1 });
  });
  it('time scale 20 runs the flashes 20× faster in real time (same pattern in simulation time)', () => {
    const c = createSimClock();
    c.advance(snap(1, 0, false, 20), 0);
    const w = c.advance(snap(1, 0, false, 20), 0.01);
    expect(w.t1 - w.t0).toBeCloseTo(0.2, 12);
  });
});
