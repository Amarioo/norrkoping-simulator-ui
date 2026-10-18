/**
 * Starts the city geometry workers as early as possible (see main.ts) and hands the
 * result to createMappedCity(). Falls back to building on the main thread when workers
 * are unavailable or fail, so the map always appears.
 */
import type { CityLayers, CityTask } from './cityMesh';
import { loadCityData, releaseCityData, type CityDataBytes } from './cityData';
import { deserializeLayers, type SerializedLayers } from './cityMeshTransfer';

type WorkerReply =
  { loaded: true } | { layers: SerializedLayers; parseMs: number; ms: number } | { error: string };

const ALL_TASKS: CityTask[] = ['terrain', 'network', 'buildings'];

/** Split the three tasks over the available cores; each worker parses the map data once. */
export function planCityTasks(cores: number): CityTask[][] {
  if (cores >= 4) return [['terrain'], ['network'], ['buildings']];
  if (cores >= 2) return [['terrain'], ['network', 'buildings']];
  return [ALL_TASKS];
}

let cityMesh: Promise<typeof import('./cityMesh')> | null = null;
async function buildOnMainThread(tasks: CityTask[]): Promise<CityLayers> {
  const { buildCityLayers } = await (cityMesh ??= import('./cityMesh'));
  return buildCityLayers(tasks);
}

interface WorkerRun {
  /** False when the worker script never loaded, so its tasks can be retried in a new worker. */
  loaded: Promise<boolean>;
  layers: Promise<CityLayers>;
}

function spawnWorker(tasks: CityTask[], data: Promise<CityDataBytes>): WorkerRun {
  let setLoaded!: (loaded: boolean) => void;
  const loaded = new Promise<boolean>((resolve) => (setLoaded = resolve));
  const layers = new Promise<CityLayers>((resolve, reject) => {
    const worker = new Worker(new URL('./cityMesh.worker.ts', import.meta.url), {
      type: 'module',
      name: 'city-' + tasks.join('+'),
    });
    let finished = false;
    const finish = () => {
      finished = true;
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      setLoaded(true);
      if ('loaded' in reply) return;
      finish();
      if ('error' in reply) reject(new Error(reply.error));
      else {
        if (import.meta.env.DEV)
          console.debug(
            `[city] ${tasks.join('+')} built in worker: data ${reply.parseMs.toFixed(0)} ms, ` +
              `geometry ${reply.ms.toFixed(0)} ms`,
          );
        resolve(deserializeLayers(reply.layers));
      }
    };
    worker.onerror = (event) => {
      finish();
      event.preventDefault();
      setLoaded(false); // No effect once the worker has reported that it loaded.
      reject(new Error(event.message || 'City worker failed to load'));
    };
    // The worker starts loading its script right away; the data follows once downloaded.
    // Each worker gets its own copy of the bytes (structured clone).
    data.then(
      (bytes) => {
        if (!finished) worker.postMessage({ tasks, data: bytes });
      },
      (error) => {
        finish();
        setLoaded(true); // Not a script problem: a new worker would not help.
        reject(error);
      },
    );
  });
  return { loaded, layers };
}

function withFallback(tasks: CityTask[], layers: Promise<CityLayers>) {
  return layers.catch((error) => {
    console.warn(`[city] worker for ${tasks.join('+')} failed, building on main thread`, error);
    return buildOnMainThread(tasks);
  });
}

function startBuild(): Promise<CityLayers> {
  if (typeof Worker === 'undefined') return buildOnMainThread(ALL_TASKS);
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  const data = loadCityData(),
    plan = planCityTasks(cores),
    runs = plan.map((tasks) => spawnWorker(tasks, data));
  const parts = runs.map((run, i) =>
    run.loaded.then((loaded) => {
      if (loaded) return withFallback(plan[i], run.layers);
      run.layers.catch(() => {}); // Retried below.
      return {};
    }),
  );
  // Workers loading the same script at once share one HTTP cache entry; when the browser
  // cannot cache it, all but one fail (ERR_CACHE_WRITE_FAILURE, seen with the 50 MB script
  // that bundled the map data). Any worker whose script failed to load is retried: once
  // the others have loaded, one more worker takes over their tasks, instead of the main thread.
  const retry = Promise.all(runs.map((run) => run.loaded)).then((loaded) => {
    const tasks = plan.filter((_, i) => !loaded[i]).flat();
    if (!tasks.length) return {};
    console.warn(`[city] worker script failed to load, retrying ${tasks.join('+')} in one worker`);
    return withFallback(tasks, spawnWorker(tasks, data).layers);
  });
  return Promise.all([...parts, retry])
    .then((layers) => Object.assign({}, ...layers))
    .finally(releaseCityData);
}

let pending: Promise<CityLayers> | null = null;
/** Starts the data download and the workers before the main thread loads the app. */
export function startCityLayers() {
  pending ??= startBuild();
}
/** Takes the prestarted build, or starts a new one (e.g. after a hot reload or remount). */
export function requestCityLayers(): Promise<CityLayers> {
  const result = pending ?? startBuild();
  pending = null;
  return result;
}
