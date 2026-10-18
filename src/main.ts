import { startCityLayers } from './lib/cityMeshClient';
import './style.css';
// Start downloading the map data and the geometry workers before the main thread loads
// the app, so they run in parallel. App waits for the same data (see lib/cityData.ts).
startCityLayers();
const target = document.getElementById('app')!;
Promise.all([import('svelte'), import('./App.svelte')]).then(
  ([{ mount }, { default: App }]) => {
    mount(App, { target });
  },
  (error) => {
    // Usually the map data could not be downloaded, even after retries.
    console.error('[city] start failed', error);
    const message = document.createElement('div');
    message.className = 'map-fallback';
    message.setAttribute('role', 'alert');
    message.textContent = 'Kartdata kunde inte laddas. Kontrollera anslutningen och ';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'ladda om sidan';
    reload.onclick = () => location.reload();
    message.append(reload, '.');
    target.replaceChildren(message);
  },
);
