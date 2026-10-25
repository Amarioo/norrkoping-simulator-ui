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
 * Vehicle lights (Vehicle Lights Phase F1, vehicleLights.ts): updateVehicles() is called every frame
 * after the vehicle models moved; it picks the VEHICLE_MAX vehicles nearest the camera and writes
 * their low beams into fixed uniforms (none by day). No lights, textures or programs are created.
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
  Frustum,
  Group,
  HemisphereLight,
  Matrix3,
  Matrix4,
  Mesh,
  Sphere,
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
import a1Data from '../data/streetlights-a1.json';
import a2Data from '../data/streetlights-a2.json';
import a3Data from '../data/streetlights-a3.json';
import { decodeCompactSet, type CompactSet } from './compactSet';
import { L2_DATASET, L2_GENERATOR, L2BC_DATASET, L2BC_GENERATOR } from './corridorL2';
import {
  A2_IDENTITY,
  A3_IDENTITY,
  corridorRegistry,
  mergeRegistries,
  type A1Data,
} from './corridorRegistry';
import { pilotRegistry, type LightingRegistry, type PilotData } from './registry';
import {
  describeRejection,
  prepareStreetLighting,
  type PreparedStreetLighting,
  type RejectedStreetLighting,
} from './streetLighting';
import { createSky } from './sky';
import {
  beamEmitter,
  BEAM_RANGE_M,
  selectNearestVehicles,
  VEHICLE_MAX,
  VEHICLE_MAX_DISTANCE_M,
  writeVehicleUniforms,
  type SelectedVehicle,
  type VehiclePose,
} from './vehicleLights';
import { dayPhase, localToUtc, solarPosition, sunDirection, utcToLocal } from './solar';

export const BLEND_SECONDS = 1.2;
export const RAMP_SECONDS = 1.5;
/** The pre-Step-6 fixed sun (Scene.svelte: position (−150, 260, 120)), for like-for-like daylight comparisons. */
export const LEGACY_SUN = new Vector3(-150, 260, 120).normalize();

/** The bundled Step 6 pilot (105 fixtures) as a registry. */
export function pilotLightingRegistry(terrain: TerrainService) {
  return pilotRegistry(lightingData as unknown as PilotData, terrain.data.reference);
}
/** The bundled Lighting Phase A1 corridor (generated, src/lib/data/streetlights-a1.json). */
export function a1LightingRegistry(terrain: TerrainService) {
  return corridorRegistry(a1Data as unknown as A1Data, terrain.data.reference);
}
/** The bundled Lighting Phase A2 corridor (generated, src/lib/data/streetlights-a2.json). */
export function a2LightingRegistry(terrain: TerrainService) {
  return corridorRegistry(a2Data as unknown as A1Data, terrain.data.reference, A2_IDENTITY);
}
/** The bundled Lighting Phase A3 corridor (generated, src/lib/data/streetlights-a3.json). */
export function a3LightingRegistry(terrain: TerrainService) {
  return corridorRegistry(a3Data as unknown as A1Data, terrain.data.reference, A3_IDENTITY);
}
/**
 * Lighting Phase L2a street fixtures of the whole map, from the compact runtime file
 * (src/lib/data/streetlights-l2.json, loaded separately: see Scene.svelte).
 */
