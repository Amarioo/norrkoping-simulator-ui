// Police Tower D1b captures: fixed views of the police tower by day and at night, with draw calls,
// triangles and shader programs from the DEV hooks (__cityCamera, __cityLighting, __cityPerformance),
// and control views elsewhere in the city that D1b must leave pixel-identical. No backend needed (the
// API is aborted, so no vehicles move through the pictures).
//
//   node scripts/police-tower-d1b/capture.mjs <outDir> <baseUrl>
//
// Poses are in a FIXED WORLD FRAME taken from the LiDAR (docs/police-tower-d1b/data/
// police-tower-parts.json), not from the drawn tower, so before (main: the illustrative slab) and
// after share exactly the same cameras: origin = the measured SSE gable centre, +a out of the gable
// (bearing 163.71°), +s to the right seen from in front of the gable (towards ENE), h = height RH2000 m
// (scene y = h / 25). Raw output belongs under work/police-tower-d1b/; curated copies go to
// docs/police-tower-d1b/evidence/ once (never overwritten).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
const parts = JSON.parse(
  fs.readFileSync(
    new URL('../../docs/police-tower-d1b/data/police-tower-parts.json', import.meta.url),
  ),
);
const M = 25;
const [gx, gz] = parts.frame.gableCentreScene;
const [ae, an] = parts.frame.axisSweref;
const [ax, az] = [ae, -an]; // +a in scene x/z (x east, z south)
const [sx, sz] = [az, -ax]; // +s: +a turned 90° (towards ENE)
// camera [a, s, h], target [a, s, h]; the tower's centre is ≈ 25 m behind the gable (a −25).
const POSES = {
  'gable-front': { camera: [150, 25, 37], target: [0, 0, 38] },
  'emblem-close': { camera: [70, 8, 38.5], target: [0, 0, 38.5] },
  // About the Hemsö 2023 photo's direction: gable, the recessed light strip and the ENE façade.
  'hemso-view': { camera: [170, 55, 14], target: [0, 4, 36] },
  stockholmsvagen: { camera: [230, -60, 15], target: [0, 0, 30] },
  'ene-side': { camera: [-20, 150, 40], target: [-25, 0, 32] },
  'wsw-side': { camera: [-20, -150, 40], target: [-25, 0, 32] },
  'roof-oblique': { camera: [70, 70, 115], target: [-25, 2, 47] },
  district: { camera: [700, 260, 170], target: [-25, 0, 30] },
  'police-preset': 'policeEmblem', // the app's "Polishusets emblem" camera preset
  'police-overview': 'police', // the app's "Polishuset" camera preset
};
// Control views far from the police tower: must not change at all (same as D1).
const CONTROLS = {
  'control-radhuset': { c: [-2.6, 1.5, -6.8], t: [-1.13, 1.45, -10.69] },
  'control-kungsgatan': { c: [-25.5, 1.1, -11.5], t: [-22.3, 0.5, -13.65] },
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
  frame: { gableCentreScene: [gx, gz], axisSweref: [ae, an] },
  poses: POSES,
  controls: CONTROLS,
  states: STATES,
  errors,
  captures: {},
};
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
      ),
  );
const scene = ([a, s, h]) => [gx + (a * ax + s * sx) / M, h / M, gz + (a * az + s * sz) / M];
try {
  const context = await browser.newContext({
    viewport: metadata.viewport,
    deviceScaleFactor: 1,
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  await page.route('**/api/**', (r) => r.abort());
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/api|Failed to load resource|ERR_FAILED/i.test(m.text()))
      errors.push('console: ' + m.text());
  });
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(3000);
  metadata.browser = browser.version();
  const shoot = async (name, state) => {
    await page.waitForTimeout(1200);
    await frames(page);
    const file = `${name}-${state}.png`;
    await page.locator('.map-panel').screenshot({ path: `${out}/${file}` });
    metadata.captures[`${name}-${state}`] = {
      file,
      perf: await page.evaluate(() => {
        const p = globalThis.__cityPerformance;
        return p && { calls: p.calls, triangles: p.triangles, geometries: p.geometries };
      }),
      programs: await page.evaluate(() => globalThis.__cityLighting.describe().programs),
      artificial: await page.evaluate(() => globalThis.__cityLighting.describe().artificial),
    };
  };
  const place = (c, t) =>
    page.evaluate(
      ({ c, t }) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.set(...c);
        controls.target.set(...t);
        controls.update();
        globalThis.__cityLighting.settle();
      },
      { c, t },
    );
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
      if (typeof pose === 'string') {
        // Select another view first: re-selecting the current value fires no change.
        await page.selectOption('#city-focus', 'city');
        await page.waitForTimeout(500);
        await page.selectOption('#city-focus', pose);
        await page.waitForTimeout(2500);
        await page.evaluate(() => globalThis.__cityLighting.settle());
      } else await place(scene(pose.camera), scene(pose.target));
      await shoot(name, state);
    }
    for (const [name, pose] of Object.entries(CONTROLS)) {
      await place(pose.c, pose.t);
      await shoot(name, state);
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
