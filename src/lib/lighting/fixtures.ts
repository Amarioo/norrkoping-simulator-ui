/**
 * Street and park fixtures of the Step 6 pilot (src/lib/data/streetlights.json): shader lamps on
 * the real mounting surface, and their instanced visuals.
 *
 * - Ground fixtures stand on the rendered ground (terrain.groundHeight: the DTM mesh / breakline
 *   patches); bridge fixtures on the drawn deck (terrain.profileHeight of the bridge way + ROAD_SURFACE),
 *   so supports are neither floating nor buried and light starts at the correct height.
 * - Visuals (Lighting Phase L1, see createFixtureVisuals): housings and lenses are gathered per
 *   fixture near the camera (full detail within POLE_NEAR, low detail to POLE_DETAIL, lenses to
 *   LENS_DETAIL); all halos (camera-facing glare quads with a minimum pixel size) are one instanced
 *   mesh, the distant city lights. Until Phase A3 there were per-area groups with a 1.25 km pole and
 *   3.5 km lens distance, which does not scale to a city-wide set. Halo bounds carry a margin for the
 *   screen-space minimum quad size, so a partly visible halo is not frustum-culled.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
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
/** Full-detail housings within this distance (scene units, 250 m). */
export const POLE_NEAR = 10;
/** Low-detail housings up to this distance (600 m); beyond, a pole is well under a pixel wide. */
export const POLE_DETAIL = 24;
/** Lenses up to this distance (1 km); beyond, the halo is the visible light. */
export const LENS_DETAIL = 40;
/** The near set is gathered again after the camera moved this far (12.5 m). */
export const REGATHER = 0.5;
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

/** Low-detail housing shapes (beyond POLE_NEAR): open 4-sided poles, one box for arm and head. */
const LOD_SHAPES: Record<string, () => BufferGeometry> = {
  bracket8: () => lodBracket(8, 1.4),
  bracket6: () => lodBracket(6, 0.9),
  lantern42: () => lodLantern(4.2),
  lantern4: () => lodLantern(4),
};
function lodBracket(h: number, arm: number) {
  return mergeGeometries([
    at(new CylinderGeometry(0.07, 0.08, h, 4, 1, true), 0, h / 2, 0),
    at(new BoxGeometry(0.2, 0.08, arm + 0.6), 0, h - 0.05, (arm + 0.6) / 2),
  ])!;
}
function lodLantern(h: number) {
  return mergeGeometries([
    at(new CylinderGeometry(0.05, 0.06, h - 0.3, 4, 1, true), 0, (h - 0.3) / 2, 0),
    at(new CylinderGeometry(0.06, 0.18, 0.4, 4, 1, false), 0, h - 0.2, 0),
  ])!;
}
const TYPE_LOD: Record<string, keyof typeof LOD_SHAPES> = {
  'street-bracket-8m': 'bracket8',
  'street-bracket-6m': 'bracket6',
  'park-lantern-4m': 'lantern42',
  'entrance-post-4m': 'lantern4',
};

/** Side of the square tiles fixtures are bucketed into for gathering (scene units, 200 m). */
export const GATHER_TILE = 8;

