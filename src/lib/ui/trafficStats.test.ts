import { describe, expect, it } from 'vitest';
import { countByKind, HISTORY_MS, pushSample, sameCounts, type MovingSample } from './trafficStats';

const at = (ms: number, moving: number): MovingSample => ({ t: new Date(ms), moving });

describe('trafficStats (Interface U1)', () => {
  it('pushSample appends and keeps the order', () => {
    const a = pushSample([], at(1000, 5));
    const b = pushSample(a, at(3000, 7));
    expect(b.map((s) => s.moving)).toEqual([5, 7]);
    expect(a).toHaveLength(1); // the input is not changed
  });

  it('pushSample drops samples older than the window, keeps the one exactly on its edge', () => {
    const start = 1_000_000;
    let h: MovingSample[] = [];
    for (const [ms, n] of [
      [start, 1],
      [start + 1000, 2],
      [start + HISTORY_MS, 3],
    ] as const)
      h = pushSample(h, at(ms, n));
    expect(h.map((s) => s.moving)).toEqual([1, 2, 3]);
    h = pushSample(h, at(start + HISTORY_MS + 500, 4));
    expect(h.map((s) => s.moving)).toEqual([2, 3, 4]);
  });

  it('countByKind always returns the six kinds in a fixed order', () => {
    const counts = countByKind([
      { kind: 'truck' },
      { kind: 'compact' },
      { kind: 'compact' },
      { kind: 'tram' },
    ]);
    expect(counts.map((k) => [k.kind, k.count])).toEqual([
      ['compact', 2],
      ['estate', 0],
      ['truck', 1],
      ['bus', 0],
      ['tram', 1],
      ['train', 0],
    ]);
    expect(counts[0].label).toBe('Personbilar');
    expect(countByKind([]).every((k) => k.count === 0)).toBe(true);
  });

  it('sameCounts compares the counts only', () => {
    const a = countByKind([{ kind: 'bus' }]);
    expect(sameCounts(a, countByKind([{ kind: 'bus' }]))).toBe(true);
    expect(sameCounts(a, countByKind([{ kind: 'bus' }, { kind: 'bus' }]))).toBe(false);
  });
});
