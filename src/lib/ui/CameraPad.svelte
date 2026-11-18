<script lang="ts">
  // Interface U4: camera buttons for touch screens. Holding a button moves the free camera the same way
  // the keyboard does (W A S D, Q/E for height); FreeCamera.svelte reads `padKeys` every frame. The pad is
  // shown only where a finger is a pointer (style.css, any-pointer: coarse).
  import { onDestroy } from 'svelte';
  import { padKeys } from '../cameraPad';

  const BUTTONS = [
    { key: 'e', label: 'Höj kameran', area: 'up', icon: 'M4 9l4-4 4 4M3 13h10' },
    { key: 'w', label: 'Flytta framåt', area: 'fwd', icon: 'M3 10l5-5 5 5' },
    { key: 'q', label: 'Sänk kameran', area: 'down', icon: 'M4 7l4 4 4-4M3 3h10' },
    { key: 'a', label: 'Flytta vänster', area: 'left', icon: 'M10 3L5 8l5 5' },
    { key: 's', label: 'Flytta bakåt', area: 'back', icon: 'M3 6l5 5 5-5' },
    { key: 'd', label: 'Flytta höger', area: 'right', icon: 'M6 3l5 5-5 5' },
  ] as const;

  let held = $state<Record<string, boolean>>({});
  const press = (key: string, e: PointerEvent) => {
    e.preventDefault();
    padKeys.add(key);
    held[key] = true;
    // Capture keeps the release coming to this button when the finger slides off it. A browser may
    // refuse the capture (the pointer is already gone); the button still works without it.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* no capture */
    }
  };
  const release = (key: string) => {
    padKeys.delete(key);
    held[key] = false;
  };
  // Keyboard: Space or Enter on a focused button moves for as long as the key is held.
  const keydown = (key: string, e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    padKeys.add(key);
    held[key] = true;
  };
  const keyup = (key: string, e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') release(key);
  };
  onDestroy(() => padKeys.clear());
</script>

<div class="camera-pad" role="group" aria-label="Flytta kameran">
  {#each BUTTONS as b (b.key)}
    <button
      type="button"
      class="camera-pad-button"
      class:held={held[b.key]}
      style:grid-area={b.area}
      aria-label={b.label}
      data-pad-key={b.key}
      onpointerdown={(e) => press(b.key, e)}
      onpointerup={() => release(b.key)}
      onpointercancel={() => release(b.key)}
      onlostpointercapture={() => release(b.key)}
      onkeydown={(e) => keydown(b.key, e)}
      onkeyup={(e) => keyup(b.key, e)}
      onblur={() => release(b.key)}
      oncontextmenu={(e) => e.preventDefault()}
      ><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d={b.icon} /></svg
      ></button
    >
  {/each}
</div>
