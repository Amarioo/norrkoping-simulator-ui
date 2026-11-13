<script lang="ts">
  // Interface U1: on a narrow screen the settings sit in a drawer pulled up from the bottom edge
  // (vaul-svelte). Loaded on demand, so wide screens never fetch it. Only the handle drags the
  // drawer, so the sliders inside can be dragged sideways without moving it.
  import { Drawer } from 'vaul-svelte';
  import type { Snippet } from 'svelte';
  let { open = $bindable(false), children }: { open?: boolean; children: Snippet } = $props();
</script>

<Drawer.Root bind:open handleOnly>
  <div class="drawer-bar">
    <Drawer.Trigger class="apply-button drawer-trigger">Inställningar</Drawer.Trigger>
  </div>
  <Drawer.Portal>
    <Drawer.Overlay class="drawer-overlay" />
    <Drawer.Content class="drawer-content">
      <Drawer.Handle class="drawer-handle" />
      <Drawer.Title class="visually-hidden">Inställningar</Drawer.Title>
      <Drawer.Description class="visually-hidden">Trafik, tid och ljus samt flyg</Drawer.Description
      >
      <div class="drawer-scroll">{@render children()}</div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
