import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Aircraft Lights Phase E2 (src/lib/lighting/aircraftLights.ts, aircraftLightsView.ts): at night with
// flights on the aircraft shows its lights; the beacon flashes on the simulation clock and freezes when
// paused; from fixed viewpoints in the aircraft's own frame the left wing tip is red and on the correct
// side of the picture (front and behind), the right one green, the tail white; the glow compiles no
// shader program; it survives a WebGL context loss. Needs the backend (API_TARGET → port 8095).
type Light = {
  aircraft: string;
  kind: string;
  group: string;
  on: boolean;
  weight: number;
  rgb: [number, number, number];
  world: [number, number, number];
};
type Lights = {
  mode: string;
  nightLevel: number;
  window: [number, number];
  aircraft: number;
  poses: { id: string; phase: string; gear: boolean; matrix: number[] }[];
  capacity: number;
  instances: number;
  visible: boolean;
  lights: Light[];
};
const SETTINGS = {
  compact: 40,
  estate: 20,
  trucks: 6,
  buses: 4,
  trams: 0,
  trains: 0,
  flights: true,
};
const lights = (page: Page) =>
  page.evaluate(() => (globalThis as any).__cityLighting.aircraftLights() as Lights);
const programs = (page: Page) =>
  page.evaluate(() => (globalThis as any).__cityLighting.describe().programs as number);
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
/** Camera at a point of the aircraft's model frame (metres; +x left, +y up, +z forward). */
const view = (page: Page, eye: number[], at: number[]) =>
  page.evaluate(
    ({ eye, at }) => {
      const g = globalThis as any;
      const m: number[] = g.__cityLighting.aircraftLights().poses[0].matrix;
      const tf = ([x, y, z]: number[]) =>
        [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ] as [number, number, number];
      const { camera, controls } = g.__cityCamera;
      camera.position.set(...tf(eye));
      controls.target.set(...tf(at));
      controls.update();
    },
    { eye, at },
  );
/** Map-panel screenshot pixel of each light this frame. */
const projected = (page: Page) =>
  page.evaluate(() => {
    const g = globalThis as any;
    const { camera } = g.__cityCamera;
    const canvas = document.querySelector('.map-panel canvas')!.getBoundingClientRect();
    const panel = document.querySelector('.map-panel')!.getBoundingClientRect();
    const out: Record<string, { x: number; y: number; weight: number }> = {};
    for (const l of g.__cityLighting.aircraftLights().lights) {
      const v = camera.position
        .clone()
        .set(...l.world)
        .project(camera);
      out[l.kind] = {
        x: canvas.left - panel.left + ((v.x + 1) / 2) * canvas.width,
        y: canvas.top - panel.top + ((1 - v.y) / 2) * canvas.height,
        weight: l.weight,
      };
    }
    return out;
  });
/** Mean sRGB colour of a 6 × 6 px square of a PNG. */
const pixel = (page: Page, png: Buffer, x: number, y: number) =>
  page.evaluate(
    async ({ b64, x, y }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.round(x - 3), Math.round(y - 3), 6, 6).data;
      const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k];
      return s.map((v) => v / (d.length / 4)) as [number, number, number];
    },
    { b64: png.toString('base64'), x, y },
  );
const shot = async (page: Page) => {
  await frames(page);
  await page.waitForTimeout(300);
  await frames(page);
  return page.locator('.map-panel').screenshot();
};
const select = async (page: Page, id: string, value: string) => {
  await page.selectOption(id, value);
  await frames(page);
};

