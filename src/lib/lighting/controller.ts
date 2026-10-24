/**
 * Step 6 lighting controller: simulated Europe/Stockholm clock → sun → sky, fog, exposure, the three
 * real-time lights, street lighting and the independent stadium floodlights.
 *
 * Real-time light budget (fixed for the session, so no program recompiles): one DirectionalLight
 * (sun/sky), one HemisphereLight, one AmbientLight; no shadow maps (the renderer's shadows stay off).
 * Fixtures are shader lights (cityLights.ts). Changing the time or the floodlight mode only updates
 * uniforms, light colours/intensities and the exposure.
 *
 * Street lighting (Lighting Phase 0): registry (registry.ts) → validation, canonical order and a
 * sparse, capacity-checked index (streetLighting.ts, lightIndex.ts) → textures, once at creation; no
 * rebuild or upload follows from time, day/night or floodlight changes. A rejected dataset never
 * reaches the GPU: in development and tests the initial set throws with its report; in production it
 * is logged, nothing (or the previous set) is rendered and describe() reports the rejection.
 * replaceStreetLighting() swaps a complete prepared set synchronously, or keeps the current one.
 *
 * Temporal smoothing: jumps of more than 20 simulated minutes (presets, date changes) blend the
 * environment over BLEND_SECONDS; floodlight groups ramp over RAMP_SECONDS. settle() ends both at
 * once (deterministic screenshots).
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Matrix3,
  Mesh,
  Vector3,
  type Camera,
  type DataTexture,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { TerrainService } from '../terrain';
import type { createIdrottsparken, StadiumMode } from '../stadium/idrottsparken';
import { STADIUM_MODES } from '../stadium/idrottsparken';
import {
  boundUniforms,
  createLightingUniforms,
  floatTexture,
  patchMaterial,
  STADIUM_MAX,
  STADIUM_ROOFS,
} from './cityLights';
import {
  blendEnvironment,
  createEnvironmentState,
  environmentAt,
  type EnvironmentState,
} from './environment';
import { createFixtureVisuals } from './fixtures';
import lightingData from '../data/streetlights.json';
import { pilotRegistry, type LightingRegistry, type PilotData } from './registry';
import {
  describeRejection,
  prepareStreetLighting,
  type PreparedStreetLighting,
  type RejectedStreetLighting,
} from './streetLighting';
import { createSky } from './sky';
import { dayPhase, localToUtc, solarPosition, sunDirection, utcToLocal } from './solar';

export const BLEND_SECONDS = 1.2;
export const RAMP_SECONDS = 1.5;
/** The pre-Step-6 fixed sun (Scene.svelte: position (−150, 260, 120)), for like-for-like daylight comparisons. */
export const LEGACY_SUN = new Vector3(-150, 260, 120).normalize();

