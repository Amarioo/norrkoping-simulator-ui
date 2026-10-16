# Swarm / airspace control

An interactive 3D drone control room built with Svelte 5, TypeScript, Threlte 8 and Three.js. Its companion repository, `../drone-swarm-backend`, runs the authoritative Kotlin/Ktor simulation.

## Start

Requires Node.js 22.12+ (tested with Node 24), npm 11.10.1+, and WebGL 2 in your browser.

Terminal 1:

```powershell
cd C:\Users\amarg\dev\drone-swarm-backend
.\dev.ps1
```

Terminal 2:

```powershell
cd C:\Users\amarg\dev\drone-swarm-ui
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Both repositories are already installed on the development machine. The API is proxied to `127.0.0.1:8080`. No cloud account, credentials, assets or database are required.

If your global npm is the older **11.1.0**, it can fail in dependency resolution with `Cannot read properties of null (reading 'edgesOut')`. Use `npx --yes npm@11.10.1 ci` instead; this does not replace your global npm. `npm run dev` works with the existing installation.

## Explore

- **Dispatch:** choose north/south hub, set 1–20 drones, then dispatch. Fleet cap: 100.
- **No-fly zone:** arm placement, then click open ground. A translucent sphere appears and the backend replans routes. Choose another location if a drone or hub would be inside it. Remove zones from the sidebar.
- **Wind:** toggle an 8/4 m/s wind vector. Ground speed varies with route heading.
- **Recall:** return all drones and disable automatic redispatch, including drones already recharging.
- **Pause / reset:** controls beside the simulation clock. Reset replaces the entire world.
- **Inspect:** click a drone to see its battery, altitude, payload and state. Its route is highlighted.
- **Camera:** left drag to orbit, right drag to pan, scroll to zoom. Touch orbit/pinch are supported.
- **Flight paths:** toggle route lines above the map.
- **Skyline:** the city is procedurally generated (deterministic on every load): glass towers with setbacks, midrise blocks, pitched-roof houses, parks and street lamps — all under the 18–26 m flight lanes, with lit windows baked per building.

The eight initial drones autonomously deliver, return, recharge and repeat. The UI is responsive; on narrow screens the controls sit below the map.

## Data flow

`src/lib/world.svelte.ts` owns two EventSource subscriptions. Named `world` events arrive around 10 Hz; `telemetry` events around 2 Hz. Commands are JSON HTTP POST requests. The dashboard only changes from server projections, so multiple browser tabs observe the same world.

`DroneMesh.svelte` initializes a Three.js group once. A per-frame `useTask` smoothly approaches each server position with `1 - exp(-rate * delta)`, and turns using the shortest yaw angle. **The incoming position is not also bound to the group**, which would snap it to server coordinates before interpolation. Full snapshots recover naturally after reconnect; offline/online events close and recreate both subscriptions. Command failures are shown in the feedback strip and are never automatically retried.

This is a local simulation with in-memory CQRS. It does not control real drones. See the backend README for route planning, battery behaviour and simulation limits.

## Development

```powershell
npm run check       # Svelte + strict TypeScript
npm test            # frame-rate independence and turning tests
npm run build       # production files in dist/
npm run preview     # local preview with the same API proxy
npm run format      # Prettier + Svelte formatting
npm run test:e2e    # both dev servers must already be running
```

The E2E test uses installed Microsoft Edge on Windows, Chromium elsewhere (`npx playwright install chromium` on Linux/macOS). It resets the local world, checks real 3D rendering and map clicks, dispatch, wind, pause, zone removal, recall, offline recovery and mobile layout. Screenshots and failure artifacts go under ignored `test-results/`.

CI runs type checking, unit tests and the production build. Browser tests are local because they need the sibling backend. Vite can report a large bundle warning for the Three.js renderer; the production build still succeeds.

## Configuration and deployment

Set `API_TARGET` before starting Vite if the API runs elsewhere:

```powershell
$env:API_TARGET = 'http://127.0.0.1:8081'
npm run dev
```

The UI always uses relative `/api` URLs. A production web server must proxy `/api` to Ktor and leave SSE unbuffered. `dist/` alone does not contain a backend. If changing the UI origin, set backend `ALLOWED_ORIGIN` accordingly. The local backend has no authentication and binds to loopback by default.

## Source map

| File                       | Responsibility                            |
| -------------------------- | ----------------------------------------- |
| `src/App.svelte`           | Controls, metrics, activity and inspector |
| `src/lib/Scene.svelte`     | City, camera, lights and zone placement   |
| `src/lib/city.ts`          | Deterministic procedural city model       |
| `src/lib/cityView.ts`      | Facade textures and instanced city props  |
| `src/lib/DroneMesh.svelte` | Animated drone and picking                |
| `src/lib/RouteLine.svelte` | Disposable route geometry                 |
| `src/lib/world.svelte.ts`  | SSE lifecycle and command client          |
| `src/lib/types.ts`         | Backend read-model contract               |
| `src/lib/motion.ts`        | Frame-independent smoothing and heading   |

Reference APIs: [Threlte useTask](https://threlte.xyz/docs/reference/core/use-task/), [Threlte interactivity](https://threlte.xyz/docs/reference/extras/interactivity/), [Ktor SSE](https://ktor.io/docs/server-server-sent-events.html).
