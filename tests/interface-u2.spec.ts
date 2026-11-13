import { test, expect, type Page } from '@playwright/test';

// Interface U2: dark is the default theme, light is the visitor's choice. The choice is remembered,
// `?theme=` in the address wins without being remembered, and the map's size is the same in both.
// No backend needed.
const DARK_GROUND = 'rgb(16, 27, 34)',
  LIGHT_GROUND = 'rgb(243, 241, 236)';
const open = async (page: Page, query = '') => {
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/' + query);
  await page.locator('.theme-toggle').waitFor({ timeout: 120000 });
};
const state = (page: Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    ground: getComputedStyle(document.documentElement).backgroundColor,
    surface: getComputedStyle(document.querySelector('.sim-header')!).backgroundColor,
    ink: getComputedStyle(document.documentElement).color,
    stored: localStorage.getItem('norrkoping.theme'),
    chrome: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
const canvasSize = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    return [c.width, c.height];
  });

test('Interface U2: dark by default; the button switches to light and the choice is remembered', async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const toggle = page.locator('.theme-toggle');

  // Nothing chosen: dark, and nothing stored.
  let s = await state(page);
  expect(s.theme).toBe('dark');
  expect(s.ground).toBe(DARK_GROUND);
  expect(s.stored).toBeNull();
  expect(s.chrome).toBe('#101b22');
  await expect(toggle).toHaveAccessibleName('Byt till ljust läge');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  const size = await canvasSize(page);

  // Light is the choice: the palette changes, the map keeps its size, the choice is stored.
  await toggle.click();
  s = await state(page);
  expect(s.theme).toBe('light');
  expect(s.ground).toBe(LIGHT_GROUND);
  expect(s.surface).toBe('rgb(255, 255, 255)');
  expect(s.stored).toBe('light');
  expect(s.chrome).toBe('#f3f1ec');
  await expect(toggle).toHaveAccessibleName('Byt till mörkt läge');
  expect(await canvasSize(page)).toEqual(size);

  // Remembered across a reload.
  await page.reload();
  await page.locator('.theme-toggle').waitFor({ timeout: 120000 });
  s = await state(page);
  expect(s.theme).toBe('light');
  expect(s.ground).toBe(LIGHT_GROUND);

  // Back to dark, and that is remembered too.
  await toggle.click();
  s = await state(page);
  expect(s.theme).toBe('dark');
  expect(s.ground).toBe(DARK_GROUND);
  expect(s.stored).toBe('dark');
  expect(errors).toEqual([]);
});

test('Interface U2: ?theme= in the address wins and is not remembered; unknown values mean dark', async ({
  page,
}) => {
  test.setTimeout(300000);
  await open(page, '?theme=light');
  let s = await state(page);
  expect(s.theme).toBe('light');
  expect(s.ground).toBe(LIGHT_GROUND);
  expect(s.stored).toBeNull();

  await page.goto('/?theme=blue');
  await page.locator('.theme-toggle').waitFor({ timeout: 120000 });
  s = await state(page);
  expect(s.theme).toBe('dark');
  expect(s.ground).toBe(DARK_GROUND);

  // Text on the two surfaces keeps a contrast of at least 4.5:1 in both themes (body text and the
  // muted notes), computed from the colours the page actually uses.
  for (const query of ['?theme=dark', '?theme=light']) {
    await page.goto('/' + query);
    await page.locator('.theme-toggle').waitFor({ timeout: 120000 });
    const ratios = await page.evaluate(() => {
      const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (c: string) => {
        const [r, g, b] = rgb(c).map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const css = (sel: string, prop: 'color' | 'backgroundColor') =>
        getComputedStyle(document.querySelector(sel)!)[prop];
      const surface = css('.sim-sidebar', 'backgroundColor');
      return {
        text: ratio(css('.card-heading h2', 'color'), surface),
        muted: ratio(css('.control-note', 'color'), surface),
        button: ratio(css('.apply-button', 'color'), css('.apply-button', 'backgroundColor')),
        tab: ratio(css('.tab[data-state="inactive"]', 'color'), css('.tab-list', 'backgroundColor')),
      };
    });
    for (const [name, value] of Object.entries(ratios))
      expect(value, `${query} ${name}`).toBeGreaterThanOrEqual(4.5);
  }
});
