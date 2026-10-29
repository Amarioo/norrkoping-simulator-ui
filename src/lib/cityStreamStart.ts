/**
 * Opens the simulator stream as early as possible (main.ts), before the map data is parsed and
 * the scene is built. Those steps keep the main thread busy for seconds, and the browser only
 * sends an EventSource's request, and only handles its reply, when the main thread is free. Opened
 * here, the request goes out at once and the first snapshot is waiting when the app mounts.
 * city.connect() takes over the stream; this module must not import the map data (terrain.ts).
 */
import { tapEventSource } from './debug/sseTap';

export const CITY_STREAM_URL = '/api/simulator/stream';

let early: { source: EventSource; last: MessageEvent<string> | null } | null = null;

export function startCityStream() {
  if (early || typeof EventSource === 'undefined' || !navigator.onLine) return;
  const source = tapEventSource(new EventSource(CITY_STREAM_URL), ['city']);
  const started = { source, last: null as MessageEvent<string> | null };
  // Keeps only the latest snapshot that arrives before the app listens.
  source.addEventListener('city', (e) => {
    if (early === started) started.last = e as MessageEvent<string>;
  });
  early = started;
}

/** The early stream with its latest snapshot (once), or a new stream. */
export function takeCityStream(): { source: EventSource; last: MessageEvent<string> | null } {
  const taken = early;
  early = null;
  return (
    taken ?? { source: tapEventSource(new EventSource(CITY_STREAM_URL), ['city']), last: null }
  );
}