export function l2LightingRegistry(terrain: TerrainService, data: CompactSet) {
  return corridorRegistry(decodeCompactSet(data) as unknown as A1Data, terrain.data.reference, {
    dataset: L2_DATASET,
    generator: L2_GENERATOR,
  });
}
/** Lighting Phase L2bc paths, squares, junction ranges and motorways (streetlights-l2bc.json). */
export function l2bcLightingRegistry(terrain: TerrainService, data: CompactSet) {
  return corridorRegistry(decodeCompactSet(data) as unknown as A1Data, terrain.data.reference, {
    dataset: L2BC_DATASET,
    generator: L2BC_GENERATOR,
  });
}
/** The citywide rendered set: pilot + A1 + A2 + A3 + L2a (+ L2bc when given). */
export function cityLightingRegistry(terrain: TerrainService, l2: CompactSet, l2bc?: CompactSet) {
  return mergeRegistries(
    runtimeLightingRegistry(terrain),
    l2LightingRegistry(terrain, l2),
    ...(l2bc ? [l2bcLightingRegistry(terrain, l2bc)] : []),
  );
}
/** The accepted Phase A1 rendered set (pilot + A1, 232 fixtures): the A1 tests and A2 comparisons. */
export function a1RuntimeLightingRegistry(terrain: TerrainService) {
  return mergeRegistries(pilotLightingRegistry(terrain), a1LightingRegistry(terrain));
}
/** The accepted Phase A2 rendered set (pilot + A1 + A2, 267 fixtures): the A2 tests and A3 comparisons. */
export function a2RuntimeLightingRegistry(terrain: TerrainService) {
  return mergeRegistries(
    pilotLightingRegistry(terrain),
    a1LightingRegistry(terrain),
    a2LightingRegistry(terrain),
  );
}
/**
 * The rendered street lighting: the Step 6 pilot plus the Phase A1, A2 and A3 corridors, validated
 * and indexed as one set (a capacity conflict or ID collision rejects the whole set; nothing is
 * dropped).
 */
