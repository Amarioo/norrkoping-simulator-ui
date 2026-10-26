<script lang="ts">
  import { onMount } from 'svelte';
  import { Canvas } from '@threlte/core';
  import Scene from './lib/Scene.svelte';
  import { CITY_VIEWS, cityMap } from './lib/mapModel';
  import { city, FLIGHT_PHASE, VEHICLE_NAMES } from './lib/city.svelte';
  import { terrain } from './lib/terrain';
  import { formatClock, lightingState, setClock } from './lib/lighting/state.svelte';
  import { dayPhase, localToUtc, presets, solarPosition } from './lib/lighting/solar';
  import FpsProbe from './lib/perf/FpsProbe.svelte';
  import FpsCounter from './lib/perf/FpsCounter.svelte';
  import { fpsCounter, setFpsVisible } from './lib/perf/fpsMonitor.svelte';
  import type { Component } from 'svelte';
  // SSE debug panel (L key / ?sse-debug): only in dev and VITE_SSE_DEBUG=1 builds, loaded on demand.
  let SseDebugHost = $state.raw<Component | null>(null);
  // Same condition as sseDebugAvailable (sseTap.ts), written out so the build drops the chunk.
  if (import.meta.env.DEV || import.meta.env.VITE_SSE_DEBUG === '1')
    import('./lib/debug/SseDebugHost.svelte').then((m) => (SseDebugHost = m.default));
  let focus = $state('city'),
    labels = $state(true),
    follow = $state(''),
    travel = $state(0),
    mapReady = $state(false),
    webgl = $state(true);
  let compact = $state(100),
    estate = $state(60),
    trucks = $state(20),
    buses = $state(12),
    trams = $state(8),
    trains = $state(2),
    flights = $state(true),
    timeScale = $state(3),
    initialized = $state(false);
  const total = $derived(compact + estate + trucks + buses),
    moving = $derived(city.snapshot.vehicles.filter((v) => !v.stopped).length),
    plane = $derived(city.snapshot.aircraft[0]);
  // Step 6: simulated time of day (Europe/Stockholm) and stadium floodlights.
  const [siteLat, siteLon] = terrain.unproject(0, 0);
  const dayPresets = $derived(presets(lightingState.date, siteLat, siteLon));
  const sun = $derived(
    solarPosition(localToUtc(lightingState.date, lightingState.minutes), siteLat, siteLon),
  );
  const PHASE_NAMES: Record<string, string> = {
    day: 'Dag',
    golden: 'Låg sol',
    'civil-twilight': 'Borgerlig skymning/gryning',
    'nautical-twilight': 'Nautisk skymning/gryning',
    'astronomical-twilight': 'Astronomisk skymning/gryning',
    night: 'Natt',
  };
  const clock = $derived(new Date(city.snapshot.simulationTime * 1000).toISOString().slice(11, 19));
  $effect(() => {
    if (city.connected && !initialized) {
      const s = city.snapshot.settings;
      compact = s.compact;
      estate = s.estate;
      trucks = s.trucks;
      buses = s.buses ?? 0;
      trams = s.trams ?? 0;
      trains = s.trains ?? 0;
      flights = s.flights;
      timeScale = s.timeScale;
      initialized = true;
    }
  });
  onMount(() => {
    const c = document.createElement('canvas');
    webgl = !!c.getContext('webgl2');
    return city.connect();
  });
  // Phase P0: fullscreen map. The Fullscreen API on the map panel; where it is missing or refused
  // (e.g. iPhone Safari, a permissions policy) the panel fills the window with CSS instead. Threlte
  // resizes the renderer and the camera aspect from the panel's size (window resize + ResizeObserver).
  // dpr stays 1 (resolution and quality belong to the performance work).
  let panel = $state<HTMLDivElement>();
  let fullscreen = $state(false),
    filled = $state(false);
  const mapExpanded = $derived(fullscreen || filled);
  async function toggleFullscreen() {
    if (fullscreen) {
      await document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (filled) {
      filled = false;
      return;
    }
    if (panel && document.fullscreenEnabled && typeof panel.requestFullscreen === 'function') {
      try {
        await panel.requestFullscreen({ navigationUI: 'hide' });
        return;
      } catch {
        // Refused (no user activation, policy): fall back to filling the window.
      }
    }
    filled = true;
  }
  const isFormField = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.isContentEditable || !!t.closest('input, select, textarea, [contenteditable]'));
  function mapKeys(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    // Esc leaves either mode. Browsers already leave native fullscreen on Esc themselves; this also
    // covers browsers/automation that pass the key to the page instead.
    if (key === 'escape' && (fullscreen || filled)) {
      if (fullscreen) document.exitFullscreen?.().catch(() => {});
      else filled = false;
      return;
    }
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isFormField(e.target)) return;
    if (key === 'f') {
      e.preventDefault();
      toggleFullscreen();
    } else if (key === 'p') {
      e.preventDefault();
      setFpsVisible(!fpsCounter.visible);
    }
  }
  const fullscreenChange = () => (fullscreen = !!panel && document.fullscreenElement === panel);
  $effect(() => {
    document.documentElement.classList.toggle('map-filled', filled);
  });
  function jump(value: string) {
    follow = '';
    focus = value;
  }
  async function apply() {
    await city.command('settings', {
      compact,
      estate,
      trucks,
      buses,
      trams,
      trains,
      flights,
      timeScale,
    });
  }
