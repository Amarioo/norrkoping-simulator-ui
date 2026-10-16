<script lang="ts">
  import { onMount } from 'svelte';
  import { Canvas } from '@threlte/core';
  import Scene from './lib/Scene.svelte';
  import { world } from './lib/world.svelte';
  let count = $state(5);
  let hub = $state('HUB_NORTH');
  let webgl = $state(true);
  const disabled = $derived(world.pending || !world.connected);
  const elapsed = $derived(
    new Date(world.snapshot.simulationTime * 1000).toISOString().slice(11, 19),
  );
  onMount(() => {
    const test = document.createElement('canvas');
    webgl = !!test.getContext('webgl2');
    return world.connect();
  });
  async function reset() {
    if (await world.command('reset')) {
      world.selectedId = null;
      world.placingZone = false;
    }
  }
</script>

<svelte:head><title>Swarm · Airspace Control</title></svelte:head>
<div class="app-shell">
  <header>
    <a class="brand" href="/" aria-label="Swarm home"
      ><span class="brand-icon">⌘</span><strong>swarm<span> / </span></strong><span
        class="brand-sub">AIRSPACE CONTROL</span
      ></a
    >
    <div class="header-meta">
      <span class="environment">LOCAL SIMULATION</span><span
        class:online={world.connected}
        class="connection"><i></i>{world.connected ? 'Live connection' : 'Reconnecting…'}</span
      >
    </div>
  </header>
  <div class="workspace">
    <aside class="controls">
      <div class="section-top">
        <span class="eyebrow">MISSION CONTROL</span><span class="tag">01</span>
      </div>
      <h1>A little airspace.<br />A lot in motion.</h1>
      <p class="intro">
        Dispatch your fleet. Shape the sky.<br />Watch the city move in real time.
      </p>
      <section class="dispatch card">
        <div class="section-top">
          <h2>Dispatch fleet</h2>
          <span class="mini-icon">↗</span>
        </div>
        <label for="hub">Departure hub</label>
        <select id="hub" bind:value={hub}
          ><option value="HUB_NORTH">North hub · N-01</option><option value="HUB_SOUTH"
            >South hub · S-02</option
          ></select
        >
        <div class="range-label">
          <label for="count">Drones</label><strong>{count.toString().padStart(2, '0')}</strong>
        </div>
        <input id="count" type="range" min="1" max="20" bind:value={count} />
        <div class="range-end"><span>01</span><span>20</span></div>
        <button
          class="primary"
          {disabled}
          onclick={() =>
            world.command('dispatch-drone', { count: Number(count), originHub: hub, weightKg: 2 })}
          >Dispatch {count} drone{count > 1 ? 's' : ''}<span>↗</span></button
        >
        <p class="fineprint">2 kg payload · autonomous return</p>
      </section>
      <section class="tools">
        <h2>Airspace tools</h2>
        <button
          class:armed={world.placingZone}
          {disabled}
          onclick={() => (world.placingZone = !world.placingZone)}
          ><span class="tool-icon coral">⊘</span><span
            ><strong>{world.placingZone ? 'Cancel placement' : 'Add no-fly zone'}</strong><small
              >{world.placingZone
                ? 'Click an open area on the map'
                : 'Reroute around a 12 m exclusion'}</small
            ></span
          ><span>+</span></button
        >
        <button
          {disabled}
          onclick={() =>
            world.command('wind', {
              x: world.snapshot.wind[0] === 0 ? 8 : 0,
              z: world.snapshot.wind[0] === 0 ? 4 : 0,
            })}
          ><span class="tool-icon blue">≋</span><span
            ><strong>{world.snapshot.wind[0] === 0 ? 'Introduce wind' : 'Clear wind'}</strong><small
              >{world.snapshot.wind[0] === 0
                ? 'Test the fleet in a crosswind'
                : 'Wind active · 8 / 4 m/s'}</small
            ></span
          ><span>↗</span></button
        >
        <button {disabled} onclick={() => world.command('recall')}
          ><span class="tool-icon mint">↙</span><span
            ><strong>Recall fleet</strong><small>Bring active drones home</small></span
          ><span>↗</span></button
        >
      </section>
      {#if world.snapshot.noFlyZones.length > 0}<section class="zone-list">
          <h2>Restricted zones <span>{world.snapshot.noFlyZones.length}</span></h2>
          {#each world.snapshot.noFlyZones as zone}<div>
              <span><i></i>{zone.id} <small>r {zone.radius} m</small></span><button
                {disabled}
                aria-label={`Remove zone ${zone.id}`}
                onclick={() => world.command('remove-no-fly-zone', { id: zone.id })}
                >Remove ×</button
              >
            </div>{/each}
        </section>{/if}
      <div class="sidebar-footer"><span class="tiny-dot"></span>KOTLIN × SVELTE × THREE.JS</div>
    </aside>
    <main>
      <div class="view-heading">
        <div>
          <span class="eyebrow">OPERATIONS OVERVIEW</span>
          <h2>City airspace <span>/ sandbox</span></h2>
        </div>
        <div class="simulation-control">
          <span class="clock">{elapsed}</span><button
            class="square"
            {disabled}
            aria-label={world.snapshot.paused ? 'Resume simulation' : 'Pause simulation'}
            onclick={() => world.command('pause', { paused: !world.snapshot.paused })}
            >{world.snapshot.paused ? '▶' : 'Ⅱ'}</button
          ><button class="square" {disabled} aria-label="Reset simulation" onclick={reset}>↺</button
          >
        </div>
      </div>
      <div class="metrics">
        <div>
          <span>ACTIVE DRONES</span><strong
            >{world.telemetry.active.toString().padStart(2, '0')}<small>
              / {world.snapshot.drones.length}</small
            ></strong
          ><i class="metric-mark mint-bg"></i>
        </div>
        <div>
          <span>DELIVERIES</span><strong
            >{world.telemetry.deliveries.toString().padStart(2, '0')}<small>
              completed</small
            ></strong
          ><i class="metric-mark blue-bg"></i>
        </div>
        <div>
          <span>FLEET BATTERY</span><strong
            >{Math.round(world.telemetry.averageBattery)}<small> % average</small></strong
          ><i class="metric-mark yellow-bg"></i>
        </div>
        <div>
          <span>DISTANCE FLOWN</span><strong
            >{(world.telemetry.distanceMetres / 1000).toFixed(2)}<small> km</small></strong
          ><i class="metric-mark coral-bg"></i>
        </div>
      </div>
      <div class:placing={world.placingZone} class="map-panel">
        <div class="map-top">
          <span class="map-badge"
            ><i class:paused={world.snapshot.paused}></i>{world.snapshot.paused
              ? 'PAUSED'
              : 'LIVE AIRSPACE'}</span
          ><label class="route-switch"
            ><input type="checkbox" bind:checked={world.showRoutes} /> Flight paths</label
          >
        </div>
        {#if webgl}<Canvas><Scene /></Canvas>{:else}<div class="map-fallback">
            This view needs WebGL 2. Enable hardware acceleration in your browser.
          </div>{/if}
        {#if !world.connected}<div class="offline-banner" role="status">
            Connecting to the simulator… Start the backend with <code>.\dev.ps1</code>.
          </div>{/if}
        {#if world.placingZone}<div class="placement-banner">
            Click open ground to place a no-fly zone <button
              onclick={() => (world.placingZone = false)}>Cancel</button
            >
          </div>{/if}
        {#if world.selected}
          <div class="drone-detail">
            <button aria-label="Close drone details" onclick={() => (world.selectedId = null)}
              >×</button
            ><span class="eyebrow">DRONE INSPECTOR</span>
            <h3>{world.selected.id}</h3>
            <span class="state-pill">{world.selected.state}</span>
            <dl>
              <div>
                <dt>Battery</dt>
                <dd>{world.selected.battery.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Altitude</dt>
                <dd>{world.selected.pos[1].toFixed(0)} m</dd>
              </div>
              <div>
                <dt>Payload</dt>
                <dd>{world.selected.weightKg} kg</dd>
              </div>
            </dl>
          </div>
        {/if}
        <div class="map-bottom">
          <div class="legend">
            <span><i class="mint-bg"></i>Delivering</span><span
              ><i class="blue-bg"></i>Returning</span
            ><span><i class="coral-bg"></i>Restricted</span>
          </div>
          <span class="map-hint">Drag to orbit · Scroll to zoom · Click a drone</span>
        </div>
        <div class="compass">N<span>↑</span></div>
      </div>
      <div class="feedback" aria-live="polite">
        {#if world.error}<span class="error" role="alert">{world.error}</span
          >{:else if world.pending}<span>Sending command…</span>{:else}<span
            >{world.notice || 'Airspace ready. Your next move starts here.'}</span
          >{/if}<span class="stream-meta">20 Hz simulation / 10 Hz world stream</span>
      </div>
      <div class="bottom-panels">
        <section class="activity-panel">
          <div class="section-top">
            <h2>Activity stream <span class="tiny-dot"></span></h2>
            <span class="eyebrow">LIVE EVENTS</span>
          </div>
          <div class="event-list">
            {#each world.telemetry.events.slice(0, 5) as event (event.id)}<div class="event">
                <span
                  class:coral={event.kind === 'zone' || event.kind === 'alert'}
                  class="event-symbol"
                  >{event.kind === 'delivery' ? '✓' : event.kind === 'zone' ? '⊘' : '↗'}</span
                ><span>{event.message}</span><time
                  >{new Date(event.time * 1000).toISOString().slice(14, 19)}</time
                >
              </div>{:else}<p class="empty">Waiting for the first flight event.</p>{/each}
          </div>
        </section>
        <section class="fleet-panel">
          <h2>Fleet status</h2>
          <div class="status-row">
            <span><i class="mint-bg"></i>Delivering</span><strong
              >{world.telemetry.delivering}</strong
            >
          </div>
          <div class="status-row">
            <span><i class="blue-bg"></i>Returning</span><strong>{world.telemetry.returning}</strong
            >
          </div>
          <div class="status-row">
            <span><i class="coral-bg"></i>Holding / alert</span><strong
              >{world.telemetry.holding}</strong
            >
          </div>
          <div class="status-row">
            <span><i class="grey-bg"></i>At hub</span><strong
              >{world.snapshot.drones.filter((d) => d.state === 'IDLE').length}</strong
            >
          </div>
        </section>
      </div>
    </main>
  </div>
</div>
