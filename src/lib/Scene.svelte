<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T } from '@threlte/core';
  import { OrbitControls, interactivity, type IntersectionEvent } from '@threlte/extras';
  import { DirectionalLight } from 'three';
  import { world } from './world.svelte';
  import DroneMesh from './DroneMesh.svelte';
  import RouteLine from './RouteLine.svelte';
  import { BEACON_RADIUS, buildingRoofTop, generateCity } from './city';
  import { createCityView, PROP_SIZE } from './cityView';
  interactivity();
  const city = generateCity();
  const view = createCityView(city);
  onDestroy(() => view.dispose());
  // Moonlit key light; soft shadows sell the massing of the skyline.
  const sun = new DirectionalLight('#dceaf8', 2.6);
  sun.position.set(58, 96, 42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -110;
  shadowCamera.right = 110;
  shadowCamera.top = 110;
  shadowCamera.bottom = -110;
  shadowCamera.near = 10;
  shadowCamera.far = 300;
  shadowCamera.updateProjectionMatrix();
</script>

<T.Color attach="background" args={['#14232e']} />
<T.Fog attach="fog" args={['#14232e', 180, 370]} />
<T.PerspectiveCamera makeDefault position={[106, 118, 118]} fov={44} near={0.1} far={600}>
  <OrbitControls
    enableDamping
    minDistance={35}
    maxDistance={270}
    maxPolarAngle={Math.PI / 2.25}
    target={[0, 0, 0]}
  />
</T.PerspectiveCamera>
<T.AmbientLight color="#3d5470" intensity={0.6} /><T.HemisphereLight
  args={['#93b8e6', '#16281f', 0.85]}
/><T is={sun} /><T.DirectionalLight position={[-70, 40, -55]} color="#52719e" intensity={0.5} />
<!-- Ground: click to place no-fly zones. -->
<T.Mesh
  rotation.x={-Math.PI / 2}
  receiveShadow
  onclick={(e: IntersectionEvent<MouseEvent>) => {
    if (world.placingZone) {
      e.stopPropagation();
      void world.placeZone([e.point.x, 15, e.point.z]);
    }
  }}
>
  <T.PlaneGeometry args={[160, 160]} /><T.MeshStandardMaterial color="#263c42" roughness={1} />
</T.Mesh>
<T.GridHelper args={[160, 40, '#52716e', '#344c51']} position.y={0.02} />
<!-- Street strips along the block grid; the procedural city fills the blocks. -->
{#each [-68, -51, -34, -17, 0, 17, 34, 51, 68] as lane}
  <T.Mesh position={[lane, 0.03, 0]} rotation.x={-Math.PI / 2}
    ><T.PlaneGeometry args={[3.5, 160]} /><T.MeshStandardMaterial color="#182c35" /></T.Mesh
  >
  <T.Mesh position={[0, 0.035, lane]} rotation.x={-Math.PI / 2}
    ><T.PlaneGeometry args={[160, 3.5]} /><T.MeshStandardMaterial color="#182c35" /></T.Mesh
  >
{/each}
<!-- Buildings stay below the 18–26 metre flight lanes (see city.ts). -->
<T is={view.group} />
{#each city.buildings as b (b.id)}
  {@const top = b.tiers[b.tiers.length - 1]}
  {@const roofTop = buildingRoofTop(b)}
  {@const angle = b.quarter * (Math.PI / 2)}
  {#each b.tiers as tier, i}
    <T.Mesh
      position={[b.x, tier.y + tier.h / 2, b.z]}
      rotation.y={angle}
      castShadow
      receiveShadow
      material={view.walls[b.id]}
    >
      {#if b.kind === 'cylinder'}<T.CylinderGeometry args={[tier.w / 2, tier.w / 2, tier.h, 24]} />
      {:else}<T.BoxGeometry args={[tier.w, tier.h, tier.d]} />
      {/if}
    </T.Mesh>
    {#if i > 0 && b.roof === 'parapet'}
      <T.Mesh position={[b.x, tier.y + 0.08, b.z]} rotation.y={angle} material={view.slab} castShadow>
        <T.BoxGeometry args={[tier.w + 0.34, 0.16, tier.d + 0.34]} />
      </T.Mesh>
    {/if}
  {/each}
  {#if b.roof === 'parapet'}
    <T.Mesh position={[b.x, top.y + top.h + 0.11, b.z]} rotation.y={angle} material={view.slab} castShadow>
      <T.BoxGeometry args={[top.w + 0.34, 0.22, top.d + 0.34]} />
    </T.Mesh>
  {:else if b.roof === 'cap'}
    <T.Mesh position={[b.x, top.y + top.h + 0.1, b.z]} material={view.slab} castShadow>
      <T.CylinderGeometry args={[top.w / 2 + 0.18, top.w / 2 + 0.24, 0.2, 24]} />
    </T.Mesh>
  {:else}
    <T.Mesh
      position={[b.x, top.y + top.h + b.roofH / 2, b.z]}
      rotation.y={angle + Math.PI / 4}
      scale={[top.w + 0.5, b.roofH, top.d + 0.5]}
      material={view.houseRoof(b)}
      castShadow
      receiveShadow
    >
      <T.ConeGeometry args={[Math.SQRT1_2, 1, 4]} />
    </T.Mesh>
  {/if}
  {#each b.props as p}
    {@const size = PROP_SIZE[p.kind]}
    <T.Mesh
      position={[b.x + p.x, roofTop + size.h / 2, b.z + p.z]}
      rotation.y={angle}
      material={view.props[p.kind]}
      castShadow
      receiveShadow
    >
      {#if p.kind === 'tank'}<T.CylinderGeometry args={[0.5, 0.5, size.h, 14]} />
      {:else}<T.BoxGeometry args={[size.w, size.h, size.d]} />
      {/if}
    </T.Mesh>
  {/each}
  {#if b.antenna > 0}
    <T.Mesh position={[b.x, roofTop + b.antenna / 2, b.z]} material={view.mast}>
      <T.CylinderGeometry args={[0.05, 0.05, b.antenna, 6]} />
    </T.Mesh>
    <T.Mesh position={[b.x, roofTop + b.antenna + BEACON_RADIUS, b.z]} material={view.beacon}>
      <T.SphereGeometry args={[BEACON_RADIUS, 10, 8]} />
    </T.Mesh>
  {/if}
{/each}
{#each world.snapshot.hubs as hub}
  <T.Group position={hub.pos}>
    <T.Mesh position.y={0.45}
      ><T.CylinderGeometry args={[7, 7, 0.9, 40]} /><T.MeshStandardMaterial
        color="#567c70"
      /></T.Mesh
    >
    <T.Mesh rotation.x={-Math.PI / 2} position.y={0.92}
      ><T.RingGeometry args={[5.6, 5.9, 40]} /><T.MeshBasicMaterial
        color="#bbf4b4"
        side={2}
      /></T.Mesh
    >
    <T.Mesh position.y={0.95}
      ><T.BoxGeometry args={[4, 0.06, 0.7]} /><T.MeshBasicMaterial color="#d1ebc7" /></T.Mesh
    >
    {#each [-1.7, 1.7] as x}<T.Mesh position={[x, 0.95, 0]}
        ><T.BoxGeometry args={[0.7, 0.06, 4]} /><T.MeshBasicMaterial color="#d1ebc7" /></T.Mesh
      >{/each}
  </T.Group>
{/each}
{#each world.snapshot.drones as drone (drone.id)}
  <DroneMesh {drone} />
  {#if world.showRoutes && drone.state !== 'IDLE' && (world.selectedId === null || world.selectedId === drone.id)}<RouteLine
      points={[drone.pos, ...drone.route]}
      color={world.selectedId === drone.id ? '#d7ff7b' : '#83b7a2'}
    />{/if}
{/each}
{#each world.snapshot.noFlyZones as zone (zone.id)}
  <T.Mesh position={zone.center}
    ><T.SphereGeometry args={[zone.radius, 24, 16]} /><T.MeshStandardMaterial
      color="#ff795e"
      transparent
      opacity={0.17}
      depthWrite={false}
    /></T.Mesh
  >
  <T.Mesh position={zone.center}
    ><T.SphereGeometry args={[zone.radius, 16, 10]} /><T.MeshBasicMaterial
      color="#f5a080"
      wireframe
      transparent
      opacity={0.22}
      depthWrite={false}
    /></T.Mesh
  >
  <T.Mesh position={[zone.center[0], 0.17, zone.center[2]]} rotation.x={-Math.PI / 2}
    ><T.RingGeometry args={[zone.radius - 0.15, zone.radius + 0.15, 48]} /><T.MeshBasicMaterial
      color="#ff967f"
      side={2}
    /></T.Mesh
  >
{/each}