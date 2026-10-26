import { describe, expect, it } from 'vitest';
import {
  RingBuffer,
  SseLog,
  SseTextParser,
  exportEntry,
  filterEntries,
  parseData,
  parseEntryData,
  utf8Length,
  type SseEntryInput,
} from './sseLog';

const ev = (over: Partial<SseEntryInput> = {}): SseEntryInput => ({
  stream: '/api/simulator/stream',
  via: 'eventsource',
  kind: 'event',
  event: 'city',
  lastEventId: '1',
  data: '{"sequence":1}',
  connection: 1,
  ...over,
});

describe('RingBuffer', () => {
  it('keeps the newest items up to its capacity', () => {
    const b = new RingBuffer<number>(3);
    expect(b.push(1)).toBeUndefined();
    b.push(2);
    b.push(3);
    expect(b.push(4)).toBe(1);
    expect(b.push(5)).toBe(2);
    expect(b.size).toBe(3);
    expect(b.toArray()).toEqual([3, 4, 5]);
    expect(b.newestFirst()).toEqual([5, 4, 3]);
    expect(b.shift()).toBe(3);
    expect(b.toArray()).toEqual([4, 5]);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.toArray()).toEqual([]);
  });
  it('rejects a capacity below 1', () => {
    expect(() => new RingBuffer(0)).toThrow();
  });
});

describe('SseLog caps', () => {
  it('never stores more than maxEntries and counts what it dropped', () => {
    const log = new SseLog({ maxEntries: 5 });
    for (let i = 1; i <= 12; i++) log.record(ev({ lastEventId: String(i), data: `{"i":${i}}` }));
    expect(log.size).toBe(5);
    expect(log.dropped).toBe(7);
    expect(log.entries().map((e) => e.lastEventId)).toEqual(['12', '11', '10', '9', '8']);
    // Counters cover every event, not only the stored ones.
    expect(log.channels()[0].events).toBe(12);
    expect(log.entries()[0].seq).toBe(12);
  });
  it('drops oldest entries to stay within maxBytes, keeping at least the newest', () => {
    const log = new SseLog({ maxEntries: 100, maxBytes: 25 });
    log.record(ev({ data: 'a'.repeat(10) }));
    log.record(ev({ data: 'b'.repeat(10) }));
    expect(log.size).toBe(2);
    log.record(ev({ data: 'c'.repeat(10) }));
    expect(log.size).toBe(2);
    expect(log.bytesStored).toBe(20);
    log.record(ev({ data: 'd'.repeat(100) }));
    expect(log.size).toBe(1);
    expect(log.entries()[0].data[0]).toBe('d');
    expect(log.dropped).toBe(3);
  });
  it('counts but does not store while paused', () => {
    const log = new SseLog();
    log.record(ev());
    log.setPaused(true);
    expect(log.record(ev())).toBeNull();
    expect(log.record(ev({ kind: 'error', event: 'error', data: '' }))).toBeNull();
    expect(log.size).toBe(1);
    expect(log.skipped).toBe(2);
    const c = log.channels()[0];
    expect(c.events).toBe(2);
    expect(c.errors).toBe(1);
    log.setPaused(false);
    log.record(ev());
    expect(log.size).toBe(2);
  });
  it('clear empties entries and counters', () => {
    const log = new SseLog();
    log.record(ev());
    const v = log.version;
    log.clear();
    expect(log.size).toBe(0);
    expect(log.channels()).toEqual([]);
    expect(log.version).toBeGreaterThan(v);
  });
});

describe('SseLog counters', () => {
  it('measures bytes as UTF-8 and computes rates over the window', () => {
    const log = new SseLog({ rateWindowMs: 2000 });
    log.record(ev({ data: 'åäö', t: 0 }));
    log.record(ev({ data: 'abc', t: 500 }));
    log.record(ev({ data: 'abc', t: 1500 }));
    log.record(ev({ stream: '/api/sse/world', event: 'world', data: '{}', t: 1500 }));
    log.record(ev({ kind: 'open', event: 'open', data: '', t: 0, readyState: 1 }));
    log.record(ev({ kind: 'reconnect', event: 'reconnect', data: '', t: 0, readyState: 1 }));
    const [city, world] = log.channels(1999);
    expect(city.channel).toBe('/api/simulator/stream');
    expect(city.events).toBe(3);
    expect(city.bytes).toBe(6 + 3 + 3);
    expect(city.eventsPerSecond).toBe(1.5);
    expect(city.bytesPerSecond).toBe(6);
    expect(city.opens).toBe(2);
    expect(city.reconnects).toBe(1);
    expect(city.readyState).toBe(1);
    expect(city.byName).toEqual({ city: 3 });
    expect(world.events).toBe(1);
    // 0 and 500 fall out of a 2 s window ending at 3000.
    expect(log.channels(3000)[0].eventsPerSecond).toBe(0.5);
    expect(log.eventNames()).toEqual(['city', 'world']);
  });
  it('keeps the raw reader on its own channel', () => {
    const log = new SseLog();
    log.record(ev());
    log.record(ev({ via: 'raw' }));
    expect(log.channels().map((c) => c.channel)).toEqual([
      '/api/simulator/stream',
      '/api/simulator/stream [rå]',
    ]);
  });
});

describe('utf8Length', () => {
  it('matches TextEncoder', () => {
    for (const s of ['', 'abc', 'Norrköping', '€', '😀 x', '\ud800', 'a\udc00b'])
      expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
  });
});

