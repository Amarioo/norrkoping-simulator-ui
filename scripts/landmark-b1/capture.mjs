// Landmark B1 captures: fixed views of Rådhuset and Gull-Olle, by day and at night, plus draw calls,
// triangles and shader programs from the DEV hooks (__cityCamera, __cityLighting, __cityPerformance).
// No backend needed (the API is aborted, so no vehicles move through the pictures).
//
//   node scripts/landmark-b1/capture.mjs <outDir> <baseUrl>
//
// Poses are in the BUILDING FRAME of docs/landmark-b1/data/radhuset-lidar.json (metres; origin = the
// measured tower centre, +u along the north façade towards NE, +v out of the north façade; heights in
// RH2000 metres), so before and after share the exact camera. Raw output belongs under
// work/landmark-b1/; curated copies go to docs/landmark-b1/evidence/ once (never overwritten).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
const lidar = JSON.parse(fs.readFileSync('docs/landmark-b1/data/radhuset-lidar.json', 'utf8'));
const [ox, oz] = lidar.frame.originScene,
  [ux, uz] = lidar.frame.axisScene;
const M = 25;
/** Building frame (u, v metres; y RH2000 m) → scene. */
const scene = ([u, v, y]) => [ox + (u * ux + v * uz) / M, y / M, oz + (u * uz - v * ux) / M];
// camera [u, v, y], target [u, v, y]
const POSES = {
  'north-square': { camera: [-25, 95, 22], target: [0, -10, 36] },
  'northwest-street': { camera: [-62, 22, 9], target: [0, 0, 44] },
  'southeast-courtyard': { camera: [75, -95, 38], target: [0, -22, 24] },
  aerial: { camera: [-130, 140, 160], target: [0, -18, 20] },
  'tower-top': { camera: [22, 26, 76], target: [0, 0, 66] },
  skyline: { camera: [-180, 520, 45], target: [0, 0, 45] },
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
  frame: lidar.frame,
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
      await page.evaluate(
        ({ c, t }) => {
          const { camera, controls } = globalThis.__cityCamera;
          camera.position.set(...c);
          controls.target.set(...t);
          controls.update();
          globalThis.__cityLighting.settle();
        },
        { c: scene(pose.camera), t: scene(pose.target) },
      );
      await page.waitForTimeout(1200);
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
          ),
      );
      const file = `${name}-${state}.png`;
      await page.locator('.map-panel').screenshot({ path: `${out}/${file}` });
      metadata.captures[`${name}-${state}`] = {
        file,
        perf: await page.evaluate(() => {
          const p = globalThis.__cityPerformance;
          return p && { calls: p.calls, triangles: p.triangles, geometries: p.geometries };
        }),
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
