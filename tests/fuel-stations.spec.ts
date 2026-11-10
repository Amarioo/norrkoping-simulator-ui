import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { expectSamePicture } from './samePicture';

// Phase D2: fuel stations in the running app. The canopy model is in the scene (three meshes), the
// 239 canopy downlights (estimates) are their own rollout in the citywide set, at night the forecourt
// under a canopy is much brighter than with main's set (registries.cityNoFuel()), by day the lights
// change nothing, the sign bands glow only at night, and there are no three.js lights and no new
// shader programs (20 by day and at night). No backend needed.
type Hook = {
  settle(): void;
  describe(): {
    fixtures: number;
    programs: number;
    realtimeLights: Record<string, number>;
    streetLighting: {
      status: string;
      rollouts: Record<string, { mapped: number; estimated: number }>;
      index: { maxRawOccupancy: number; overflowCells: number };
    };
  };
};
const hook = 'globalThis.__cityLighting';
const map = JSON.parse(fs.readFileSync('src/lib/data/norrkoping-map.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('src/lib/data/fuel-canopies.json', 'utf8'));
const M = 25;
// St1 Boktryckargatan (canopy way/287687456): camera south-south-east of it, 4 m up.
const CANOPY = 'way/287687456';
const ring = map.buildings.find((b: { id: string }) => b.id === CANOPY).rings[0] as number[][];
const canopy = data.canopies.find((c: { id: string }) => c.id === CANOPY);
const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length,
  cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
const a = (150 * Math.PI) / 180;
const POSE = {
  position: [
    cx + (Math.sin(a) * 28) / M,
    (canopy.groundRh2000 + 4) / M,
    cz - (Math.cos(a) * 28) / M,
  ],
  target: [cx, (canopy.groundRh2000 + 2.5) / M, cz],
};
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
/** Screen position (panel pixels) of a scene point in the current camera. */
const project = (page: Page, p: number[]) =>
  page.evaluate((p) => {
    const { camera } = (globalThis as any).__cityCamera;
    camera.updateMatrixWorld();
    const v = camera.position.clone().set(p[0], p[1], p[2]).project(camera);
    const canvas = document.querySelector('.map-panel canvas') as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect(),
      panel = (document.querySelector('.map-panel') as HTMLElement).getBoundingClientRect();
    return {
      x: r.left - panel.left + ((v.x + 1) / 2) * r.width,
      y: r.top - panel.top + ((1 - v.y) / 2) * r.height,
    };
  }, p);
/** Mean luma of a square of side 2·half pixels around (x, y). */
const luma = (page: Page, png: Buffer, x: number, y: number, half = 20) =>
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
/** The fuel-station group's meshes and their emissive intensities. */
const fuelGroup = (page: Page) =>
  page.evaluate(() => {
    let root = (globalThis as any).__cityLighting.group;
    while (root.parent) root = root.parent;
    let group: any = null;
    root.traverse((o: any) => {
      if (o.name === 'fuel-stations') group = o;
    });
    if (!group) return null;
    return group.children.map((m: any) => ({
      name: m.name,
      emissive: m.material.emissiveIntensity,
    }));
  });

test('Phase D2 fuel stations: canopies in the scene, downlights light the forecourt at night only, 20 programs', async ({
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

  // Night: the model and its glow; the downlights as their own rollout in the citywide set.
  const start = await state(page);
  expect(start.streetLighting.status).toBe('ok');
  expect(start.streetLighting.rollouts['fuel-d2-v1']).toEqual({ mapped: 0, estimated: 239 });
  expect(start.streetLighting.index.overflowCells).toBe(0);
  expect(start.streetLighting.index.maxRawOccupancy).toBeLessThanOrEqual(32);
  expect(start.programs).toBe(20);
  expect(start.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });
  const nightModel = await fuelGroup(page);
  expect(nightModel!.map((m: { name: string }) => m.name)).toEqual([
    'fuel-structure',
    'fuel-soffits',
    'fuel-lit',
  ]);
  expect(nightModel![2].emissive).toBeGreaterThan(0.8);

  // The forecourt under the canopy (its centre on the ground) against main's set without the downlights.
  const lit = await shot(page);
  const ground = await project(page, [cx, canopy.groundRh2000 / M, cz]);
  const call0 = await call(page, `${hook}.replaceStreetLighting(${hook}.registries.cityNoFuel())`);
  expect(call0).toEqual({ ok: true });
  const dark = await shot(page);
  const without = await state(page);
  expect(without.fixtures).toBe(start.fixtures - 239);
  expect(without.streetLighting.rollouts['fuel-d2-v1']).toBeUndefined();
  const litLuma = await luma(page, lit, ground.x, ground.y),
    darkLuma = await luma(page, dark, ground.x, ground.y);
  console.log(
    `[fuel] night forecourt luma: without downlights ${darkLuma.toFixed(1)}, with ${litLuma.toFixed(1)}`,
  );
  expect(litLuma).toBeGreaterThan(darkLuma * 1.5 + 20);
  // Back to the full set: the same picture as before the swap.
  expect(await call(page, `${hook}.replaceStreetLighting(${hook}.registries.city())`)).toEqual({
    ok: true,
  });
  await expectSamePicture(page, await shot(page), lit);
  expect((await state(page)).programs).toBe(20);

  // Day: no glow, and the downlights change nothing on screen.
  await setTime(page, 750);
  await page.waitForTimeout(400);
  const dayWith = await shot(page);
  const dayModel = await fuelGroup(page);
  expect(dayModel![1].emissive).toBe(0);
  expect(dayModel![2].emissive).toBe(0);
  const day = await state(page);
  expect(day.programs).toBe(20);
  await call(page, `${hook}.replaceStreetLighting(${hook}.registries.cityNoFuel())`);
  const dayWithout = await shot(page);
  const diff = Math.abs(
    (await luma(page, dayWith, ground.x, ground.y)) -
      (await luma(page, dayWithout, ground.x, ground.y)),
  );
  expect(diff).toBeLessThan(1);
  await call(page, `${hook}.replaceStreetLighting(${hook}.registries.city())`);
  expect((await state(page)).programs).toBeLessThanOrEqual(day.programs);
  expect(errors).toEqual([]);
});
