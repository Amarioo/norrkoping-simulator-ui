/**
 * SSE debug log: the pure part (no DOM, no Svelte), so it can be unit tested in Node.
 *
 * - `SseLog` keeps the newest entries in a ring buffer capped by entry count AND by the total size
 *   of the stored `data` strings, so memory stays bounded however large the snapshots are. Per-stream
 *   counters (events, bytes, errors, opens, reconnects, events per second) keep counting while the
 *   log is paused and after old entries have been dropped.
 * - `parseEntryData` parses an entry's `data` as JSON on demand (cached), with a plain-text fallback.
 * - `filterEntries` filters by channel, event name and free text.
 * - `SseTextParser` reads the raw `text/event-stream` format (used by the panel's raw fetch reader,
 *   which, unlike EventSource, sees every event name, comments and `retry:` fields).
 */

/** What an entry records: a delivered event, a comment line, or a connection lifecycle step. */
export type SseEntryKind =
  | 'event' // a dispatched SSE event (named or default `message`)
  | 'comment' // a `:` comment line (raw reader only; EventSource never exposes these)
  | 'retry' // a `retry:` field (raw reader only)
  | 'create' // a new connection object was created by the app
  | 'attach' // the debug log started listening to an already existing connection
  | 'open' // the connection opened (first time)
  | 'reconnect' // the connection opened again after an error (browser auto-reconnect or raw retry)
  | 'error' // connection error (EventSource then retries by itself unless readyState is CLOSED)
  | 'close'; // the app (or the raw reader) closed the connection

/** How the data was received. */
export type SseVia = 'eventsource' | 'raw';

export interface SseEntry {
  /** Running number in this log (1, 2, 3, …), also the list key. */
  seq: number;
  /** Receive time, epoch ms (Date.now()). */
  at: number;
  /** Receive time, performance.now() ms (monotonic, for rates). */
  t: number;
  /** Stream URL path, e.g. `/api/simulator/stream`. */
  stream: string;
  via: SseVia;
  /** `stream` for EventSource, `stream [rå]` for the raw reader. Filters and counters use this. */
  channel: string;
  kind: SseEntryKind;
  /** Event name (`message` when the server sent none); the kind for lifecycle entries. */
  event: string;
  lastEventId: string;
  /** Raw data exactly as received ('' for lifecycle entries). */
  data: string;
  /** UTF-8 size of `data` in bytes. */
  bytes: number;
  /** Connection number: one per EventSource object / raw fetch attempt. */
  connection: number;
  /** EventSource.readyState at the time (0 connecting, 1 open, 2 closed), if known. */
  readyState?: number;
  note?: string;
}

export type SseEntryInput = Omit<SseEntry, 'seq' | 'at' | 't' | 'channel' | 'bytes'> & {
  at?: number;
  t?: number;
};

export const channelOf = (stream: string, via: SseVia) =>
  via === 'raw' ? `${stream} [rå]` : stream;

// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x00-\x7f]/;
/** UTF-8 byte length without allocating an encoded copy. */
export function utf8Length(s: string): number {
  // Fast path: pure ASCII (the backend's JSON) is one byte per character; a native regex scan is
  // much cheaper than the loop below on ~50 kB snapshots.
  if (!NON_ASCII.test(s)) return s.length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3; // lone high surrogate → U+FFFD (3 bytes)
    } else n += 3;
  }
  return n;
}

/** Fixed-capacity ring buffer, oldest overwritten first. */
export class RingBuffer<T> {
  private items: (T | undefined)[];
  private start = 0;
  private count = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('capacity must be ≥ 1');
    this.items = new Array(capacity);
  }
  get size() {
    return this.count;
  }
  /** Adds an item; returns the item it pushed out, if the buffer was full. */
  push(item: T): T | undefined {
    if (this.count < this.capacity) {
      this.items[(this.start + this.count) % this.capacity] = item;
      this.count++;
      return undefined;
    }
    const evicted = this.items[this.start];
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
    return evicted;
  }
  /** Removes and returns the oldest item. */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.items[this.start];
    this.items[this.start] = undefined;
    this.start = (this.start + 1) % this.capacity;
    this.count--;
    return item;
  }
  /** Oldest first. */
  toArray(): T[] {
    const out: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.items[(this.start + i) % this.capacity]!;
    return out;
  }
  /** Newest first. */
  newestFirst(): T[] {
    const out: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++)
      out[i] = this.items[(this.start + this.count - 1 - i) % this.capacity]!;
    return out;
  }
  clear() {
    this.items = new Array(this.capacity);
    this.start = 0;
    this.count = 0;
  }
}

