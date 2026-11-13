// Vehicle Lights Phase F2: trams and trains get the same lights as cars and buses (Phase F1): lens
// glow at night and a beam from the leading section. The lamp positions must match the drawn models.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Color, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { terrain } from '../terrain';
import { createPublicTransport } from '../publicTransport';
import type { Vehicle } from '../city.svelte';
import { createLightingUniforms } from './cityLights';
import {
  BEAM_CANDELA,
  beamEmitter,
  beamIlluminance,
  HEADLAMP_NIGHT_GAIN,
  headingForward,
  isLitVehicleKind,
  selectNearestVehicles,
  TAILLAMP_NIGHT_GAIN,
  VEHICLE_LAMPS,
  writeVehicleUniforms,
  type VehiclePose,
} from './vehicleLights';

const M = terrain.data.reference.metresPerUnit;
const HEADLAMP = new Color('#fff6dc').getHex(),
  TAIL = new Color('#ac2f29').getHex();

// publicTransport.ts paints its liveries on 2D canvases; Vitest runs in Node, without a DOM. The
// paint calls are irrelevant here, so the canvas is a stand-in that accepts any call.
beforeAll(() => {
  const context = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
});
afterAll(() => vi.unstubAllGlobals());

const meshesOf = (t: ReturnType<typeof createPublicTransport>, colour: number) => {
  const out: InstancedMesh[] = [];
  t.group.traverse((o) => {
    const m = (o as InstancedMesh).material as MeshStandardMaterial | undefined;
    if (m && !Array.isArray(m) && m.color.getHex() === colour) out.push(o as InstancedMesh);
  });
  return out;
};
const section = (x: number, z: number, heading = 0, pitch = 0) => ({
  pos: [x, 0.2, z] as Vehicle['pos'],
  heading,
  pitch,
});
const rail = (id: number, kind: 'tram' | 'train', sections: number, heading: number): Vehicle => ({
  id,
  kind,
  pos: [id, 0.2, 0],
  heading,
  speed: 8,
  road: kind === 'tram' ? 'tram2' : 'rail',
  destination: kind === 'tram' ? 'Kvarnberget' : undefined,
  stopped: false,
  // Sections trail behind the leading one (section 0), 0.3 units apart along −z.
  sections: Array.from({ length: sections }, (_, i) => section(id, 0.5 - i * 0.3, heading, 0.02)),
});

describe('Phase F2: lamp positions of trams and trains', () => {
  test('the lamp table matches the drawn headlamp lenses of the leading section', () => {
    const t = createPublicTransport();
    // Front face (largest z) and mid height of every headlamp lens mesh, metres in the model frame.
    const lenses = meshesOf(t, HEADLAMP).map((mesh) => {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!;
      return { front: b.max.z, height: (b.min.y + b.max.y) / 2, rear: b.min.z };
    });
    // One bus (lenses at +z; its tail lamps are another material), four tram destination models
    // and the train: every one of them has lenses only at the front end of its leading section.
    expect(lenses).toHaveLength(6);
    const fronts = [...new Set(lenses.map((l) => Math.round(l.front * 1000) / 1000))].sort(
      (a, b) => a - b,
    );
    expect(fronts).toEqual([
      Math.round(VEHICLE_LAMPS.tram.front * 1000) / 1000,
      Math.round(VEHICLE_LAMPS.bus.front * 1000) / 1000,
      Math.round(VEHICLE_LAMPS.train.front * 1000) / 1000,
    ]);
    for (const l of lenses) {
      expect(l.height).toBeCloseTo(0.84, 6);
      expect(l.rear).toBeGreaterThan(0); // no white lens at the rear end
    }
    expect(VEHICLE_LAMPS.tram.height).toBe(0.84);
    expect(VEHICLE_LAMPS.train.height).toBe(0.84);
    // Red lenses of trams and trains sit at the rear end of the last section only.
    const tails = meshesOf(t, TAIL).map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.max.z;
    });
    expect(tails).toHaveLength(6);
    for (const z of tails) expect(z).toBeLessThan(0);
    expect(isLitVehicleKind('tram')).toBe(true);
    expect(isLitVehicleKind('train')).toBe(true);
    t.dispose();
  });
  test('the emitter follows the pitch of the leading section; the beam stays horizontal', () => {
    const level: VehiclePose = { id: 1, kind: 'train', x: 2, y: 0.3, z: -1, heading: 0.7 };
    const up: VehiclePose = { ...level, pitch: 0.03 };
    const a = beamEmitter(level, M),
      b = beamEmitter(up, M);
    const reach = VEHICLE_LAMPS.train.front + 0.1;
    expect((a.y - level.y) * M).toBeCloseTo(VEHICLE_LAMPS.train.height, 9);
    expect((b.y - a.y) * M).toBeCloseTo(reach * Math.sin(0.03), 9);
    const [fx, fz] = headingForward(0.7);
    expect(((b.x - up.x) * fx + (b.z - up.z) * fz) * M).toBeCloseTo(reach * Math.cos(0.03), 9);
    expect([b.fx, b.fz]).toEqual([fx, fz]);
    // Light on the track ahead of the nose, none behind it (under the train).
    const at = (forwardM: number) => ({
      x: level.x + (forwardM * fx) / M,
      y: level.y,
      z: level.z + (forwardM * fz) / M,
    });
    expect(beamIlluminance(a, BEAM_CANDELA, at(reach + 10), M)).toBeGreaterThan(10);
    expect(beamIlluminance(a, BEAM_CANDELA, at(0), M)).toBe(0);
    expect(beamIlluminance(a, BEAM_CANDELA, at(-30), M)).toBe(0);
  });
});

