import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRetryDelay, SSE_CLOSED, watchStream, type StreamSource } from './sseWatchdog';

class FakeSource implements StreamSource {
  readyState = 0;
  closed = false;
  private listeners = new Map<string, ((e: Event) => void)[]>();
  addEventListener(type: string, listener: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    if (type === 'open') this.readyState = 1;
    for (const l of this.listeners.get(type) ?? []) l(new Event(type));
  }
  /** What EventSource does when a reconnect gets an HTTP error: CLOSED, then one 'error' event. */
  fail() {
    this.readyState = SSE_CLOSED;
    this.emit('error');
  }
  close() {
    this.readyState = SSE_CLOSED;
    this.closed = true;
  }
}

describe('watchStream', () => {
  let sources: FakeSource[];
  let downs: string[];
  const start = (extra: { silentMs?: number } = {}) =>
    watchStream({
      open: () => {
        const s = new FakeSource();
        sources.push(s);
        return s;
      },
      events: ['city'],
      onDown: (reason) => downs.push(reason),
      ...extra,
    });
  beforeEach(() => {
    vi.useFakeTimers();
    sources = [];
    downs = [];
  });
  afterEach(() => vi.useRealTimers());

  it('leaves a stream that keeps sending alone', () => {
    const w = start();
    sources[0].emit('open');
    for (let i = 0; i < 300; i++) {
      vi.advanceTimersByTime(100);
      sources[0].emit('city');
    }
    expect(sources).toHaveLength(1);
    expect(downs).toEqual([]);
    expect(w.attempts).toBe(0);
    w.stop();
  });

  it('reconnects when the stream goes silent while open (backend stopped behind a proxy)', () => {
    const w = start();
    sources[0].emit('open');
    sources[0].emit('city');
    vi.advanceTimersByTime(5000);
    expect(sources).toHaveLength(1); // 5 s exactly is still fine
    vi.advanceTimersByTime(1000);
    expect(downs).toEqual(['silent']);
    expect(sources[0].closed).toBe(true);
    // First retry is immediate (a 0 ms timer set during a fake-timer tick runs 1 ms later).
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    expect(w.source).toBe(sources[1]);
    w.stop();
  });

  it('an open without events is not proof of life', () => {
    const w = start();
    vi.advanceTimersByTime(3000);
    sources[0].emit('open');
    vi.advanceTimersByTime(5000);
    expect(sources[0].readyState).toBe(1);
    expect(downs).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(downs).toEqual(['silent']);
    w.stop();
  });

  it('reconnects at once when the browser gives up (readyState CLOSED after an HTTP error)', () => {
    const w = start();
    sources[0].fail();
    expect(downs).toEqual(['closed']);
    vi.advanceTimersByTime(0);
    expect(sources).toHaveLength(2);
    w.stop();
  });

  it('a transient error while the browser retries by itself is left to the browser', () => {
    const w = start();
    sources[0].emit('open');
    sources[0].readyState = 0; // CONNECTING: EventSource retries after its retry: delay
    sources[0].emit('error');
    expect(downs).toEqual([]);
    sources[0].emit('open');
    sources[0].emit('city');
    vi.advanceTimersByTime(4000);
    expect(sources).toHaveLength(1);
    w.stop();
  });

  it('backs off while the backend stays down, and resets once events arrive again', () => {
    const w = start();
    sources[0].fail();
    vi.advanceTimersByTime(0);
    // Backend still down: every new connection fails at once.
    const times: number[] = [];
    let t = 0;
    for (let i = 0; i < 5; i++) {
      const before = sources.length;
      sources.at(-1)!.fail();
      while (sources.length === before) {
        vi.advanceTimersByTime(100);
        t += 100;
      }
      times.push(t);
      t = 0;
    }
    expect(times).toEqual([1000, 2000, 4000, 8000, 10000]);
    expect(w.attempts).toBe(6);
    // Backend back: the next connection delivers events and the counter resets.
    sources.at(-1)!.emit('open');
    sources.at(-1)!.emit('city');
    expect(w.attempts).toBe(0);
    w.stop();
  });

  it('ignores late events from a replaced source', () => {
    const w = start();
    const old = sources[0];
    old.fail();
    vi.advanceTimersByTime(0);
    old.emit('city');
    expect(w.attempts).toBe(1);
    w.stop();
  });

  it('stop closes the source and cancels a pending reconnect', () => {
    const w = start();
    sources[0].fail();
    sources[0].fail();
    expect(downs).toEqual(['closed']); // one reconnect scheduled, not two
    w.stop();
    vi.advanceTimersByTime(60000);
    expect(sources).toHaveLength(1);
  });

  it('stop on a live stream closes it and stops checking', () => {
    const w = start();
    sources[0].emit('open');
    w.stop();
    expect(sources[0].closed).toBe(true);
    vi.advanceTimersByTime(60000);
    expect(sources).toHaveLength(1);
    expect(downs).toEqual([]);
  });

  it('honours a custom silence limit', () => {
    const w = start({ silentMs: 1500 });
    sources[0].emit('city');
    vi.advanceTimersByTime(2000);
    expect(downs).toEqual(['silent']);
    w.stop();
  });

  it('default retry delays', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(defaultRetryDelay)).toEqual([
      0, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
  });
});
