import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, otherTheme, startTheme } from './themeName';

describe('themeName (Interface U2)', () => {
  it('starts dark when nothing is set', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(startTheme(null, null)).toBe('dark');
  });

  it('uses the remembered choice', () => {
    expect(startTheme(null, 'light')).toBe('light');
    expect(startTheme(null, 'dark')).toBe('dark');
  });

  it('lets the address win over the remembered choice', () => {
    expect(startTheme('light', 'dark')).toBe('light');
    expect(startTheme('dark', 'light')).toBe('dark');
  });

  it('ignores unknown values', () => {
    expect(startTheme('blue', null)).toBe('dark');
    expect(startTheme(null, 'LIGHT')).toBe('dark');
    expect(startTheme('', 'light')).toBe('light');
  });

  it('otherTheme switches between the two', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });
});
