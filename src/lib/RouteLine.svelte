<script lang="ts">
  import { T } from '@threlte/core';
  import { BufferGeometry, Float32BufferAttribute } from 'three';
  import type { Vec3 } from './types';
  let { points, color = '#7ea38f' }: { points: Vec3[]; color?: string } = $props();
  const geometry = $derived.by(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
    return g;
  });
  $effect(() => {
    const previous = geometry;
    return () => previous.dispose();
  });
</script>

<T.Line {geometry}><T.LineBasicMaterial {color} transparent opacity={0.45} /></T.Line>