export type ParsedData =
  { ok: true; value: unknown } | { ok: false; error: string; empty: boolean };

const parsedCache = new WeakMap<SseEntry, ParsedData>();
/** Parses `data` as JSON; falls back to text (ok: false) when it is not JSON. */
export function parseData(raw: string): ParsedData {
  if (raw.trim() === '') return { ok: false, error: 'tom data', empty: true };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), empty: false };
  }
}
/** `parseData` for an entry, cached so expanding / copying / exporting parses once. */
export function parseEntryData(entry: SseEntry): ParsedData {
  let p = parsedCache.get(entry);
  if (!p) {
    p = parseData(entry.data);
    parsedCache.set(entry, p);
  }
  return p;
}

export interface ChannelStats {
  channel: string;
  stream: string;
  via: SseVia;
  /** Events delivered (kind 'event'), including ones not stored because the log was paused. */
  events: number;
  bytes: number;
  comments: number;
  opens: number;
  reconnects: number;
  errors: number;
  closes: number;
  /** Events per event name. */
  byName: Record<string, number>;
  lastEventAt: number | null;
  lastEventId: string;
  /** Last known readyState (0 connecting, 1 open, 2 closed). */
  readyState: number | null;
  /** performance.now() of recent events (trimmed to the rate window). */
  recent: number[];
  recentBytes: number[];
}

export interface SseLogOptions {
  /** Most entries kept (oldest dropped). */
  maxEntries?: number;
  /** Most total `data` bytes kept (oldest dropped), so big snapshots can't fill memory. */
  maxBytes?: number;
  /** Window for events/second and bytes/second. */
  rateWindowMs?: number;
}
export const DEFAULT_MAX_ENTRIES = 1000;
export const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_RATE_WINDOW_MS = 5000;

export class SseLog {
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly rateWindowMs: number;
  private buffer: RingBuffer<SseEntry>;
  private storedBytes = 0;
  private stats = new Map<string, ChannelStats>();
  private nextSeq = 1;
  /** Increments on every change; the panel redraws only when it moved. */
  version = 0;
  paused = false;
  /** Entries not stored because the log was paused. */
  skipped = 0;
  /** Entries dropped to stay within the caps. */
  dropped = 0;

  constructor(options: SseLogOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.rateWindowMs = options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
    this.buffer = new RingBuffer(this.maxEntries);
  }

  get size() {
    return this.buffer.size;
  }
  get bytesStored() {
    return this.storedBytes;
  }

  private statsFor(stream: string, via: SseVia): ChannelStats {
    const channel = channelOf(stream, via);
    let s = this.stats.get(channel);
    if (!s) {
      s = {
        channel,
        stream,
        via,
        events: 0,
        bytes: 0,
        comments: 0,
        opens: 0,
        reconnects: 0,
        errors: 0,
        closes: 0,
        byName: {},
        lastEventAt: null,
        lastEventId: '',
        readyState: null,
        recent: [],
        recentBytes: [],
      };
      this.stats.set(channel, s);
    }
    return s;
  }

  /** Records one entry. Returns it, or null when the log is paused (counters still update). */
  record(input: SseEntryInput): SseEntry | null {
    const t = input.t ?? globalThis.performance?.now() ?? Date.now();
    const at = input.at ?? Date.now();
    const bytes = utf8Length(input.data);
    const s = this.statsFor(input.stream, input.via);
    if (input.readyState !== undefined) s.readyState = input.readyState;
    switch (input.kind) {
      case 'event':
        s.events++;
        s.bytes += bytes;
        s.byName[input.event] = (s.byName[input.event] ?? 0) + 1;
        s.lastEventAt = at;
        s.lastEventId = input.lastEventId;
        s.recent.push(t);
        s.recentBytes.push(bytes);
        this.trim(s, t);
        break;
      case 'comment':
        s.comments++;
        break;
      case 'open':
        s.opens++;
        break;
      case 'reconnect':
        s.opens++;
        s.reconnects++;
        break;
      case 'error':
        s.errors++;
        break;
      case 'close':
        s.closes++;
        s.readyState = 2;
        break;
    }
    this.version++;
    if (this.paused) {
      this.skipped++;
      return null;
    }
    const entry: SseEntry = {
      ...input,
      seq: this.nextSeq++,
      at,
      t,
      channel: s.channel,
      bytes,
    };
    const evicted = this.buffer.push(entry);
    this.storedBytes += bytes;
    if (evicted) {
      this.storedBytes -= evicted.bytes;
      this.dropped++;
    }
    // Byte cap: drop oldest until within it, but always keep the newest entry.
    while (this.storedBytes > this.maxBytes && this.buffer.size > 1) {
      const old = this.buffer.shift()!;
      this.storedBytes -= old.bytes;
      this.dropped++;
    }
    return entry;
  }

