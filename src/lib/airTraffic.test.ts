import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createTransportModels } from './transportModels';
import { AIRCRAFT_MAX, createAircraftLights } from './lighting/aircraftLightsView';
import { SOCKETS } from './lighting/aircraftLights';
import { FLIGHT_PHASE, MAX_PLANES, planesOf } from './flights';
import type { Aircraft, TrafficSettings } from './city.svelte';

const plane = (n: number, over: Partial<Aircraft> = {}): Aircraft => ({
  id: 'NK-0' + n,
  pos: [100 + n * 10, 5, -40],
  heading: n,
  pitch: 0,
  bank: 0,
  phase: 'CRUISE',
  origin: 'Norrköpings flygplats',
  destination: 'Bråvalla F13',
  speed: 250,
  gear: false,
  ...over,
});
const fleet = (count: number) => Array.from({ length: count }, (_, i) => plane(i + 1));
const settings: TrafficSettings = {
  compact: 1,
  estate: 1,
  trucks: 1,
  buses: 0,
  trams: 0,
  trains: 0,
  flights: true,
  timeScale: 3,
};

describe('Air traffic: several aircraft are drawn', () => {
  it('one body per aircraft, each at its own place, and never more than the buffer holds', () => {
    expect(AIRCRAFT_MAX).toBe(MAX_PLANES);
    const transport = createTransportModels();
    transport.update([], fleet(MAX_PLANES + 1), 1, 0);
    const poses = transport.aircraftPoses();
    expect(poses.map((p) => p.id)).toEqual(['NK-01', 'NK-02', 'NK-03', 'NK-04', 'NK-05', 'NK-06']);
    const bodies = transport.aircraft.children;
    expect(bodies.filter((b) => b.visible).length).toBe(MAX_PLANES);
    // The first body is the model that the others copy.
    expect(bodies[0]).toBe(transport.airplane);
    poses.forEach((p, i) => {
      const at = new Vector3().setFromMatrixPosition(p.matrix);
      expect(at.x).toBeCloseTo(110 + i * 10, 6);
      // 1:25 like the first aircraft.
      expect(new Vector3().setFromMatrixScale(p.matrix).x).toBeCloseTo(1 / 25, 9);
    });
    transport.dispose();
  });

  it('the copies share geometry and materials, but each has its own beacon lens', () => {
    const transport = createTransportModels();
    transport.update([], fleet(3), 1, 0);
    const [first, second, third] = transport.aircraft.children;
    const meshes = (body: (typeof transport.aircraft.children)[number]) => {
      const list: Mesh[] = [];
      body.traverse((o) => (o as Mesh).isMesh && list.push(o as Mesh));
      return list;
    };
    const a = meshes(first),
      b = meshes(second);
    expect(b.length).toBe(a.length);
    let ownMaterials = 0;
    a.forEach((mesh, i) => {
      expect(b[i].geometry).toBe(mesh.geometry);
      if (b[i].material !== mesh.material) ownMaterials++;
    });
    expect(ownMaterials).toBe(1);
    const beacon = (body: typeof first) =>
      (body.getObjectByName('beacon') as Mesh).material as MeshStandardMaterial;
    transport.setBeaconLens('NK-02', 1);
    expect(beacon(second).emissiveIntensity).toBeGreaterThan(beacon(first).emissiveIntensity + 1);
    expect(beacon(third).emissiveIntensity).toBe(beacon(first).emissiveIntensity);
    // An aircraft that is not drawn is ignored.
    transport.setBeaconLens('NK-09', 1);
    transport.dispose();
  });

  it('an aircraft that leaves is hidden; one that appears starts where it is', () => {
    const transport = createTransportModels();
    transport.update([], fleet(4), 0.016, 0);
    transport.update([], fleet(2), 0.016, 0);
    expect(transport.aircraftPoses().map((p) => p.id)).toEqual(['NK-01', 'NK-02']);
    expect(transport.aircraft.children.map((b) => b.visible)).toEqual([true, true, false, false]);
    transport.update([], [], 0.016, 0);
    expect(transport.aircraftPoses().length).toBe(0);
    expect(transport.airplane.visible).toBe(false);
    // NK-03 comes back far from where it was last drawn: no glide across the map in one short frame.
    const back = [plane(1), plane(2), plane(3, { pos: [-220, 1.1, -66] })];
    transport.update([], back, 0.016, 0);
    const at = new Vector3().setFromMatrixPosition(transport.aircraftPoses()[2].matrix);
    expect(at.toArray()).toEqual([-220, 1.1, -66]);
    // Gear per aircraft.
    transport.update([], [plane(1, { gear: true }), plane(2)], 0.016, 0);
    const gear = transport.aircraft.children.map((b) => b.getObjectByName('gear')!.visible);
    expect(gear.slice(0, 2)).toEqual([true, false]);
    transport.dispose();
  });

  it('every drawn aircraft gets its lights, and its beacon flashes on its own clock', () => {
    const transport = createTransportModels();
    const lights = createAircraftLights();
    const camera = new PerspectiveCamera(50, 1.5, 0.01, 1000);
    camera.position.set(140, 30, 20);
    camera.lookAt(140, 5, -40);
    camera.updateMatrixWorld();
    transport.update([], fleet(MAX_PLANES), 1, 0);
    const flashes = new Map<string, number[]>();
    for (let frame = 0; frame < 300; frame++) {
      const t = frame * 0.02;
      lights.update(transport.aircraftPoses(), t, t + 0.02, camera, 1, 'auto', 1000, null);
      for (const p of transport.aircraftPoses()) {
        if (!flashes.has(p.id)) flashes.set(p.id, []);
        flashes.get(p.id)!.push(lights.beaconLevel(p.id) > 0 ? 1 : 0);
      }
    }
    const d = lights.describe();
    expect(d.aircraft).toBe(MAX_PLANES);
    expect(d.capacity).toBe(MAX_PLANES * SOCKETS.length);
    expect(d.instances).toBe(MAX_PLANES * SOCKETS.length);
    expect(new Set(d.lights.map((l) => l.aircraft)).size).toBe(MAX_PLANES);
    const patterns = [...flashes.values()].map((f) => f.join(''));
    for (const p of patterns) expect(p).toMatch(/1/);
    // Seeded by the aircraft's id: the six beacons do not flash in step.
    expect(new Set(patterns).size).toBe(MAX_PLANES);
    expect(lights.beaconLevel('NK-09')).toBe(0);
    lights.dispose();
    transport.dispose();
  });
});

describe('Air traffic: settings and phase names', () => {
  it('a number of aircraft, the single legacy shuttle when the server names none, none when off', () => {
    expect(planesOf({ ...settings, planes: 4 })).toBe(4);
    expect(planesOf(settings)).toBe(1);
    expect(planesOf({ ...settings, planes: 4, flights: false })).toBe(0);
  });
  it('every phase the server sends has a Swedish name', () => {
    for (const phase of [
      'PARKED',
      'QUEUE',
      'TAXI_OUT',
      'TAKEOFF',
      'CLIMB',
      'CRUISE',
      'HOLDING',
      'APPROACH',
      'LANDING',
      'TAXI_IN',
    ])
      expect(FLIGHT_PHASE[phase]).toBeTruthy();
    expect(Object.keys(FLIGHT_PHASE).length).toBe(10);
  });
});
