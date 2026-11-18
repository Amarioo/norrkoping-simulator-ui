/**
 * A city per visitor. With `VITE_CITY_SESSIONS=1` in the build (the public deployment), or
 * `?own-city` in the address, this tab names a city of its own in every simulator request
 * (`?session=<id>`), and the backend runs one for it: its traffic settings, pause and reset reach
 * nobody else. Without it everybody shares the backend's one city, which the tests and capture
 * scripts rely on (they steer that city through the API and watch it in the page).
 *
 * The id is random, says nothing about the visitor, and is kept in sessionStorage: a reload keeps
 * the city, a new tab gets a new one. No imports: main.ts loads this before the map data.
 */
const KEY = 'city-session';

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function pick(): string | null {
  if (typeof location === 'undefined') return null;
  const wanted =
    import.meta.env.VITE_CITY_SESSIONS === '1' ||
    new URLSearchParams(location.search).has('own-city');
  if (!wanted) return null;
  try {
    const kept = sessionStorage.getItem(KEY);
    if (kept && /^[A-Za-z0-9_-]{8,64}$/.test(kept)) return kept;
    const id = randomId();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return randomId(); // storage blocked: the city lasts until the page is reloaded
  }
}

/** This tab's city id, or null when the shared city is used. */
export const CITY_SESSION = pick();

/** The address of a simulator route (`stream`, `world`, `settings`, `pause`, `reset`). */
export const cityUrl = (name: string) =>
  '/api/simulator/' + name + (CITY_SESSION ? '?session=' + CITY_SESSION : '');
