/**
 * SSE debug recorder. Loaded only where the debug tool is available (dev builds, VITE_SSE_DEBUG=1),
 * by SseDebugHost.svelte through a dynamic import.
 *
 * While recording is on (the panel is open) it listens to every EventSource the app created through
 * `tapEventSource` — `open`, `error`, the default `message` event and each named event the app
 * listens for — and writes them to `sseLog`. Recording off removes every listener again, so a closed
 * panel costs nothing per event. The app's own listeners are separate and unaffected.
 *
 * EventSource only delivers named events that someone listens for. The optional raw reader opens its
 * own `fetch()` connection to a stream and parses the text itself, so it sees every event name, the
 * `:` comment lines and `retry:` fields too — at the price of one extra connection to the backend.
 */
import { SseLog, SseTextParser, type SseEntryInput } from './sseLog';
import { setTapListener, type TappedSource } from './sseTap';

/** The streams the backend serves (norrkoping-simulator-backend Application.kt). */
export const KNOWN_STREAMS = ['/api/simulator/stream', '/api/sse/world', '/api/sse/telemetry'];

export const sseLog = new SseLog();

export const sseDebug = $state({
  open: false,
  recording: false,
  /** Raw readers wanted, per stream path. */
  raw: {} as Record<string, boolean>,
  /** Streams the app has opened (or opened before), for the raw toggles. */
  seen: [] as string[],
});

const record = (e: SseEntryInput) => {
  if (sseDebug.recording) sseLog.record(e);
};

// ---- EventSource tap -------------------------------------------------------------------------

const known = new Set<TappedSource>();
const attached = new Map<TappedSource, () => void>();

const noteSeen = (stream: string) => {
  if (!sseDebug.seen.includes(stream)) sseDebug.seen = [...sseDebug.seen, stream];
};

function attach(t: TappedSource, kind: 'create' | 'attach') {
  if (attached.has(t)) return;
  const s = t.source;
  const base = { stream: t.stream, via: 'eventsource' as const, connection: t.id };
  const names = [...new Set(['message', ...t.names])];
  record({
    ...base,
    kind,
    event: kind,
    lastEventId: '',
    data: '',
    readyState: s.readyState,
    note: `Lyssnar på: ${names.join(', ')}`,
  });
  let opened = s.readyState === EventSource.OPEN;
  const onOpen = () => {
    record({
      ...base,
      kind: opened ? 'reconnect' : 'open',
      event: opened ? 'reconnect' : 'open',
      lastEventId: '',
      data: '',
      readyState: s.readyState,
    });
    opened = true;
  };
  const onError = () =>
    record({
      ...base,
      kind: 'error',
      event: 'error',
      lastEventId: '',
      data: '',
      readyState: s.readyState,
      note:
        s.readyState === EventSource.CLOSED
          ? 'Stängd av webbläsaren — ingen ny anslutning (t.ex. fel statuskod eller innehållstyp)'
          : 'Anslutningen bröts eller kunde inte öppnas — webbläsaren försöker igen',
    });
  const onMessage = (e: Event) => {
    const m = e as MessageEvent;
    record({
      ...base,
      kind: 'event',
      event: m.type,
      lastEventId: m.lastEventId,
      data: typeof m.data === 'string' ? m.data : String(m.data),
      readyState: s.readyState,
    });
  };
  s.addEventListener('open', onOpen);
  s.addEventListener('error', onError);
  for (const n of names) s.addEventListener(n, onMessage);
  attached.set(t, () => {
    s.removeEventListener('open', onOpen);
    s.removeEventListener('error', onError);
    for (const n of names) s.removeEventListener(n, onMessage);
  });
}

function detach(t: TappedSource) {
  attached.get(t)?.();
  attached.delete(t);
}

for (const t of setTapListener({
  added(t) {
    known.add(t);
    noteSeen(t.stream);
    if (sseDebug.recording) attach(t, 'create');
  },
  removed(t) {
    known.delete(t);
    if (attached.has(t)) {
      detach(t);
      record({
        stream: t.stream,
        via: 'eventsource',
        connection: t.id,
        kind: 'close',
        event: 'close',
        lastEventId: '',
        data: '',
        readyState: EventSource.CLOSED,
        note: 'Appen stängde anslutningen',
      });
    }
  },
})) {
  known.add(t);
  noteSeen(t.stream);
}

// ---- Raw fetch reader --------------------------------------------------------------------------