  private trim(s: ChannelStats, now: number) {
    const cutoff = now - this.rateWindowMs;
    let i = 0;
    while (i < s.recent.length && s.recent[i] < cutoff) i++;
    if (i > 0) {
      s.recent.splice(0, i);
      s.recentBytes.splice(0, i);
    }
  }

  /** Newest first. */
  entries(): SseEntry[] {
    return this.buffer.newestFirst();
  }

  /** Per-channel counters, with events/s and bytes/s over the rate window ending at `now`. */
  channels(now = globalThis.performance?.now() ?? Date.now()) {
    return [...this.stats.values()]
      .map((s) => {
        this.trim(s, now);
        const seconds = this.rateWindowMs / 1000;
        const recentBytes = s.recentBytes.reduce((a, b) => a + b, 0);
        return {
          channel: s.channel,
          stream: s.stream,
          via: s.via,
          events: s.events,
          bytes: s.bytes,
          comments: s.comments,
          opens: s.opens,
          reconnects: s.reconnects,
          errors: s.errors,
          closes: s.closes,
          byName: { ...s.byName },
          lastEventAt: s.lastEventAt,
          lastEventId: s.lastEventId,
          readyState: s.readyState,
          eventsPerSecond: s.recent.length / seconds,
          bytesPerSecond: recentBytes / seconds,
        };
      })
      .sort((a, b) => a.channel.localeCompare(b.channel));
  }

  /** Every event name seen so far (lifecycle kinds excluded). */
  eventNames(): string[] {
    const names = new Set<string>();
    for (const s of this.stats.values()) for (const n of Object.keys(s.byName)) names.add(n);
    return [...names].sort();
  }

  clear() {
    this.buffer.clear();
    this.storedBytes = 0;
    this.stats.clear();
    this.skipped = 0;
    this.dropped = 0;
    this.version++;
  }

  setPaused(on: boolean) {
    this.paused = on;
    this.version++;
  }

  /** The whole log as a plain object for a JSON file (data parsed where it is JSON). */
  toExport(now = Date.now()) {
    return {
      format: 'norrkoping-sse-debug-log/v1',
      exportedAt: new Date(now).toISOString(),
      caps: { maxEntries: this.maxEntries, maxBytes: this.maxBytes },
      stored: this.size,
      dropped: this.dropped,
      skippedWhilePaused: this.skipped,
      channels: this.channels(),
      entries: this.buffer.toArray().map(exportEntry),
    };
  }
}

/** One entry for copy / export: everything recorded, plus `json` when the data parses. */
export function exportEntry(e: SseEntry) {
  const p = e.kind === 'event' ? parseEntryData(e) : null;
  return {
    seq: e.seq,
    receivedAt: new Date(e.at).toISOString(),
    stream: e.stream,
    via: e.via,
    kind: e.kind,
    event: e.event,
    lastEventId: e.lastEventId,
    connection: e.connection,
    readyState: e.readyState,
    note: e.note,
    bytes: e.bytes,
    data: e.data,
    json: p?.ok ? p.value : undefined,
    jsonError: p && !p.ok && !p.empty ? p.error : undefined,
  };
}

export interface SseFilter {
  /** Channels to show; empty or missing = all. */
  channels?: ReadonlySet<string>;
  /** Event names to show (kind 'event'); empty or missing = all. Lifecycle entries use their kind. */
  events?: ReadonlySet<string>;
  /** Hide lifecycle entries (open, error, …). */
  hideLifecycle?: boolean;
  /** Case-insensitive text search in stream, event name, id, note and raw data. */
  text?: string;
}

const LIFECYCLE: ReadonlySet<SseEntryKind> = new Set([
  'create',
  'attach',
  'open',
  'reconnect',
  'error',
  'close',
]);
export const isLifecycle = (e: SseEntry) => LIFECYCLE.has(e.kind);

