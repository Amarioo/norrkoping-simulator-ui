<script lang="ts">
  // Phase P0: times every frame inside the Threlte loop. Two extra stages, one before the main stage
  // (frame start) and one after the render stage (frame end), so the CPU time covers every task and
  // renderer.render(). Nothing is drawn, nothing touches the DOM, renderer.info is only read (by the
  // overlay, twice a second), and the tasks never invalidate: they do not cause extra renders.
  import { onDestroy } from 'svelte';
  import { useStage, useTask, useThrelte } from '@threlte/core';
  import { attachRenderer, cpuWindow, fpsCollecting, frameStats } from './fpsMonitor.svelte';
  const { renderer, mainStage, renderStage } = useThrelte();
  attachRenderer(renderer);
  const begin = useStage(Symbol('p0-fps-begin'), { before: mainStage });
  const end = useStage(Symbol('p0-fps-end'), { after: renderStage });
  let started = 0;
  useTask(
    () => {
      started = performance.now();
      frameStats.frame(started);
    },
    { stage: begin, autoInvalidate: false, running: fpsCollecting },
  );
  useTask(
    () => {
      if (started) cpuWindow.add(started, performance.now() - started);
    },
    { stage: end, autoInvalidate: false, running: fpsCollecting },
  );
  // A hidden tab stops requestAnimationFrame: the first frame back must not count as one long frame.
  const visibility = () => {
    if (document.hidden) {
      frameStats.pause();
      started = 0;
    }
  };
  document.addEventListener('visibilitychange', visibility);
  $effect(() => {
    // When collection stops (counter switched off), the next start must not span the off period.
    if (!fpsCollecting()) {
      frameStats.pause();
      started = 0;
    }
  });
  onDestroy(() => {
    document.removeEventListener('visibilitychange', visibility);
    attachRenderer(null);
  });
</script>
