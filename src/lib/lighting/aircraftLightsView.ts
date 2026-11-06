/**
 * Aircraft Lights Phase E2: draws the aircraft's exterior lights (model: aircraftLights.ts).
 *
 * Two instanced meshes of camera-facing glare quads (normal lights; strong lights with a larger glare)
 * for every light of every drawn aircraft, both with the street lights' halo shader (fixtures.ts
 * HALO_VERTEX/HALO_FRAGMENT, same material parameters as the airport lights), so no new shader
 * program is compiled. No three.js lights, no shadow maps. Each
 * frame, on the CPU: the light's world position is its model-frame socket under the aircraft's
 * interpolated object transform (the same matrix as the drawn body), and its colour is the phase rule
 * × flash level × visibility sector towards the camera × display level. Emissive only: the landing and
 * taxi lights light nothing on the ground (gap, docs/aircraft-lights-e2/remaining-gaps.md).
 */
import {
  AdditiveBlending,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Camera,
  type Fog,
} from 'three';
import { HALO_FRAGMENT, HALO_VERTEX } from './fixtures';
import {
  aircraftLightStates,
  DAY_FLASH_LEVEL,
  SOCKETS,
  type LightGroup,
  type LightKind,
  type Vec3,
} from './aircraftLights';

export type AircraftLightsMode = 'auto' | 'off';
/** Most aircraft whose lights are drawn (fixed buffer; the simulator flies one). */
export const AIRCRAFT_MAX = 4;
/**
 * Glow quads, metres and minimum pixels (ESTIMATE, perceptual): position lights and beacons a little
 * larger than the airport lights (0.9 m); the strong lights (landing, taxi, strobes) on a second buffer
 * with a larger glare, since the halo size is one uniform per material.
 */
export const GLOW = {
  normal: { sizeM: 1.3, minPx: 3 },
  strong: { sizeM: 4, minPx: 6 },
};
const STRONG: ReadonlySet<LightGroup> = new Set(['landing', 'taxi', 'strobe']);

/** One drawn aircraft: id, flight phase, gear, and the body's object-to-world matrix this frame. */
export interface AircraftLightPose {
  id: string;
  phase: string;
  gear: boolean;
  matrix: Matrix4;
}

