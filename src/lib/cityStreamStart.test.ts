import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeEventSource {
  static created: FakeEventSource[] = [];
  readyState = 0;
  private listeners = new Map<string, ((e: Event) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.created.push(this);
  }
  addEventListener(type: string, listener: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: string) {
    const event = Object.assign(new Event(type), { data }) as MessageEvent<string>;
    for (const l of this.listeners.get(type) ?? []) l(event);
    return event;
  }
  close() {
    this.readyState = 2;
  }
}

// Fresh module state per test (the early stream is module-level).
const load = () => import('./cityStreamStart');

describe('cityStreamStart', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeEventSource.created = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the city stream at start and hands it over once', async () => {
    const { startCityStream, takeCityStream, CITY_STREAM_URL } = await load();
    startCityStream();
    startCityStream(); // a second call does not open another stream
    expect(FakeEventSource.created.map((s) => s.url)).toEqual([CITY_STREAM_URL]);
    const first = takeCityStream();
    expect(first.source).toBe(FakeEventSource.created[0]);
    expect(first.last).toBeNull();
    // Later takes (reconnects) open new streams.
    const second = takeCityStream();
    expect(second.source).toBe(FakeEventSource.created[1]);
    expect(second.source).not.toBe(first.source);
  });

  it('keeps only the latest snapshot that arrived before the app took the stream', async () => {
    const { startCityStream, takeCityStream } = await load();
    startCityStream();
    const source = FakeEventSource.created[0];
    source.emit('city', '{"sequence":1}');
    const latest = source.emit('city', '{"sequence":2}');
    const taken = takeCityStream();
    expect(taken.last).toBe(latest);
    // After the hand-over the early listener no longer records anything.
    source.emit('city', '{"sequence":3}');
    expect(taken.last?.data).toBe('{"sequence":2}');
  });

  it('opens nothing early while offline; the app then opens its own stream', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { startCityStream, takeCityStream } = await load();
    startCityStream();
    expect(FakeEventSource.created).toHaveLength(0);
    const taken = takeCityStream();
    expect(FakeEventSource.created).toHaveLength(1);
    expect(taken.last).toBeNull();
  });

  it('does nothing where EventSource is missing', async () => {
    vi.stubGlobal('EventSource', undefined);
    const { startCityStream } = await load();
    expect(() => startCityStream()).not.toThrow();
  });
});
