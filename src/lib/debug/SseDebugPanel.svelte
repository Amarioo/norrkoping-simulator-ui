<script lang="ts">
  // SSE debug panel: every server-sent event the frontend receives, newest first, with per-stream
  // counters. Redraws at most 4 times a second (not per event), shows at most `limit` rows, and
  // parses / pretty-prints JSON only for an expanded entry.
  import { onMount } from 'svelte';
  import { exportEntry, filterEntries, isLifecycle, parseEntryData, type SseEntry } from './sseLog';
  import { KNOWN_STREAMS, setOpen, setRaw, sseDebug, sseLog } from './sseRecorder.svelte';

  const REFRESH_MS = 250;
  const PAGE = 200;

  type Channel = ReturnType<typeof sseLog.channels>[number];
  let channels = $state.raw<Channel[]>([]);
  let names = $state.raw<string[]>([]);
  let rows = $state.raw<SseEntry[]>([]);
  let total = $state(0);
  let matched = $state(0);
  let paused = $state(sseLog.paused);
  let skipped = $state(0);
  let dropped = $state(0);
  let storedBytes = $state(0);

  let text = $state('');
  let channelFilter = $state<string[]>([]);
  let eventFilter = $state<string[]>([]);
  let hideLifecycle = $state(false);
  let limit = $state(PAGE);
  let expanded = $state<number | null>(null);
  let copied = $state<number | null>(null);
  let showStreams = $state(true);
  // Left by default, so the fps counter (bottom-right of the map) stays visible.
  let side = $state<'left' | 'right'>('left');

  let lastVersion = -1;
  let lastFilterKey = '';
  function refresh() {
    channels = sseLog.channels();
    const filterKey = JSON.stringify([text, channelFilter, eventFilter, hideLifecycle, limit]);
    if (sseLog.version === lastVersion && filterKey === lastFilterKey) return;
    lastVersion = sseLog.version;
    lastFilterKey = filterKey;
    const all = sseLog.entries();
    const filtered = filterEntries(all, {
      text,
      channels: new Set(channelFilter),
      events: new Set(eventFilter),
      hideLifecycle,
    });
    total = all.length;
    matched = filtered.length;
    rows = filtered.slice(0, limit);
    names = sseLog.eventNames();
    paused = sseLog.paused;
    skipped = sseLog.skipped;
    dropped = sseLog.dropped;
    storedBytes = sseLog.bytesStored;
  }
  onMount(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  });
  // Filter changes redraw at once.
  $effect(() => {
    void [text, channelFilter, eventFilter, hideLifecycle, limit];
    refresh();
  });

  const streams = $derived([...new Set([...KNOWN_STREAMS, ...sseDebug.seen])]);

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const clock = (at: number) => {
    const d = new Date(at);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  };
  // One shared formatter: toLocaleString() builds a new one on every call (hundreds per redraw).
  const dec = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
  const size = (b: number) =>
    b < 1024
      ? `${b} B`
      : b < 1024 * 1024
        ? `${dec.format(b / 1024)} kB`
        : `${dec.format(b / 1024 / 1024)} MB`;
  const rate = (v: number) => dec.format(v);
  const STATE = ['ansluter', 'öppen', 'stängd'];
  /** An open stream with no event for this long is flagged "tyst" (silent). */
  const SILENT_MS = 3000;
  const silentFor = (c: Channel) =>
    c.readyState === 1 && c.lastEventAt !== null && Date.now() - c.lastEventAt > SILENT_MS
      ? Math.floor((Date.now() - c.lastEventAt) / 1000)
      : 0;
  const stateOf = (c: Channel) => {
    if (c.readyState === null) return '–';
    const silent = silentFor(c);
    return silent ? `öppen, tyst ${silent} s` : (STATE[c.readyState] ?? '–');
  };
  const preview = (e: SseEntry) => {
    if (e.kind === 'event' || e.kind === 'comment' || e.kind === 'retry')
      return e.data.length > 160 ? e.data.slice(0, 160) + '…' : e.data;
    return e.note ?? '';
  };
  const pretty = (e: SseEntry) => {
    const p = parseEntryData(e);
    return p.ok ? JSON.stringify(p.value, null, 2) : e.data;
  };

  async function copy(e: SseEntry) {
    const text = JSON.stringify(exportEntry(e), null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused (no focus / permission): fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copied = e.seq;
    setTimeout(() => {
      if (copied === e.seq) copied = null;
    }, 1500);
  }

  function exportLog() {
    const file = sseLog.toExport();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = file.exportedAt.replace(/[:.]/g, '-');
    a.href = url;
    a.download = `sse-logg-${stamp}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function togglePause() {
    sseLog.setPaused(!sseLog.paused);
    refresh();
  }
  function clear() {
    sseLog.clear();
    expanded = null;
    refresh();
  }
</script>

<section
  class="sse-debug"
  class:right={side === 'right'}
  data-side={side}
  aria-label="SSE-felsökning"
  data-total={total}
  data-matched={matched}
  data-paused={paused}
>
  <header>
    <strong>SSE-händelser</strong>
    <span class="rec" class:paused title={paused ? 'Pausad' : 'Spelar in'}
      >{paused ? 'Pausad' : '● Spelar in'}</span
    >
    <span class="count">{total} sparade · {size(storedBytes)}</span>
    <div class="actions">
      <button type="button" class="pause" onclick={togglePause}
        >{paused ? 'Fortsätt' : 'Pausa'}</button
      >
      <button type="button" class="clear" onclick={clear}>Rensa</button>
      <button type="button" class="export" onclick={exportLog}>Exportera JSON</button>
      <button
        type="button"
        class="side"
        aria-label={side === 'left' ? 'Flytta panelen till höger' : 'Flytta panelen till vänster'}
        title={side === 'left' ? 'Flytta till höger' : 'Flytta till vänster'}
        onclick={() => (side = side === 'left' ? 'right' : 'left')}
        >{side === 'left' ? '→' : '←'}</button
      >
      <button
        type="button"
        class="close"
        aria-label="Stäng SSE-panelen"
        onclick={() => setOpen(false)}>×</button
      >
    </div>
  </header>
  {#if paused && skipped > 0}<p class="note">
      {skipped} händelser kom medan loggen var pausad (räknas men sparas inte).
    </p>{/if}
  {#if dropped > 0}<p class="note">
      {dropped} äldsta poster har tagits bort (tak: {sseLog.maxEntries} poster eller {size(
        sseLog.maxBytes,
      )}).
    </p>{/if}

  <button
    type="button"
    class="section-toggle"
    aria-expanded={showStreams}
    onclick={() => (showStreams = !showStreams)}>{showStreams ? '▾' : '▸'} Strömmar</button
  >
  {#if showStreams}
    <table class="channels">
      <thead
        ><tr
          ><th>Ström</th><th>Status</th><th>Händ.</th><th>/s</th><th>kB/s</th><th>Totalt</th><th
            >Fel</th
          ><th title="Återanslutningar">Åter.</th><th>Senaste id</th></tr
        ></thead
      >
      <tbody>
        {#each channels as c (c.channel)}
          <tr data-channel={c.channel} data-events={c.events}>
            <td
              class="mono"
              title={Object.entries(c.byName)
                .map(([n, k]) => `${n}: ${k}`)
                .join(', ')}>{c.channel}</td
            >
            <td
              class="state"
              class:bad={silentFor(c) > 0 || c.readyState === 2}
              title="Tyst = anslutningen är öppen men inga händelser har kommit på över 3 s"
              >{stateOf(c)}</td
            >
            <td class="num">{c.events}</td>
            <td class="num">{rate(c.eventsPerSecond)}</td>
            <td class="num">{rate(c.bytesPerSecond / 1024)}</td>
            <td class="num">{size(c.bytes)}</td>
            <td class="num" class:bad={c.errors > 0}>{c.errors}</td>
            <td class="num">{c.reconnects}</td>
            <td class="mono">{c.lastEventId || '–'}</td>
          </tr>
        {:else}
          <tr><td colspan="9" class="empty">Inga strömmar än.</td></tr>
        {/each}
      </tbody>
    </table>
    <fieldset class="raw">
      <legend
        title="EventSource ser bara händelsenamn som appen lyssnar på. Den råa läsaren öppnar en egen anslutning med fetch() och ser allt: alla namn, kommentarer och retry-fält."
        >Rå läsare (extra anslutning, ser alla händelsenamn)</legend
      >
      {#each streams as s (s)}
        <label
          ><input
            type="checkbox"
            checked={!!sseDebug.raw[s]}
            onchange={(e) => setRaw(s, (e.currentTarget as HTMLInputElement).checked)}
          /><span class="mono">{s}</span></label
        >
      {/each}
    </fieldset>
  {/if}

  <div class="filters">
    <input
      type="search"
      placeholder="Sök i data, id, händelsenamn…"
      aria-label="Sök i SSE-loggen"
      bind:value={text}
    />
    <label class="check"
      ><input type="checkbox" bind:checked={hideLifecycle} /> Dölj anslutningshändelser</label
    >
    <div class="chips" aria-label="Filtrera på ström">
      {#each channels as c (c.channel)}
        <button
          type="button"
          class="chip"
          aria-pressed={channelFilter.includes(c.channel)}
          onclick={() => (channelFilter = toggle(channelFilter, c.channel))}>{c.channel}</button
        >
      {/each}
    </div>
    <div class="chips" aria-label="Filtrera på händelsenamn">
      {#each names as n (n)}
        <button
          type="button"
          class="chip ev"
          aria-pressed={eventFilter.includes(n)}
          onclick={() => (eventFilter = toggle(eventFilter, n))}>{n}</button
        >
      {/each}
    </div>
  </div>

  <p class="shown">
    Visar {rows.length} av {matched}{matched !== total ? ` (filtrerat från ${total})` : ''}, nyast
    först.
  </p>
  <ol class="entries">
    {#each rows as e (e.seq)}
      <li class="entry kind-{e.kind}" class:open={expanded === e.seq} data-event={e.event}>
        <button
          type="button"
          class="row"
          aria-expanded={expanded === e.seq}
          onclick={() => (expanded = expanded === e.seq ? null : e.seq)}
        >
          <span class="time">{clock(e.at)}</span>
          <span class="badge" class:life={isLifecycle(e)}>{e.event}</span>
          <span class="stream">{e.channel}</span>
          {#if e.lastEventId}<span class="id">#{e.lastEventId}</span>{/if}
          {#if e.kind === 'event'}<span class="bytes">{size(e.bytes)}</span>{/if}
          <span class="preview">{preview(e)}</span>
        </button>
        {#if expanded === e.seq}
          <div class="detail">
            <dl>
              <dt>Mottagen</dt>
              <dd>{new Date(e.at).toLocaleString('sv-SE')} ({clock(e.at)})</dd>
              <dt>Ström</dt>
              <dd class="mono">
                {e.stream} ({e.via === 'raw' ? 'rå fetch-läsare' : 'EventSource'})
              </dd>
              <dt>Händelse</dt>
              <dd>{e.event} · post {e.seq} · anslutning {e.connection}</dd>
              {#if e.lastEventId}<dt>lastEventId</dt>
                <dd class="mono">{e.lastEventId}</dd>{/if}
              {#if e.readyState !== undefined}<dt>readyState</dt>
                <dd>{e.readyState} ({STATE[e.readyState]})</dd>{/if}
              {#if e.note}<dt>Anteckning</dt>
                <dd>{e.note}</dd>{/if}
              {#if e.kind === 'event'}<dt>Storlek</dt>
                <dd>
                  {size(e.bytes)} · {parseEntryData(e).ok ? 'JSON' : 'inte JSON, visas som text'}
                </dd>{/if}
            </dl>
            <div class="detail-actions">
              <button type="button" class="copy" onclick={() => copy(e)}
                >{copied === e.seq ? 'Kopierad ✓' : 'Kopiera post'}</button
              >
            </div>
            {#if e.data}<pre class="data">{pretty(e)}</pre>{/if}
          </div>
        {/if}
      </li>
    {:else}
      <li class="empty">
        {total === 0
          ? 'Inga händelser än. Kör backend (Ktor på port 8080) eller slå på en rå läsare.'
          : 'Inga poster matchar filtret.'}
      </li>
    {/each}
  </ol>
  {#if matched > rows.length}<button type="button" class="more" onclick={() => (limit += PAGE)}
      >Visa {Math.min(PAGE, matched - rows.length)} till</button
    >{/if}
</section>

<style>
  .sse-debug {
    position: fixed;
    top: 12px;
    left: 12px;
    bottom: 12px;
    z-index: 1000;
    width: min(620px, calc(100vw - 24px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    overflow: hidden;
    color: #dfe9e9;
    background: #101d24f2;
    border: 1px solid #6a7b79;
    border-radius: 6px;
    box-shadow: 0 6px 24px #0008;
    font-size: 12px;
  }
  .sse-debug.right {
    left: auto;
    right: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  header strong {
    font-size: 13px;
  }
  .rec {
    color: #ff8f80;
    font-size: 11px;
  }
  .rec.paused {
    color: #f0c674;
  }
  .count {
    color: var(--muted);
    font-size: 11px;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }
  button {
    cursor: pointer;
    color: inherit;
    background: #1d3039;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 3px 7px;
  }
  button:hover {
    border-color: #6a7b79;
  }
  .close {
    padding: 1px 8px;
    font-size: 15px;
    line-height: 1;
  }
  .note,
  .shown {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }
  .section-toggle {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--mint);
  }
  .mono,
  .entries,
  .channels td.num {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
  .channels {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .channels th,
  .channels td {
    padding: 2px 4px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }
  .channels th {
    color: var(--muted);
    font-weight: 500;
  }
  .channels td.num {
    text-align: right;
  }
  .channels td:first-child {
    max-width: 210px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bad {
    color: #ff8f80;
  }
  .raw {
    margin: 0;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 11px;
  }
  .raw legend {
    color: var(--muted);
    padding: 0 4px;
  }
  .raw label,
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .filters input[type='search'] {
    flex: 1 1 220px;
    padding: 4px 6px;
    color: inherit;
    background: #0c171d;
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 10px;
  }
  .chip[aria-pressed='true'] {
    background: #3d5a3a;
    border-color: var(--mint);
  }
  .entries {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--line);
    font-size: 11px;
  }
  .entry {
    border-bottom: 1px solid #22323a;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    width: 100%;
    padding: 2px 4px;
    text-align: left;
    background: none;
    border: none;
    border-radius: 0;
    white-space: nowrap;
    overflow: hidden;
  }
  .row:hover,
  .entry.open .row {
    background: #1a2b33;
  }
  .time {
    color: var(--muted);
  }
  .badge {
    padding: 0 5px;
    border-radius: 3px;
    background: #2b4a5a;
    color: #cfe6f0;
  }
  .badge.life {
    background: #3a3a2a;
    color: #f0e0a0;
  }
  .kind-error .badge {
    background: #5a2b2b;
    color: #ffc8c0;
  }
  .kind-comment .badge,
  .kind-retry .badge {
    background: #33334a;
    color: #d0d0ff;
  }
  .stream {
    color: var(--mint);
  }
  .id,
  .bytes {
    color: var(--muted);
  }
  .preview {
    overflow: hidden;
    text-overflow: ellipsis;
    color: #b8c8cc;
  }
  .detail {
    padding: 4px 8px 8px;
    background: #0c171d;
  }
  .detail dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 1px 10px;
    margin: 0 0 6px;
    font-family: Inter, 'Segoe UI', sans-serif;
  }
  .detail dt {
    color: var(--muted);
  }
  .detail dd {
    margin: 0;
    word-break: break-all;
  }
  .detail-actions {
    margin-bottom: 6px;
  }
  .data {
    margin: 0;
    max-height: 50vh;
    overflow: auto;
    padding: 6px;
    background: #071015;
    border: 1px solid var(--line);
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .empty {
    padding: 8px 4px;
    color: var(--muted);
  }
  .more {
    align-self: center;
  }
</style>