</script>

<svelte:head
  ><title>Norrköping Simulator</title><meta
    name="description"
    content="Utforska Norrköping i 3D med simulerad vägtrafik och flyg mellan Kungsängen och Bråvalla F13."
  /></svelte:head
>
<svelte:window onkeydown={mapKeys} />
<svelte:document onfullscreenchange={fullscreenChange} />
<div class="sim-shell">
  <header class="sim-header">
    <a href="/" class="sim-brand"
      ><span class="brand-mark">N<span>↗</span></span><span
        ><strong>NORRKÖPING</strong><small>SIMULATOR</small></span
      ></a
    >
    <div class="sim-live">
      <i class:online={city.connected}></i>{city.connected
        ? 'Simulatorn är ansluten'
        : 'Ansluter till simulatorn…'}<span class="local-badge">LOKAL SIMULERING</span>
    </div>
  </header>
  <div class="sim-layout">
    <aside class="sim-sidebar">
      <div class="sidebar-title">
        <span class="eyebrow">STADEN I RÖRELSE</span>
        <h1>Ditt Norrköping.<br />På väg och i luften.</h1>
        <p>Följ trafiken genom staden eller lyft mot Bråvalla.</p>
      </div>
      <section class="sim-card">
        <div class="card-heading">
          <h2>Vägtrafik</h2>
          <span class="count-tag">{total} fordon</span>
        </div>
        <label class="slider-label" for="compact"
          ><span>Små personbilar</span><output>{compact}</output></label
        ><input id="compact" type="range" min="0" max="600" step="10" bind:value={compact} />
        <label class="slider-label" for="estate"
          ><span>Större bilar & kombi</span><output>{estate}</output></label
        ><input id="estate" type="range" min="0" max="600" step="10" bind:value={estate} />
        <label class="slider-label" for="trucks"
          ><span>Lastbilar</span><output>{trucks}</output></label
        ><input id="trucks" type="range" min="0" max="150" step="5" bind:value={trucks} />
        <p class="control-note">
          Personbilar följer körbara gator. Drottninggatan är undantagen. Lastbilar håller sig
          till större vägar, bland annat E4 och Söderleden.
        </p>
        <h3 class="transit-heading">Kollektivtrafik</h3>
        <label class="slider-label" for="buses"><span>Bussar</span><output>{buses}</output></label
        ><input id="buses" type="range" min="0" max="80" step="1" bind:value={buses} />
        <label class="slider-label" for="trams"
          ><span>Spårvagnar · linje 2 & 3</span><output>{trams}</output></label
        ><input id="trams" type="range" min="0" max="40" step="1" bind:value={trams} />
        <label class="slider-label" for="trains"
          ><span>Östgötapendeln</span><output>{trains}</output></label
        ><input id="trains" type="range" min="0" max="12" step="1" bind:value={trains} />
        <p class="control-note">
          Spårvagnar och pendeltåg följer kartlagda spår. Bussar delar vägtrafikens köer och
          trafikljus. Hållplatsuppehåll och avgångar är simulerade.
        </p>
        <label class="slider-label" for="time-scale"
          ><span>Simuleringshastighet</span><output>{timeScale}×</output></label
        ><select id="time-scale" bind:value={timeScale}
          ><option value={1}>Realtid · 1×</option><option value={3}>Stadspuls · 3×</option
          ><option value={5}>Snabbare · 5×</option><option value={10}>Överblick · 10×</option
          ><option value={20}>Snabbspola · 20×</option></select
        >
        <label class="check-row"
          ><input type="checkbox" bind:checked={flights} /> Flygtrafik mellan flygplatserna</label
        >
        <button
          class="apply-button"
          disabled={!city.connected || city.pending || total > 1000}
          onclick={apply}
          >{city.pending ? 'Uppdaterar…' : 'Uppdatera trafiken'}<span>↗</span></button
        >
        {#if total > 1000}<p class="error-text">Välj högst 1 000 fordon totalt.</p>{/if}
      </section>
      <section class="sim-card lighting-card">
        <div class="card-heading">
          <h2>Tid och ljus</h2>
          <span class="count-tag">{formatClock(lightingState.minutes)}</span>
        </div>
        <label class="slider-label" for="light-date"><span>Datum (Europe/Stockholm)</span></label
        ><input
          id="light-date"
          type="date"
          value={lightingState.date}
          onchange={(e) => {
            if (e.currentTarget.value) lightingState.date = e.currentTarget.value;
          }}
        />
        <label class="slider-label" for="light-time"
          ><span>Lokal tid</span><output>{formatClock(lightingState.minutes)}</output></label
        ><input
          id="light-time"
          type="range"
          min="0"
          max="1439"
          step="1"
          value={Math.floor(lightingState.minutes)}
          oninput={(e) => (lightingState.minutes = Number(e.currentTarget.value))}
        />
        <div class="preset-row" role="group" aria-label="Ljusförval">
          {#each dayPresets as p (p.id)}<button
              class="preset-button"
              data-preset={p.id}
              title={p.label + ' · ' + formatClock(p.minutes) + ' · ' + p.elevation.toFixed(1) + '°'}
              onclick={() => setClock(lightingState.date, p.minutes)}>{p.label}</button
            >{/each}
        </div>
        <p class="control-note" data-sun-elevation={sun.elevation.toFixed(2)}>
          Solhöjd {sun.elevation.toFixed(1).replace('.', ',')}° · {PHASE_NAMES[dayPhase(sun.elevation)]}.
          Gatubelysning i tre pilotområden: Kungsgatan, Strömparken och kring Idrottsparken.
        </p>
        <label class="slider-label" for="light-play"><span>Tidsförlopp</span></label><select
          id="light-play"
          bind:value={lightingState.rate}
          ><option value={0}>Stoppad</option><option value={60}>1 min per sekund</option><option
            value={600}>10 min per sekund</option
          ></select
        >
        <label class="slider-label" for="stadium-lights"><span>Idrottsparkens strålkastare</span></label
        ><select id="stadium-lights" bind:value={lightingState.stadium}
          ><option value="off">Av</option><option value="training">Träning</option><option
            value="event">Match</option
          ></select
        >
        <p class="micro-note">
          Strålkastarna styrs separat från tiden; ingen match antas. Lyktplaceringar är kartlagda
          (OSM) eller uppskattade från lit=yes.
        </p>
      </section>
      <section class="sim-card flight-card">
        <div class="card-heading">
          <h2>Regionalflyg</h2>
          <span class="flight-code">NK-01</span>
        </div>
        <div class="airport-route">
          <span>NRK<small>Kungsängen</small></span><b>⇄</b><span
            >F13<small>Bråvalla</small></span
          >
        </div>
        <p class="flight-phase">
          {plane ? FLIGHT_PHASE[plane.phase] : 'Flygtrafiken är avstängd'}
        </p>
        {#if plane}<p class="control-note">{plane.origin} → {plane.destination}</p>{/if}
        <button
          class="secondary-button"
          disabled={!plane}
          onclick={() => {
            follow = follow === 'plane' ? '' : 'plane';
          }}
          >{follow === 'plane' ? 'Sluta följa flygplanet' : 'Följ flygplanet'}
          <span>✈</span></button
        >
        <p class="micro-note">
          Fiktiv flygpendel till den tidigare F13-basen. Banornas lägen och riktningar följer
          kartan.
        </p>
      </section>
      <section class="camera-help">
        <h2>Fri kamera</h2>
        <p>
          Klicka i kartan och använd <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> för att förflytta
          dig.
        </p>
        <p>
          <kbd>Q</kbd>/<kbd>E</kbd> höjd · <kbd>Shift</kbd> snabbare<br />Dra: rotera ·
          högerdra: förflytta · scrolla: zooma
        </p>
      </section>
      <footer class="sidebar-footer">
        KARTDATA + SIMULERAD TRAFIK<br /><span>Kotlin / Ktor · CQRS · SSE · Three.js</span>
      </footer>
    </aside>
    <main class="sim-main">
      <div class="sim-title">
        <div>
          <span class="eyebrow">ÖSTERGÖTLAND · SVERIGE</span>
          <h2>Norrköping i rörelse</h2>
        </div>
        <div class="sim-clock">
          <span>{clock}</span><button
            aria-label={city.snapshot.paused ? 'Fortsätt simuleringen' : 'Pausa simuleringen'}
            disabled={!city.connected || city.pending}
            onclick={() => city.command('pause', { paused: !city.snapshot.paused })}
            >{city.snapshot.paused ? '▶' : 'Ⅱ'}</button
          ><button
            aria-label="Återställ simuleringen"
            disabled={!city.connected || city.pending}
            onclick={() => city.command('reset')}>↺</button
          >
        </div>
      </div>
      <div class="sim-metrics">
        <div>
          <span>FORDON I STADEN</span><strong
            >{city.snapshot.vehicles.length}<small> / {moving} i rörelse</small></strong
          >
        </div>
        <div>
          <span>LASTBILAR</span><strong
            >{city.snapshot.vehicles.filter((v) => v.kind === 'truck').length}<small>
              på huvudleder</small
            ></strong
          >
        </div>
        <div>
          <span>FLYGTRAFIK</span><strong
            >{plane ? '01' : '00'}<small>
              {plane ? FLIGHT_PHASE[plane.phase] : 'avstängd'}</small
            ></strong
          >
        </div>
        <div>
          <span>GENOMFÖRDA LANDNINGAR</span><strong
            >{city.snapshot.completedFlights}<small> NRK ⇄ F13</small></strong
          >
        </div>
      </div>
      <div
        class="map-panel simulator-map"
        class:map-filled-panel={filled}
        bind:this={panel}
        data-camera-travel={travel.toFixed(2)}
        data-map-ready={mapReady}
        data-fullscreen={fullscreen ? 'native' : filled ? 'window' : 'off'}
      >
        {#if webgl}<Canvas shadows={false} dpr={1}
            ><Scene {focus} showLabels={labels} bind:follow bind:travel bind:mapReady /><FpsProbe
            /></Canvas
          >{#if !mapReady}<div class="map-loading" role="status">
              <i></i>Bygger kartan…
            </div>{/if}{:else}<div class="map-fallback">
            Din webbläsare behöver WebGL 2 för att visa 3D-kartan.
          </div>{/if}
        <div class="explorer-toolbar">
          <label for="city-focus">Utforska</label><select
            id="city-focus"
            value={focus}
            onchange={(e) => jump(e.currentTarget.value)}
            >{#each Object.entries(CITY_VIEWS) as [key, value]}<option value={key}
                >{value.label}</option
              >{/each}</select
          ><label class="label-toggle"
            ><input type="checkbox" bind:checked={labels} /> Landmärken</label
          ><span class="toolbar-divider" aria-hidden="true"></span><button
            type="button"
            class="map-tool fps-toggle"
            aria-pressed={fpsCounter.visible}
            aria-label="Fps-räknare"
            title={(fpsCounter.visible ? 'Dölj' : 'Visa') + ' fps-räknaren (P)'}
            onclick={() => setFpsVisible(!fpsCounter.visible)}>FPS</button
          ><button
            type="button"
            class="map-tool fullscreen-toggle"
            aria-label={mapExpanded ? 'Avsluta helskärm' : 'Helskärm'}
            title={(mapExpanded ? 'Avsluta helskärm' : 'Helskärm') + ' (F)'}
            onclick={toggleFullscreen}
            ><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
              >{#if mapExpanded}<path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />{:else}<path
                  d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"
                />{/if}</svg
            ></button
          >
        </div>
        {#if fpsCounter.visible}<FpsCounter />{/if}
        <div class="map-status">
          {follow ? 'FÖLJER ' + (follow === 'plane' ? 'NK-01' : 'FORDON ' + follow) : 'FRI KAMERA'}
          <i></i>
        </div>
        {#if !city.connected}<div class="connection-banner">
            Ansluter till Ktor… Starta om backend om du nyss uppdaterade projektet.
          </div>{/if}
        {#if city.selected}<div class="vehicle-inspector">
            <button
              class="close-inspector"
              aria-label="Stäng fordonsdetaljer"
              onclick={() => (city.selectedId = null)}>×</button
            ><span class="eyebrow">FORDON {city.selected.id}</span>
            <h3>
              {VEHICLE_NAMES[city.selected.kind]}
            </h3>
            <p>
              {city.selected.road || 'Lokalgata'}{city.selected.destination
                ? ' → ' + city.selected.destination
                : ''} · {city.selected.speed.toFixed(0)} km/h
            </p>
            {#if city.selected.stop}<p>Hållplats: {city.selected.stop}</p>{/if}
            <button class="secondary-button" onclick={() => (follow = String(city.selected!.id))}
              >Följ fordonet ↗</button
            >
          </div>{/if}
        <div class="map-key">
          <span><i style="background:#a2c48a"></i> Grönområden</span><span
            ><i style="background:#668c9d"></i> Vatten</span
          ><span><i style="background:#d3be83"></i> Simulerad trafik</span>
        </div>
        <div class="map-attribution">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
            >OpenStreetMap contributors · ODbL</a
          >
          · Markhöjdmodell Nedladdning ©Lantmäteriet, bearbetad ·
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.sv"
            target="_blank"
            rel="noreferrer">CC BY 4.0</a
          >
        </div>
      </div>
      <div class="sim-feedback" aria-live="polite" class:has-error={!!city.error}>
        {city.error ||
          city.notice ||
          'Välj en stadsdel eller förflytta dig fritt över kartan.'}<span
          >{cityMap.buildings.length.toLocaleString('sv-SE')} byggnader · {cityMap.signals.length} signalpunkter</span
        >
      </div>
      <section class="sim-bottom">
        <div>
          <h2>Senaste händelser</h2>
          {#each city.snapshot.events.slice(0, 4) as event (event.id)}<p class="event-row">
              <span>{event.kind === 'landing' ? '↘' : '•'}</span>{event.message}<time
                >{new Date(event.time * 1000).toISOString().slice(14, 19)}</time
              >
            </p>{/each}
        </div>
        <div class="vehicle-select">
          <h2>Hitta ett fordon</h2>
          <label for="vehicle-select">Välj bil, buss, spårvagn eller tåg</label><select
            id="vehicle-select"
            value={city.selectedId ?? ''}
            onchange={(e) => {
              city.selectedId = Number(e.currentTarget.value) || null;
            }}
            ><option value="">Välj fordon…</option
            >{#each city.snapshot.vehicles as v (v.id)}<option value={v.id}
                >#{v.id} · {VEHICLE_NAMES[v.kind]} · {v.road || 'Lokalgata'}{v.destination
                  ? ' → ' + v.destination
                  : ''}</option
              >{/each}</select
          >
          <p class="micro-note">
            Signaler och flygturer är simulerade. Kartlagda former kompletteras med uppskattade
            höjder och byggnadsdetaljer.
          </p>
        </div>
      </section>
    </main>
  </div>
</div>
{#if SseDebugHost}<SseDebugHost />{/if}
