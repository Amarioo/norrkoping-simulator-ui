import { test, expect } from '@playwright/test';

// Step 6: time of day, presets, floodlights and pilot views (dev server: __cityLighting is DEV-only).
type Lighting = {
  settle(): void;
  describe(): {
    date: string;
    elevation: number;
    artificial: number;
    stadium: string;
    floodlights: { masts: number; roofs: number };
    programs: number;
    realtimeLights: Record<string, number>;
    grid: { overflow: number; maxPerCell: number };
    fixtures: number;
  };
};
const describe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const l = (globalThis as unknown as { __cityLighting: Lighting }).__cityLighting;
    l.settle();
    return l.describe();
  });

const setTime = (page: import('@playwright/test').Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );

test('time of day, presets and independent floodlights work without shader recompiles', async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No vehicles: models first drawn later would compile programs unrelated to lighting.
  await request.post('/api/simulator/settings', {
    data: {
      compact: 0,
      estate: 0,
      trucks: 0,
      buses: 0,
      trams: 0,
      trains: 0,
      flights: false,
      timeScale: 3,
    },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await page.goto('/?date=2026-10-21&time=12:39&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.lighting-card')).toBeVisible();
  const elevation = async () =>
    Number(await page.locator('[data-sun-elevation]').getAttribute('data-sun-elevation'));
  expect(await elevation()).toBeCloseTo(20.7, 0);
  let d = await describe(page);
  expect(d.artificial).toBe(0);
  expect(d.realtimeLights).toEqual({
    directional: 1,
    hemisphere: 1,
    ambient: 1,
    point: 0,
    spot: 0,
    shadowMaps: 0,
  });
  expect(d.fixtures).toBeGreaterThan(100);
  expect(d.grid.overflow).toBe(0);

  // Presets come from the sun on this date.
  await page.locator('[data-preset="sunset"]').click();
  expect(await elevation()).toBeCloseTo(-0.83, 1);
  await page.locator('[data-preset="twilight"]').click();
  expect(await elevation()).toBeCloseTo(-3, 1);
  await page.locator('[data-preset="night"]').click();
  expect(await elevation()).toBeLessThan(-40); // solar midnight, 00:40 on the next day
  await expect(page.locator('#light-date')).toHaveValue('2026-10-22');
  d = await describe(page);
  expect(d.artificial).toBe(1);
  expect(d.stadium).toBe('off');
  expect(d.floodlights).toEqual({ masts: 0, roofs: 0 });

  // Visit the pilot views so every program is compiled, then count programs.
  for (const view of ['kungsgatan', 'stromparken', 'idrottsparkenPitch', 'parken']) {
    await page.selectOption('#city-focus', view);
    await page.waitForTimeout(1200);
  }
  const programs = (await describe(page)).programs;
  expect(programs).toBeGreaterThan(5);

  // Floodlights are independent of the time; toggling and time scrubbing compile nothing new.
  for (const mode of ['event', 'training', 'off', 'event']) {
    await page.selectOption('#stadium-lights', mode);
    await page.waitForTimeout(300);
  }
  for (let m = 0; m < 1440; m += 60) await setTime(page, m);
  d = await describe(page);
  expect(d.stadium).toBe('event');
  expect(d.floodlights).toEqual({ masts: 1, roofs: 1 });
  expect(d.programs).toBe(programs);
  await page.locator('[data-preset="day"]').click();
  d = await describe(page);
  expect(d.artificial).toBe(0);
  expect(d.floodlights).toEqual({ masts: 1, roofs: 1 }); // a daytime match keeps its floodlights
  expect(d.programs).toBe(programs);

  // Time-lapse rolls over midnight into the next date.
  await setTime(page, 1438);
  await page.selectOption('#light-play', '600');
  await expect(page.locator('#light-date')).toHaveValue('2026-10-23', { timeout: 5000 });
  await page.selectOption('#light-play', '0');
  expect(errors).toEqual([]);
});

test('stadium and lighting recover after WebGL context loss', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?date=2026-10-21&time=21:30&stadium=event');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.selectOption('#city-focus', 'parken');
  await page.waitForTimeout(2500);
  await describe(page);
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context required for this regression test');
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }),
    );
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise((resolve) => setTimeout(resolve, 200));
    extension.restoreContext();
    await restored;
  });
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
  const d = await describe(page);
  expect(d.stadium).toBe('event');
  expect(d.programs).toBeGreaterThan(5);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cityPerformance: { triangles: number } }).__cityPerformance
            .triangles,
      ),
    )
    .toBeGreaterThan(500000);
});
