// Interface U2: reading, applying and remembering the theme in the browser. Plain TypeScript (no
// Svelte), so main.ts can set the theme before the app is loaded and the first paint is right.
import { startTheme, THEME_STORAGE_KEY, type Theme } from './themeName';

/** The page background of each theme, for the browser's own chrome (<meta name="theme-color">). */
const CHROME: Record<Theme, string> = { dark: '#101b22', light: '#f3f1ec' };

export function readStartTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage blocked: start in the default theme.
  }
  return startTheme(new URLSearchParams(location.search).get('theme'), stored);
}

/** The theme is a `data-theme` attribute on <html>; style.css holds both palettes. */
export function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[value]);
}

export function rememberTheme(value: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Not remembered; the choice still holds until the page is reloaded.
  }
}