/** The bundled Step 6 pilot (105 fixtures) as a registry. */
export function pilotLightingRegistry(terrain: TerrainService) {
  return pilotRegistry(lightingData as unknown as PilotData, terrain.data.reference);
}
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export interface LightingInput {
  date: string;
  minutes: number;
  stadium: StadiumMode['id'];
  /** Evidence mode: the pre-Step-6 sun direction and daylight state. */
  legacySun?: boolean;
}
export function createCityLighting(options: {
  terrain: TerrainService;
  stadium: ReturnType<typeof createIdrottsparken>;
  renderer: WebGLRenderer;
  scene: Scene;
  /** Street-lighting registry (default: the bundled pilot). */
  registry?: LightingRegistry;
  /** Throw on a rejected initial street-lighting set (default: development and tests). */
  strict?: boolean;
  /** Page side in cells (lightIndex.ts default). */
  chunkCells?: number;
}) {
  const { terrain, stadium, renderer, scene } = options;
  const metres = terrain.data.reference.metresPerUnit;
  const [lat, lon] = terrain.unproject(0, 0);
  const uniforms = createLightingUniforms();
  uniforms.cityMetres.value = metres;
  // WebGL 2 guarantees 2048; an unknown renderer (tests) is held to that minimum.
  const maxTextureSize = renderer.capabilities?.maxTextureSize ?? 2048;
  const group = new Group();
  group.name = 'city-lighting';
  const patchCount = { materials: 0, rebound: 0 };
  /** Patches a lit material, or rebinds one patched by an earlier controller to these uniforms. */
  const bind = (m: Material) => {
    const before = boundUniforms(m);
    if (patchMaterial(m, uniforms)) patchCount.materials++;
    else if (before && before !== uniforms) patchCount.rebound++;
  };

  // Street lighting: prepared on the CPU, then uploaded as one complete set.
  interface StreetSet {
    prepared: PreparedStreetLighting | null;
    textures: DataTexture[];
    visuals: ReturnType<typeof createFixtureVisuals> | null;
    uploadMs: number | null;
  }
  let street: StreetSet = { prepared: null, textures: [], visuals: null, uploadMs: null };
  let lastRejection: RejectedStreetLighting | null = null;
  let streetBuilds = 0;
  const applyStreet = (prepared: PreparedStreetLighting) => {
    const { index, lampPack } = prepared;
    const { directory, payload } = index.stats;
    const lampTexture = floatTexture(lampPack.data, lampPack.width, lampPack.height);
    const gridTexture = floatTexture(index.payload, payload.width, payload.height);
    const pageTexture = floatTexture(
      index.directory,
      Math.max(1, directory.columns),
      Math.max(1, directory.rows),
      true,
    );
    const visuals = createFixtureVisuals(prepared.fixtures, prepared.lamps, metres);
    visuals.group.traverse((o) => {
      const material = (o as Mesh).material as Material | Material[] | undefined;
      if (material) for (const m of [material].flat()) bind(m);
    });
    // Eager upload keeps the first night frame free of texture uploads (CPU submission time only).
    let uploadMs: number | null = null;
    if (typeof renderer.initTexture === 'function') {
      const t = now();
      for (const texture of [lampTexture, gridTexture, pageTexture]) renderer.initTexture(texture);
      uploadMs = now() - t;
    }
    // Swap uniforms and visuals in one step, then release the previous set.
    uniforms.cityLampTex.value = lampTexture;
    uniforms.cityGridTex.value = gridTexture;
    uniforms.cityPageTex.value = pageTexture;
    uniforms.cityGrid.value.set(index.originX, index.originZ, 1 / index.cell, directory.columns);
    uniforms.cityGridRows.value = directory.rows;
    uniforms.cityChunkCells.value = index.chunkCells;
    uniforms.cityPagesPerRow.value = payload.pagesPerRow;
    uniforms.cityLampRows.value = lampPack.rows;
    const previous = street;
    street = { prepared, textures: [lampTexture, gridTexture, pageTexture], visuals, uploadMs };
    if (previous.visuals) group.remove(previous.visuals.group);
    group.add(visuals.group);
    previous.visuals?.dispose();
    for (const t of previous.textures) t.dispose();
  };
  /**
   * Validates and indexes `registry`; on success swaps it in, otherwise keeps the current set. Never
   * throws for invalid data; the result and describe() report the outcome.
   */
  const replaceStreetLighting = (registry: LightingRegistry) => {
    streetBuilds++;
    const prepared = prepareStreetLighting(registry, terrain, {
      maxTextureSize,
      chunkCells: options.chunkCells,
    });
    if (!prepared.ok) {
      lastRejection = prepared;
      return prepared;
    }
    lastRejection = null;
    applyStreet(prepared);
    return prepared;
  };

  // Stadium hooks.
  uniforms.stadiumToLocal.value.copy(stadium.frame.toLocal);
  uniforms.stadiumToWorld.value.copy(
    new Matrix3().setFromMatrix4(stadium.frame.toWorld).multiplyScalar(metres),
  );
  if (stadium.emitters.length > STADIUM_MAX || stadium.roofs.length > STADIUM_ROOFS)
    throw new Error('Stadium lighting exceeds its shader budget');
  uniforms.stadiumCount.value = stadium.emitters.length;
  uniforms.stadiumRoofCount.value = stadium.roofs.length;
  stadium.emitters.forEach((e, j) => {
    const [a, b] = [uniforms.stadiumLights.value[j * 3], uniforms.stadiumLights.value[j * 3 + 1]];
    a.set(e.position[0], e.position[1], e.position[2], e.cosInner);
    b.set(e.aim[0], e.aim[1], e.aim[2], e.cosOuter);
  });
  stadium.roofs.forEach((r, k) => {
    uniforms.stadiumRoofs.value[k * 2].set(r.x0, r.x1, r.z0, r.z1);
    uniforms.stadiumRoofs.value[k * 2 + 1].set(r.y, 0, 0, 0);
  });
  const weights = { masts: 0, roofs: 0 },
    targets = { masts: 0, roofs: 0 };
  const applyWeights = () => {
    stadium.emitters.forEach((e, j) => {
      const w = weights[stadium.emitterGroups[j]] * e.candela;
      uniforms.stadiumLights.value[j * 3 + 2].set(
        e.color[0] * w,
        e.color[1] * w,
        e.color[2] * w,
        0,
      );
    });
    uniforms.stadiumLevel.value = Math.max(weights.masts, weights.roofs) > 0.0005 ? 1 : 0;
  };
  applyWeights();

  // Real-time lights, sky and fog (fixed set).
  const sun = new DirectionalLight('#fff3de', 2.1);
  sun.castShadow = false;
  const hemi = new HemisphereLight('#d9efff', '#8b9575', 1.1);
  const ambient = new AmbientLight('#f3f1e7', 0.75);
  const sky = createSky();
  group.add(sun, sun.target, hemi, ambient, sky.mesh);
  const initial = replaceStreetLighting(options.registry ?? pilotLightingRegistry(terrain));
  if (!initial.ok) {
    const message = describeRejection(initial);
    if (options.strict ?? import.meta.env.DEV) {
      sky.dispose();
      throw new Error(message);
    }
    console.error('[lighting] ' + message);
  }
  const fog = new Fog('#bacbd3', 700, 1700);
  scene.fog = fog;
  scene.background = new Color('#bacbd3');

  // Clock and smoothing state.
  let input: LightingInput = { date: '2026-06-21', minutes: 12 * 60, stadium: 'off' };
  let utc = localToUtc(input.date, input.minutes);
  const target = createEnvironmentState(),
    shown = createEnvironmentState(),
    from = createEnvironmentState();
  let blend = 1;
  const sunDir = new Vector3(),
    shownSun = new Vector3(),
    fromSun = new Vector3();
  let solar = solarPosition(utc, lat, lon);
  const computeTarget = () => {
    if (input.legacySun) {
      environmentAt(53.6, target);
      sunDir.copy(LEGACY_SUN);
      return;
    }
    solar = solarPosition(utc, lat, lon);
    environmentAt(solar.elevation, target);
    sunDir.fromArray(sunDirection(solar.azimuth, solar.elevation, terrain.trueNorth));
  };
  computeTarget();
  blendEnvironment(target, target, 1, shown);
  shownSun.copy(sunDir);

  const patch = (root: Object3D) => {
    root.traverse((o) => {
      const material = (o as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) bind(m);
    });
  };
  patch(stadium.group);
  patch(stadium.turf);

  /** Development diagnostics (describe()): counts, occupancy, sizes and timings; no per-frame cost. */
  const streetDiagnostics = () => {
    const p = street.prepared;
    const stats = p?.index.stats ?? null;
    const visualCounts = street.visuals?.counts() ?? null;
    const bytes = (k: number) =>
      (street.textures[k]?.image.data as Float32Array | undefined)?.byteLength ?? 0;
    return {
      status: !p ? 'rejected' : lastRejection ? 'rendering-previous' : 'ok',
      builds: streetBuilds,
      registry: p?.counts ?? lastRejection?.counts ?? null,
      emitters: p?.lamps.length ?? 0,
      index: stats && {
        chunkCells: stats.chunkCells,
        cellMetres: stats.cellMetres,
        capacity: p!.index.capacity,
        cellEntries: stats.cellEntries,
        nonEmptyCells: stats.nonEmptyCells,
        maxRawOccupancy: stats.maxRawOccupancy,
        maxRetainedOccupancy: stats.maxRetainedOccupancy,
        histogram: stats.histogram,
        overflowCells: stats.overflowCells,
        pages: { allocated: stats.pages, resident: stats.pages, residency: 'static' },
        directory: stats.directory,
        payload: stats.payload,
        denseEquivalent: stats.denseEquivalent,
      },
      textures: {
        lamp: p && {
          width: p.lampPack.width,
          height: p.lampPack.height,
          rows: p.lampPack.rows,
          format: 'RGBA32F',
        },
        payload: stats && {
          width: stats.payload.width,
          height: stats.payload.height,
          format: 'RGBA32F',
        },
        directory: stats && {
          width: stats.directory.columns,
          height: stats.directory.rows,
          format: 'R32F',
        },
        maxTextureSize,
      },
      /** CPU typed arrays kept for context restoration; GPU texture bytes are the same arithmetic estimate. */
      bytes: {
        lamp: bytes(0),
        payload: bytes(1),
        directory: bytes(2),
        instanceBuffers: visualCounts?.instanceBytes ?? 0,
        fixtureGeometry: visualCounts?.geometryBytes ?? 0,
      },
      timings: { buildMs: p?.buildMs ?? null, uploadSubmitMs: street.uploadMs },
      visuals: visualCounts,
      lastRejection: lastRejection && {
        stage: lastRejection.stage,
        errors: lastRejection.errors.length,
        firstErrors: lastRejection.errors.slice(0, 10),
        conflictCount: lastRejection.conflictCount,
        conflicts: lastRejection.conflicts.slice(0, 10),
        stats: lastRejection.stats,
      },
    };
  };

  return {
    group,
    uniforms,
    /** Current sparse index (canonical order), or null when no set was accepted. */
    get index() {
      return street.prepared?.index ?? null;
    },
    /** Current shader lamps and fixtures, canonical order. */
    get lamps() {
      return street.prepared?.lamps ?? [];
    },
    get fixtures() {
      return street.prepared?.fixtures ?? [];
    },
    patch,
    /** Patch individual materials (e.g. worker-built city layers before their meshes exist). */
    patchMaterials(materials: Material[]) {
      for (const m of materials) bind(m);
    },
    replaceStreetLighting,
    set(next: LightingInput) {
      const nextUtc = localToUtc(next.date, next.minutes);
      const jump = Math.abs(nextUtc - utc) > 20 * 60000 || !!next.legacySun !== !!input.legacySun;
      input = { ...next };
      utc = nextUtc;
      if (jump) {
        from.elevation = shown.elevation;
        blendEnvironment(shown, shown, 1, from);
        fromSun.copy(shownSun);
        blend = 0;
      }
      computeTarget();
      const mode: StadiumMode = STADIUM_MODES[input.stadium];
      targets.masts = mode.masts;
      targets.roofs = mode.roofs;
    },
    /** Ends any temporal smoothing at once. */
    settle() {
      blend = 1;
      weights.masts = targets.masts;
      weights.roofs = targets.roofs;
      blendEnvironment(target, target, 1, shown);
      shownSun.copy(sunDir);
      applyWeights();
    },
    update(dt: number, camera: Camera, viewportHeight: number) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / BLEND_SECONDS);
        const t = blend * blend * (3 - 2 * blend);
        blendEnvironment(from, target, t, shown);
        shownSun.copy(fromSun).lerp(sunDir, t).normalize();
      } else {
        blendEnvironment(target, target, 1, shown);
        shownSun.copy(sunDir);
      }
      let moving = false;
      for (const k of ['masts', 'roofs'] as const) {
        const d = targets[k] - weights[k];
        if (Math.abs(d) > 1e-4) {
          weights[k] += Math.sign(d) * Math.min(Math.abs(d), dt / RAMP_SECONDS);
          moving = true;
        }
      }
      if (moving) applyWeights();
      const env: EnvironmentState = shown;
      sun.color.copy(env.sunColor);
      sun.intensity = env.sunIntensity;
      sun.position.copy(shownSun).multiplyScalar(300);
      hemi.color.copy(env.skyColor);
      hemi.groundColor.copy(env.groundColor);
      hemi.intensity = env.hemiIntensity;
      ambient.color.copy(env.ambientColor);
      ambient.intensity = env.ambientIntensity;
      fog.color.copy(env.fog);
      (scene.background as Color).copy(env.horizon);
      renderer.toneMappingExposure = env.exposure;
      uniforms.cityLampLevel.value = env.artificial;
      sky.update(camera, env, shownSun);
      street.visuals?.update(camera, env.artificial, viewportHeight, fog);
      stadium.update(camera, Math.max(weights.masts, weights.roofs));
    },
    describe() {
      const local = utcToLocal(utc);
      const index = street.prepared?.index.stats;
      return {
        date: input.date,
        minutes: input.minutes,
        local,
        utc: new Date(utc).toISOString(),
        legacySun: !!input.legacySun,
        elevation: input.legacySun ? 53.6 : solar.elevation,
        azimuth: input.legacySun ? null : solar.azimuth,
        phase: dayPhase(input.legacySun ? 53.6 : solar.elevation),
        artificial: shown.artificial,
        exposure: shown.exposure,
        stadium: input.stadium,
        floodlights: { ...weights },
        fixtures: street.prepared?.lamps.length ?? 0,
        grid: {
          overflow: index?.overflowCells ?? 0,
          maxPerCell: index?.maxRetainedOccupancy ?? 0,
          cells: index?.nonEmptyCells ?? 0,
          pages: index?.pages ?? 0,
        },
        streetLighting: streetDiagnostics(),
        patchedMaterials: patchCount.materials,
        reboundMaterials: patchCount.rebound,
        programs: renderer.info.programs?.length ?? null,
        realtimeLights: {
          directional: 1,
          hemisphere: 1,
          ambient: 1,
          point: 0,
          spot: 0,
          shadowMaps: 0,
        },
        stadiumEmitters: stadium.emitters.length,
      };
    },
    dispose() {
      street.visuals?.dispose();
      for (const t of street.textures) t.dispose();
      street = { prepared: null, textures: [], visuals: null, uploadMs: null };
      sky.dispose();
      group.clear();
      if (scene.fog === fog) scene.fog = null;
    },
  };
}
export type CityLighting = ReturnType<typeof createCityLighting>;