export function createAircraftLights(metresPerUnit = 25) {
  const group = new Group();
  group.name = 'aircraft-lights';
  const capacity = AIRCRAFT_MAX * SOCKETS.length;
  const geometry = new PlaneGeometry(1, 1);
  // Two instanced buffers with the same halo program (two materials, one program; one draw call each).
  const buffer = (kind: keyof typeof GLOW) => {
    const material = new ShaderMaterial({
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: {
        haloSize: { value: GLOW[kind].sizeM / metresPerUnit },
        haloMinPx: { value: GLOW[kind].minPx },
        viewportHeight: { value: 800 },
        haloLevel: { value: 1 },
        fogNear: { value: 700 },
        fogFar: { value: 1700 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: true,
    });
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = 'aircraft-lights-glow-' + kind;
    mesh.count = 0;
    mesh.visible = false;
    // Moving lights, a few dozen quads: no bounding sphere to keep up to date.
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    const colors = new Float32Array(capacity * 3);
    mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
    group.add(mesh);
    return { mesh, material, colors };
  };
  const buffers = { normal: buffer('normal'), strong: buffer('strong') };

  const inverse = new Matrix4(),
    m = new Matrix4(),
    world = new Vector3(),
    eye = new Vector3(),
    viewer = new Vector3();
  interface Shown {
    aircraft: string;
    kind: LightKind;
    group: LightGroup;
    on: boolean;
    weight: number;
    rgb: Vec3;
    world: Vec3;
  }
  let shown: Shown[] = [];
  let last = { mode: 'auto' as AircraftLightsMode, nightLevel: 0, t0: 0, t1: 0, aircraft: 0 };
  let poses: { id: string; phase: string; gear: boolean; matrix: number[] }[] = [];

  return {
    group,
    /**
     * Per frame, after the aircraft models moved. `t0`…`t1` is the frame's simulation-time window
     * (createSimClock), `nightLevel` the street lighting's night level 0…1.
     */
    update(
      aircraft: readonly AircraftLightPose[],
      t0: number,
      t1: number,
      camera: Camera,
      nightLevel: number,
      mode: AircraftLightsMode,
      viewportHeight: number,
      fog: Fog | null,
    ) {
      const drawn = mode === 'off' ? [] : aircraft.slice(0, AIRCRAFT_MAX);
      last = { mode, nightLevel, t0, t1, aircraft: drawn.length };
      shown = [];
      poses = drawn.map((a) => ({
        id: a.id,
        phase: a.phase,
        gear: a.gear,
        matrix: [...a.matrix.elements],
      }));
      for (const b of Object.values(buffers)) {
        b.mesh.count = 0;
        b.mesh.visible = drawn.length > 0;
        const u = b.material.uniforms;
        u.viewportHeight.value = viewportHeight;
        if (fog) {
          u.fogNear.value = fog.near;
          u.fogFar.value = fog.far;
        }
      }
      if (!drawn.length) return;
      eye.setFromMatrixPosition(camera.matrixWorld);
      // Steady lights glow at the night level; flashing ones also by day (SERA.3215: anti-collision
      // lights in daylight), at DAY_FLASH_LEVEL.
      const steady = nightLevel,
        flashing = Math.max(nightLevel, DAY_FLASH_LEVEL);
      for (const a of drawn) {
        inverse.copy(a.matrix).invert();
        const local = viewer.copy(eye).applyMatrix4(inverse);
        const states = aircraftLightStates(a.id, a.phase, a.gear, t0, t1, [
          local.x,
          local.y,
          local.z,
        ]);
        for (const s of states) {
          const p = s.socket.position;
          world.set(p[0], p[1], p[2]).applyMatrix4(a.matrix);
          m.makeTranslation(world.x, world.y, world.z);
          const g = s.socket.group;
          const b = buffers[STRONG.has(g) ? 'strong' : 'normal'];
          const k = b.mesh.count++;
          b.mesh.setMatrixAt(k, m);
          const level = s.weight * (g === 'beacon' || g === 'strobe' ? flashing : steady);
          const rgb: Vec3 = [
            s.socket.rgb[0] * level,
            s.socket.rgb[1] * level,
            s.socket.rgb[2] * level,
          ];
          b.colors.set(rgb, k * 3);
          shown.push({
            aircraft: a.id,
            kind: s.socket.kind,
            group: g,
            on: s.on,
            weight: s.weight,
            rgb,
            world: [world.x, world.y, world.z],
          });
        }
      }
      for (const b of Object.values(buffers)) {
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.instanceColor!.needsUpdate = true;
      }
    },
    /** Beacon flash level 0…1 of the first aircraft this frame (for its lens), 0 if none. */
    beaconLevel() {
      return shown.find((s) => s.kind === 'beaconTop')?.weight ?? 0;
    },
    /** Development / test hook data: this frame's lights (world position in scene units, colour). */
    describe() {
      return {
        mode: last.mode,
        nightLevel: last.nightLevel,
        window: [last.t0, last.t1],
        aircraft: last.aircraft,
        poses: poses.map((p) => ({ ...p, matrix: [...p.matrix] })),
        capacity,
        instances: buffers.normal.mesh.count + buffers.strong.mesh.count,
        byBuffer: { normal: buffers.normal.mesh.count, strong: buffers.strong.mesh.count },
        visible: buffers.normal.mesh.visible,
        lights: shown.map((s) => ({ ...s })),
      };
    },
    dispose() {
      for (const b of Object.values(buffers)) {
        b.material.dispose();
        b.mesh.dispose();
      }
      geometry.dispose();
      group.clear();
    },
  };
}
