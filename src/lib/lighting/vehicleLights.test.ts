// Vehicle Lights Phase F1: nearest-vehicle selection, day/night switching, beam direction, and the
// fixed shader budget (no lights, no program variants).
import { describe, expect, test } from 'vitest';
import {
  DirectionalLight,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  type WebGLRenderer,
} from 'three';
import { terrain } from '../terrain';
import { createIdrottsparken } from '../stadium/idrottsparken';
import { createTransportModels } from '../transportModels';
import type { Vehicle } from '../city.svelte';
import { createLightingUniforms, patchMaterial } from './cityLights';
import { createCityLighting } from './controller';
import {
  BEAM_CANDELA,
  BEAM_RANGE_M,
  beamEmitter,
  beamIlluminance,
  headingForward,
  selectNearestVehicles,
  VEHICLE_FADE,
  VEHICLE_LAMPS,
  VEHICLE_MAX,
  VEHICLE_MAX_DISTANCE_M,
  writeVehicleUniforms,
  type VehiclePose,
} from './vehicleLights';

const M = terrain.data.reference.metresPerUnit;
const origin = { x: 0, y: 0, z: 0 };
/** n vehicles on a line along +x, 10 m apart, starting 10 m from the origin. */
const row = (n: number, kind: VehiclePose['kind'] = 'compact'): VehiclePose[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 1000 - i,
    kind,
    x: ((i + 1) * 10) / M,
    y: 0,
    z: 0,
    heading: 0,
  }));
// Deterministic shuffle (no Math.random): reverse halves and interleave.
const shuffle = <T>(a: T[]) => {
  const out: T[] = [];
  const l = a.slice(0, a.length >> 1).reverse(),
    r = a.slice(a.length >> 1);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    if (r[i]) out.push(r[i]);
    if (l[i]) out.push(l[i]);
  }
  return out;
};

describe('nearest-vehicle selection', () => {
  test('picks at most VEHICLE_MAX vehicles, nearest first, independent of input order', () => {
    const poses = row(40);
    const a = selectNearestVehicles(poses, origin, M);
    const b = selectNearestVehicles(shuffle(poses), origin, M);
    expect(VEHICLE_MAX).toBe(16);
    expect(a).toHaveLength(VEHICLE_MAX);
    expect(a.map((s) => s.pose.id)).toEqual(poses.slice(0, VEHICLE_MAX).map((p) => p.id));
    expect(b.map((s) => s.pose.id)).toEqual(a.map((s) => s.pose.id));
    for (let i = 1; i < a.length; i++) expect(a[i].distanceM).toBeGreaterThan(a[i - 1].distanceM);
    expect(a[0].distanceM).toBeCloseTo(10, 6);
  });
  test('equal distances are ordered by vehicle id', () => {
    const tie: VehiclePose[] = [7, 3, 9, 1].map((id, k) => ({
      id,
      kind: 'estate',
      x: (Math.cos(k) * 50) / M,
      y: 0,
      z: (Math.sin(k) * 50) / M,
      heading: k,
    }));
    expect(selectNearestVehicles(tie, origin, M, 3).map((s) => s.pose.id)).toEqual([1, 3, 7]);
  });
  test('vehicles beyond the distance limit get no beam; few vehicles get no fade', () => {
    const near = row(3),
      far = { ...near[0], id: 1, x: (VEHICLE_MAX_DISTANCE_M + 5) / M };
    const s = selectNearestVehicles([...near, far], origin, M);
    expect(s.map((v) => v.pose.id)).toEqual(near.map((p) => p.id));
    expect(s.every((v) => v.weight === 1)).toBe(true);
  });
  test('an inView filter drops vehicles before ranking (the budget goes to visible beams)', () => {
    const poses = row(30);
    const s = selectNearestVehicles(poses, origin, M, VEHICLE_MAX, VEHICLE_MAX_DISTANCE_M, (p) => p.id % 2 === 0);
    expect(s).toHaveLength(15);
    expect(s.every((v) => v.pose.id % 2 === 0)).toBe(true);
    expect(s.map((v) => v.pose.id)).toEqual(poses.filter((p) => p.id % 2 === 0).map((p) => p.id));
  });
  test('the last selected vehicles fade as the next one approaches (no popping)', () => {
    const s = selectNearestVehicles(row(17), origin, M);
    // Cut-off = distance of vehicle 17 (170 m); fade over the last VEHICLE_FADE of it.
    const fadeStart = 170 * (1 - VEHICLE_FADE);
    for (const v of s)
      if (v.distanceM <= fadeStart) expect(v.weight).toBe(1);
      else expect(v.weight).toBeCloseTo((170 - v.distanceM) / (170 - fadeStart), 9);
    expect(s.at(-1)!.weight).toBeGreaterThan(0);
    expect(s.at(-1)!.weight).toBeLessThan(1);
  });
});

