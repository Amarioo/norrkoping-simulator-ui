import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Vehicle Lights Phase F1: at night a followed car lights the road in front of it (beam on vs off,
// same frame otherwise), the beams cost no shader programs, switch off by day and survive WebGL
// context restoration. Needs the backend (isolated copy, API_TARGET → port 8095).
type Pose = { id: number; kind: string; x: number; y: number; z: number; heading: number };
type State = {
  artificial: number;
  programs: number;
  realtimeLights: Record<string, number>;
  vehicleLights: {
    enabled: boolean;
    max: number;
    active: number;
    selected: { id: number; kind: string; distanceM: number; weight: number }[];
  };
};
const hook = 'globalThis.__cityLighting';
const call = <T>(page: Page, expr: string) => page.evaluate((e) => (0, eval)(e) as T, expr);
const state = (page: Page) =>
  call<State>(
    page,
    `(() => { const l = ${hook}; const d = l.describe(); return { artificial: d.artificial, programs: d.programs, realtimeLights: d.realtimeLights, vehicleLights: d.vehicleLights }; })()`,
  );
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Mean luma of a square (side 2·half px) around a point of the map panel screenshot. */
const luma = (page: Page, png: Buffer, cx: number, cy: number, half: number) =>
  page.evaluate(
    async ({ b64, cx, cy, half }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const x0 = Math.max(0, Math.round(cx - half)),
        y0 = Math.max(0, Math.round(cy - half));
      const w = Math.min(img.width - x0, 2 * half),
        h = Math.min(img.height - y0, 2 * half);
      const d = g.getImageData(x0, y0, w, h).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4)
        s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    },
    { b64: png.toString('base64'), cx, cy, half },
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

test('Phase F1 vehicle lights: beam in front of a followed car at night, off by day, no new programs, context restoration', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', {
    data: {
      compact: 40,
      estate: 20,
      trucks: 6,
      buses: 4,
      trams: 0,
      trains: 0,
      flights: false,
      timeScale: 3,
    },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await expect
    .poll(() => call<number>(page, `${hook}.vehiclePoses().length`), { timeout: 30000 })
    .toBeGreaterThan(40);

  // Follow a car (paused simulation: the follow camera settles on a fixed frame).
  const poses = await call<Pose[]>(page, `${hook}.vehiclePoses()`);
  const car = poses.filter((p) => p.kind === 'compact').sort((a, b) => a.id - b.id)[0];
  await page.selectOption('#vehicle-select', String(car.id));
  await page.getByRole('button', { name: /Följ fordonet/ }).click();
  await expect(page.locator('.map-status')).toContainText('FÖLJER FORDON');
  await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
  await page.waitForTimeout(5000);
  await call(page, `${hook}.settle()`);
  await frames(page);

  // The followed car is the nearest vehicle and has a beam; no real-time lights exist.
  const night = await state(page);
  expect(night.artificial).toBe(1);
  expect(night.vehicleLights.enabled).toBe(true);
  expect(night.vehicleLights.max).toBe(16);
  expect(night.vehicleLights.active).toBeGreaterThanOrEqual(1);
  expect(night.vehicleLights.active).toBeLessThanOrEqual(16);
  expect(night.vehicleLights.selected[0].id).toBe(car.id);
  expect(night.realtimeLights).toMatchObject({ point: 0, spot: 0, shadowMaps: 0 });

  // Screen point on the road 12 m ahead of the car, in map-panel screenshot pixels.
  const target = await page.evaluate((id) => {
    const g = globalThis as any;
    const p = g.__cityLighting.vehiclePoses().find((v: Pose) => v.id === id);
    const { camera } = g.__cityCamera;
    const v = camera.position.clone();
    v.set(p.x + (Math.sin(p.heading) * 12) / 25, p.y, p.z + (Math.cos(p.heading) * 12) / 25);
    v.project(camera);
    const canvas = document.querySelector('.map-panel canvas')!.getBoundingClientRect();
    const panel = document.querySelector('.map-panel')!.getBoundingClientRect();
    return {
      x: canvas.left - panel.left + ((v.x + 1) / 2) * canvas.width,
      y: canvas.top - panel.top + ((1 - v.y) / 2) * canvas.height,
      inView: Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1,
    };
  }, car.id);
  expect(target.inView).toBe(true);
  const shot = async () => {
    await frames(page);
    return page.locator('.map-panel').screenshot();
  };
  const on = await shot();
  const onAgain = await shot();
  await call(page, `${hook}.setVehicleBeams(false)`);
  const off = await shot();
  const offState = await state(page);
  await call(page, `${hook}.setVehicleBeams(true)`);
  const back = await shot();
  const lumaOn = await luma(page, on, target.x, target.y, 30),
    lumaOff = await luma(page, off, target.x, target.y, 30),
    lumaBack = await luma(page, back, target.x, target.y, 30);
  // Brighter road in front of the car with its beam; the frame is otherwise stable.
  expect(lumaOn).toBeGreaterThan(lumaOff * 1.25 + 4);
  expect(Math.abs(lumaBack - lumaOn)).toBeLessThan(1.5);
  expect(Math.abs((await luma(page, onAgain, target.x, target.y, 30)) - lumaOn)).toBeLessThan(1.5);
  // Switching the beams (count 0 ↔ n) creates no shader program.
  expect(offState.vehicleLights.active).toBe(0);
  expect(offState.programs).toBe(night.programs);
  expect((await state(page)).programs).toBe(night.programs);

  // By day the beams are off (count 0) and still no new program.
  await setTime(page, 12 * 60);
  await call(page, `${hook}.settle()`);
  await frames(page);
  const day = await state(page);
  expect(day.artificial).toBe(0);
  expect(day.vehicleLights.active).toBe(0);
  expect(day.programs).toBe(night.programs);
  await setTime(page, 21 * 60 + 30);
  await call(page, `${hook}.settle()`);
  await frames(page);
  expect((await state(page)).vehicleLights.active).toBe(night.vehicleLights.active);

  // WebGL context loss and restoration: beams come back, no extra programs.
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
  const restoredShot = await shot();
  const restored = await state(page);
  const lumaRestored = await luma(page, restoredShot, target.x, target.y, 30);
  expect(restored.vehicleLights.active).toBe(night.vehicleLights.active);
  expect(restored.programs).toBeLessThanOrEqual(night.programs);
  expect(Math.abs(lumaRestored - lumaOn)).toBeLessThan(1.5);

  fs.mkdirSync('test-results/vehicle-lights-f1', { recursive: true });
  fs.writeFileSync('test-results/vehicle-lights-f1/beam-on.png', on);
  fs.writeFileSync('test-results/vehicle-lights-f1/beam-off.png', off);
  fs.writeFileSync(
    'test-results/vehicle-lights-f1/e2e.json',
    JSON.stringify(
      { car, target, night, offState, day, restored, luma: { lumaOn, lumaOff, lumaBack, lumaRestored } },
      null,
      1,
    ),
  );
  expect(errors).toEqual([]);
  // Restore the normal initial scene (as tests/simulation.spec.ts does).
  await request.post('/api/simulator/settings', {
    data: { compact: 100, estate: 60, trucks: 20, buses: 12, trams: 8, trains: 2, flights: true, timeScale: 3 },
  });
  await request.post('/api/simulator/reset', { data: {} });
  await request.post('/api/simulator/pause', { data: { paused: false } });
});
