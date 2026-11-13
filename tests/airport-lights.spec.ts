import { test, expect, type Page } from '@playwright/test';

// Airport Lighting Phase E1: the ESSP RWY 09/27 lights (src/lib/airport/). Lit at night with the
// switch on 'auto', dark by day on 'auto' and always with 'off', lit by day with 'on'; the runway in
// use decides the approach lights and the PAPI; PAPI shows 2 white / 2 red on the 3° slope, all white
// above, all red below; no new shader programs; survives a WebGL context loss. No backend needed.
type Airport = {
  lights: number;
  byGroup: Record<string, number>;
  level: number;
  visible: boolean;
  runwayInUse: string;
  litByGroup: Record<string, number>;
  papi: Record<string, string>;
};
const airport = (page: Page) =>
  page.evaluate(() => {
    const l = (globalThis as any).__cityLighting;
    l.settle();
    return l.airport() as Airport;
  });
const programs = (page: Page) =>
  page.evaluate(() => (globalThis as any).__cityLighting.describe().programs as number);
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
const select = async (page: Page, id: string, value: string) => {
  // Interface U1: the lighting controls live in the "Tid och ljus" tab.
  await page.getByRole('tab', { name: 'Tid och ljus' }).click();
  await page.selectOption(id, value);
  await frames(page);
};
// Threshold 27 (scene units, 1 = 25 m); ground ≈ RH2000 9.8 m. A pilot on the 3° slope 1 000 m out:
// eye height = MEHT (17 m) + 1 000 m · tan 3°.
const THR27: [number, number] = [191.357, 14.313],
  GROUND = 9.8 / 25,
  TAN3 = Math.tan((3 * Math.PI) / 180);
const onApproach27 = (page: Page, metres: number, extraM = 0) =>
  page.evaluate(
    ([x, y, z, tx, ty, tz]) => {
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.set(x, y, z);
      controls.target.set(tx, ty, tz);
      controls.update();
    },
    [
      THR27[0] + metres / 25,
      GROUND + (17 + metres * TAN3 + extraM) / 25,
      THR27[1],
      THR27[0] - 30,
      GROUND,
      THR27[1],
    ],
  );
/** Pixels brighter than sRGB luma 100 (the lights are small, bright points), decoded in the page. */
const bright = (page: Page, png: Buffer) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 100) n++;
    return n;
  }, png.toString('base64'));
const shot = async (page: Page) => {
  await frames(page);
  await page.waitForTimeout(400);
  return page.locator('.map-panel canvas').screenshot();
};

test('Airport Lighting E1: ESSP runway lights, own switch, runway in use, PAPI, programs, context loss', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off&lighting=a3');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await onApproach27(page, 1000);
  await frames(page);

  // Defaults: auto (lit when dark), runway 27 in use; the layout of src/lib/airport/runwayLights.ts.
  const night = await airport(page);
  // 470 in E1; 572 since the Calvert crossbars at 150–750 m (102 more approach lights).
  expect(night.lights).toBe(572);
  expect(night.byGroup).toEqual({ edge: 72, threshold: 32, approach: 370, papi: 8, taxiway: 90 });
  expect(night.visible).toBe(true);
  expect(night.level).toBeGreaterThan(0.9);
  expect(night.runwayInUse).toBe('27');
  // On the slope: approach 27 lights seen, PAPI 27 two white (outer C, D) and two red (A, B nearest).
  expect(night.litByGroup.approach).toBeGreaterThan(100);
  expect(night.papi['27']).toBe('RRWW');
  expect(night.papi['09']).toBe('----');
  const lit = await shot(page);
  const programsLit = await programs(page);

  await select(page, '#airport-lights', 'off');
  const off = await airport(page);
  expect(off.visible).toBe(false);
  const dark = await shot(page);
  // Runway, approach and taxiway lights: several hundred bright pixels more than with the switch off.
  expect(await bright(page, lit)).toBeGreaterThan((await bright(page, dark)) + 300);
  // The glow reuses the street-light halo program: lighting it compiles nothing new.
  expect(programsLit).toBe(await programs(page));
  await select(page, '#airport-lights', 'auto');

  // Above and below the slope.
  await onApproach27(page, 1000, 40);
  await frames(page);
  expect((await airport(page)).papi['27']).toBe('WWWW');
  await onApproach27(page, 1000, -25);
  await frames(page);
  expect((await airport(page)).papi['27']).toBe('RRRR');

  // Runway 09 in use: the 27 approach lights and PAPI go dark (seen from the 27 side).
  await onApproach27(page, 1000);
  await select(page, '#airport-runway', '09');
  const rwy09 = await airport(page);
  expect(rwy09.runwayInUse).toBe('09');
  expect(rwy09.litByGroup.approach ?? 0).toBe(0);
  expect(rwy09.papi['27']).toBe('----');
  expect(rwy09.litByGroup.edge).toBe(night.litByGroup.edge);
  await select(page, '#airport-runway', '27');

  // By day: dark on auto, lit on 'on'.
  await page.$eval('#light-time', (el) => {
    (el as HTMLInputElement).value = '759';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1600);
  await frames(page);
  expect((await airport(page)).visible).toBe(false);
  await select(page, '#airport-lights', 'on');
  const dayOn = await airport(page);
  expect(dayOn.visible).toBe(true);
  expect(dayOn.level).toBe(1);
  await select(page, '#airport-lights', 'auto');

  // Night again, then a WebGL context loss and restoration: still lit, same picture.
  await page.$eval('#light-time', (el) => {
    (el as HTMLInputElement).value = '1290';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1600);
  await onApproach27(page, 1000);
  const before = await bright(page, await shot(page));
  await page.evaluate(async () => {
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    const lost = new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
    const restored = new Promise((r) =>
      canvas.addEventListener('webglcontextrestored', r, { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise((r) => setTimeout(r, 200));
    extension.restoreContext();
    await restored;
  });
  await page.waitForTimeout(3000);
  const after = await airport(page);
  expect(after.visible).toBe(true);
  expect(after.papi['27']).toBe('RRWW');
  expect(Math.abs((await bright(page, await shot(page))) - before)).toBeLessThan(before * 0.05);
  expect(errors).toEqual([]);
});