describe('Phase F2: poses and lens glow of the drawn models', () => {
  test('one pose per bus, tram and train: the leading section, with its pitch', () => {
    const t = createPublicTransport();
    const bus: Vehicle = {
      id: 3,
      kind: 'bus',
      pos: [3, 0.2, 0.5],
      heading: 1,
      speed: 5,
      road: 'r',
      stopped: false,
    };
    const tram = rail(1, 'tram', 5, 0.4),
      train = rail(2, 'train', 4, -1.2);
    t.update([tram, train, bus], 0.016);
    const poses = [...t.poses()].sort((a, b) => a.id - b.id);
    expect(poses.map((p) => [p.id, p.kind])).toEqual([
      [1, 'tram'],
      [2, 'train'],
      [3, 'bus'],
    ]);
    for (const [pose, vehicle] of [
      [poses[0], tram],
      [poses[1], train],
    ] as const) {
      expect([pose.x, pose.y, pose.z]).toEqual(vehicle.sections![0].pos);
      expect(pose.heading).toBe(vehicle.heading);
      expect(pose.pitch).toBe(0.02);
    }
    expect([poses[2].x, poses[2].y, poses[2].z]).toEqual(bus.pos);
    expect(poses[2].pitch).toBe(0);
    // Trams and trains take part in the nearest-vehicle selection like any other vehicle.
    const selected = selectNearestVehicles(poses, { x: 1, y: 0.2, z: 0 }, M);
    expect(selected.map((s) => s.pose.kind)).toEqual(['tram', 'train', 'bus']);
    const u = createLightingUniforms();
    expect(writeVehicleUniforms(u, selected, 1, M)).toBe(3);
    expect(writeVehicleUniforms(u, selected, 0, M)).toBe(0);
    t.update([], 0.016);
    expect(t.poses()).toHaveLength(0);
    t.dispose();
  });
  test('lens glow: every headlamp and tail lens is unchanged by day and brighter at night', () => {
    const t = createPublicTransport();
    const materials = (colour: number) => [
      ...new Set(meshesOf(t, colour).map((m) => m.material as MeshStandardMaterial)),
    ];
    const head = materials(HEADLAMP),
      tail = materials(TAIL);
    // Two of each: the buses' own copy (F1) and the one shared by trams and trains (F2).
    expect(head).toHaveLength(2);
    expect(tail).toHaveLength(2);
    for (const m of head) expect(m.emissiveIntensity).toBe(0.5);
    for (const m of tail) expect(m.emissiveIntensity).toBe(0.3);
    t.setNightLevel(0);
    for (const m of head) expect(m.emissiveIntensity).toBe(0.5);
    for (const m of tail) expect(m.emissiveIntensity).toBe(0.3);
    t.setNightLevel(1);
    for (const m of head) expect(m.emissiveIntensity).toBe(0.5 + HEADLAMP_NIGHT_GAIN);
    for (const m of tail) expect(m.emissiveIntensity).toBe(0.3 + TAILLAMP_NIGHT_GAIN);
    t.setNightLevel(0.5);
    for (const m of head) expect(m.emissiveIntensity).toBe(0.5 + HEADLAMP_NIGHT_GAIN / 2);
    t.dispose();
  });
});
