import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Lighting Phase L2d: site lighting (parking lots, the rail yard, private site roads) loads with the
// citywide street set before map-ready as its own category (describe().siteLighting); at night the
// parking lots beside Polishuset (Stinsen 1) are brighter than with the set of main (the same app with
// the site category left out: registries.cityStreets(), = main's rendered set), by day only poles
// change; no three.js lights, the shader program count stays 20, and `?lighting=no-l2d` leaves the
// category out. No backend needed.
type Hook = {
  settle(): void;
  describe(): {
    fixtures: number;
    programs: number;
    exposure: number;
    realtimeLights: Record<string, number>;
    siteLighting: { category: string; rollout: string; shown: boolean; fixtures: number; streetFixtures: number };
    streetLighting: {
      status: string;
      rollouts: Record<string, { mapped: number; estimated: number }>;
      index: { maxRawOccupancy: number; overflowCells: number };
    };
  };
};
const hook = 'globalThis.__cityLighting';
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
const setTime = (page: Page, minutes: number) =>
  page.$eval(
    '#light-time',
    (el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    minutes,
  );
const state = (page: Page) =>
  page.evaluate(() => {
    const l = (globalThis as unknown as { __cityLighting: Hook }).__cityLighting;
    l.settle();
    return l.describe();
  });
// scripts/lighting-l2d/poses.json police-lots-elevated: the lots south-west of the police tower.
const POSE = { position: [-21.5, 3.2, -37.0], target: [-29.5, 0.4, -29.0] };
const shot = async (page: Page) => {
  await page.evaluate((p) => {
    const { camera, controls } = (globalThis as any).__cityCamera;
    camera.position.fromArray(p.position);
    controls.target.fromArray(p.target);
    controls.update();
    (globalThis as any).__cityLighting.settle();
  }, POSE);
  await page.waitForTimeout(800);
  await frames(page);
  return page.locator('.map-panel').screenshot();
};
/** Mean luma of the screenshot, or of a box given as fractions [x0, y0, x1, y1] of its size. */
const luma = (page: Page, png: Buffer, box = [0, 0, 1, 1]) =>
  page.evaluate(
    async ([b64, b]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const [x0, y0, x1, y1] = (b as number[]).map((v, i) => Math.round(v * (i % 2 ? img.height : img.width)));
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    },
    [png.toString('base64'), box] as const,
  );

test('Phase L2d site lighting: own category, lights the lots at Polishuset at night, poles only by day, 20 programs', async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(3000);
  await frames(page);
  const start = await state(page);
  expect(start.streetLighting.status).toBe('ok');
  const l2d = start.streetLighting.rollouts['lighting-l2d-v1'];
  expect(l2d.mapped).toBe(0);
  expect(l2d.estimated).toBeGreaterThan(3000);
  expect(start.siteLighting).toMatchObject({ category: 'site', rollout: 'lighting-l2d-v1', shown: true, fixtures: l2d.estimated });
  expect(start.fixtures).toBe(start.siteLighting.streetFixtures + l2d.estimated);
  expect(start.streetLighting.index.overflowCells).toBe(0);
  expect(start.streetLighting.index.maxRawOccupancy).toBeLessThanOrEqual(32);
  expect(start.programs).toBe(20);
  expect(start.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });

  // Night: the lots are brighter with L2d than with main's set (site category left out).
  const withSites = await shot(page);
  const call = <T>(expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
  expect(await call(`${hook}.replaceStreetLighting(${hook}.registries.cityStreets())`)).toEqual({ ok: true });
  const streetsOnly = await shot(page);
  const without = await state(page);
  expect(without.siteLighting).toMatchObject({ shown: false, fixtures: 0 });
  expect(without.fixtures).toBe(start.siteLighting.streetFixtures);
  expect(without.exposure).toBe(start.exposure);
  // The lot fills the lower middle of this pose.
  const LOT = [0.3, 0.55, 0.85, 0.95];
  const lit = await luma(page, withSites, LOT),
    dark = await luma(page, streetsOnly, LOT);
  const litFrame = await luma(page, withSites),
    darkFrame = await luma(page, streetsOnly);
  console.log(`L2d luma at the Polishuset lots: ${dark.toFixed(1)} → ${lit.toFixed(1)} (frame ${darkFrame.toFixed(1)} → ${litFrame.toFixed(1)})`);
  expect(lit).toBeGreaterThan(dark * 1.5);
  expect(litFrame).toBeGreaterThan(darkFrame);
  // Back to the full set: the same picture as before the swap, no new programs.
  expect(await call(`${hook}.replaceStreetLighting(${hook}.registries.city())`)).toEqual({ ok: true });
  expect((await shot(page)).equals(withSites)).toBe(true);
  const back = await state(page);
  expect(back.fixtures).toBe(start.fixtures);
  expect(back.programs).toBe(20);

  // Day: only the poles differ (no light), and the program count is unchanged.
  await setTime(page, 759);
  await page.waitForTimeout(400);
  const dayWith = await shot(page);
  const dayStart = await state(page);
  expect(dayStart.programs).toBe(20);
  await call(`${hook}.replaceStreetLighting(${hook}.registries.cityStreets())`);
  const dayWithout = await shot(page);
  const dayDiff = Math.abs((await luma(page, dayWith, LOT)) - (await luma(page, dayWithout, LOT)));
  expect(dayDiff).toBeLessThan(1);
  await call(`${hook}.replaceStreetLighting(${hook}.registries.city())`);
  const day = await state(page);
  // By day no halo is drawn, so a set swap releases the halo program until night (as in the L2a
  // test): never more programs than before the swap.
  expect(day.programs).toBeLessThanOrEqual(dayStart.programs);
  expect(day.realtimeLights).toEqual(start.realtimeLights);
  fs.mkdirSync('test-results/lighting-l2d', { recursive: true });
  fs.writeFileSync(
    'test-results/lighting-l2d/e2e.json',
    JSON.stringify({ start: { fixtures: start.fixtures, siteLighting: start.siteLighting, programs: start.programs }, luma: { lit, dark, litFrame, darkFrame, dayDiff } }, null, 1),
  );
  expect(errors).toEqual([]);
});

test('Phase L2d: ?lighting=no-l2d leaves the site category out', async ({ page }) => {
  test.setTimeout(200000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off&lighting=no-l2d');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  await frames(page);
  const d = await state(page);
  expect(d.siteLighting).toMatchObject({ shown: false, fixtures: 0 });
  expect(d.streetLighting.rollouts['lighting-l2d-v1']).toBeUndefined();
  expect(d.streetLighting.rollouts['lighting-l2bc-v1']).toBeDefined();
});
