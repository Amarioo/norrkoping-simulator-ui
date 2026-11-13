<script lang="ts">
  // Interface U1: two charts under the map, drawn with LayerChart. They read the simulator's
  // snapshot every other second (not on every SSE message) and stand still while the tab is hidden.
  import { onMount } from 'svelte';
  import { AreaChart, BarChart } from 'layerchart';
  import 'layerchart/core.css';
  import { city } from '../city.svelte';
  import {
    countByKind,
    pushSample,
    sameCounts,
    SAMPLE_MS,
    type KindCount,
    type MovingSample,
  } from './trafficStats';

  let history = $state.raw<MovingSample[]>([]);
  let kinds = $state.raw<KindCount[]>(countByKind([]));
  onMount(() => {
    const sample = () => {
      if (!city.connected || document.hidden) return;
      const vehicles = city.snapshot.vehicles;
      history = pushSample(history, {
        t: new Date(),
        moving: vehicles.filter((v) => !v.stopped).length,
      });
      const next = countByKind(vehicles);
      if (!sameCounts(next, kinds)) kinds = next;
    };
    sample();
    const id = setInterval(sample, SAMPLE_MS);
    return () => clearInterval(id);
  });
  const latest = $derived(history.at(-1)?.moving);
  const total = $derived(kinds.reduce((sum, k) => sum + k.count, 0));
  const clock = (d: Date) => d.toLocaleTimeString('sv-SE');
</script>

<section class="chart-card" data-chart="moving" data-samples={history.length}>
  <div class="chart-heading">
    <h2>Fordon i rörelse</h2>
    <span>senaste 5 min</span>
  </div>
  {#if history.length > 1}
    <div
      class="chart-box"
      role="img"
      aria-label={'Linjediagram: fordon i rörelse de senaste fem minuterna, nu ' + latest}
    >
      <AreaChart
        data={history}
        x="t"
        y="moving"
        yDomain={[0, null]}
        yNice
        props={{ xAxis: { ticks: 3, format: clock }, yAxis: { ticks: 3 } }}
      />
    </div>
  {:else}
    <p class="chart-empty">Samlar in värden från simulatorn …</p>
  {/if}
</section>
<section class="chart-card" data-chart="kinds" data-total={total}>
  <div class="chart-heading">
    <h2>Fordon per typ</h2>
    <span>{total} totalt</span>
  </div>
  {#if total > 0}
    <div
      class="chart-box"
      role="img"
      aria-label={'Stapeldiagram: ' + kinds.map((k) => k.label + ' ' + k.count).join(', ')}
    >
      <BarChart
        data={kinds}
        x="count"
        y="label"
        orientation="horizontal"
        labels
        padding={{ left: 76, right: 28, bottom: 4, top: 4 }}
        axis="y"
        grid={false}
      />
    </div>
  {:else}
    <p class="chart-empty">Inga fordon i simulatorn just nu.</p>
  {/if}
</section>
