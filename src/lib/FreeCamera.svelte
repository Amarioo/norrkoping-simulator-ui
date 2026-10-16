<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T, useTask } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import type { OrbitControls as Controls } from 'three/addons/controls/OrbitControls.js';
  import { PerspectiveCamera, Vector3 } from 'three';
  import { CITY_VIEWS } from './mapModel';
  import { city } from './city.svelte';
  let {
    focus = 'overview',
    follow = $bindable(''),
    travel = $bindable(0),
  }: { focus: string; follow?: string; travel?: number } = $props();
  const camera = new PerspectiveCamera(48, 1, 0.015, 2400);
  camera.position.fromArray(CITY_VIEWS.overview.position);
  let controls = $state.raw<Controls>();
  const keys = new Set<string>(),
    forward = new Vector3(),
    right = new Vector3(),
    move = new Vector3();
  $effect(() => {
    if (!controls) return;
    const preset = CITY_VIEWS[focus] ?? CITY_VIEWS.overview;
    camera.position.fromArray(preset.position);
    controls.target.fromArray(preset.target);
    controls.update();
  });
  $effect(() => {
    if (!controls) return;
    const canvas = controls.domElement!.querySelector('canvas') ?? controls.domElement!;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      '3D-karta. WASD flyttar kameran, Q och E ändrar höjd, Shift ökar hastigheten.',
    );
    const keydown = (e: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      if (
        [
          'w',
          'a',
          's',
          'd',
          'q',
          'e',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          'shift',
        ].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        keys.add(e.key.toLowerCase());
        follow = '';
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const clear = () => keys.clear();
    const pointer = () => canvas.focus({ preventScroll: true });
    const manual = () => {
      follow = '';
    };
    canvas.addEventListener('pointerdown', pointer);
    canvas.addEventListener('blur', clear);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    controls.addEventListener('start', manual);
    return () => {
      canvas.removeEventListener('pointerdown', pointer);
      canvas.removeEventListener('blur', clear);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      controls?.removeEventListener('start', manual);
    };
  });
  useTask((dt) => {
    if (!controls) return;
    if (follow) {
      const item =
        follow === 'plane'
          ? city.snapshot.aircraft[0]
          : city.snapshot.vehicles.find((v) => String(v.id) === follow);
      if (item) {
        const kind = 'kind' in item ? item.kind : 'plane';
        const distance =
            kind === 'plane'
              ? 3.8
              : kind === 'train'
                ? 5
                : kind === 'tram'
                  ? 2.8
                  : kind === 'bus'
                    ? 1.4
                    : 0.85,
          height =
            kind === 'plane' || kind === 'train'
              ? 1.5
              : kind === 'tram'
                ? 1
                : kind === 'bus'
                  ? 0.65
                  : 0.42;
        const wanted = new Vector3(
          item.pos[0] - Math.sin(item.heading) * distance,
          item.pos[1] + height,
          item.pos[2] - Math.cos(item.heading) * distance,
        );
        camera.position.lerp(wanted, 1 - Math.exp(-dt * 4));
        controls.target.lerp(new Vector3(...item.pos), 1 - Math.exp(-dt * 6));
        controls.update();
      } else follow = '';
    }
    if (!keys.size) return;
    forward.subVectors(controls.target, camera.position);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    move.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup')) move.add(forward);
    if (keys.has('s') || keys.has('arrowdown')) move.sub(forward);
    if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
    if (keys.has('d') || keys.has('arrowright')) move.add(right);
    if (keys.has('q')) move.y -= 1;
    if (keys.has('e')) move.y += 1;
    const speed =
      Math.max(1.4, camera.position.distanceTo(controls.target) * 0.65) *
      (keys.has('shift') ? 3 : 1);
    move.normalize().multiplyScalar(Math.min(dt, 0.05) * speed);
    if (camera.position.y + move.y < 0.18) move.y = 0;
    camera.position.add(move);
    controls.target.add(move);
    travel += move.length();
    controls.update();
  });
  onDestroy(() => {
    keys.clear();
  });
</script>

<T is={camera} makeDefault
  ><OrbitControls
    bind:ref={controls}
    enableDamping
    screenSpacePanning
    minDistance={0.3}
    maxDistance={1500}
    maxPolarAngle={Math.PI / 2.02}
    target={CITY_VIEWS.overview.target}
  /></T
>
