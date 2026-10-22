/**
 * Step 6 lighting controller: simulated Europe/Stockholm clock → sun → sky, fog, exposure, the three
 * real-time lights, street lighting and the independent stadium floodlights.
 *
 * Real-time light budget (fixed for the session, so no program recompiles): one DirectionalLight
 * (sun/sky), one HemisphereLight, one AmbientLight; no shadow maps (the renderer's shadows stay off).
 * Fixtures are shader lights (cityLights.ts). Changing the time or the floodlight mode only updates
 * uniforms, light colours/intensities and the exposure.
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
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { TerrainService } from '../terrain';
import type { createIdrottsparken, StadiumMode } from '../stadium/idrottsparken';
import { STADIUM_MODES } from '../stadium/idrottsparken';
import {
  buildLightGrid,
  createLightingUniforms,
  packGrid,
  packLamps,
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
import { createFixtureVisuals, FIXTURES, fixtureLamps } from './fixtures';
import { createSky } from './sky';
import { dayPhase, localToUtc, solarPosition, sunDirection, utcToLocal } from './solar';

export const BLEND_SECONDS = 1.2;
export const RAMP_SECONDS = 1.5;
/** The pre-Step-6 fixed sun (Scene.svelte: position (−150, 260, 120)), for like-for-like daylight comparisons. */
export const LEGACY_SUN = new Vector3(-150, 260, 120).normalize();

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
}) {
  const { terrain, stadium, renderer, scene } = options;
  const metres = terrain.data.reference.metresPerUnit;
  const [lat, lon] = terrain.unproject(0, 0);
  const uniforms = createLightingUniforms();
  uniforms.cityMetres.value = metres;

  // Street lighting data → textures (once).
  const lamps = fixtureLamps(FIXTURES, terrain);
  const grid = buildLightGrid(lamps, metres, 1);
  const lampTexture = packLamps(lamps),
    gridTexture = packGrid(grid);
  uniforms.cityLampTex.value = lampTexture;
  uniforms.cityGridTex.value = gridTexture;
  uniforms.cityGrid.value.set(grid.originX, grid.originZ, 1 / grid.cell, grid.columns);
  uniforms.cityGridRows.value = grid.rows;
  const visuals = createFixtureVisuals(FIXTURES, lamps, metres);

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
  const group = new Group();
  group.name = 'city-lighting';
  const sun = new DirectionalLight('#fff3de', 2.1);
  sun.castShadow = false;
  const hemi = new HemisphereLight('#d9efff', '#8b9575', 1.1);
  const ambient = new AmbientLight('#f3f1e7', 0.75);
  const sky = createSky();
  group.add(sun, sun.target, hemi, ambient, sky.mesh, visuals.group);
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

  const patchCount = { materials: 0 };
  const patch = (root: Object3D) => {
    root.traverse((o) => {
      const material = (o as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material])
        if (patchMaterial(m, uniforms)) patchCount.materials++;
    });
  };
  patch(stadium.group);
  patch(stadium.turf);
  patch(visuals.group);

  return {
    group,
    uniforms,
    grid,
    lamps,
    patch,
    /** Patch individual materials (e.g. worker-built city layers before their meshes exist). */
    patchMaterials(materials: Material[]) {
      for (const m of materials) if (patchMaterial(m, uniforms)) patchCount.materials++;
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
      visuals.update(camera, env.artificial, viewportHeight, fog);
      stadium.update(camera, Math.max(weights.masts, weights.roofs));
    },
    describe() {
      const local = utcToLocal(utc);
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
        fixtures: lamps.length,
        grid: {
          columns: grid.columns,
          rows: grid.rows,
          overflow: grid.overflow,
          maxPerCell: Math.max(0, ...grid.cells.map((c) => c.length)),
        },
        patchedMaterials: patchCount.materials,
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
      visuals.dispose();
      sky.dispose();
      lampTexture.dispose();
      gridTexture.dispose();
      group.clear();
      if (scene.fog === fog) scene.fog = null;
    },
  };
}
export type CityLighting = ReturnType<typeof createCityLighting>;
