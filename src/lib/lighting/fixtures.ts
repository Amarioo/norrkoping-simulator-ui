/**
 * Street and park fixtures of the Step 6 pilot (src/lib/data/streetlights.json): shader lamps on
 * the real mounting surface, and their instanced visuals.
 *
 * - Ground fixtures stand on the rendered ground (terrain.groundHeight: the DTM mesh / breakline
 *   patches); bridge fixtures on the drawn deck (terrain.profileHeight of the bridge way + ROAD_SURFACE),
 *   so supports are neither floating nor buried and light starts at the correct height.
 * - Visuals: one InstancedMesh per (pilot, type) for the housing and one for the lens, plus one halo
 *   InstancedMesh per pilot (camera-facing glare quads with a minimum pixel size). Housings are hidden
 *   beyond POLE_DETAIL (1.25 km) and lenses beyond LENS_DETAIL; halos stay as distant city lights.
 *   Detail distances are measured to the nearest point of the group's bounds (Phase 0; previously to
 *   the group centre, which could hide a nearby fixture of a wide group). Halo bounds carry a margin
 *   for the screen-space minimum quad size, so a partly visible halo is not frustum-culled.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_SURFACE, type TerrainService } from '../terrain';
import type { ShaderLamp } from './cityLights';
import lighting from '../data/streetlights.json';

export interface FixtureRecord {
  id: string;
  pilot: string;
  type: string;
  x: number;
  z: number;
  heading: number | null;
  mount:
    | { kind: 'ground' }
    | {
        kind: 'bridge';
        segment: { way: number; a: number[]; b: number[]; yA: number; yB: number; t: number };
      };
  /** Mapped (OSM node) or estimated; method, source and uncertainty: streetlights-provenance.json. */
  placement: 'mapped' | 'estimated';
  /** Canonical registry ID (registry.ts), when the record came through the registry. */
  canonicalId?: string;
  heightM: number;
  cct: number;
  candela: number;
  rangeM: number;
  profile: number;
  occlusionM: number[];
}
export const FIXTURES = lighting.fixtures as unknown as FixtureRecord[];
export const LIGHTING_META = lighting.meta;
export const POLE_DETAIL = 50;
export const LENS_DETAIL = 140;
/**
 * Extra halo bounding radius (scene units): the halo quad keeps haloMinPx on screen, so its world size
 * grows with distance (≈ 1.8 units at the 1 700-unit fog end for a 1 000 px viewport).
 */
export const HALO_CULL_MARGIN = 2;

/** Night-adapted white point; keeps warm lamps warm without a yellow wash on grass/pavements. */
export const WHITE_POINT_K = 3500;
/** Linear RGB of a black body at `kelvin`, white-balanced to WHITE_POINT_K, normalised to max 1. */
export function kelvinToLinear(kelvin: number): [number, number, number] {
  const c = blackBody(kelvin),
    w = blackBody(WHITE_POINT_K);
  const r = c[0] / w[0],
    g = c[1] / w[1],
    b = c[2] / w[2];
  const m = Math.max(r, g, b);
  return [r / m, g / m, b / m];
}
/** Linear RGB of a black body (Tanner Helland fit), normalised to max 1. */
function blackBody(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = new Color().setRGB(
    Math.min(255, Math.max(0, r)) / 255,
    Math.min(255, Math.max(0, g)) / 255,
    Math.min(255, Math.max(0, b)) / 255,
    SRGBColorSpace,
  );
  const m = Math.max(c.r, c.g, c.b);
  return [c.r / m, c.g / m, c.b / m];
}

/** Grows `target` to contain `s` (an empty target becomes `s`). */
function unionSphere(target: Sphere, s: Sphere) {
  if (target.isEmpty()) target.copy(s);
  else target.union(s);
}

