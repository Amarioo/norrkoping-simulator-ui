import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Phase C2: the Vrinnevi illuminated trail in the running app. The 58 new lanterns are in the set and
// light the ground beside the trail at night (against the set without them, registries.cityNoTrail());
// the loop is lit all night like all other lighting (21:30, 23:30 and 03:00 give the same picture);
// no three.js lights and the shader program count stays 20. No backend needed.
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const prov = JSON.parse(fs.readFileSync('docs/trail-c2/data/streetlights-c2-provenance.json', 'utf8'));
const r = map.meta.reference;
const UNIT = r.metresPerUnit * r.gridScaleFactor,
  M = r.metresPerUnit;
// A new lantern on the western leg (way 122294025, highway=track), about half-way along it.
const onWay = (prov.positions as [string, number, number][]).filter((p) => p[0].includes('way/122294025:'));
const MID = Math.floor(onWay.length / 2);
const [POST_ID, E, N] = onWay[MID];
const px = (E - r.originEasting) / UNIT,
  pz = (r.originNorthing - N) / UNIT;
// The camera stands under the tree crowns, 9 m from the post towards the neighbouring post (so beside
// the trail), 2.2 m above the ground.
const [, E2, N2] = onWay[MID - 1];
const along = Math.hypot(E2 - E, N2 - N);
const cx = px + (((E2 - E) / along) * 9) / M,
  cz = pz - (((N2 - N) / along) * 9) / M;
type Hook = { settle(): void; describe(): any };
const hook = '__cityLighting';
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
const call = <T>(page: Page, expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
/** Camera under the crowns, 9 m from the post, looking at its base. */
const shot = async (page: Page) => {
  await page.evaluate(
    async ({ px, pz, cx, cz, M }) => {
      const { terrain } = await import('/src/lib/terrain.ts' as string);
      const y = terrain.groundHeight(px, pz) as number;
      const { camera, controls } = (globalThis as any).__cityCamera;
      camera.position.set(cx, (terrain.groundHeight(cx, cz) as number) + 2.2 / M, cz);
      controls.target.set(px, y, pz);
      controls.update();
      (globalThis as any).__cityLighting.settle();
      (globalThis as any).__trailBase = [px, y, pz];
    },
    { px, pz, cx, cz, M },
  );
  await page.waitForTimeout(800);
  await frames(page);
  return page.locator('.map-panel').screenshot();
};
/** Screen position (panel pixels) of the post base in the current camera. */
const projectBase = (page: Page) =>
  page.evaluate(() => {
    const p = (globalThis as any).__trailBase as number[];
    const { camera } = (globalThis as any).__cityCamera;
    camera.updateMatrixWorld();
    const v = camera.position.clone().set(p[0], p[1], p[2]).project(camera);
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const c = canvas.getBoundingClientRect(),
      panel = (document.querySelector('.map-panel') as HTMLElement).getBoundingClientRect();
    return {
      x: c.left - panel.left + ((v.x + 1) / 2) * c.width,
      y: c.top - panel.top + ((1 - v.y) / 2) * c.height,
    };
  });
/** Mean luma of a square of side 2·half pixels around (x, y). */
const luma = (page: Page, png: Buffer, x: number, y: number, half = 24) =>
  page.evaluate(
    async ({ b64, x, y, half }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.round(x) - half, Math.round(y) - half, 2 * half, 2 * half).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    },
    { b64: png.toString('base64'), x, y, half },
  );
