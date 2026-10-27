// Keeps a server-sent event stream alive.
//
// The browser's EventSource reconnects by itself only after a network error. Two cases slip past it:
// - Silence: through the Vite dev proxy a stopped backend leaves the browser's connection open with
//   no error, so the stream just goes quiet and EventSource waits forever.
// - Closed: when a reconnect gets an HTTP error (for example 502/504 from a proxy while the backend
//   is down) EventSource gives up for good (readyState CLOSED) and never tries again.
// watchStream treats both as "down": it reports it (so the UI can show that it is reconnecting) and
// opens a new EventSource, waiting longer after each failed try. The backend publishes every
// 100 ms (city, world) or 500 ms (telemetry), also while paused, so a few seconds of silence means
// the connection is dead.

/** EventSource.readyState CLOSED (kept here so the module does not need the browser global). */
export const SSE_CLOSED = 2;

/** The part of EventSource this module uses (a real EventSource satisfies it). */
export interface StreamSource {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export type DownReason = 'silent' | 'closed';

export interface WatchOptions<S extends StreamSource> {
  /** Creates a new source with the app's own listeners attached. Called again on every reconnect. */
  open: () => S;
  /** Event names whose arrival proves the stream is alive (the app's named events). */
  events: readonly string[];
  /** Called when the stream is found dead, before the reconnect is scheduled. */
  onDown?: (reason: DownReason) => void;
  /** No event for this long while open = dead. Default 5 000 ms. */
  silentMs?: number;
  /** How often silence is checked. Default 1 000 ms. */
  checkMs?: number;
  /** Wait before reconnect attempt n (1, 2, …). Default 0, 1, 2, 4, 8, then 10 s. */
  retryDelay?: (attempt: number) => number;
  now?: () => number;
}

export interface StreamWatch<S extends StreamSource> {
  /** The source currently in use (replaced on every reconnect). */
  readonly source: S | undefined;
  /** Reconnect attempts since the last event arrived. */
  readonly attempts: number;
  /** Closes the source and stops watching. */
  stop(): void;
}

export const DEFAULT_SILENT_MS = 5000;

export function defaultRetryDelay(attempt: number): number {
  return attempt <= 1 ? 0 : Math.min(1000 * 2 ** (attempt - 2), 10000);
}

export function watchStream<S extends StreamSource>(options: WatchOptions<S>): StreamWatch<S> {
  const silentMs = options.silentMs ?? DEFAULT_SILENT_MS;
  const checkMs = options.checkMs ?? 1000;
  const retryDelay = options.retryDelay ?? defaultRetryDelay;
  const now = options.now ?? (() => Date.now());
  let source: S | undefined;
  let lastActivity = now();
  let attempts = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    retryTimer = undefined;
    if (stopped) return;
    const s = options.open();
    source = s;
    lastActivity = now();
    const alive = () => {
      if (source !== s) return;
      lastActivity = now();
      attempts = 0;
    };
    for (const name of options.events) s.addEventListener(name, alive);
    // 'open' only restarts the silence clock: a proxy can answer before the backend sends anything.
    s.addEventListener('open', () => {
      if (source === s) lastActivity = now();
    });
    s.addEventListener('error', () => {
      if (source === s && s.readyState === SSE_CLOSED) down('closed');
    });
  };

  const down = (reason: DownReason) => {
    if (stopped || retryTimer !== undefined) return;
    source?.close();
    attempts++;
    options.onDown?.(reason);
    retryTimer = setTimeout(connect, retryDelay(attempts));
  };

  const check = setInterval(() => {
    if (stopped || retryTimer !== undefined || !source) return;
    if (source.readyState === SSE_CLOSED) down('closed');
    else if (now() - lastActivity > silentMs) down('silent');
  }, checkMs);

  connect();
  return {
    get source() {
      return source;
    },
    get attempts() {
      return attempts;
    },
    stop() {
      stopped = true;
      clearInterval(check);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
      source?.close();
    },
  };
}
