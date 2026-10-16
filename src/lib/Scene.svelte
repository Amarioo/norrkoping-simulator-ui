<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T, useTask } from '@threlte/core';
  import { interactivity, type IntersectionEvent } from '@threlte/extras';
  import { DirectionalLight } from 'three';
  import { createMappedCity } from './mapView';
  import { cityMap } from './mapModel';
  import { city } from './city.svelte';
  import { createTransportModels } from './transportModels';
  import { createTrafficSignals } from './trafficSignals';
  import FreeCamera from './FreeCamera.svelte';
  let {
    focus = 'overview',
    showLabels = true,
    follow = $bindable(''),
    travel = $bindable(0),
  }: { focus?: string; showLabels?: boolean; follow?: string; travel?: number } = $props();
  interactivity();
  const view = createMappedCity(),
    transport = createTransportModels(),
    signals = createTrafficSignals();
  onDestroy(() => {
    view.dispose();
    transport.dispose();
    signals.dispose();
  });
  $effect(() => {
    view.labels.visible = showLabels;
    for (const child of view.labels.children)
      child.visible = focus !== 'overview' || child.userData.primary;
  });
  useTask((dt) => {
    transport.update(
      city.snapshot.vehicles,
      city.snapshot.aircraft,
      dt,
      city.snapshot.simulationTime,
    );
    signals.update(city.snapshot.simulationTime);
  });
  const sun = new DirectionalLight('#fff3de', 2.1);
  sun.position.set(-150, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.012;
  Object.assign(sun.shadow.camera, {
    left: -130,
    right: 130,
    top: 130,
    bottom: -130,
    near: 1,
    far: 700,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const bounds = cityMap.meta.bounds;
  function pick(e: IntersectionEvent<MouseEvent>) {
    const ids = e.object.userData.ids;
    if (ids && e.instanceId !== undefined) {
      city.selectedId = ids[e.instanceId];
      e.stopPropagation();
    }
  }
</script>

<T.Color attach="background" args={['#bacbd3']} /><T.Fog
  attach="fog"
  args={['#bacbd3', 700, 1700]}
/>
<FreeCamera {focus} bind:follow bind:travel />
<T.AmbientLight color="#f3f1e7" intensity={0.75} /><T.HemisphereLight
  args={['#d9efff', '#8b9575', 1.1]}
/><T is={sun} />
<T.Mesh
  rotation.x={-Math.PI / 2}
  position={[(bounds[0] + bounds[2]) / 2, -0.02, (bounds[1] + bounds[3]) / 2]}
  receiveShadow
  ><T.PlaneGeometry args={[bounds[2] - bounds[0], bounds[3] - bounds[1]]} /><T.MeshStandardMaterial
    color="#a7ac80"
    roughness={1}
  /></T.Mesh
>
<T is={view.group} /><T is={transport.group} onclick={pick} /><T is={signals.group} />