/**
 * Instanced visuals of a complete fixture set (Lighting Phase L1: scale to tens of thousands).
 *
 * - Halos: ONE InstancedMesh with every lamp (canonical order, static matrices and colours), drawn
 *   only at night: distant city lights in a single draw call.
 * - Housings and lenses: per type (and per colour temperature for lenses) one full-detail, one
 *   low-detail and one lens InstancedMesh whose instances are GATHERED from the fixtures near the
 *   camera: full detail within POLE_NEAR, low detail up to POLE_DETAIL, lenses up to LENS_DETAIL
 *   (3D distance from the camera to the fixture base). Gathering runs when the set changes or the
 *   camera has moved REGATHER units; it visits only the tiles within reach and copies precomputed
 *   matrices, in a fixed order (tile z, tile x, canonical fixture order), so the instance buffers
 *   depend only on the set and the gather position. Draw calls stay constant (≈ 3 per type + 1) and
 *   triangles are bounded by the fixtures within reach, independent of the city total.
 * - Every instanced mesh lists its current fixtures in `userData.fixtureIds` (instance order).
 */
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

  // Precomputed housing/lens transform of every fixture (16 floats each, fixture order).
  const n = fixtures.length;
  const matrices = new Float32Array(n * 16);
  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(1 / metres, 1 / metres, 1 / metres),
    v = new Vector3(),
    up = new Vector3(0, 1, 0);
  fixtures.forEach((f, i) => {
    q.setFromAxisAngle(up, f.heading ?? 0);
    m.compose(v.set(f.x, lamps[i].baseY, f.z), q, s);
    m.toArray(matrices, i * 16);
  });

  // Tiles (fixture indices in fixture = canonical order).
  const tiles = new Map<string, number[]>();
  const tileOf = (x: number) => Math.floor(x / GATHER_TILE);
  fixtures.forEach((f, i) => {
    const k = `${tileOf(f.x)},${tileOf(f.z)}`;
    let t = tiles.get(k);
    if (!t) tiles.set(k, (t = []));
    t.push(i);
  });
  /**
   * Instance capacity: the most fixtures of one kind in any block of tiles that a gather within
   * `radius` can visit (the tile range around any camera position). Counted per tile first.
   */
  const capacity = (filter: (i: number) => boolean, radius: number) => {
    // A fixture within `radius` of the camera lies at most ceil(radius / tile) tiles away from the
    // camera's tile; the camera may stand in any tile, empty ones included. Exact maximum of the
    // (2·reach + 1)² block sums over every possible camera tile, with a 2D prefix sum.
    const reach = Math.ceil(radius / GATHER_TILE) + 1;
    if (!n) return 1;
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const key of tiles.keys()) {
      const [tx, tz] = key.split(',').map(Number);
      x0 = Math.min(x0, tx);
      z0 = Math.min(z0, tz);
      x1 = Math.max(x1, tx);
      z1 = Math.max(z1, tz);
    }
    const w = x1 - x0 + 1,
      h = z1 - z0 + 1;
    const prefix = new Float64Array((w + 1) * (h + 1));
    for (const [key, list] of tiles) {
      const [tx, tz] = key.split(',').map(Number);
      let c = 0;
      for (const i of list) if (filter(i)) c++;
      prefix[(tz - z0 + 1) * (w + 1) + (tx - x0 + 1)] = c;
    }
    for (let z = 1; z <= h; z++)
      for (let x = 1; x <= w; x++)
        prefix[z * (w + 1) + x] +=
          prefix[(z - 1) * (w + 1) + x] + prefix[z * (w + 1) + x - 1] - prefix[(z - 1) * (w + 1) + x - 1];
    const sum = (ax: number, az: number, bx: number, bz: number) => {
      // Inclusive tile block, clipped to the occupied rectangle.
      ax = Math.max(ax, 0);
      az = Math.max(az, 0);
      bx = Math.min(bx, w - 1);
      bz = Math.min(bz, h - 1);
      if (ax > bx || az > bz) return 0;
      const W = w + 1;
      return (
        prefix[(bz + 1) * W + bx + 1] - prefix[az * W + bx + 1] - prefix[(bz + 1) * W + ax] + prefix[az * W + ax]
      );
    };
    let best = 0;
    for (let cz = -reach; cz < h + reach; cz++)
      for (let cx = -reach; cx < w + reach; cx++)
        best = Math.max(best, sum(cx - reach, cz - reach, cx + reach, cz + reach));
    return Math.max(1, best);
  };

  interface Slot {
    mesh: InstancedMesh;
    accept(i: number, d: number): boolean;
  }
  const slots: Slot[] = [];
  const types = [...new Set(fixtures.map((f) => f.type))].sort();
  for (const type of types) {
    const ofType = (i: number) => fixtures[i].type === type;
    const shape = TYPE_SHAPE[type]();
    const near = own(
      new InstancedMesh(own(shape.body()), housing, capacity(ofType, POLE_NEAR + REGATHER)),
    );
    near.name = `lighting-body-${type}`;
    slots.push({ mesh: near, accept: (i, d) => ofType(i) && d < POLE_NEAR });
    const lod = own(
      new InstancedMesh(own(LOD_SHAPES[TYPE_LOD[type]]()), housing, capacity(ofType, POLE_DETAIL + REGATHER)),
    );
    lod.name = `lighting-body-lod-${type}`;
    slots.push({ mesh: lod, accept: (i, d) => ofType(i) && d >= POLE_NEAR && d < POLE_DETAIL });
    const lensGeometry = own(shape.lensGeometry());
    for (const cct of [...new Set(fixtures.filter((f) => f.type === type).map((f) => f.cct))].sort(
      (a, b) => a - b,
    )) {
      const match = (i: number) => ofType(i) && fixtures[i].cct === cct;
      const lens = own(
        new InstancedMesh(lensGeometry, lensFor(cct), capacity(match, LENS_DETAIL + REGATHER)),
      );
      lens.name = `lighting-lens-${type}-${cct}`;
      slots.push({ mesh: lens, accept: (i, d) => match(i) && d < LENS_DETAIL });
    }
  }
  for (const { mesh } of slots) {
    mesh.count = 0;
    mesh.userData.fixtureIds = [];
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    group.add(mesh);
  }

  // Halos: every lamp, static.
  const halo = own(new InstancedMesh(own(new PlaneGeometry(1, 1)), haloMaterial, Math.max(1, n)));
  halo.name = 'lighting-halos';
  halo.count = n;
  const colors = new Float32Array(Math.max(1, n) * 3);
  lamps.forEach((l, k) => {
    m.makeTranslation(l.x, l.y, l.z);
    halo.setMatrixAt(k, m);
    // Halo brightness grows weakly with output (cube root of candela, relative to 900 cd).
    const w = Math.cbrt(l.candela / 900) * 0.9;
    colors.set([l.color[0] * w, l.color[1] * w, l.color[2] * w], k * 3);
  });
  halo.instanceColor = new InstancedBufferAttribute(colors, 3);
  halo.userData.fixtureIds = fixtures.map((f) => f.id);
  if (n) {
    halo.computeBoundingSphere();
    halo.boundingSphere!.radius += HALO_CULL_MARGIN;
  }
  halo.renderOrder = 5;
  halo.visible = false;
  group.add(halo);

  // Gathering.
  const gatheredAt = new Vector3();
  let dropped = 0,
    gathered = false,
    gathers = 0;
  const reach = Math.max(POLE_DETAIL, LENS_DETAIL);
  const gather = (p: Vector3) => {
    gathered = true;
    gathers++;
    dropped = 0;
    gatheredAt.copy(p);
    const counts = slots.map(() => 0);
    const ids: string[][] = slots.map(() => []);
    for (let tz = tileOf(p.z - reach); tz <= tileOf(p.z + reach); tz++)
      for (let tx = tileOf(p.x - reach); tx <= tileOf(p.x + reach); tx++)
        for (const i of tiles.get(`${tx},${tz}`) ?? []) {
          const f = fixtures[i];
          const d = Math.hypot(f.x - p.x, lamps[i].baseY - p.y, f.z - p.z);
          if (d >= reach) continue;
          slots.forEach((slot, k) => {
            if (!slot.accept(i, d)) return;
            const array = slot.mesh.instanceMatrix.array as Float32Array;
            // Never expected (capacity is the exact block maximum); counted, never silent.
            if (counts[k] >= slot.mesh.instanceMatrix.count) return void dropped++;
            array.set(matrices.subarray(i * 16, i * 16 + 16), counts[k] * 16);
            ids[k].push(f.id);
            counts[k]++;
          });
        }
    slots.forEach(({ mesh }, k) => {
      mesh.count = counts[k];
      mesh.userData.fixtureIds = ids[k];
      const attr = mesh.instanceMatrix;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, counts[k] * 16);
      attr.needsUpdate = true;
      mesh.visible = counts[k] > 0;
      if (counts[k]) mesh.computeBoundingSphere();
    });
  };

  const lensColor = new Color(),
    dayLens = new Color('#c9c8c0');
  return {
    group,
    /** Per frame: gather near fixtures when the camera moved; night level of lenses/halos. */
    update(
      camera: Camera,
      level: number,
      viewportHeight: number,
      fog: { near: number; far: number },
    ) {
      if (!gathered || camera.position.distanceTo(gatheredAt) >= REGATHER) gather(camera.position);
      for (const { material, color } of lensMaterials.values()) {
        // Lit lens: HDR emitter colour (unlit material, tone mapped); by day a grey diffuser.
        lensColor.setRGB(color[0] * 7, color[1] * 7, color[2] * 7);
        material.color.copy(dayLens).lerp(lensColor, level);
      }
      haloMaterial.uniforms.haloLevel.value = level * 0.6;
      haloMaterial.uniforms.viewportHeight.value = viewportHeight;
      haloMaterial.uniforms.fogNear.value = fog.near;
      haloMaterial.uniforms.fogFar.value = fog.far;
      halo.visible = level > 0.01 && n > 0;
    },
    /** Gathers at `position` now (tests and diagnostics; update() does this when needed). */
    gatherAt(position: Vector3) {
      gather(position);
    },
    counts: () => {
      let instancedMeshes = 0,
        instances = 0,
        detailInstances = 0,
        instanceBytes = 0,
        geometryBytes = 0,
        detailTriangles = 0;
      const geometries = new Set<BufferGeometry>();
      group.traverse((o) => {
        if (!(o instanceof InstancedMesh)) return;
        instancedMeshes++;
        instances += o.instanceMatrix.count;
        if (o.visible && o !== halo) {
          detailInstances += o.count;
          const g = o.geometry;
          detailTriangles += o.count * ((g.index?.count ?? g.getAttribute('position').count) / 3);
        }
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
        fixtures: n,
        tiles: tiles.size,
        instancedMeshes,
        /** Allocated instance capacity (all meshes, halos included). */
        instances,
        /** Gathered housing/lens instances currently enabled (before frustum culling). */
        detailInstances,
        detailTriangles,
        halos: n,
        gathers,
        /** Instances that did not fit the capacity in the last gather (must be 0). */
        droppedLastGather: dropped,
        gatheredAt: gathered ? gatheredAt.toArray() : null,
        instanceBytes,
        geometryBytes,
      };
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
