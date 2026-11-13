// Interface U2: which theme the page starts in. Dark is the default; light is the choice the
// visitor can make. Pure functions, no DOM.
export type Theme = 'dark' | 'light';
export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'norrkoping.theme';

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

/**
 * The theme to start in: `?theme=light|dark` in the address wins (for screenshots and tests, not
 * remembered), then the remembered choice, then dark. Anything unknown counts as not set.
 */
export function startTheme(query: string | null, stored: string | null): Theme {
  if (isTheme(query)) return query;
  if (isTheme(stored)) return stored;
  return DEFAULT_THEME;
}

export const otherTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');