describe('beam direction and day/night', () => {
  test('the emitter sits in front of the vehicle at lamp height, along the heading', () => {
    for (const heading of [0, Math.PI / 2, -2.3]) {
      const pose: VehiclePose = { id: 1, kind: 'truck', x: 3, y: 0.2, z: -4, heading, };
      const e = beamEmitter(pose, M);
      const [fx, fz] = headingForward(heading);
      const ahead = ((e.x - pose.x) * fx + (e.z - pose.z) * fz) * M;
      expect(ahead).toBeCloseTo(VEHICLE_LAMPS.truck.front + 0.1, 6);
      expect(((e.x - pose.x) * fz - (e.z - pose.z) * fx) * M).toBeCloseTo(0, 9);
      expect((e.y - pose.y) * M).toBeCloseTo(VEHICLE_LAMPS.truck.height, 6);
      expect([e.fx, e.fz]).toEqual([fx, fz]);
    }
    // Heading 0 points along +z, as the vehicle models (headlamps at +z).
    expect(headingForward(0)).toEqual([0, 1]);
  });
  test('light falls on the road in front, never behind, beside or above the cut-off', () => {
    for (const heading of [0, 1.1, Math.PI]) {
      const pose: VehiclePose = { id: 1, kind: 'compact', x: 0, y: 0, z: 0, heading };
      const e = beamEmitter(pose, M);
      const [fx, fz] = headingForward(heading);
      const at = (forwardM: number, sideM: number, upM = 0) => ({
        x: pose.x + (forwardM * fx + sideM * fz) / M,
        y: pose.y + upM / M,
        z: pose.z + (forwardM * fz - sideM * fx) / M,
      });
      const lux = (p: { x: number; y: number; z: number }) => beamIlluminance(e, BEAM_CANDELA, p, M);
      expect(lux(at(10, 0))).toBeGreaterThan(10);
      expect(lux(at(20, 0))).toBeGreaterThan(lux(at(40, 0)));
      expect(lux(at(-10, 0))).toBe(0);
      expect(lux(at(-3, 0))).toBe(0);
      expect(lux(at(0, 10))).toBe(0);
      expect(lux(at(5, 10))).toBe(0); // 63° off-axis, outside the cone
      expect(lux(at(10, 0, 5))).toBe(0); // above the low-beam cut-off
      // Range counts from the emitter (lamp front + 0.1 m), not the vehicle centre.
      const lampAhead = VEHICLE_LAMPS.compact.front + 0.1;
      expect(lux(at(lampAhead + BEAM_RANGE_M - 2, 0))).toBeGreaterThan(0);
      expect(lux(at(lampAhead + BEAM_RANGE_M + 0.5, 0))).toBe(0);
    }
  });
  test('day writes no beams; night writes the selection; the fade scales intensity', () => {
    const u = createLightingUniforms();
    const s = selectNearestVehicles(row(20), origin, M);
    expect(writeVehicleUniforms(u, s, 0, M)).toBe(0);
    expect(u.vehicleCount.value).toBe(0);
    expect(writeVehicleUniforms(u, s, 1, M)).toBe(VEHICLE_MAX);
    expect(u.vehicleCount.value).toBe(VEHICLE_MAX);
    expect(u.vehicleLights.value[1].z).toBe(BEAM_CANDELA);
    expect(u.vehicleLights.value[(VEHICLE_MAX - 1) * 2 + 1].z).toBeLessThan(BEAM_CANDELA);
    expect(u.vehicleLights.value[0].w).toBe(BEAM_RANGE_M);
    expect(writeVehicleUniforms(u, s, 0.5, M)).toBe(VEHICLE_MAX);
    expect(u.vehicleLights.value[1].z).toBe(BEAM_CANDELA / 2);
  });
});

