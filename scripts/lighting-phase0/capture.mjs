// Lighting Phase 0 paired captures: identical poses, date, time, Europe/Stockholm time zone,
// viewport 1400×1000, DPR 1, API (traffic) disabled, labels off. Requires a DEV server (__cityCamera,
// __cityLighting). Run once per build, serially:
//
//   node scripts/lighting-phase0/capture.mjs <outDir> <baseUrl>
//
// Writes <outDir>/<pose>-<state>.png and <outDir>/metadata.json (lighting describe(), renderer
// calls/triangles, camera pose, time zone, browser/GPU). Raw PNGs belong under work/lighting-phase0/.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base = 'http://127.0.0.1:5193/'] = process.argv.slice(2);
if (!out) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
const poses = JSON.parse(fs.readFileSync('docs/step6/poses.json'));
poses['bergsbron-north-end'] = { position: [-17.9, 2.8, 2.9], target: [-21.1, 0.8, -0.9] };
// Phase 0 overviews (true-north oriented like mapModel focus()): all three pilot areas from ≈1.5 km,
// and the inner city (CITY_VIEWS.city pose).
poses['pilot-overview'] = { position: [-8.27, 38, 37.8], target: [-20, 0, 8] };
poses['city-overview'] = { position: [31.33, 114, 97.47], target: [-3.86, 0, 8.08] };
const selected = (
  process.env.ONLY ??
  [
    'kungsgatan-street',
    'kungsgatan-elevated',
    'bergsbron-north-end',
    'stromparken-path',
    'stromparken-elevated',
    'stadium-pitch-north',
    'stadium-elevated-se',
    'pilot-overview',
    'city-overview',
  ].join(',')
).split(',');
const states = {
  day: [759, 'off'],
  sunset: [1056, 'off'],
  twilight: [1072, 'off'],
  night: [1290, 'off'],
  training: [1290, 'training'],
  match: [1290, 'event'],
};
const stadiumOnly = new Set(['training', 'match']);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const metadata = {
  base,
  date: '2026-10-21',
  timezoneId: 'Europe/Stockholm',
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 1,
  traffic: 'API requests aborted (no vehicles, no simulation)',
  states,
  poses: Object.fromEntries(selected.map((k) => [k, poses[k]])),
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
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
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
      if (stadiumOnly.has(state) && !name.startsWith('stadium') && name !== 'pilot-overview')
        continue;
      await page.evaluate((pose) => {
        const { camera, controls } = globalThis.__cityCamera;
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
        globalThis.__cityLighting.settle();
      }, poses[name]);
      await page.waitForTimeout(700);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await page.locator('.map-panel').screenshot({ path: `${out}/${name}-${state}.png` });
      metadata.captures[`${name}-${state}`] = await page.evaluate(() => {
        const d = globalThis.__cityLighting.describe();
        return {
          lighting: {
            local: d.local,
            elevation: d.elevation,
            artificial: d.artificial,
            exposure: d.exposure,
            stadium: d.stadium,
            floodlights: d.floodlights,
            fixtures: d.fixtures,
            grid: d.grid,
            programs: d.programs,
            detailInstances: d.streetLighting?.visuals?.detailInstances ?? null,
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
