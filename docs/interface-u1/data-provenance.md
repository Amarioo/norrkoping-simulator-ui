# Interface U1 — data provenance (2026-11-13)

**No dataset was added or changed.** No map data, elevation data, coordinates or estimates are
touched by this phase; `src/lib/data/` is unchanged. The phase changes how the page looks and is
operated, nothing in the 3D scene.

## What the new parts show, and where the numbers come from

| Shown | Source | Kind |
|---|---|---|
| The four big numbers (vehicles, lorries, flights, landings) | the simulator's own snapshot (SSE stream from the backend), as before | simulated |
| Line chart "Fordon i rörelse" | vehicles not standing still in the snapshot, read every 2 s in the browser, last 5 minutes | simulated, sampled in the browser; nothing is stored |
| Bar chart "Fordon per typ" | vehicles per kind in the same snapshot | simulated |
| Toasts | the backend's answer to a command, its errors, and landings in its event list | simulated |

The charts hold their values in memory only. Reloading the page empties the line chart.

## Software added (npm, exact versions pinned in `package.json`)

| Library | Version | Licence | Used for |
|---|---|---|---|
| `bits-ui` | 2.21.0 | MIT | the three tabs (keyboard and screen-reader behaviour) |
| `layerchart` | 2.10.1 | MIT | the two charts |
| `@number-flow/svelte` (with `number-flow` 0.6.2) | 0.4.2 | MIT | the rolling digits of the four big numbers |
| `svelte-sonner` | 1.2.3 | MIT | toasts |
| `vaul-svelte` | 1.0.0-next.7 (**pre-release**) | MIT | the drawer on narrow screens |

Licences read from each package's `package.json` in `node_modules` on 2026-11-13. `vaul-svelte` has
no stable release for Svelte 5 yet (stable 0.3.2 is for Svelte 4); see
[remaining-gaps.md](remaining-gaps.md).

No font or other file is fetched from the internet at run time: the page uses the fonts already on
the computer (Inter if installed, otherwise Segoe UI).
