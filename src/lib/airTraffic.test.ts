import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type Object3D } from 'three';
import { createTransportModels } from './transportModels';
import { AIRCRAFT_MAX, createAircraftLights } from './lighting/aircraftLightsView';
import { SOCKETS, socketsOf } from './lighting/aircraftLights';
import { AIRCRAFT_TYPES, jetLights, typeOf } from './aircraftTypes';
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

describe('Air routes: aircraft types', () => {
  const jets = Object.entries(AIRCRAFT_TYPES).filter(([, t]) => t.jet);
  const meshesOf = (body: Object3D) => {
    const list: Mesh[] = [];
    body.traverse((o) => (o as Mesh).isMesh && list.push(o as Mesh));
    return list;
  };

  it('the measures are those of the types, and every type has a name', () => {
    expect(Object.keys(AIRCRAFT_TYPES).sort()).toEqual(['A20N', 'A21N', 'B38M', 'TP']);
    expect(jets.length).toBe(3);
    for (const [, t] of Object.entries(AIRCRAFT_TYPES)) expect(t.name && t.short).toBeTruthy();
    expect(AIRCRAFT_TYPES.A21N.jet!.length).toBeGreaterThan(AIRCRAFT_TYPES.A20N.jet!.length + 6);
    expect(typeOf(undefined)).toBe('TP');
    expect(typeOf('B744')).toBe('TP');
    expect(typeOf('A20N')).toBe('A20N');
  });

  it('a jet is drawn to its length, span and tail height, with its wheels on the ground', () => {
    const transport = createTransportModels();
    for (const [id, t] of jets) {
      transport.update([], [plane(1, { type: id, pos: [0, 0, 0], heading: 0, gear: true })], 1, 0);
      const body = transport.aircraft.children.find((b) => b.visible)!;
      const box = new Box3().setFromObject(body);
      const size = box.getSize(new Vector3()).multiplyScalar(25);
      const s = t.jet!;
      // The tip devices lean a quarter of a metre outwards; the fin is the highest part.
      expect(size.z).toBeCloseTo(s.length, 1);
      expect(size.x).toBeGreaterThan(s.span);
      expect(size.x).toBeLessThan(s.span + 1);
      expect(box.max.y * 25).toBeCloseTo(s.tailHeight, 1);
      // (A wheel is a 14-sided prism, so its lowest corner is up to 2 cm above the ground.)
      expect(Math.abs(box.min.y * 25)).toBeLessThan(0.02);
      // Few parts: a jet is a dozen draw calls, not the turboprop's fifty-five.
      expect(meshesOf(body).length).toBeLessThanOrEqual(12);
      expect(body.getObjectByName('gear')).toBeTruthy();
      expect(body.getObjectByName('beacon')).toBeTruthy();
    }
    transport.dispose();
  });

  it('a place in the fleet changes body with its type, and each type keeps its own lights', () => {
    const transport = createTransportModels();
    const lights = createAircraftLights();
    const camera = new PerspectiveCamera(50, 1.5, 0.01, 1000);
    camera.position.set(0, 40, 0.01);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const at = (kind: string) =>
      lights.describe().lights.find((l) => l.kind === kind)!.world as [number, number, number];
    for (const id of ['TP', 'A21N', 'B38M', 'TP']) {
      transport.update([], [plane(1, { type: id, pos: [0, 0, 0], heading: 0 })], 1, 0);
      expect(transport.aircraft.children.filter((b) => b.visible).length).toBe(1);
      expect(transport.aircraftPoses()[0].type).toBe(id);
      lights.update(transport.aircraftPoses(), 0, 0.02, camera, 1, 'auto', 1000, null);
      // Red on the left wing tip (+x), green on the right: half a span apart from the centre line.
      const span = AIRCRAFT_TYPES[id].jet?.span ?? 23.2;
      expect(at('navLeft')[0] * 25).toBeCloseTo(span / 2, 0);
      expect(at('navRight')[0] * 25).toBeCloseTo(-span / 2, 0);
      expect(lights.describe().instances).toBe(SOCKETS.length);
    }
    // The turboprop in the first place is the original model again, not a copy.
    expect(transport.aircraft.children.find((b) => b.visible)).toBe(transport.airplane);
    expect(socketsOf('A20N').length).toBe(SOCKETS.length);
    expect(socketsOf('A20N')).toBe(socketsOf('A20N'));
    expect(socketsOf(undefined)).toBe(SOCKETS);
    // A jet's lights are where its model has them.
    const places = jetLights(AIRCRAFT_TYPES.A20N.jet!);
    for (const s of socketsOf('A20N')) expect(s.position).toEqual(places[s.kind]);
    lights.dispose();
    transport.dispose();
  });
});
