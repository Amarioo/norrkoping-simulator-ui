// Interface U2: the page's theme as reactive state. Dark by default; choosing light is remembered.
import { applyTheme, readStartTheme, rememberTheme } from './themeDom';
import { otherTheme, type Theme } from './themeName';

export const theme = $state<{ value: Theme }>({ value: readStartTheme() });

export function setTheme(value: Theme) {
  theme.value = value;
  applyTheme(value);
  rememberTheme(value);
}

export const toggleTheme = () => setTheme(otherTheme(theme.value));
