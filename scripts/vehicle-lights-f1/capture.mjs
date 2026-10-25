// Vehicle Lights Phase F1 captures (before/after pictures and draw calls/triangles), WITH TRAFFIC.
// Requires a DEV server (__cityLighting, __cityCamera, __cityPerformance) whose /api is proxied to the
// isolated backend copy, and a PAUSED world (scripts/vehicle-lights-f1/measure.mjs leaves it reset and
// paused; the same frozen vehicles are then seen by the before and the after app).
//
//   node scripts/vehicle-lights-f1/capture.mjs <outDir> <baseUrl>
//
// Poses are relative to vehicles of the frozen world (the lowest-id car and bus), so before and after
// share the exact camera. Writes <outDir>/<pose>-<state>.png and <outDir>/metadata.json. Raw output
// belongs under work/vehicle-lights-f1/; curated copies go to docs/vehicle-lights-f1/evidence/ once.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
const API = process.env.API ?? 'http://127.0.0.1:8095';
const world = await (await fetch(API + '/api/simulator/world')).json();
if (!world.paused) throw new Error('pause the simulation first (measure.mjs leaves it paused)');
const lowest = (kind) =>
  world.vehicles.filter((v) => v.kind === kind).sort((a, b) => a.id - b.id)[0];
const car = lowest('compact'),
  bus = lowest('bus');
// Camera offsets in metres in the vehicle frame: forward (+ ahead), side (+ right), up; the target is
// `look` metres ahead of the vehicle at ground level.
const POSES = {
  'car-behind': { id: car.id, forward: -22, side: 0, up: 10, look: 20 },
  'car-front': { id: car.id, forward: 30, side: 8, up: 3, look: 10 },
  'car-side': { id: car.id, forward: 6, side: 14, up: 6, look: 14 },
  'bus-behind': { id: bus.id, forward: -32, side: 0, up: 14, look: 25 },
  'bus-front': { id: bus.id, forward: 38, side: 10, up: 4, look: 12 },
};
const STATES = { day: 759, night: 1290 };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const metadata = {
  base,
  date: '2026-10-21',
  timezoneId: 'Europe/Stockholm',
  viewport: { width: 1400, height: 1000 },
  traffic: `backend copy, paused at simulation time ${world.simulationTime}, ${world.vehicles.length} vehicles`,
  vehicles: { car: car.id, bus: bus?.id ?? null },
  poses: POSES,
  states: STATES,
  errors,
  captures: {},
};
try {
  const context = await browser.newContext({
    viewport: metadata.viewport,
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.locator('.sim-live').filter({ hasText: 'Simulatorn är ansluten' }).waitFor();
  await page.waitForTimeout(3000);
  metadata.browser = browser.version();
  for (const [state, minutes] of Object.entries(STATES)) {
    await page.$eval(
      '#light-time',
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      minutes,
    );
    await page.waitForTimeout(800);
    for (const [name, pose] of Object.entries(POSES)) {
      // Paused world: the drawn (smoothed) pose has settled on the snapshot pose, which both apps
      // receive; the baseline has no vehiclePoses() hook, so the snapshot is used for both.
      const target = world.vehicles.find((v) => v.id === pose.id);
      await page.evaluate(
        ({ p, v }) => {
          const { camera, controls } = globalThis.__cityCamera;
          const fx = Math.sin(v.heading),
            fz = Math.cos(v.heading);
          const m = 25;
          camera.position.set(
            v.pos[0] + (fx * p.forward + fz * p.side) / m,
            v.pos[1] + p.up / m,
            v.pos[2] + (fz * p.forward - fx * p.side) / m,
          );
          controls.target.set(v.pos[0] + (fx * p.look) / m, v.pos[1], v.pos[2] + (fz * p.look) / m);
          controls.update();
          globalThis.__cityLighting.settle();
        },
        { p: pose, v: target },
      );
      await page.waitForTimeout(900);
      await page.evaluate(
        () =>
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))),
      );
      const file = `${name}-${state}.png`;
      await page.locator('.map-panel').screenshot({ path: `${out}/${file}` });
      metadata.captures[`${name}-${state}`] = {
        file,
        perf: await page.evaluate(() => {
          const p = globalThis.__cityPerformance;
          return p && { calls: p.calls, triangles: p.triangles, geometries: p.geometries };
        }),
        vehicleLights: await page.evaluate(
          () => globalThis.__cityLighting.describe().vehicleLights ?? null,
        ),
        programs: await page.evaluate(() => globalThis.__cityLighting.describe().programs),
      };
    }
  }
} finally {
  fs.writeFileSync(`${out}/metadata.json`, JSON.stringify(metadata, null, 2));
  await browser.close();
}
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
