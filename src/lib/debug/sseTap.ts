/**
 * SSE debug tap: the only piece the SSE consumers (world.svelte.ts, city.svelte.ts) import.
 *
 * `tapEventSource(source, names)` returns the same EventSource unchanged. In builds without the
 * debug tool (production without VITE_SSE_DEBUG=1) it does nothing at all. Where the tool is
 * available it only remembers the connection (and wraps `close()` so the log can see the app close
 * it); no listeners are added and nothing is recorded until the debug panel turns recording on
 * (sseRecorder.svelte.ts). The consumers' own listeners and handlers are never touched.
 */

/** The debug tool exists in development builds and in builds made with VITE_SSE_DEBUG=1. */
export const sseDebugAvailable = import.meta.env.DEV || import.meta.env.VITE_SSE_DEBUG === '1';

export interface TappedSource {
  source: EventSource;
  /** URL path (and query), e.g. `/api/simulator/stream`. */
  stream: string;
  /** Named events the app listens for. EventSource can only deliver names someone listens to. */
  names: readonly string[];
  /** Connection number, one per EventSource object. */
  id: number;
}

export interface TapListener {
  added(t: TappedSource): void;
  removed(t: TappedSource): void;
}

const live = new Set<TappedSource>();
let listener: TapListener | null = null;
let nextId = 1;

export const streamPath = (url: string) => {
  try {
    const u = new URL(url, globalThis.location?.href ?? 'http://localhost/');
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

export function tapEventSource<T extends EventSource>(source: T, names: readonly string[]): T {
  if (!sseDebugAvailable) return source;
  const t: TappedSource = {
    source,
    stream: streamPath(source.url),
    names: [...names],
    id: nextId++,
  };
  live.add(t);
  const close = source.close;
  source.close = function (this: EventSource) {
    close.call(source);
    if (live.delete(t)) listener?.removed(t);
  };
  listener?.added(t);
  return source;
}

/** Called by the recorder when it loads; returns the connections that already exist. */
export function setTapListener(l: TapListener | null): TappedSource[] {
  listener = l;
  return [...live];
}