describe('JSON parse fallback', () => {
  it('parses JSON and falls back to text', () => {
    expect(parseData('{"a":[1,2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
    expect(parseData('42')).toEqual({ ok: true, value: 42 });
    const bad = parseData('not json {');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.empty).toBe(false);
      expect(bad.error.length).toBeGreaterThan(0);
    }
    const empty = parseData('  ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.empty).toBe(true);
  });
  it('caches per entry and exports parsed JSON or the parse error', () => {
    const log = new SseLog();
    const good = log.record(ev({ data: '{"sequence":7}' }))!;
    const text = log.record(ev({ data: 'hello' }))!;
    const open = log.record(ev({ kind: 'open', event: 'open', data: '' }))!;
    expect(parseEntryData(good)).toBe(parseEntryData(good));
    expect(exportEntry(good).json).toEqual({ sequence: 7 });
    expect(exportEntry(good).jsonError).toBeUndefined();
    expect(exportEntry(text).json).toBeUndefined();
    expect(exportEntry(text).data).toBe('hello');
    expect(exportEntry(text).jsonError).toBeTruthy();
    expect(exportEntry(open).jsonError).toBeUndefined();
    const file = log.toExport(Date.UTC(2026, 9, 26));
    expect(file.format).toBe('norrkoping-sse-debug-log/v1');
    expect(file.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(JSON.parse(JSON.stringify(file)).entries[0].json).toEqual({ sequence: 7 });
  });
});

describe('filterEntries', () => {
  const log = new SseLog();
  log.record(ev({ data: '{"vehicles":[{"road":"Drottninggatan"}]}', lastEventId: '10' }));
  log.record(ev({ stream: '/api/sse/world', event: 'world', data: '{"drones":[]}' }));
  log.record(ev({ stream: '/api/sse/telemetry', event: 'telemetry', data: '{"events":[]}' }));
  log.record(ev({ kind: 'error', event: 'error', data: '', note: 'Anslutningen bröts' }));
  log.record(ev({ via: 'raw', event: 'heartbeat', data: 'ping' }));
  const all = log.entries();

  it('shows everything with an empty filter', () => {
    expect(filterEntries(all, {})).toHaveLength(5);
  });
  it('filters by channel', () => {
    const r = filterEntries(all, { channels: new Set(['/api/sse/world']) });
    expect(r.map((e) => e.event)).toEqual(['world']);
    const raw = filterEntries(all, { channels: new Set(['/api/simulator/stream [rå]']) });
    expect(raw.map((e) => e.event)).toEqual(['heartbeat']);
  });
  it('filters by event name and keeps lifecycle entries unless hidden', () => {
    const r = filterEntries(all, { events: new Set(['city']) });
    expect(r.map((e) => e.event)).toEqual(['error', 'city']);
    expect(filterEntries(all, { events: new Set(['city']), hideLifecycle: true })).toHaveLength(1);
  });
  it('searches text case-insensitively in data, id and notes', () => {
    expect(filterEntries(all, { text: 'drottninggatan' })).toHaveLength(1);
    expect(filterEntries(all, { text: 'BRÖTS' })).toHaveLength(1);
    expect(filterEntries(all, { text: '  ' })).toHaveLength(5);
    expect(
      filterEntries(all, { text: 'telemetry', channels: new Set(['/api/sse/world']) }),
    ).toEqual([]);
  });
});

describe('SseTextParser', () => {
  it('parses named and default events, multi-line data, ids and retry', () => {
    const p = new SseTextParser();
    const items = p.feed(
      'retry: 1500\nevent: city\nid: 7\ndata: {"a":\ndata: 1}\n\ndata: plain\n\n: keep-alive\n\n',
    );
    expect(items).toEqual([
      { type: 'retry', event: 'retry', data: '', retry: 1500, lastEventId: '' },
      { type: 'event', event: 'city', data: '{"a":\n1}', lastEventId: '7' },
      { type: 'event', event: 'message', data: 'plain', lastEventId: '7' },
      { type: 'comment', event: 'comment', data: '', comment: 'keep-alive', lastEventId: '7' },
    ]);
  });
  it('handles chunks split anywhere, CRLF and CR line endings, and a BOM', () => {
    const text = '﻿event: x\r\ndata: 1\r\n\r\nevent: y\rdata: 2\r\r';
    for (let cut = 1; cut < text.length; cut++) {
      const p = new SseTextParser();
      const items = [...p.feed(text.slice(0, cut)), ...p.feed(text.slice(cut))];
      expect(items.map((i) => [i.event, i.data])).toEqual([
        ['x', '1'],
        ['y', '2'],
      ]);
    }
  });
  it('keeps a CRLF split across chunks (with an empty chunk between) as one line break', () => {
    const p = new SseTextParser();
    const items = [
      ...p.feed('data: a\r'),
      ...p.feed(''),
      ...p.feed('\ndata: b\r\n'),
      ...p.feed('\r\n'),
    ];
    expect(items.map((i) => i.data)).toEqual(['a\nb']);
  });
  it('splits long multi-line chunks and counts non-ASCII bytes', () => {
    const big = 'x'.repeat(60000);
    const p = new SseTextParser();
    const items = p.feed(`data: ${big}\ndata: åä\n\ndata: 2\n\n`);
    expect(items.map((i) => i.data.length)).toEqual([60003, 1]);
    expect(utf8Length(items[0].data)).toBe(60000 + 1 + 4);
  });
  it('skips events without data, ignores bad ids and retries, discards an unfinished event', () => {
    const p = new SseTextParser();
    const items = p.feed('event: nodata\n\nid: a\0b\nretry: 1s\ndata\n\nfoo: bar\ndata: tail');
    expect(items).toEqual([{ type: 'event', event: 'message', data: '', lastEventId: '' }]);
    expect(p.end()).toEqual([]);
  });
});