describe('fixed shader budget', () => {
  test('the patch declares a fixed vehicle array and loop; the program key is unchanged', () => {
    const u = createLightingUniforms();
    expect(u.vehicleLights.value).toHaveLength(VEHICLE_MAX * 2);
    const m = new MeshStandardMaterial();
    patchMaterial(m, u);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <lights_pars_begin>\n#include <lights_fragment_maps>',
    };
    m.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain(`uniform vec4 vehicleLights[ ${VEHICLE_MAX * 2} ];`);
    expect(shader.fragmentShader).toContain('n < cityCars + cityFloods + cityLamps');
    expect(shader.uniforms.vehicleCount).toBe(u.vehicleCount);
    expect(m.customProgramCacheKey()).toBe('city-lights-v3');
  });
  test('controller: nearest beams at night, none by day, no real-time lights', () => {
    const stadium = createIdrottsparken(terrain);
    const lighting = createCityLighting({
      terrain,
      stadium,
      renderer: { toneMappingExposure: 1, info: { programs: [] } } as unknown as WebGLRenderer,
      scene: new Scene(),
    });
    // Looking along +x, down the row of vehicles.
    const camera = new PerspectiveCamera(50, 1, 0.01, 1000);
    camera.lookAt(1, 0, 0);
    camera.updateMatrixWorld();
    const poses = row(30);
    lighting.set({ date: '2026-10-21', minutes: 12 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, camera, 800);
    expect(lighting.updateVehicles(poses, camera)).toBe(0);
    expect(lighting.describe().vehicleLights.active).toBe(0);
    lighting.set({ date: '2026-10-21', minutes: 22 * 60, stadium: 'off' });
    lighting.settle();
    lighting.update(0.016, camera, 800);
    expect(lighting.updateVehicles(poses, camera)).toBe(VEHICLE_MAX);
    const d = lighting.describe();
    expect(d.vehicleLights.selected.map((s) => s.id)).toEqual(
      poses.slice(0, VEHICLE_MAX).map((p) => p.id),
    );
    expect(d.realtimeLights).toMatchObject({ point: 0, spot: 0 });
    let lights = 0;
    lighting.group.traverse((o) => {
      if (o instanceof PointLight || o instanceof SpotLight) lights++;
      if (o instanceof DirectionalLight) expect(o.castShadow).toBe(false);
    });
    expect(lights).toBe(0);
    lighting.setVehicleBeams(false);
    expect(lighting.updateVehicles(poses, camera)).toBe(0);
    expect(lighting.uniforms.vehicleCount.value).toBe(0);
    lighting.setVehicleBeams(true);
    expect(lighting.updateVehicles([], camera)).toBe(0);
    // Behind the camera, with the beam reach (60 m) wholly outside the view: skipped, so the budget
    // goes to the vehicles in view. A vehicle behind but within 60 m of the view still counts.
    const behind = row(30).map((p) => ({ ...p, id: p.id + 5000, x: -p.x - 80 / M }));
    expect(lighting.updateVehicles(behind, camera)).toBe(0);
    const mixed = [...behind, ...poses.slice(0, 5)];
    expect(lighting.updateVehicles(mixed, camera)).toBe(5);
    expect(lighting.describe().vehicleLights.selected.map((s) => s.id)).toEqual(
      poses.slice(0, 5).map((p) => p.id),
    );
    camera.lookAt(-1, 0, 0);
    camera.updateMatrixWorld();
    expect(lighting.updateVehicles([{ ...poses[0], x: 40 / M }], camera)).toBe(1);
    expect(lighting.updateVehicles([{ ...poses[0], x: 70 / M }], camera)).toBe(0);
    lighting.dispose();
    stadium.dispose();
  });
});

describe('vehicle models: poses and lens glow', () => {
  const vehicle = (id: number, kind: Vehicle['kind'], heading: number): Vehicle => ({
    id,
    kind,
    pos: [id * 0.5, 0.1, -id * 0.25],
    heading,
    speed: 10,
    road: 'r',
    stopped: false,
  });
  test('poses are the drawn (smoothed) poses of cars and trucks; trams and trains excluded', () => {
    const t = createTransportModels();
    const list = [vehicle(1, 'compact', 0.3), vehicle(2, 'truck', -1), vehicle(3, 'estate', 2)];
    t.update([...list, vehicle(4, 'tram', 0), vehicle(5, 'train', 0)], [], 0.016, 0);
    const poses = t.poses();
    expect(poses.map((p) => [p.id, p.kind]).sort()).toEqual([
      [1, 'compact'],
      [2, 'truck'],
      [3, 'estate'],
    ]);
    for (const p of poses) {
      const v = list.find((x) => x.id === p.id)!;
      expect([p.x, p.y, p.z]).toEqual(v.pos);
      expect(p.heading).toBe(v.heading);
      expect(t.positionOf(p.id)!.toArray()).toEqual([p.x, p.y, p.z]);
    }
    // Paused simulation (unchanged snapshot): poses converge and keep following the models.
    const moved = list.map((v) => ({ ...v, pos: [v.pos[0] + 0.1, v.pos[1], v.pos[2]] as Vehicle['pos'] }));
    for (let i = 0; i < 120; i++) t.update(moved, [], 0.016, 0);
    for (const p of t.poses()) {
      const v = moved.find((x) => x.id === p.id)!;
      expect(p.x).toBeCloseTo(v.pos[0], 6);
      expect(t.positionOf(p.id)!.x).toBe(p.x);
    }
    t.update([], [], 0.016, 0);
    expect(t.poses()).toHaveLength(0);
    t.dispose();
  });
  test('lens glow: unchanged by day, brighter at night', () => {
    const t = createTransportModels();
    const lenses = () => {
      const out = new Set<MeshStandardMaterial>();
      t.group.traverse((o) => {
        const m = (o as { material?: MeshStandardMaterial }).material;
        if (m && !Array.isArray(m) && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) out.add(m);
      });
      return [...out];
    };
    const day = lenses().map((m) => m.emissiveIntensity);
    t.setNightLevel(0);
    expect(lenses().map((m) => m.emissiveIntensity)).toEqual(day);
    t.setNightLevel(1);
    const night = lenses().map((m) => m.emissiveIntensity);
    expect(night.filter((v, i) => v > day[i]).length).toBeGreaterThanOrEqual(2);
    t.dispose();
  });
});
