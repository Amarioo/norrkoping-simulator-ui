import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityTask } from './cityMesh';
import { planCityTasks, requestCityLayers } from './cityMeshClient';

/** One representative layer per task, so the merged result shows which tasks arrived. */
const LAYER = { terrain: 'land', network: 'roads', buildings: 'walls' } as const;
const layersFor = (tasks: CityTask[]) => Object.fromEntries(tasks.map((t) => [LAYER[t], []]));

const mainThread = vi.hoisted(() => ({ calls: [] as string[][] }));
const download = vi.hoisted(() => ({ fail: false, released: 0 }));
vi.mock('./cityData', () => ({
  loadCityData: () =>
    download.fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ terrain: new ArrayBuffer(4), map: new ArrayBuffer(8) }),
  releaseCityData: () => download.released++,
}));
vi.mock('./cityMesh', () => ({
  buildCityLayers: (tasks: CityTask[]) => {
    mainThread.calls.push([...tasks]);
    return Object.fromEntries(
      tasks.map((t) => [{ terrain: 'land', network: 'roads', buildings: 'walls' }[t], []]),
    );
  },
}));

type Outcome = 'ok' | 'load-error' | 'build-error';
let outcome: (tasks: CityTask[], attempt: number) => Outcome;
let log: string[];
let received: { terrain: number; map: number }[];

class FakeWorker {
  static created = 0;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
  private result: Outcome;
  private terminated = false;
  /** Like a real worker, the script loads (or fails to) independently of any message. */
  constructor(_url: URL, { name }: { name: string }) {
    const tasks = name.replace(/^city-/, '').split('+') as CityTask[];
    const result = (this.result = outcome(tasks, FakeWorker.created++));
    log.push('spawn ' + tasks.join('+'));
    setTimeout(() => {
      if (result === 'load-error') {
        log.push('load-error ' + tasks.join('+'));
        this.onerror?.({ message: '', preventDefault() {} });
        return;
      }
      log.push('loaded ' + tasks.join('+'));
      this.onmessage?.({ data: { loaded: true } });
    });
  }
  postMessage({
    tasks,
    data,
  }: {
    tasks: CityTask[];
    data: { terrain: ArrayBuffer; map: ArrayBuffer };
  }) {
    if (this.terminated) throw new Error('posted to a terminated worker');
    received.push({ terrain: data.terrain.byteLength, map: data.map.byteLength });
    setTimeout(() =>
      this.onmessage?.({
        data:
          this.result === 'ok'
            ? { layers: layersFor(tasks), parseMs: 1, ms: 1 }
            : { error: 'boom in ' + tasks.join('+') },
      }),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  log = [];
  received = [];
  mainThread.calls = [];
  download.fail = false;
  download.released = 0;
  FakeWorker.created = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('city geometry workers', () => {
  it('splits the tasks over the cores, each task exactly once', () => {
    for (let cores = 1; cores <= 16; cores++)
      expect(planCityTasks(cores).flat().sort()).toEqual(['buildings', 'network', 'terrain']);
    expect(planCityTasks(8)).toHaveLength(3);
    expect(planCityTasks(2)).toHaveLength(2);
    expect(planCityTasks(1)).toHaveLength(1);
  });

  it('builds every layer in workers when they load', async () => {
    outcome = () => 'ok';
    expect(Object.keys(await requestCityLayers()).sort()).toEqual(['land', 'roads', 'walls']);
    expect(mainThread.calls).toEqual([]);
    expect(FakeWorker.created).toBe(3);
    // Every worker got the downloaded bytes; nothing is fetched or bundled per worker.
    expect(received).toEqual([
      { terrain: 4, map: 8 },
      { terrain: 4, map: 8 },
      { terrain: 4, map: 8 },
    ]);
    expect(download.released).toBe(1);
  });

  it('retries workers whose script failed to load in one worker, after the others loaded', async () => {
    // First worker loads; the two that shared its in-flight request fail to load.
    outcome = (_, attempt) => (attempt === 1 || attempt === 2 ? 'load-error' : 'ok');
    expect(Object.keys(await requestCityLayers()).sort()).toEqual(['land', 'roads', 'walls']);
    expect(mainThread.calls).toEqual([]);
    expect(FakeWorker.created).toBe(4);
    const retry = log.indexOf('spawn network+buildings');
    expect(retry).toBeGreaterThan(log.indexOf('loaded terrain'));
    expect(retry).toBeGreaterThan(log.indexOf('load-error network'));
    expect(retry).toBeGreaterThan(log.indexOf('load-error buildings'));
  });

  it('falls back to the main thread when the retry cannot load either', async () => {
    outcome = (tasks) => (tasks.includes('terrain') ? 'ok' : 'load-error');
    expect(Object.keys(await requestCityLayers()).sort()).toEqual(['land', 'roads', 'walls']);
    expect(mainThread.calls).toEqual([['network', 'buildings']]);
  });

  it('builds a task on the main thread when its worker throws, without a retry', async () => {
    outcome = (tasks) => (tasks.includes('network') ? 'build-error' : 'ok');
    expect(Object.keys(await requestCityLayers()).sort()).toEqual(['land', 'roads', 'walls']);
    expect(mainThread.calls).toEqual([['network']]);
    expect(FakeWorker.created).toBe(3);
  });

  it('does not retry workers when the data download fails', async () => {
    outcome = () => 'ok';
    download.fail = true;
    await requestCityLayers();
    expect(FakeWorker.created).toBe(3);
    expect(received).toEqual([]);
    expect(mainThread.calls.flat().sort()).toEqual(['buildings', 'network', 'terrain']);
  });

  it('builds on the main thread without Worker support', async () => {
    vi.stubGlobal('Worker', undefined);
    expect(Object.keys(await requestCityLayers()).sort()).toEqual(['land', 'roads', 'walls']);
    expect(mainThread.calls).toEqual([['terrain', 'network', 'buildings']]);
  });
});
