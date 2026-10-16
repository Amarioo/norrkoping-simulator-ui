<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import { Group, Vector3 } from 'three';
  import { untrack } from 'svelte';
  import type { Drone } from './types';
  import { world } from './world.svelte';
  import { heading, shortestAngle, smoothingAlpha } from './motion';
  let { drone }: { drone: Drone } = $props();
  const group = new Group();
  group.position.fromArray(untrack(() => drone.pos));
  const target = new Vector3();
  let propellers = $state.raw<Group>();
  const color = $derived(
    drone.state === 'EMERGENCY' || drone.state === 'HOLDING'
      ? '#fb9b75'
      : drone.state === 'RETURNING'
        ? '#a7b9ff'
        : drone.state === 'IDLE'
          ? '#8296a9'
          : '#a7f3c5',
  );
  const selected = $derived(world.selectedId === drone.id);
  useTask((delta) => {
    target.fromArray(drone.pos);
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const alpha = smoothingAlpha(delta);
    group.position.lerp(target, alpha);
    if (dx * dx + dz * dz > 0.0005)
      group.rotation.y += shortestAngle(group.rotation.y, heading(dx, dz)) * alpha;
    if (propellers && drone.state !== 'IDLE' && !world.snapshot.paused)
      propellers.rotation.y += delta * 36;
  });
</script>

<T
  is={group}
  onclick={(event: IntersectionEvent<MouseEvent>) => {
    event.stopPropagation();
    world.selectedId = drone.id;
  }}
>
  <T.Mesh castShadow
    ><T.BoxGeometry args={[1.25, 0.65, 1.9]} /><T.MeshStandardMaterial
      {color}
      metalness={0.35}
      roughness={0.4}
    /></T.Mesh
  >
  {#each [-0.7, 0.7] as angle}<T.Mesh rotation.y={angle}
      ><T.BoxGeometry args={[4, 0.18, 0.24]} /><T.MeshStandardMaterial color="#d8e6ee" /></T.Mesh
    >{/each}
  {#each [[-1.45, -1.2], [1.45, -1.2], [-1.45, 1.2], [1.45, 1.2]] as offset}
    <T.Mesh position={[offset[0], 0.2, offset[1]]} rotation.x={-Math.PI / 2}
      ><T.RingGeometry args={[0.55, 0.68, 12]} /><T.MeshBasicMaterial {color} side={2} /></T.Mesh
    >
  {/each}
  <T.Group bind:ref={propellers} position.y={0.3}
    ><T.Mesh
      ><T.BoxGeometry args={[2.4, 0.04, 0.12]} /><T.MeshBasicMaterial
        color="#edf8ff"
        transparent
        opacity={0.5}
      /></T.Mesh
    ></T.Group
  >
  <T.Mesh position={[0, 0, 1.05]}
    ><T.SphereGeometry args={[0.2, 8, 6]} /><T.MeshBasicMaterial color="#fff5bd" /></T.Mesh
  >
  {#if selected}<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.5}
      ><T.RingGeometry args={[3, 3.18, 40]} /><T.MeshBasicMaterial
        color="#d7ff7b"
        side={2}
      /></T.Mesh
    >{/if}
</T>
<T.Mesh position={[drone.pos[0], 0.17, drone.pos[2]]} rotation.x={-Math.PI / 2}
  ><T.CircleGeometry args={[1, 16]} /><T.MeshBasicMaterial
    {color}
    transparent
    opacity={0.22}
    depthWrite={false}
  /></T.Mesh
>