test('Aircraft Lights E2: lights at night, flashing on the simulation clock, red left / green right, no new programs, context loss', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/api/simulator/settings', { data: { ...SETTINGS, timeScale: 20 } });
  await request.post('/api/simulator/reset', { data: {} });
  await page.setViewportSize({ width: 1400, height: 1000 });
  // Starts with the aircraft lights switched off: the program count without them is the reference.
  await page.goto('/?date=2026-10-21&time=21:30&stadium=off&aircraftLights=off');
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({ timeout: 120000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await expect.poll(async () => (await lights(page)).mode).toBe('off');
  expect((await lights(page)).instances).toBe(0);

  await select(page, '#aircraft-lights', 'auto');
  // Airborne (fewer buildings around it): wait at time scale 20, then back to 3.
  await expect
    .poll(async () => (await lights(page)).poses[0]?.phase, { timeout: 180000, intervals: [100] })
    .toMatch(/^(CLIMB|CRUISE|APPROACH)$/);
  await request.post('/api/simulator/settings', { data: { ...SETTINGS, timeScale: 3 } });

  // Lit at night: 11 lights on the one aircraft, navigation and beacon on.
  const night = await lights(page);
  expect(night.mode).toBe('auto');
  expect(night.aircraft).toBe(1);
  expect(night.instances).toBe(11);
  expect(night.visible).toBe(true);
  expect(night.nightLevel).toBeGreaterThan(0.9);
  const on = (l: Lights, kind: string) => l.lights.find((x) => x.kind === kind)!;
  expect(on(night, 'navLeft').on).toBe(true);
  expect(on(night, 'navRight').on).toBe(true);
  expect(on(night, 'taxi').on).toBe(false);

  // The beacon flashes while the simulation runs (every frame for 3 s: both on and off seen) …
  const beacon = await page.evaluate(
    () =>
      new Promise<{ weights: number[]; t1: number[] }>((resolve) => {
        const g = globalThis as any;
        const weights: number[] = [],
          t1: number[] = [];
        const end = performance.now() + 3000;
        const step = () => {
          const d = g.__cityLighting.aircraftLights();
          weights.push(d.lights.find((l: Light) => l.kind === 'beaconTop').weight);
          t1.push(d.window[1]);
          if (performance.now() < end) requestAnimationFrame(step);
          else resolve({ weights, t1 });
        };
        requestAnimationFrame(step);
      }),
  );
  expect(Math.max(...beacon.weights)).toBeGreaterThan(0.1);
  expect(Math.min(...beacon.weights)).toBe(0);
  // … on a simulation clock that never runs backwards.
  for (let i = 1; i < beacon.t1.length; i++)
    expect(beacon.t1[i]).toBeGreaterThanOrEqual(beacon.t1[i - 1]);

  // Paused: the clock and the flashes stand still.
  await request.post('/api/simulator/pause', { data: { paused: true } });
  await page.waitForTimeout(1500);
  await frames(page);
  // Not frozen in the middle of a strobe flash (its white glare would cover the red / green lights).
  const strobeLit = async () =>
    (await lights(page)).lights.some((l) => l.group === 'strobe' && l.weight > 0);
  for (let i = 0; i < 20 && (await strobeLit()); i++) {
    await request.post('/api/simulator/pause', { data: { paused: false } });
    await page.waitForTimeout(150);
    await request.post('/api/simulator/pause', { data: { paused: true } });
    await page.waitForTimeout(1500);
    await frames(page);
  }
  expect(await strobeLit()).toBe(false);
  const p1 = await lights(page);
  await page.waitForTimeout(800);
  await frames(page);
  const p2 = await lights(page);
  expect(p2.window[0]).toBe(p2.window[1]);
  expect(p2.window).toEqual(p1.window);
  expect(on(p2, 'beaconTop').weight).toBe(on(p1, 'beaconTop').weight);
  // The body has settled (its smoothing converges): the lights stay with it.
  p2.poses[0].matrix.forEach((v, i) =>
    expect(Math.abs(v - p1.poses[0].matrix[i])).toBeLessThan(1e-6),
  );

  // Fixed viewpoints in the aircraft's frame (metres; +x = its left).
  const result: Record<string, unknown> = { phase: p2.poses[0].phase };
  // Behind, looking forward: left wing tip on the left of the picture; only the white tail light.
  await view(page, [0, 6, -42], [0, 2.5, 0]);
  const behind = await shot(page);
  const pb = await projected(page);
  expect(pb.navLeft.x).toBeLessThan(pb.navRight.x);
  expect(pb.navTail.weight).toBe(1);
  expect(pb.navLeft.weight).toBe(0);
  expect(pb.navRight.weight).toBe(0);
  const tail = await pixel(page, behind, pb.navTail.x, pb.navTail.y);
  expect(Math.min(...tail)).toBeGreaterThan(120);
  // In front, looking back: left wing tip on the right of the picture.
  await view(page, [0, 4, 42], [0, 2.5, 0]);
  await frames(page);
  const pf = await projected(page);
  expect(pf.navLeft.x).toBeGreaterThan(pf.navRight.x);
  expect(pf.navTail.weight).toBe(0);
  // From the left: red at the left wing tip, the green one not shown.
  await view(page, [42, 4, 3], [0, 2.5, 0]);
  const left = await shot(page);
  const pl = await projected(page);
  expect(pl.navLeft.weight).toBe(1);
  expect(pl.navRight.weight).toBe(0);
  const red = await pixel(page, left, pl.navLeft.x, pl.navLeft.y);
  expect(red[0]).toBeGreaterThan(red[1] + 30);
  expect(red[0]).toBeGreaterThan(150);
  // From the right: green at the right wing tip.
  await view(page, [-42, 4, 3], [0, 2.5, 0]);
  const right = await shot(page);
  const pr = await projected(page);
  expect(pr.navRight.weight).toBe(1);
  expect(pr.navLeft.weight).toBe(0);
  const green = await pixel(page, right, pr.navRight.x, pr.navRight.y);
  expect(green[1]).toBeGreaterThan(green[0] + 30);
  expect(green[1]).toBeGreaterThan(150);
  Object.assign(result, { pb, pf, pl, pr, tail, red, green });

  // Switch off: the red glow disappears; switching costs no shader program (the glow reuses the
  // street-light halo program, compiled long before).
  const programsOn = await programs(page);
  await view(page, [42, 4, 3], [0, 2.5, 0]);
  await select(page, '#aircraft-lights', 'off');
  const off = await shot(page);
  const offRed = await pixel(page, off, pl.navLeft.x, pl.navLeft.y);
  expect(offRed[0]).toBeLessThan(red[0] - 60);
  expect((await lights(page)).instances).toBe(0);
  await select(page, '#aircraft-lights', 'auto');
  await frames(page);
  expect(await programs(page)).toBe(programsOn);
  Object.assign(result, { offRed, programsOn });

  // WebGL context loss and restoration: the lights come back, same colour.
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
  const restoredShot = await shot(page);
  const restored = await lights(page);
  expect(restored.instances).toBe(11);
  const redAgain = await pixel(page, restoredShot, pl.navLeft.x, pl.navLeft.y);
  expect(Math.abs(redAgain[0] - red[0])).toBeLessThan(12);
  expect(await programs(page)).toBeLessThanOrEqual(programsOn);
  Object.assign(result, { redAgain });

  await request.post('/api/simulator/pause', { data: { paused: false } });
  fs.mkdirSync('test-results/aircraft-lights-e2', { recursive: true });
  fs.writeFileSync('test-results/aircraft-lights-e2/left.png', left);
  fs.writeFileSync('test-results/aircraft-lights-e2/right.png', right);
  fs.writeFileSync('test-results/aircraft-lights-e2/e2e.json', JSON.stringify(result, null, 1));
  expect(errors).toEqual([]);
});