export function filterEntries(entries: readonly SseEntry[], f: SseFilter): SseEntry[] {
  const text = f.text?.trim().toLowerCase() ?? '';
  const channels = f.channels && f.channels.size > 0 ? f.channels : null;
  const events = f.events && f.events.size > 0 ? f.events : null;
  return entries.filter((e) => {
    if (channels && !channels.has(e.channel)) return false;
    const lifecycle = isLifecycle(e);
    if (lifecycle && f.hideLifecycle) return false;
    if (events && !lifecycle && !events.has(e.event)) return false;
    if (text) {
      const hay = `${e.stream}\n${e.event}\n${e.lastEventId}\n${e.note ?? ''}\n${e.data}`;
      if (!hay.toLowerCase().includes(text)) return false;
    }
    return true;
  });
}

export interface ParsedSseItem {
  type: 'event' | 'comment' | 'retry';
  /** Event name, `message` when none was given. */
  event: string;
  data: string;
  /** Last event ID after this item (it carries over between events, as in EventSource). */
  lastEventId: string;
  /** For `retry`: the reconnection time in ms. For comments: undefined. */
  retry?: number;
  /** Comment text (without the leading ':'). */
  comment?: string;
}

/**
 * Incremental parser for the `text/event-stream` format, following the HTML standard's rules
 * (https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation):
 * lines end in CRLF, LF or CR; `data:` lines join with '\n'; an empty line dispatches; an event with
 * no data is not dispatched; `id` containing NUL is ignored; `retry` must be all digits; unknown
 * fields are ignored. Unlike EventSource it also reports comments and retry fields.
 */
export class SseTextParser {
  private buffer = '';
  private pendingCR = false;
  private data: string[] = [];
  private hasData = false;
  private eventName = '';
  lastEventId = '';
  private idBuffer = '';
  private bom = true;

  /** Feeds a decoded text chunk; returns the items completed by it. */
  feed(chunk: string): ParsedSseItem[] {
    const out: ParsedSseItem[] = [];
    let text = chunk;
    if (this.bom) {
      if (text.length === 0) return out;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      this.bom = false;
    }
    if (text.length === 0) return out;
    // A chunk ending in CR: a following LF belongs to the same line break.
    if (this.pendingCR && text.startsWith('\n')) text = text.slice(1);
    this.pendingCR = false;
    const buf = this.buffer + text;
    // Find line breaks with native indexOf (much faster than a per-character loop on ~50 kB lines).
    let start = 0;
    let lf = buf.indexOf('\n');
    let cr = buf.indexOf('\r');
    for (;;) {
      if (lf !== -1 && lf < start) lf = buf.indexOf('\n', start);
      if (cr !== -1 && cr < start) cr = buf.indexOf('\r', start);
      let i = lf === -1 ? cr : cr === -1 ? lf : Math.min(lf, cr);
      if (i === -1) break;
      const line = buf.slice(start, i);
      if (i === cr) {
        if (i + 1 < buf.length) {
          if (buf.charCodeAt(i + 1) === 10) i++;
        } else this.pendingCR = true;
      }
      start = i + 1;
      this.line(line, out);
    }
    this.buffer = buf.slice(start);
    return out;
  }

  /** End of stream: an incomplete event is discarded (as the standard says). */
  end(): ParsedSseItem[] {
    this.buffer = '';
    this.data = [];
    this.hasData = false;
    this.eventName = '';
    return [];
  }

  private line(line: string, out: ParsedSseItem[]) {
    if (line === '') {
      this.lastEventId = this.idBuffer;
      if (this.hasData) {
        out.push({
          type: 'event',
          event: this.eventName || 'message',
          data: this.data.join('\n'),
          lastEventId: this.lastEventId,
        });
      }
      this.data = [];
      this.hasData = false;
      this.eventName = '';
      return;
    }
    if (line.startsWith(':')) {
      out.push({
        type: 'comment',
        event: 'comment',
        data: '',
        comment: line.slice(1).replace(/^ /, ''),
        lastEventId: this.lastEventId,
      });
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        this.eventName = value;
        break;
      case 'data':
        this.data.push(value);
        this.hasData = true;
        break;
      case 'id':
        if (!value.includes('\0')) this.idBuffer = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value))
          out.push({
            type: 'retry',
            event: 'retry',
            data: '',
            retry: Number(value),
            lastEventId: this.lastEventId,
          });
        break;
    }
  }
}