export function runtimeLightingRegistry(terrain: TerrainService) {
  return mergeRegistries(
    pilotLightingRegistry(terrain),
    a1LightingRegistry(terrain),
    a2LightingRegistry(terrain),
    a3LightingRegistry(terrain),
  );
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
  /** Street-lighting registry (default: the bundled runtime set, pilot + Phase A1 + A2 + A3). */
  registry?: LightingRegistry;
  /** Throw on a rejected initial street-lighting set (default: development and tests). */
  strict?: boolean;
  /** Page side in cells (lightIndex.ts default). */
  chunkCells?: number;
  /** Keep registry records for inspect() (default: development and tests). */
  keepRecords?: boolean;
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
    const gridTexture = floatTexture(index.payload, payload.width, payload.height, 2);
    const pageTexture = floatTexture(
      index.directory,
      Math.max(1, directory.columns),
      Math.max(1, directory.rows),
      1,
    );
    const listTexture = floatTexture(index.list, index.stats.list.width, index.stats.list.height, 1);
    const visuals = createFixtureVisuals(prepared.fixtures, prepared.lamps, metres);
    visuals.group.traverse((o) => {
      const material = (o as Mesh).material as Material | Material[] | undefined;
      if (material) for (const m of [material].flat()) bind(m);
    });
    // Eager upload keeps the first night frame free of texture uploads (CPU submission time only).
    let uploadMs: number | null = null;
    if (typeof renderer.initTexture === 'function') {
      const t = now();
      for (const texture of [lampTexture, gridTexture, pageTexture, listTexture])
        renderer.initTexture(texture);
      uploadMs = now() - t;
    }
    // Swap uniforms and visuals in one step, then release the previous set.
    uniforms.cityLampTex.value = lampTexture;
    uniforms.cityGridTex.value = gridTexture;
    uniforms.cityPageTex.value = pageTexture;
    uniforms.cityListTex.value = listTexture;
    uniforms.cityListWidth.value = index.listWidth;
    uniforms.cityGrid.value.set(index.originX, index.originZ, 1 / index.cell, directory.columns);
    uniforms.cityGridRows.value = directory.rows;
    uniforms.cityChunkCells.value = index.chunkCells;
    uniforms.cityPagesPerRow.value = payload.pagesPerRow;
    uniforms.cityLampRows.value = lampPack.rows;
    const previous = street;
    street = {
      prepared,
      textures: [lampTexture, gridTexture, pageTexture, listTexture],
      visuals,
      uploadMs,
    };
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
      keepRecords: options.keepRecords ?? import.meta.env.DEV,
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
  const initial = replaceStreetLighting(options.registry ?? runtimeLightingRegistry(terrain));
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

  // Vehicle beams: the current selection (diagnostics) and a switch for tests / comparisons.
  let vehicleSelection: SelectedVehicle[] = [];
  let vehicleBeams = true;
  let vehicleRangeM = VEHICLE_MAX_DISTANCE_M;
  const cameraPosition = new Vector3();
  const viewFrustum = new Frustum(),
    viewProjection = new Matrix4(),
    beamSphere = new Sphere(new Vector3(), BEAM_RANGE_M / metres);
  /** True when the beam's reach (a sphere of BEAM_RANGE_M around the emitter) touches the view. */
  const beamInView = (pose: VehiclePose) => {
    const e = beamEmitter(pose, metres);
    beamSphere.center.set(e.x, e.y, e.z);
    return viewFrustum.intersectsSphere(beamSphere);
  };

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
      rollouts: p?.rollouts ?? null,
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
        list: stats.list,
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
          format: 'RG32F',
        },
        list: stats && { width: stats.list.width, height: stats.list.height, format: 'R32F' },
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
        list: bytes(3),
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
    /**
     * Development inspection (Phase A1): every rendered fixture with identity, rollout, visual group,
     * evidence class, type, support and EPSG:3006 position. Runtime lights only; research-only
     * inventory points are in docs/lighting-phase-a1/inspector.html.
     */
    inspect() {
      return (street.prepared?.records ?? []).map((r) => ({
        id: r.id,
        rollout: r.generator.version,
        group: r.group,
        placement: r.placement,
        type: r.photometry.fixtureType,
        support: r.support.kind,
        e: r.position.e,
        n: r.position.n,
        x: r.position.scene.x,
        z: r.position.scene.z,
      }));
    },
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
    /**
     * Per frame, after the vehicle models moved: beams of the nearest vehicles (smoothed render
     * poses, so beams and lenses stay together), scaled by the night level. Allocation-light: the
     * selection array is rebuilt, the uniforms are reused.
     */
    updateVehicles(poses: readonly VehiclePose[], camera: Camera) {
      const level = shown.artificial;
      if (!vehicleBeams || level <= 0.0005 || poses.length === 0) {
        vehicleSelection = [];
        uniforms.vehicleCount.value = 0;
        return 0;
      }
      camera.updateMatrixWorld();
      camera.getWorldPosition(cameraPosition);
      viewFrustum.setFromProjectionMatrix(
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      vehicleSelection = selectNearestVehicles(
        poses,
        cameraPosition,
        metres,
        VEHICLE_MAX,
        vehicleRangeM,
        beamInView,
      );
      return writeVehicleUniforms(uniforms, vehicleSelection, level, metres);
    },
    /** Switches the vehicle beams on or off (tests and before/after comparisons; default on). */
    setVehicleBeams(on: boolean) {
      vehicleBeams = on;
      if (!on) {
        vehicleSelection = [];
        uniforms.vehicleCount.value = 0;
      }
    },
    /**
     * Selection distance limit in metres (default VEHICLE_MAX_DISTANCE_M). Measurement only: Infinity
     * keeps all VEHICLE_MAX beams active wherever the camera is (worst-case shader cost).
     */
    setVehicleRange(metresLimit: number) {
      vehicleRangeM = metresLimit;
    },
    /** Night level (env.artificial) currently shown: drives the vehicle lens glow. */
    get artificial() {
      return shown.artificial;
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
        vehicleLights: {
          enabled: vehicleBeams,
          max: VEHICLE_MAX,
          active: uniforms.vehicleCount.value,
          selected: vehicleSelection.map((s) => ({
            id: s.pose.id,
            kind: s.pose.kind,
            distanceM: Math.round(s.distanceM * 10) / 10,
            weight: Math.round(s.weight * 1000) / 1000,
          })),
        },
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
