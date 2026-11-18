import { expect, test } from '@playwright/test';

// Interface U4 (tablet and phone), layout step: the drawer layout also on a phone held on its side
// and a tablet held upright; a tablet on its side keeps the side panel. Finger-sized controls where
// the main pointer is a finger.

const box = async (page: import('@playwright/test').Page, selector: string) => {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
};

test('Interface U4: drawer layout on a phone on its side and a tablet upright; side panel on a tablet on its side', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.abort());

  // A phone on its side: no side panel, and the map plus the settings bar fit on one screen.
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto('/');
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await expect(page.locator('.sim-sidebar')).toHaveCount(0);
  const bar = page.getByRole('button', { name: 'Inställningar' });
  await expect(bar).toBeVisible();
  const map = await box(page, '.map-panel');
  const barBox = await box(page, '.drawer-bar');
  expect(map.height).toBeGreaterThanOrEqual(220);
  expect(map.height + barBox.height).toBeLessThanOrEqual(375);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 812);
  await bar.click();
  const drawer = page.getByRole('dialog', { name: 'Inställningar' });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.height).toBeLessThanOrEqual(375);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // A tablet upright: the drawer layout, the map as wide as the page allows.
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('.sim-sidebar')).toHaveCount(0);
  await expect(bar).toBeVisible();
  expect((await box(page, '.map-panel')).width).toBeGreaterThan(740);

  // A tablet on its side: the side panel, as on a desktop.
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(page.locator('.sim-sidebar')).toBeVisible();
  await expect(bar).toHaveCount(0);
  // With a mouse as the only pointer the camera buttons are not shown.
  await expect(page.getByRole('group', { name: 'Flytta kameran' })).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('with a finger as the pointer', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('Interface U4: controls are at least 44 px and lists use 16 px text', async ({ page }) => {
    test.setTimeout(240000);
    await page.route('**/api/**', (r) => r.abort());
    await page.goto('/');
    await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

    const sizes = (scope: string) =>
      page.evaluate((s) => {
        const root = document.querySelector(s)!;
        // Switches are left out: each sits inside a label that is the finger target.
        return [...root.querySelectorAll('button, select, input:not(.switch), [role=tab]')]
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.height > 0)
          .map(({ e, r }) => ({
            name: `${e.tagName.toLowerCase()} ${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)}`,
            min: Math.round(Math.min(r.width, r.height)),
            font: e.tagName === 'SELECT' ? parseFloat(getComputedStyle(e).fontSize) : 16,
          }));
      }, scope);

    const check = (list: Awaited<ReturnType<typeof sizes>>) => {
      expect(list.length).toBeGreaterThan(0);
      expect(list.filter((c) => c.min < 44)).toEqual([]);
      expect(list.filter((c) => c.font < 16)).toEqual([]);
    };
    check(await sizes('.sim-shell'));
    for (const label of await page.locator('.sim-shell label:has(.switch)').all())
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.getByRole('button', { name: 'Inställningar' }).click();
    const drawer = page.getByRole('dialog', { name: 'Inställningar' });
    await expect(drawer).toBeVisible();
    check(await sizes('[role=dialog]'));
  });

  test('Interface U4: holding a camera button moves the camera, releasing stops it', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', (r) => r.abort());
    await page.goto('/');
    const panel = page.locator('[data-map-ready="true"]');
    await panel.waitFor({ timeout: 180000 });
    const pad = page.getByRole('group', { name: 'Flytta kameran' });
    await expect(pad).toBeVisible();
    await expect(pad.getByRole('button')).toHaveCount(6);

    const state = () =>
      page.evaluate(() => {
        const cam = (
          globalThis as unknown as {
            __cityCamera: { camera: { position: { x: number; y: number; z: number } } };
          }
        ).__cityCamera.camera.position;
        const travel = Number(
          document.querySelector<HTMLElement>('.map-panel')!.dataset.cameraTravel,
        );
        return { x: cam.x, y: cam.y, z: cam.z, travel };
      });
    const hold = async (name: string) => {
      const b = await pad.getByRole('button', { name }).boundingBox();
      await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      await page.waitForTimeout(300);
      return state();
    };

    const start = await state();
    const forward = await hold('Flytta framåt');
    expect(forward.travel).toBeGreaterThan(start.travel);
    expect(Math.hypot(forward.x - start.x, forward.z - start.z)).toBeGreaterThan(0.5);
    expect(forward.y).toBeCloseTo(start.y, 3);

    const raised = await hold('Höj kameran');
    expect(raised.y).toBeGreaterThan(forward.y + 0.5);
    const lowered = await hold('Sänk kameran');
    expect(lowered.y).toBeLessThan(raised.y - 0.5);

    const side = await hold('Flytta höger');
    expect(Math.hypot(side.x - lowered.x, side.z - lowered.z)).toBeGreaterThan(0.5);

    // Released: the camera stands still.
    const rest = await state();
    await page.waitForTimeout(500);
    expect((await state()).travel).toBe(rest.travel);
    expect(errors).toEqual([]);
  });
});
