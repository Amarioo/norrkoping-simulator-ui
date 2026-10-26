<script lang="ts">
  // Phase P0: the fps counter overlay. Reads the probe's statistics twice a second (no DOM update per
  // frame). Collapsed: fps, mean and p95 frame time. Expanded: CPU time, draw calls, triangles,
  // shader programs and resolution from renderer.info / the canvas.
  import { onMount } from 'svelte';
  import {
    FPS_REFRESH_MS,
    fpsCounter,
    readFps,
    setFpsExpanded,
    type FpsReading,
  } from './fpsMonitor.svelte';
  let r = $state.raw<FpsReading | null>(null);
  onMount(() => {
    const tick = () => (r = readFps());
    tick();
    const id = setInterval(tick, FPS_REFRESH_MS);
    return () => clearInterval(id);
  });
  const num = (v: number | null | undefined, digits = 1) =>
    v === null || v === undefined || !Number.isFinite(v)
      ? '–'
      : v.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const int = (v: number | undefined) => (v === undefined ? '–' : v.toLocaleString('sv-SE'));
</script>

<section
  class="fps-counter"
  class:expanded={fpsCounter.expanded}
  aria-label="Fps-räknare"
  data-fps={r?.fps?.toFixed(1) ?? ''}
  data-frame-ms={r?.meanMs?.toFixed(2) ?? ''}
  data-p95-ms={r?.p95Ms?.toFixed(2) ?? ''}
  data-calls={r?.calls ?? ''}
  data-triangles={r?.triangles ?? ''}
  data-programs={r?.programs ?? ''}
  data-resolution={r ? `${r.width}x${r.height}` : ''}
>
  <button
    type="button"
    class="fps-summary"
    aria-expanded={fpsCounter.expanded}
    aria-controls="fps-details"
    title={fpsCounter.expanded ? 'Fäll ihop' : 'Visa detaljer'}
    onclick={() => setFpsExpanded(!fpsCounter.expanded)}
    ><strong class="fps-value">{num(r?.fps, 0)}</strong><span class="fps-unit">fps</span><span
      class="fps-ms">{num(r?.meanMs)} ms</span
    ><span class="fps-p95">p95 {num(r?.p95Ms)}</span><i aria-hidden="true"
      >{fpsCounter.expanded ? '▾' : '▸'}</i
    ></button
  >
  {#if fpsCounter.expanded}<div id="fps-details" class="fps-details">
      <dl>
        <dt>Bildtid medel · p95 · max</dt>
        <dd>{num(r?.meanMs)} · {num(r?.p95Ms)} · {num(r?.maxMs)} ms</dd>
        <dt>CPU per bild medel · p95</dt>
        <dd>{num(r?.cpuMeanMs)} · {num(r?.cpuP95Ms)} ms</dd>
        <dt>Ritanrop</dt>
        <dd class="fps-calls">{int(r?.calls)}</dd>
        <dt>Trianglar</dt>
        <dd class="fps-triangles">{int(r?.triangles)}</dd>
        <dt>Shaderprogram</dt>
        <dd class="fps-programs">{int(r?.programs)}</dd>
        <dt>Upplösning</dt>
        <dd class="fps-resolution">
          {r ? `${r.width} × ${r.height} px` : '–'}{r && r.pixelRatio !== r.devicePixelRatio
            ? ` (dpr ${num(r.pixelRatio, 0)}, skärm ${num(r.devicePixelRatio, 2)})`
            : ''}
        </dd>
        <dt>Geometrier · texturer</dt>
        <dd>{int(r?.geometries)} · {int(r?.textures)}</dd>
      </dl>
      <p class="fps-note">
        Senaste {num((r?.windowMs ?? 2000) / 1000, 0)} s · {int(r?.frames)} bilder. Bildtid = tid mellan
        bilder, inte ren GPU-tid.
      </p>
    </div>{/if}
</section>