test('Phase C2 trail: 58 new lanterns light the loop, all night, 20 programs', async ({ page }) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => route.abort());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-11-13&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(2000);
  await frames(page);

  // 21:30: the set holds this phase's 58 lanterns; 101 lamps stand on the loop.
  const start = await state(page);
  expect(start.artificial).toBeGreaterThan(0.95);
  expect(start.trailLighting).toEqual({
    category: 'trail',
    rollout: 'lighting-c2-v1',
    fixtures: 58,
    loopLamps: 101,
  });
  expect(start.streetLighting.rollouts['lighting-c2-v1']).toEqual({ mapped: 0, estimated: 58 });
  expect(start.streetLighting.index.overflowCells).toBe(0);
  expect(start.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });
  expect(start.programs).toBe(20);

  const lit = await shot(page);
  const at = await projectBase(page);
  const litLuma = await luma(page, lit, at.x, at.y);

  // Against main's set without this phase's lanterns: the ground at the post is dark there.
  expect(await call(page, `${hook}.replaceStreetLighting(${hook}.registries.cityNoTrail())`)).toEqual({ ok: true });
  const without = await state(page);
  expect(without.fixtures).toBe(start.fixtures - 58);
  expect(without.streetLighting.rollouts['lighting-c2-v1']).toBeUndefined();
  expect(without.trailLighting).toMatchObject({ fixtures: 0, loopLamps: 43 });
  const beforeLuma = await luma(page, await shot(page), at.x, at.y);
  expect(await call(page, `${hook}.replaceStreetLighting(${hook}.registries.city())`)).toEqual({ ok: true });
  expect((await state(page)).fixtures).toBe(start.fixtures);
  console.log(`[trail] ${POST_ID} ground luma at 21:30: without C2 ${beforeLuma.toFixed(1)}, with ${litLuma.toFixed(1)}`);
  expect(litLuma).toBeGreaterThan(beforeLuma * 1.5 + 10);

  // Late night: still lit, the same brightness (no switch-off).
  for (const minutes of [23 * 60 + 30, 3 * 60]) {
    await setTime(page, minutes);
    await page.waitForTimeout(400);
    const night = await state(page);
    expect(night.artificial).toBeGreaterThan(0.95);
    const l = await luma(page, await shot(page), at.x, at.y);
    console.log(`[trail] ground luma at ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}: ${l.toFixed(1)}`);
    expect(Math.abs(l - litLuma)).toBeLessThan(0.1 * litLuma);
    expect(night.programs).toBe(20);
  }

  // Day: the lamps are off with all other lighting; no new program.
  await setTime(page, 12 * 60 + 30);
  await page.waitForTimeout(400);
  const day = await state(page);
  expect(day.artificial).toBeLessThan(0.01);
  expect(day.programs).toBe(20);
  expect(errors).toEqual([]);
});

test('Phase C2 trail: ?lighting=no-c2 leaves the new lanterns out', async ({ page }) => {
  test.setTimeout(300000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?date=2026-11-13&time=21:30&stadium=off&lighting=no-c2');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  const d = await state(page);
  expect(d.streetLighting.rollouts['lighting-c2-v1']).toBeUndefined();
  // The earlier lanterns on the loop are there.
  expect(d.trailLighting).toMatchObject({ fixtures: 0, loopLamps: 43 });
});

test('Tid och ljus: Idrottsparkens floodlights are the only light switch left', async ({ page }) => {
  test.setTimeout(300000);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/?date=2026-11-13&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 150000 });
  await page.getByRole('tab', { name: 'Tid och ljus' }).click();
  await expect(page.locator('#stadium-lights')).toBeVisible();
  await expect(page.locator('#stadium-lights option')).toHaveCount(3);
  for (const gone of ['#airport-lights', '#airport-runway', '#aircraft-lights'])
    await expect(page.locator(gone)).toHaveCount(0);
  // The date, the clock and the time-lapse are still there (they set the time, not a light).
  for (const kept of ['#light-date', '#light-time', '#light-play']) await expect(page.locator(kept)).toBeVisible();
  // Everything else follows the darkness by itself: runway and aircraft lights are on their rule.
  const s = await page.evaluate(() => {
    const st = (globalThis as any).__cityLighting.state;
    return { airport: st.airport, aircraftLights: st.aircraftLights };
  });
  expect(s).toEqual({ airport: 'auto', aircraftLights: 'auto' });
});
