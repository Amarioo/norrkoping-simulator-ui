// Lighting Phase L2d captures: the Phase 0 / L1 capture method (scripts/lighting-l1/capture.mjs: same
// date, time zone, viewport 1400×1000, DPR 1, API aborted, labels off) with the L2d poses
// (scripts/lighting-l2d/poses.json). Requires a DEV server (camera and lighting hooks).
//
//   node scripts/lighting-l2d/capture.mjs <outDir> <baseUrl> [query]
//   e.g. node scripts/lighting-l2d/capture.mjs work/lighting-city-l2d/captures/after http://127.0.0.1:5260/
//
// Writes <outDir>/<pose>-<state>.png and <outDir>/metadata.json. Raw output belongs under
// work/lighting-city-l2d/; curated copies go to docs/lighting-city-l2d/evidence/ once.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base = 'http://127.0.0.1:5260/', query = ''] = process.argv.slice(2);
if (!out) throw new Error('usage: capture.mjs <outDir> <baseUrl> [extra query]');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
const poses = JSON.parse(fs.readFileSync('scripts/lighting-l2d/poses.json', 'utf8'));
const selected = (process.env.ONLY ?? Object.keys(poses).join(',')).split(',');
const states = { day: [759, 'off'], night: [1290, 'off'] };
if (process.env.STATES)
  for (const k of Object.keys(states)) if (!process.env.STATES.split(',').includes(k)) delete states[k];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const metadata = {
  base,
  query,
  date: '2026-10-21',
  timezoneId: 'Europe/Stockholm',
  viewport: { width: 1400, height: 1000 },
  traffic: 'API requests aborted (no vehicles, no simulation)',
  states,
  poses: Object.fromEntries(selected.map((k) => [k, poses[k]])),
  errors,
  captures: {},
};
try {
  const context = await browser.newContext({ viewport: metadata.viewport, deviceScaleFactor: 1, timezoneId: 'Europe/Stockholm' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // Aborted API requests (no backend) log 'Failed to load resource'; everything else counts.
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(new URL(`?date=2026-10-21&time=12:39&stadium=off${query}`, base).href);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: '.connection-banner{display:none!important}' });
  await page.locator('.label-toggle input').uncheck();
  await page.waitForTimeout(2500);
  metadata.browser = browser.version();
  metadata.gpu = await page.evaluate(() => {
    const gl = document.querySelector('.map-panel canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  for (const [state, [minutes, mode]] of Object.entries(states)) {
    await page.$eval(
      '#light-time',
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      minutes,
    );
    await page.selectOption('#stadium-lights', mode);
    for (const name of selected) {
      await page.evaluate((pose) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
        globalThis.__cityLighting.settle();
      }, poses[name]);
      await page.waitForTimeout(900);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.locator('.map-panel').screenshot({ path: `${out}/${name}-${state}.png` });
      metadata.captures[`${name}-${state}`] = await page.evaluate(() => {
        const d = globalThis.__cityLighting.describe();
        const v = d.streetLighting?.visuals;
        return {
          lighting: {
            artificial: d.artificial,
            exposure: d.exposure,
            fixtures: d.fixtures,
            siteLighting: d.siteLighting ?? null,
            grid: d.grid,
            programs: d.programs,
            detailInstances: v?.detailInstances ?? null,
            detailTriangles: v?.detailTriangles ?? null,
          },
          rendering: globalThis.__cityPerformance,
        };
      });
    }
  }
  metadata.final = await page.evaluate(() => globalThis.__cityLighting.describe());
} finally {
  fs.writeFileSync(`${out}/metadata.json`, JSON.stringify(metadata, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ out, captures: Object.keys(metadata.captures).length, errors }));
if (errors.length) process.exitCode = 1;