let nextRawId = 1;
class RawReader {
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private opened = false;
  private retryMs = 3000;
  private lastEventId = '';
  constructor(readonly stream: string) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.abort) {
      this.abort.abort();
      this.abort = null;
    }
  }

  private rec(e: Omit<SseEntryInput, 'stream' | 'via'>) {
    record({ stream: this.stream, via: 'raw', ...e });
  }

  private async connect() {
    if (this.stopped) return;
    const connection = nextRawId++;
    const abort = new AbortController();
    this.abort = abort;
    const life = (kind: SseEntryInput['kind'], note?: string, readyState?: number) =>
      this.rec({ kind, event: kind, lastEventId: '', data: '', connection, note, readyState });
    life('create', 'Rå läsare (fetch): egen anslutning som ser alla händelser', 0);
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId;
      const res = await fetch(this.stream, { headers, cache: 'no-store', signal: abort.signal });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !res.body) {
        life('error', `HTTP ${res.status} ${res.statusText}`.trim(), 0);
        return this.later();
      }
      if (!type.toLowerCase().startsWith('text/event-stream'))
        life('error', `Oväntad innehållstyp: ${type || '(saknas)'} — läser ändå`, 1);
      life(this.opened ? 'reconnect' : 'open', `HTTP ${res.status}`, 1);
      this.opened = true;
      const parser = new SseTextParser();
      parser.lastEventId = this.lastEventId;
      let retryLogged = false;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const item of parser.feed(value)) {
          this.lastEventId = item.lastEventId;
          if (item.type === 'retry') {
            // The backend (Ktor) repeats `retry: 1500` in every event: log only changes.
            if (item.retry === this.retryMs && retryLogged) continue;
            retryLogged = true;
            this.retryMs = item.retry!;
            this.rec({
              kind: 'retry',
              event: 'retry',
              lastEventId: item.lastEventId,
              data: String(item.retry),
              connection,
              note: `Servern ber om ${item.retry} ms mellan återanslutningar (visas bara när värdet ändras)`,
            });
          } else if (item.type === 'comment') {
            this.rec({
              kind: 'comment',
              event: 'comment',
              lastEventId: item.lastEventId,
              data: item.comment ?? '',
              connection,
            });
          } else {
            this.rec({
              kind: 'event',
              event: item.event,
              lastEventId: item.lastEventId,
              data: item.data,
              connection,
              readyState: 1,
            });
          }
        }
      }
      parser.end();
      life('error', 'Servern avslutade strömmen', 0);
    } catch (e) {
      if (abort.signal.aborted) {
        life('close', 'Rå läsare stoppad', 2);
        return;
      }
      life('error', e instanceof Error ? e.message : String(e), 0);
    }
    this.later();
  }

  private later() {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.connect(), this.retryMs);
  }
}

const rawReaders = new Map<string, RawReader>();

function syncRaw() {
  for (const [stream, reader] of rawReaders)
    if (!sseDebug.recording || !sseDebug.raw[stream]) {
      reader.stop();
      rawReaders.delete(stream);
    }
  if (!sseDebug.recording) return;
  for (const [stream, on] of Object.entries(sseDebug.raw))
    if (on && !rawReaders.has(stream)) {
      const r = new RawReader(stream);
      rawReaders.set(stream, r);
      r.start();
    }
}

export function setRaw(stream: string, on: boolean) {
  sseDebug.raw = { ...sseDebug.raw, [stream]: on };
  syncRaw();
}

// ---- Recording on / off ------------------------------------------------------------------------

export function setRecording(on: boolean) {
  if (sseDebug.recording === on) return;
  sseDebug.recording = on;
  if (on) for (const t of known) attach(t, 'attach');
  else for (const t of [...attached.keys()]) detach(t);
  syncRaw();
}

export function setOpen(on: boolean) {
  sseDebug.open = on;
}

/** Hook for Playwright and the browser console (only in builds where the tool exists). */
(globalThis as unknown as { __sseLog: unknown }).__sseLog = {
  log: sseLog,
  open: () => setOpen(true),
  close: () => setOpen(false),
  get recording() {
    return sseDebug.recording;
  },
  get listeners() {
    return attached.size;
  },
  get rawReaders() {
    return rawReaders.size;
  },
  setRaw,
  entries: () => sseLog.entries(),
  channels: () => sseLog.channels(),
  export: () => sseLog.toExport(),
};
