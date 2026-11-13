import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Phase C2: the Vrinnevi illuminated trail in the running app. The 58 new lanterns are in the set and
// light the ground beside the trail at 21:30 (against the set without them, registries.cityNoTrail());
// after 22:00 the whole loop (101 lamps) is switched off while the street lighting stays on; at 06:30
// it is on again; no three.js lights and the shader program count stays 20. No backend needed.
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
/** The trail's parts of the lamp visuals: flagged halos, the scheduled lens mesh and its level. */
const visuals = (page: Page) =>
  page.evaluate(() => {
    const group = (globalThis as any).__cityLighting.group;
    let halo: any = null,
      lens: any = null;
    group.traverse((o: any) => {
      if (o.name === 'lighting-halos') halo = o;
      if (o.name === 'lighting-lens-park-lantern-4m-2700-scheduled') lens = o;
    });
    const flags = halo.geometry.getAttribute('haloScheduled').array as Float32Array;
    let flagged = 0;
    for (let i = 0; i < halo.count; i++) flagged += flags[i];
    return {
      halos: halo.count,
      flagged,
      haloScheduleLevel: halo.material.uniforms.haloScheduleLevel.value,
      lens: !!lens,
      lensCount: lens?.count ?? 0,
      lensColor: lens ? lens.material.color.r + lens.material.color.g + lens.material.color.b : 0,
    };
  });

test('Phase C2 trail: 58 new lanterns light the loop at 21:30, the loop is dark after 22:00 and lit again at 06:30, 20 programs', async ({
  page,
}) => {
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

  // 21:30: the trail is on; the set holds this phase's 58 lanterns and 101 scheduled lamps.
  const start = await state(page);
  expect(start.artificial).toBeGreaterThan(0.95);
  expect(start.trailLighting).toMatchObject({
    category: 'trail',
    rollout: 'lighting-c2-v1',
    fixtures: 58,
    scheduled: 101,
    on: true,
    level: 1,
  });
  expect(start.trailLighting.schedule.status).toBe('assumption');
  expect(start.streetLighting.rollouts['lighting-c2-v1']).toEqual({ mapped: 0, estimated: 58 });
  expect(start.streetLighting.index.overflowCells).toBe(0);
  expect(start.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });
  expect(start.programs).toBe(20);

  const lit = await shot(page);
  const at = await projectBase(page);
  const litLuma = await luma(page, lit, at.x, at.y);
  const v = await visuals(page);
  expect(v.flagged).toBe(101);
  expect(v.halos).toBe(start.fixtures);
  expect(v.haloScheduleLevel).toBe(1);
  expect(v.lens).toBe(true);
  expect(v.lensCount).toBeGreaterThan(0);

  // Against main's set without this phase's lanterns: the ground at the post is dark there.
  expect(await call(page, `${hook}.replaceStreetLighting(${hook}.registries.cityNoTrail())`)).toEqual({ ok: true });
  const without = await state(page);
  expect(without.fixtures).toBe(start.fixtures - 58);
  expect(without.streetLighting.rollouts['lighting-c2-v1']).toBeUndefined();
  expect(without.trailLighting).toMatchObject({ fixtures: 0, scheduled: 43 });
  const beforeLuma = await luma(page, await shot(page), at.x, at.y);
  expect(await call(page, `${hook}.replaceStreetLighting(${hook}.registries.city())`)).toEqual({ ok: true });
  expect((await state(page)).fixtures).toBe(start.fixtures);
  console.log(`[trail] ${POST_ID} ground luma at 21:30: without C2 ${beforeLuma.toFixed(1)}, with ${litLuma.toFixed(1)}`);
  expect(litLuma).toBeGreaterThan(beforeLuma * 1.5 + 10);

  // 22:30: the loop is switched off, the street lighting is not.
  await setTime(page, 22 * 60 + 30);
  await page.waitForTimeout(400);
  const off = await state(page);
  expect(off.artificial).toBeGreaterThan(0.95);
  expect(off.trailLighting).toMatchObject({ on: false, level: 0 });
  const offLuma = await luma(page, await shot(page), at.x, at.y);
  const vOff = await visuals(page);
  expect(vOff.haloScheduleLevel).toBe(0);
  expect(vOff.lensColor).toBeLessThan(v.lensColor / 2);
  expect(await call<number>(page, `${hook}.uniforms.cityScheduleLevel.value`)).toBe(0);
  expect(await call<number>(page, `${hook}.uniforms.cityLampLevel.value`)).toBeGreaterThan(0.95);
  console.log(`[trail] ground luma at 22:30 (switched off): ${offLuma.toFixed(1)}`);
  expect(Math.abs(offLuma - beforeLuma)).toBeLessThan(3);
  expect(off.programs).toBe(20);

  // 06:30 (still dark in November): on again, the same brightness as in the evening.
  await setTime(page, 6 * 60 + 30);
  await page.waitForTimeout(400);
  const morning = await state(page);
  expect(morning.artificial).toBeGreaterThan(0.95);
  expect(morning.trailLighting).toMatchObject({ on: true, level: 1 });
  const morningLuma = await luma(page, await shot(page), at.x, at.y);
  console.log(`[trail] ground luma at 06:30: ${morningLuma.toFixed(1)}`);
  expect(Math.abs(morningLuma - litLuma)).toBeLessThan(0.15 * litLuma);

  // Day: the schedule allows the lamps, the daylight level keeps them off; no new program.
  await setTime(page, 12 * 60 + 30);
  await page.waitForTimeout(400);
  const day = await state(page);
  expect(day.artificial).toBeLessThan(0.01);
  expect(day.trailLighting.on).toBe(true);
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
  // The earlier lanterns on the loop are there, and follow the schedule.
  expect(d.trailLighting).toMatchObject({ fixtures: 0, scheduled: 43, on: true });
});