interface TypeShape {
  armM: number;
  /** Lens centre relative to the base, before rotation (metres): (0, y, z along the arm). */
  lens: [number, number, number];
  body(): BufferGeometry;
  lensGeometry(): BufferGeometry;
}
const at = (g: BufferGeometry, x: number, y: number, z: number, rx = 0) => {
  if (rx) g.rotateX(rx);
  return g.translate(x, y, z);
};
/** Fixture shapes in metres (scaled to scene units on use). Dimensions are estimates. */
const SHAPES: Record<string, (h: number, arm: number) => TypeShape> = {
  bracket: (h, arm) => ({
    armM: arm,
    lens: [0, h - 0.12, arm + 0.1],
    body: () =>
      mergeGeometries([
        at(new CylinderGeometry(0.06, 0.09, h, 8), 0, h / 2, 0),
        at(new BoxGeometry(0.07, 0.07, arm + 0.1), 0, h - 0.05, (arm + 0.1) / 2),
        at(new BoxGeometry(0.28, 0.09, 0.62), 0, h - 0.05, arm + 0.1),
        at(new CylinderGeometry(0.16, 0.2, 0.5, 8), 0, 0.25, 0),
      ])!,
    lensGeometry: () => at(new PlaneGeometry(0.22, 0.5), 0, h - 0.1, arm + 0.1, Math.PI / 2),
  }),
  lantern: (h) => ({
    armM: 0,
    lens: [0, h - 0.3, 0],
    body: () =>
      mergeGeometries([
        at(new CylinderGeometry(0.045, 0.07, h - 0.5, 8), 0, (h - 0.5) / 2, 0),
        at(new CylinderGeometry(0.04, 0.22, 0.14, 8), 0, h - 0.05, 0),
        at(new CylinderGeometry(0.12, 0.12, 0.06, 8), 0, h - 0.52, 0),
      ])!,
    lensGeometry: () => at(new CylinderGeometry(0.15, 0.1, 0.42, 8, 1, true), 0, h - 0.3, 0),
  }),
};
const TYPE_SHAPE: Record<string, () => TypeShape> = {
  'street-bracket-8m': () => SHAPES.bracket(8, 1.4),
  'street-bracket-6m': () => SHAPES.bracket(6, 0.9),
  'park-lantern-4m': () => SHAPES.lantern(4.2, 0),
  'entrance-post-4m': () => SHAPES.lantern(4, 0),
};
/** Fixture types the renderer has geometry for (registry validation). */
export const FIXTURE_TYPES = Object.keys(TYPE_SHAPE);

/** Mounting surface height of a fixture (scene units). */
export function mountHeight(f: FixtureRecord, terrain: TerrainService) {
  if (f.mount.kind === 'bridge') {
    const s = f.mount.segment;
    return (
      terrain.profileHeight([s.a[0], s.yA, s.a[1]], [s.b[0], s.yB, s.b[1]], s.t) + ROAD_SURFACE
    );
  }
  return terrain.groundHeight(f.x, f.z);
}
/** Emitter position (scene units) of a fixture with base height `baseY`. */
export function emitterPosition(
  f: FixtureRecord,
  baseY: number,
  metres: number,
): [number, number, number] {
  const shape = TYPE_SHAPE[f.type]();
  const h = f.heading ?? 0;
  const [, ly, lz] = shape.lens;
  return [
    f.x + (Math.sin(h) * lz) / metres,
    baseY + ly / metres,
    f.z + (Math.cos(h) * lz) / metres,
  ];
}
/** Shader lamps of all fixtures (deterministic order = data order). */
export function fixtureLamps(fixtures: FixtureRecord[], terrain: TerrainService): ShaderLamp[] {
  const metres = terrain.data.reference.metresPerUnit;
  return fixtures.map((f) => {
    const baseY = mountHeight(f, terrain);
    const [x, y, z] = emitterPosition(f, baseY, metres);
    return {
      x,
      y,
      z,
      rangeM: f.rangeM,
      color: kelvinToLinear(f.cct),
      candela: f.candela,
      profile: f.profile,
      heading: f.heading ?? 0,
      baseY,
      clipBelow: f.mount.kind === 'bridge',
      occlusionM: f.occlusionM,
    };
  });
}

