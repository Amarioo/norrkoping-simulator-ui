import { test, expect, type Page } from '@playwright/test';

// Phase P0: fullscreen map and fps counter. The fullscreen button (and F) puts the map panel in
// fullscreen with the Fullscreen API, Esc and the button leave it, and the renderer's drawing buffer
// and camera aspect follow the panel on entry and exit (dpr stays 1). Where the API is refused the
// panel fills the window instead. The fps counter is off by default, toggles with its button and P
// (not while typing in a form field), shows numbers, remembers the choice, and adds no shader
// programs (20). No backend needed.
const ready = async (page: Page) => {
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
};
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Canvas drawing buffer, panel size and camera aspect. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.map-panel') as HTMLElement;
    const canvas = panel.querySelector('canvas') as HTMLCanvasElement;
    const camera = (globalThis as unknown as { __cityCamera: { camera: { aspect: number } } })
      .__cityCamera.camera;
    return {
      mode: panel.dataset.fullscreen,
      fullscreenElement: document.fullscreenElement?.className ?? null,
      panel: [panel.clientWidth, panel.clientHeight],
      canvas: [canvas.width, canvas.height],
      css: [canvas.clientWidth, canvas.clientHeight],
      aspect: camera.aspect,
      window: [innerWidth, innerHeight],
    };
  });
const expectFits = (g: Awaited<ReturnType<typeof geometry>>) => {
  // dpr 1: one drawing-buffer pixel per CSS pixel, no stretching (aspect = buffer aspect).
  expect(Math.abs(g.canvas[0] - g.css[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(g.canvas[1] - g.css[1])).toBeLessThanOrEqual(1);
  expect(g.aspect).toBeCloseTo(g.canvas[0] / g.canvas[1], 2);
};
const programs = (page: Page) =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as { __cityLighting: { describe(): { programs: number } } }
      ).__cityLighting.describe().programs,
  );

test('Phase P0: fullscreen button, F and Esc; the renderer follows the panel on entry and exit', async ({
  page,
}) => {
  test.setTimeout(240000);
  await ready(page);
  const button = page.locator('.fullscreen-toggle');
  await expect(button).toHaveAccessibleName('Helskärm');
  const before = await geometry(page);
  expect(before.mode).toBe('off');
  expectFits(before);

  await button.click();
  await page.waitForFunction(() => !!document.fullscreenElement, undefined, { timeout: 10000 });
  await frames(page);
  const full = await geometry(page);
  expect(full.mode).toBe('native');
  expect(full.fullscreenElement).toContain('map-panel');
  expect(full.panel).toEqual(full.window);
  expectFits(full);
  expect(full.canvas[0]).toBeGreaterThan(before.canvas[0]);
  await expect(button).toHaveAccessibleName('Avsluta helskärm');
  // The map's own controls stay usable in fullscreen.
  await page.selectOption('#city-focus', 'kungsgatan');
  await expect(page.locator('#city-focus')).toHaveValue('kungsgatan');
  await page.locator('.label-toggle input').uncheck();
  await page.locator('.label-toggle input').check();

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 10000 });
  await frames(page);
  const back = await geometry(page);
  expect(back.mode).toBe('off');
  expect(back.canvas).toEqual(before.canvas);
  expectFits(back);
  await expect(button).toHaveAccessibleName('Helskärm');

  // F toggles (focus outside form fields) …
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement, undefined, { timeout: 10000 });
  // … the button leaves fullscreen too …
  await button.click();
  await page.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 10000 });
  await frames(page);
  expect((await geometry(page)).canvas).toEqual(before.canvas);
  // … and F typed into a form field does nothing.
  await page.locator('#city-focus').focus();
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('Phase P0: where fullscreen is refused, the panel fills the window and follows its size', async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('denied (test)'));
  });
  await ready(page);
  const before = await geometry(page);
  await page.locator('.fullscreen-toggle').click();
  await expect(page.locator('.map-panel')).toHaveAttribute('data-fullscreen', 'window');
  await frames(page);
  await page.waitForTimeout(300);
  const filled = await geometry(page);
  expect(filled.panel).toEqual(filled.window);
  expectFits(filled);
  await expect(page.locator('.fullscreen-toggle')).toHaveAccessibleName('Avsluta helskärm');

  // A window resize while filled reaches the renderer.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(400);
  await frames(page);
  const resized = await geometry(page);
  expect(resized.panel).toEqual([1100, 700]);
  expect(resized.canvas).toEqual([1100, 700]);
  expectFits(resized);

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-panel')).toHaveAttribute('data-fullscreen', 'off');
  await page.waitForTimeout(400);
  await frames(page);
  const back = await geometry(page);
  expect(back.canvas).toEqual(before.canvas);
  expectFits(back);
});

test('Phase P0: fps counter off by default, toggles with button and P, shows numbers, remembers the choice, 20 programs', async ({
  page,
}) => {
  test.setTimeout(240000);
  await ready(page);
  const counter = page.locator('.fps-counter');
  const toggle = page.locator('.fps-toggle');
  await expect(counter).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const programsOff = await programs(page);
  expect(programsOff).toBe(20);

  await toggle.click();
  await expect(counter).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // Numbers appear within a couple of refreshes (twice a second).
  await expect
    .poll(async () => Number(await counter.getAttribute('data-fps')), { timeout: 10000 })
    .toBeGreaterThan(0);
  expect(Number(await counter.getAttribute('data-frame-ms'))).toBeGreaterThan(0);
  expect(Number(await counter.getAttribute('data-p95-ms'))).toBeGreaterThanOrEqual(
    Number(await counter.getAttribute('data-frame-ms')) * 0.5,
  );
  await expect(counter.locator('.fps-value')).not.toHaveText('–');

  // Expanded: draw calls, triangles, programs and resolution from renderer.info / the canvas.
  await counter.locator('.fps-summary').click();
  await expect(counter.locator('.fps-summary')).toHaveAttribute('aria-expanded', 'true');
  await expect(counter.locator('.fps-details')).toBeVisible();
  await page.waitForTimeout(1200);
  const shown = await counter.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  expect(Number(shown.calls)).toBeGreaterThan(0);
  expect(Number(shown.triangles)).toBeGreaterThan(0);
  expect(Number(shown.programs)).toBe(20);
  const g = await geometry(page);
  expect(shown.resolution).toBe(`${g.canvas[0]}x${g.canvas[1]}`);
  await expect(counter.locator('.fps-programs')).toHaveText('20');
  // The hook gives the same reading to scripts.
  const hook = await page.evaluate(() => (globalThis as any).__fpsStats.read());
  expect(hook.fps).toBeGreaterThan(0);
  expect(hook.programs).toBe(20);
  expect(hook.width).toBe(g.canvas[0]);
  expect(await programs(page)).toBe(programsOff);

  // The counter stays visible in fullscreen.
  await page.locator('.fullscreen-toggle').click();
  await page.waitForFunction(() => !!document.fullscreenElement, undefined, { timeout: 10000 });
  await expect(counter).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 10000 });

  // Remembered across a reload (localStorage), including the expanded state.
  await page.reload();
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await expect(counter).toBeVisible();
  await expect(counter.locator('.fps-details')).toBeVisible();

  // P toggles it off (not while a form field has focus) and that is remembered too.
  await page.locator('#city-focus').focus();
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  await expect(counter).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('p');
  await expect(counter).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('norrkoping.fpsCounter'))).toBe('0');
  await page.reload();
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.waitForTimeout(1000);
  await expect(counter).toHaveCount(0);
});
