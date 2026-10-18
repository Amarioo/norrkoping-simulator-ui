/**
 * Builds static city layers off the main thread. The map and terrain data arrive as bytes
 * from the main thread (see cityData.ts), and the result is sent back as transferable
 * typed arrays, so no geometry is copied between threads.
 */
import type { CityTask } from './cityMesh';
import { provideCityData, type CityDataBytes } from './cityData';
import { serializeLayers } from './cityMeshTransfer';

// Typed locally: the project's tsconfig uses the DOM lib, which conflicts with "webworker".
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ tasks: CityTask[]; data: CityDataBytes }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
// The (small) script has loaded; anything that fails from here on is a build error.
scope.postMessage({ loaded: true });
scope.onmessage = async (event) => {
  try {
    const started = performance.now();
    provideCityData(event.data.data);
    // Imported only now: the map and terrain modules wait for the data provided above.
    const { buildCityLayers } = await import('./cityMesh');
    const parsed = performance.now();
    const { layers, transfer } = serializeLayers(buildCityLayers(event.data.tasks));
    scope.postMessage(
      { layers, parseMs: parsed - started, ms: performance.now() - parsed },
      transfer,
    );
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.stack || error.message : String(error),
    });
  }
};