const HALO_VERTEX = /* glsl */ `
uniform float haloSize;
uniform float haloMinPx;
uniform float viewportHeight;
varying vec2 vUv;
varying vec3 vColor;
varying float vFog;
uniform float fogNear;
uniform float fogFar;
void main() {
	vec4 centre = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec4 clip = projectionMatrix * centre;
	float pxPerUnit = projectionMatrix[ 1 ][ 1 ] * viewportHeight * 0.5 / max( clip.w, 1e-4 );
	float size = max( haloSize, haloMinPx / pxPerUnit );
	centre.xy += position.xy * size;
	// Pull the quad slightly towards the camera so it is not cut by its own housing.
	centre.xyz *= 1.0 - min( 0.002, 0.04 / max( length( centre.xyz ), 1e-3 ) );
	gl_Position = projectionMatrix * centre;
	vUv = uv;
	vColor = instanceColor;
	vFog = smoothstep( fogNear, fogFar, -centre.z );
}
`;
const HALO_FRAGMENT = /* glsl */ `
uniform float haloLevel;
varying vec2 vUv;
varying vec3 vColor;
varying float vFog;
void main() {
	float r = length( vUv - 0.5 ) * 2.0;
	float a = exp( - r * r * 6.0 ) * ( 1.0 - smoothstep( 0.75, 1.0, r ) );
	gl_FragColor = vec4( vColor * a * haloLevel * ( 1.0 - vFog ), 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export function createFixtureVisuals(
  fixtures: FixtureRecord[],
  lamps: ShaderLamp[],
  metres: number,
) {
  const group = new Group();
  group.name = 'lighting-fixtures';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const housing = own(
    new MeshStandardMaterial({ color: '#4a4f52', roughness: 0.55, metalness: 0.45 }),
  );
  const lensMaterials = new Map<
    number,
    { material: MeshBasicMaterial; color: [number, number, number] }
  >();
  const lensFor = (cct: number) => {
    if (!lensMaterials.has(cct))
      lensMaterials.set(cct, {
        material: own(new MeshBasicMaterial({ color: '#c9c8c0' })),
        color: kelvinToLinear(cct),
      });
    return lensMaterials.get(cct)!.material;
  };
  const haloMaterial = own(
    new ShaderMaterial({
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: {
        haloSize: { value: 0.65 / metres },
        haloMinPx: { value: 2.5 },
        viewportHeight: { value: 800 },
        haloLevel: { value: 0 },
        fogNear: { value: 700 },
        fogFar: { value: 1700 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: true,
    }),
  );
  const pilots = new Map<
    string,
    { group: Group; bounds: Sphere; bodies: InstancedMesh[]; lenses: InstancedMesh[] }
  >();
  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(1 / metres, 1 / metres, 1 / metres),
    v = new Vector3(),
    up = new Vector3(0, 1, 0);
  const byPilot = new Map<string, number[]>();
  fixtures.forEach((f, i) => byPilot.set(f.pilot, [...(byPilot.get(f.pilot) ?? []), i]));
  for (const [pilot, indices] of byPilot) {
    const pg = new Group();
    pg.name = 'lighting-' + pilot;
    const entry = {
      group: pg,
      bounds: new Sphere(),
      bodies: [] as InstancedMesh[],
      lenses: [] as InstancedMesh[],
    };
    const byType = new Map<string, number[]>();
    for (const i of indices)
      byType.set(fixtures[i].type, [...(byType.get(fixtures[i].type) ?? []), i]);
    for (const [type, list] of byType) {
      const shape = TYPE_SHAPE[type]();
      const body = own(new InstancedMesh(own(shape.body()), housing, list.length));
      const lensGeometry = own(shape.lensGeometry());
      // One lens mesh per colour temperature within the type.
      const byCct = new Map<number, number[]>();
      for (const i of list) byCct.set(fixtures[i].cct, [...(byCct.get(fixtures[i].cct) ?? []), i]);
      list.forEach((i, k) => {
        const f = fixtures[i];
        q.setFromAxisAngle(up, f.heading ?? 0);
        m.compose(v.set(f.x, lamps[i].baseY, f.z), q, s);
        body.setMatrixAt(k, m);
      });
      body.computeBoundingSphere();
      unionSphere(entry.bounds, body.boundingSphere!);
      body.userData.fixtureIds = list.map((i) => fixtures[i].id);
      pg.add(body);
      entry.bodies.push(body);
      for (const [cct, ccts] of byCct) {
        const lens = own(new InstancedMesh(lensGeometry, lensFor(cct), ccts.length));
        ccts.forEach((i, k) => {
          const f = fixtures[i];
          q.setFromAxisAngle(up, f.heading ?? 0);
          m.compose(v.set(f.x, lamps[i].baseY, f.z), q, s);
          lens.setMatrixAt(k, m);
        });
        lens.computeBoundingSphere();
        unionSphere(entry.bounds, lens.boundingSphere!);
        pg.add(lens);
        entry.lenses.push(lens);
      }
    }
    const halo = own(new InstancedMesh(own(new PlaneGeometry(1, 1)), haloMaterial, indices.length));
    const colors = new Float32Array(indices.length * 3);
    indices.forEach((i, k) => {
      const l = lamps[i];
      m.makeTranslation(l.x, l.y, l.z);
      halo.setMatrixAt(k, m);
      // Halo brightness grows weakly with output (cube root of candela, relative to 900 cd).
      const w = Math.cbrt(l.candela / 900) * 0.9;
      colors.set([l.color[0] * w, l.color[1] * w, l.color[2] * w], k * 3);
    });
    halo.instanceColor = new InstancedBufferAttribute(colors, 3);
    halo.computeBoundingSphere();
    halo.boundingSphere!.radius += HALO_CULL_MARGIN;
    unionSphere(entry.bounds, halo.boundingSphere!);
    halo.renderOrder = 5;
    halo.frustumCulled = true;
    pg.add(halo);
    group.add(pg);
    pilots.set(pilot, entry);
  }
  const lensColor = new Color(),
    dayLens = new Color('#c9c8c0');
  return {
    group,
    /** Per frame: detail by camera distance and the night level of lenses/halos (no allocation). */
    update(
      camera: Camera,
      level: number,
      viewportHeight: number,
      fog: { near: number; far: number },
    ) {
      for (const p of pilots.values()) {
        // Distance to the nearest point of the group's bounds (0 inside): never farther than any member.
        const d = Math.max(0, camera.position.distanceTo(p.bounds.center) - p.bounds.radius);
        for (const b of p.bodies) b.visible = d < POLE_DETAIL;
        for (const l of p.lenses) l.visible = d < LENS_DETAIL;
      }
      for (const { material, color } of lensMaterials.values()) {
        // Lit lens: HDR emitter colour (unlit material, tone mapped); by day a grey diffuser.
        lensColor.setRGB(color[0] * 7, color[1] * 7, color[2] * 7);
        material.color.copy(dayLens).lerp(lensColor, level);
      }
      haloMaterial.uniforms.haloLevel.value = level * 0.6;
      haloMaterial.uniforms.viewportHeight.value = viewportHeight;
      haloMaterial.uniforms.fogNear.value = fog.near;
      haloMaterial.uniforms.fogFar.value = fog.far;
      const showHalos = level > 0.01;
      for (const p of pilots.values())
        for (const c of p.group.children)
          if (c instanceof InstancedMesh && c.material === haloMaterial) c.visible = showHalos;
    },
    counts: () => {
      let instancedMeshes = 0,
        instances = 0,
        detailInstances = 0,
        instanceBytes = 0,
        geometryBytes = 0;
      const geometries = new Set<BufferGeometry>();
      group.traverse((o) => {
        if (!(o instanceof InstancedMesh)) return;
        instancedMeshes++;
        instances += o.count;
        if (o.visible) detailInstances += o.count;
        instanceBytes +=
          o.instanceMatrix.array.byteLength + (o.instanceColor?.array.byteLength ?? 0);
        geometries.add(o.geometry);
      });
      for (const g of geometries) {
        for (const a of Object.values(g.attributes))
          geometryBytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
        geometryBytes += g.index?.array.byteLength ?? 0;
      }
      return {
        groups: pilots.size,
        instancedMeshes,
        instances,
        /** Instances in meshes enabled by detail/day-night state (before frustum culling). */
        detailInstances,
        instanceBytes,
        geometryBytes,
        groupBounds: [...pilots].map(([id, p]) => ({
          id,
          centre: p.bounds.center.toArray(),
          radius: p.bounds.radius,
        })),
      };
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
