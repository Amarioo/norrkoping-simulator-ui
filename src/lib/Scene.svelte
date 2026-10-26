<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Group } from 'three';
  import { T, useTask, useThrelte } from '@threlte/core';
  import { interactivity, type IntersectionEvent } from '@threlte/extras';
  import { createMappedCity } from './mapView';
  import { city } from './city.svelte';
  import { createTransportModels } from './transportModels';
  import { createTrafficSignals } from './trafficSignals';
  import FreeCamera from './FreeCamera.svelte';
  import { createPublicTransport } from './publicTransport';
  import { terrain } from './terrain';
  import {
    a1LightingRegistry,
    a1RuntimeLightingRegistry,
    a2LightingRegistry,
    a2RuntimeLightingRegistry,
    a3LightingRegistry,
    cityLightingRegistry,
    createCityLighting,
    pilotLightingRegistry,
    runtimeLightingRegistry,
  } from './lighting/controller';
  import {
    corridorRegistry,
    mergeRegistries,
    type A1Data,
    type CorridorIdentity,
  } from './lighting/corridorRegistry';
  import type { CompactSet } from './lighting/compactSet';
  import l2Url from './data/streetlights-l2.json?url';
  import l2bcUrl from './data/streetlights-l2bc.json?url';
  import l2dUrl from './data/streetlights-l2d.json?url';
  import { advanceClock, lightingState } from './lighting/state.svelte';
  import type { VehiclePose } from './lighting/vehicleLights';
  let {
    focus = 'overview',
    showLabels = true,
    follow = $bindable(''),
    travel = $bindable(0),
    mapReady = $bindable(false),
  }: {
    focus?: string;
    showLabels?: boolean;
    follow?: string;
    travel?: number;
    mapReady?: boolean;
  } = $props();
  interactivity();
  const { renderer, scene, camera } = useThrelte();
  const buildStarted = performance.now();
  const transit = createPublicTransport();
  const view = createMappedCity(),
    transport = createTransportModels(),
    signals = createTrafficSignals();
  // Step 6: time of day, street lighting and stadium floodlights (lighting/controller.ts). Every lit
  // material gets the fixed lighting patch before its first compile. Recreating the controller
  // (development hook below) rebinds the same materials to the new controller's uniforms. The
  // controller's group lives in a stable root: Threlte keeps every object ever passed to <T is>
  // until the component unmounts, so swapping `is` would retain each replaced group.
  // Lighting Phase L2a/L2bc: the citywide fixtures (streets ≈ 14 000; paths, squares, junctions and
  // motorways ≈ 7 700) are two separate compact files, fetched in parallel
  // and swapped in after the controller exists (the bundled pilot + A1–A3 set renders until then);
  // map-ready waits for it. `?lighting=a3` (development / hook builds) keeps the A1–A3 set only, for
  // the earlier phases' tests.
  // Lighting Phase L2d: site lighting (parking lots, rail yard, private site roads, ≈ 3 500 estimated
  // fixtures) is a third file, fetched with the other two; `?lighting=no-l2d` (development / hook
  // builds) leaves that category out (the set of main before L2d).
  const hookEnabled = import.meta.env.DEV || import.meta.env.VITE_LIGHTING_HOOK === '1';
  const lightingParam = hookEnabled ? new URLSearchParams(location.search).get('lighting') : null;
  const onlyA3 = lightingParam === 'a3';
  const withSites = lightingParam !== 'no-l2d';
  let l2Set: CompactSet | null = null,
    l2bcSet: CompactSet | null = null,
    l2dSet: CompactSet | null = null;
  const defaultRegistry = () =>
    l2Set
      ? cityLightingRegistry(terrain, l2Set, l2bcSet ?? undefined, l2dSet ?? undefined)
      : runtimeLightingRegistry(terrain);
  const fetchSet = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CompactSet>;
    });
  const createLighting = () => {
    const l = createCityLighting({
      terrain,
      stadium: view.stadium,
      renderer,
      scene,
      registry: defaultRegistry(),
    });
    for (const root of [view.group, transport.group, transit.group, signals.group]) l.patch(root);
    l.patchMaterials(view.layerMaterials);
    return l;
  };
  const lightingRoot = new Group();
  lightingRoot.name = 'city-lighting-root';
  let lighting = createLighting();
  lightingRoot.add(lighting.group);
  const lightingInput = () => ({
    date: lightingState.date,
    minutes: lightingState.minutes,
    stadium: lightingState.stadium,
    legacySun: lightingState.legacySun,
  });
  lighting.set(lightingInput());
  lighting.settle();
  $effect(() => lighting.set(lightingInput()));
  const l2Ready: Promise<void> = onlyA3
    ? Promise.resolve()
    : Promise.all([fetchSet(l2Url), fetchSet(l2bcUrl), withSites ? fetchSet(l2dUrl) : null])
        .then(([a, bc, d]) => {
          const result = lighting.replaceStreetLighting(
            cityLightingRegistry(terrain, a, bc, d ?? undefined),
          );
          if (!result.ok) throw new Error(`citywide set rejected at ${result.stage}`);
          l2Set = a;
          l2bcSet = bc;
          l2dSet = d;
        })
        .catch((error) => console.error('[lighting] citywide street lighting not loaded:', error));
  // Development, or a test build made with VITE_LIGHTING_HOOK=1 (Lighting Phase L1 measurements of
  // large sets on a production bundle). Unset in normal builds, so the hook is removed there.
  if (hookEnabled)
    (globalThis as unknown as { __cityLighting: unknown }).__cityLighting = {
      state: lightingState,
      settle: () => lighting.settle(),
      describe: () => lighting.describe(),
      get uniforms() {
        return lighting.uniforms;
      },
      get group() {
        return lighting.group;
      },
      renderer,
      // Lighting Phase 0 lifecycle checks (tests/lighting.spec.ts): full controller recreation on the
      // live scene, and a complete street-lighting rebuild/swap from the same registry.
      recreate() {
        lightingRoot.remove(lighting.group);
        lighting.dispose();
        lighting = createLighting();
        lightingRoot.add(lighting.group);
        lighting.set(lightingInput());
        lighting.settle();
        return lighting.describe();
      },
      reloadStreetLighting: () => lighting.replaceStreetLighting(defaultRegistry()).ok,
      // Lighting Phase A1/A2/A3 checks: swap complete sets (pilot only, pilot + A1, pilot + A1 + A2,
      // pilot + A1 + A2 + A3), submit arbitrary (e.g. deliberately invalid) registries, and list the
      // rendered fixtures.
      registries: {
        pilot: () => pilotLightingRegistry(terrain),
        a1: () => a1LightingRegistry(terrain),
        a2: () => a2LightingRegistry(terrain),
        a3: () => a3LightingRegistry(terrain),
        a1Runtime: () => a1RuntimeLightingRegistry(terrain),
        a2Runtime: () => a2RuntimeLightingRegistry(terrain),
        runtime: () => runtimeLightingRegistry(terrain),
        // Phase L2a: the default set (pilot + A1–A3 + L2a once loaded).
        city: () => defaultRegistry(),
        // Phase L2d: the city set without the site-lighting category (streets, paths, squares).
        cityStreets: () =>
          l2Set
            ? cityLightingRegistry(terrain, l2Set, l2bcSet ?? undefined)
            : runtimeLightingRegistry(terrain),
        // Phase L1: any set in the A1–A3 runtime format (e.g. the stress set) on top of the runtime set.
        runtimePlus: (data: A1Data, identity: CorridorIdentity) =>
          mergeRegistries(
            runtimeLightingRegistry(terrain),
            corridorRegistry(data, terrain.data.reference, identity),
          ),
      },
      replaceStreetLighting: (registry: Parameters<typeof lighting.replaceStreetLighting>[0]) => {
        const r = lighting.replaceStreetLighting(registry);
        return r.ok ? { ok: true } : { ok: false, stage: r.stage, conflictCount: r.conflictCount };
      },
      inspect: () => lighting.inspect(),
      // Vehicle Lights Phase F1: beams on/off (before/after comparisons) and this frame's poses.
      setVehicleBeams: (on: boolean) => lighting.setVehicleBeams(on),
      setVehicleRange: (metresLimit: number) => lighting.setVehicleRange(metresLimit),
      vehiclePoses: () => vehiclePoses.map((p) => ({ ...p })),
    };
  const vehiclePoses: VehiclePose[] = [];
  const buildMs = performance.now() - buildStarted;
  // Ground, roads and buildings are built in workers and arrive after the first frames.
  let mapReadyMs: number | null = null;
  // Step 6: start every program's compilation at once (KHR_parallel_shader_compile through
  // renderer.compileAsync) instead of one blocking compile per program on its first frame: once the
  // scene graph (with its lights) is mounted, and again for the worker-built layers before they are
  // first drawn. Without the extension this degrades to the usual synchronous compile.
  const precompile = () => {
    if (camera.current) renderer.compileAsync(scene, camera.current).catch(() => {});
  };
  $effect(precompile);
  Promise.all([view.ready, l2Ready]).then(
    () => {
      precompile();
      mapReadyMs = performance.now() - buildStarted;
      mapReady = true;
    },
    (error) => console.error('[city] map geometry failed', error),
  );
  // Development only: `?inspect=infra` marks terrain/infrastructure defects (inspectInfra.ts).
  let inspector: { group: import('three').Group; dispose(): void } | null = $state(null);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('inspect') === 'infra')
    view.ready.then(() =>
      import('./inspectInfra').then((m) => {
        inspector = m.createInfraInspector();
      }),
    );
  // Development only: `?inspect=lighting` shows runtime fixtures, research-only candidates, the A1
  // zones and light-grid occupancy (inspectLighting.ts, Lighting Phase A1).
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('inspect') === 'lighting')
    view.ready.then(() =>
      import('./inspectLighting').then(async (m) => {
        inspector = await m.createLightingInspector(lighting);
      }),
    );
  onDestroy(() => {
    inspector?.dispose();
    lighting.dispose();
    view.dispose();
    transport.dispose();
    transit.dispose();
    signals.dispose();
  });
  $effect(() => {
    view.labels.visible = showLabels;
    for (const child of view.labels.children)
      child.visible = focus !== 'overview' || child.userData.primary;
  });
  useTask((dt) => {
    advanceClock(dt);
    if (camera.current) lighting.update(dt, camera.current, renderer.domElement.height);
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __cityPerformance: unknown }).__cityPerformance = {
        buildMs,
        mapReadyMs,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        frameMs: dt * 1000,
      };
    }
    transport.update(
      city.snapshot.vehicles,
      city.snapshot.aircraft,
      dt,
      city.snapshot.simulationTime,
    );
    signals.update(city.snapshot.simulationTime);
    transit.update(city.snapshot.vehicles, dt);
    // Vehicle Lights Phase F1: lens glow and the nearest vehicles' beams, from this frame's smoothed
    // poses (after the models moved, so beams and lenses stay together while paused or following).
    const level = lighting.artificial;
    transport.setNightLevel(level);
    transit.setNightLevel(level);
    // Police Signs Phase D1: the police emblem glows at the same night level.
    view.setNightLevel(level);
    vehiclePoses.length = 0;
    for (const p of transport.poses()) vehiclePoses.push(p);
    for (const p of transit.poses()) vehiclePoses.push(p);
    if (camera.current) lighting.updateVehicles(vehiclePoses, camera.current);
  });
  function pick(e: IntersectionEvent<MouseEvent>) {
    const ids = e.object.userData.ids;
    if (ids && e.instanceId !== undefined) {
      city.selectedId = ids[e.instanceId];
      e.stopPropagation();
    }
  }
</script>

<FreeCamera {focus} bind:follow bind:travel />
<!-- Sun, sky, hemisphere/ambient light, fog and fixtures: lighting/controller.ts (Step 6). -->
<T is={lightingRoot} />
<!-- Ground and river cutouts are rendered together by mapView. -->
<T is={view.group} />{#if inspector}<T is={inspector.group} />{/if}<T is={transport.group} onclick={pick} /><T is={signals.group} /><T
  is={transit.group}
  onclick={pick}
/>
