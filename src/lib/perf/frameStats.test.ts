import { describe, expect, it } from 'vitest';
import { FrameStats, RollingWindow } from './frameStats';

/** Feeds frames at the given intervals starting at `start`; returns the last frame time. */
const feed = (s: FrameStats, intervals: number[], start = 1000) => {
  let t = start;
  s.frame(t);
  for (const dt of intervals) s.frame((t += dt));
  return t;
};

describe('RollingWindow', () => {
  it('computes mean, nearest-rank p95 and max over the window', () => {
    const w = new RollingWindow(1000);
    for (let i = 1; i <= 100; i++) w.add(i, i); // values 1..100 at times 1..100
    const s = w.stats(100)!;
    expect(s.count).toBe(100);
    expect(s.mean).toBeCloseTo(50.5);
    expect(s.p95).toBe(95);
    expect(s.max).toBe(100);
  });

  it('drops samples older than the window', () => {
    const w = new RollingWindow(100);
    w.add(0, 50);
    w.add(150, 10);
    w.add(200, 20);
    const s = w.stats(200)!;
    expect(s.count).toBe(2);
    expect(s.mean).toBe(15);
    expect(w.stats(400)).toBeNull();
  });

  it('keeps only the newest samples when over capacity', () => {
    const w = new RollingWindow(1e9, 4);
    for (let i = 0; i < 10; i++) w.add(i, i);
    const s = w.stats(9)!;
    expect(s.count).toBe(4);
    expect(s.mean).toBe(7.5);
  });

  it('a single sample is its own p95', () => {
    const w = new RollingWindow(1000);
    w.add(5, 16.7);
    expect(w.stats(5)).toEqual({ count: 1, mean: 16.7, p95: 16.7, max: 16.7 });
  });
});

describe('FrameStats', () => {
  it('reports fps and frame times for a steady 60 Hz stream', () => {
    const s = new FrameStats();
    const end = feed(s, Array(120).fill(1000 / 60));
    const snap = s.snapshot(end)!;
    expect(snap.fps).toBeCloseTo(60, 5);
    expect(snap.meanMs).toBeCloseTo(16.667, 2);
    expect(snap.p95Ms).toBeCloseTo(16.667, 2);
    expect(snap.frames).toBe(120);
  });

  it('p95 catches a minority of slow frames that the mean hides', () => {
    const s = new FrameStats();
    // 90 frames of 10 ms and 10 frames of 40 ms, interleaved.
    const intervals = Array.from({ length: 100 }, (_, i) => (i % 10 === 9 ? 40 : 10));
    const end = feed(s, intervals);
    const snap = s.snapshot(end)!;
    expect(snap.meanMs).toBeCloseTo(13);
    expect(snap.p95Ms).toBe(40);
    expect(snap.maxMs).toBe(40);
    expect(snap.fps).toBeCloseTo(1000 / 13);
  });

  it('the window slides: old slow frames stop counting', () => {
    const s = new FrameStats({ windowMs: 1000 });
    let t = feed(s, Array(20).fill(50)); // 1 s of 20 fps
    for (let i = 0; i < 200; i++) s.frame((t += 10)); // then 2 s of 100 fps
    const snap = s.snapshot(t)!;
    expect(snap.fps).toBeCloseTo(100);
    expect(snap.maxMs).toBe(10);
  });

  it('a gap longer than gapMs (tab switch, sleep) is not recorded as a frame', () => {
    const s = new FrameStats({ gapMs: 1000 });
    let t = feed(s, Array(30).fill(16));
    s.frame((t += 5000)); // the tab came back after 5 s
    for (let i = 0; i < 30; i++) s.frame((t += 16));
    const snap = s.snapshot(t)!;
    expect(snap.maxMs).toBe(16);
    expect(s.gaps).toBe(1);
  });

  it('pause() starts a new interval even when the gap is short', () => {
    const s = new FrameStats({ gapMs: 1000 });
    let t = feed(s, Array(30).fill(16));
    s.pause();
    s.frame((t += 400)); // would otherwise count as a 400 ms frame
    s.frame((t += 16));
    const snap = s.snapshot(t)!;
    expect(snap.maxMs).toBe(16);
    expect(s.gaps).toBe(0);
  });

  it('after a long pause the window is empty until new frames arrive', () => {
    const s = new FrameStats({ windowMs: 2000 });
    const t = feed(s, Array(30).fill(16));
    expect(s.snapshot(t + 10_000)).toBeNull();
  });

  it('reset() clears everything', () => {
    const s = new FrameStats();
    const t = feed(s, Array(30).fill(16));
    s.reset();
    expect(s.snapshot(t)).toBeNull();
    s.frame(t + 1);
    expect(s.snapshot(t + 1)).toBeNull(); // one frame start is not yet an interval
  });

  it('ignores non-increasing timestamps', () => {
    const s = new FrameStats();
    s.frame(100);
    s.frame(100);
    s.frame(90);
    s.frame(106);
    const snap = s.snapshot(106)!;
    expect(snap.frames).toBe(1);
    expect(snap.meanMs).toBe(16);
  });
});
