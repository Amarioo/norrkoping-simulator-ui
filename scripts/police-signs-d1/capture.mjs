// Police Signs D1 captures: fixed views of the police tower's emblem sign by day and at night, plus
// draw calls, triangles and shader programs from the DEV hooks (__cityCamera, __cityLighting,
// __cityPerformance), and control views elsewhere in the city that D1 must leave pixel-identical.
// No backend needed (the API is aborted, so no vehicles move through the pictures).
//
//   node scripts/police-signs-d1/capture.mjs <outDir> <baseUrl>
//
// Poses are in the TOWER FRAME of the drawn police tower (src/lib/landmarks/police/spec.ts,
// TOWER_MODEL): metres, origin = slab centre at the tower base, +a out of the SSE gable (the sign's
// face), +s along the gable to the right seen from the front, h = height above the tower base. The
// tower base is read from the scene (the group placed at TOWER_MODEL.position), so before (main) and
// after share the exact camera. Raw output belongs under work/police-signs-d1/; curated copies go to
// docs/police-signs-d1/evidence/ once (never overwritten).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
// TOWER_MODEL (spec.ts); kept literal so the script also runs against main, which lacks spec.ts.
const TOWER = { x: -29.25, z: -26.22, rotation: 0.2775 };
const M = 25;
const [ax, az] = [Math.sin(TOWER.rotation), Math.cos(TOWER.rotation)]; // local +z in scene x/z
const [sx, sz] = [az, -ax]; // local +x
// camera [a, s, h], target [a, s, h]
const POSES = {
  'gable-front': { camera: [150, 25, 25], target: [33, 0, 37] },
  stockholmsvagen: { camera: [230, -60, 3], target: [33, 0, 30] },
  'emblem-close': { camera: [70, 8, 37], target: [33, 0, 37] },
  district: { camera: [700, 260, 160], target: [0, 0, 25] },
  'police-preset': null, // the app's "Polisusets emblem" camera preset
  // Window follow-up: a long façade (local +x side) and a high view from the south, like the user's.
  'long-facade': { camera: [20, 190, 30], target: [0, 0, 25] },
  'aerial-south': { camera: [380, 80, 200], target: [0, 0, 10] },
};
// Control views far from the police tower: must not change at all.
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
  tower: TOWER,
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
  const baseY = await page.evaluate(({ x, z }) => {
    const l = globalThis.__cityLighting;
    let root = l.group;
    while (root.parent) root = root.parent;
    let y = null;
    root.traverse((o) => {
      if (
        o.type === 'Group' &&
        Math.abs(o.position.x - x) < 1e-6 &&
        Math.abs(o.position.z - z) < 1e-6
      )
        y = o.position.y;
    });
    return y;
  }, TOWER);
  if (baseY === null) throw new Error('police tower group not found');
  metadata.towerBaseScene = baseY;
  const scene = ([a, s, h]) => [
    TOWER.x + (a * ax + s * sx) / M,
    baseY + h / M,
    TOWER.z + (a * az + s * sz) / M,
  ];
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
      if (pose) await place(scene(pose.camera), scene(pose.target));
      else {
        // Select another view first: re-selecting the current value fires no change.
        await page.selectOption('#city-focus', 'city');
        await page.waitForTimeout(500);
        await page.selectOption('#city-focus', 'policeEmblem');
        await page.waitForTimeout(2500);
        await page.evaluate(() => globalThis.__cityLighting.settle());
      }
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
