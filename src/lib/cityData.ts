/**
 * The two large static datasets, the DTM heights and the OSM-derived map, are served as
 * hashed static assets instead of being inlined into the JavaScript bundles. Inlined, both
 * the main bundle and the worker bundle carried a copy (~23 MB gzip each). Now the main
 * thread downloads each file once and the geometry workers receive copies of the bytes
 * (cityMeshClient.ts), so nothing is bundled, downloaded or fetched twice.
 */
import terrainUrl from './data/terrain.json?url';
import mapUrl from './data/norrkoping-map.json?url';

export interface CityDataBytes {
  terrain: ArrayBuffer;
  map: ArrayBuffer;
}

const ATTEMPTS = 3;
async function download(url: string): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      if (attempt >= ATTEMPTS)
        throw new Error(`Could not load ${url}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

let bytes: Promise<CityDataBytes> | null = null;
/**
 * Interface U4 (memory). Reading one dataset takes several times its file size while it is parsed,
 * and both the page and the geometry worker read both datasets.
 * - `gate`: where memory is short the page reads its copy only after the worker has finished and
 *   is gone (parseAfter, set by cityMeshClient.ts), so the two do not hold their peaks together.
 * - `dropWhenParsed`: the raw bytes are dropped as soon as both datasets are parsed here.
 */
let gate: Promise<unknown> | null = null;
let dropWhenParsed = false;
const parsed = new Set<keyof CityDataBytes>();
/** The page parses its datasets only once `work` has settled, and then drops the raw bytes. */
export function parseAfter(work: Promise<unknown>) {
  gate = work.then(
    () => {},
    () => {},
  );
  dropWhenParsed = true;
}
/** Downloads both datasets once; a failed download is retried by the next call. */
export function loadCityData(): Promise<CityDataBytes> {
  bytes ??= Promise.all([download(terrainUrl), download(mapUrl)]).then(
    ([terrain, map]) => ({ terrain, map }),
    (error) => {
      bytes = null;
      throw error;
    },
  );
  return bytes;
}
/** Workers use the bytes sent by the main thread instead of downloading them again. */
export function provideCityData(data: CityDataBytes) {
  bytes = Promise.resolve(data);
  dropWhenParsed = true;
}
/** Drops the raw bytes once they are parsed and every worker has its copy. */
export function releaseCityData() {
  bytes = null;
}

/** Parses one dataset; the time shows up as a `city-data:parse-*` performance measure. */
export async function cityJson<T>(name: keyof CityDataBytes): Promise<T> {
  if (gate) await gate;
  const data = await loadCityData(),
    started = performance.now();
  const value = JSON.parse(new TextDecoder().decode(data[name])) as T;
  performance.measure?.(`city-data:parse-${name}`, { start: started });
  parsed.add(name);
  // A later reader (the inspection tools) downloads the files again, as after releaseCityData().
  if (dropWhenParsed && parsed.size === 2) bytes = null;
  return value;
}
