// Lighting Phase L1 captures: the Phase 0 capture method (scripts/lighting-phase0/capture.mjs: same
// date, time zone, viewport 1400×1000, DPR 1, API aborted, labels off) with the L1 poses, and
// optionally the stress set swapped in after the map is ready (STRESS=1; DEV hook
// __cityLighting.registries.runtimePlus). Requires a DEV server (or a VITE_LIGHTING_HOOK=1 build).
//
//   node scripts/lighting-l1/capture.mjs <outDir> <baseUrl>
//   STRESS=1 STATES=night node scripts/lighting-l1/capture.mjs <outDir> <baseUrl>
//
// Writes <outDir>/<pose>-<state>.png and <outDir>/metadata.json. Raw output belongs under
// work/lighting-city-l1/; curated copies go to docs/lighting-city-l1/evidence/ once.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [out, base = 'http://127.0.0.1:5211/'] = process.argv.slice(2);
if (!out) throw new Error('usage: capture.mjs <outDir> <baseUrl>');
if (out.includes('docs') && fs.existsSync(out) && fs.readdirSync(out).length)
  throw new Error(`${out} already holds evidence; refusing to overwrite`);
const poses = JSON.parse(fs.readFileSync('scripts/lighting-l1/poses.json', 'utf8'));
const step6 = JSON.parse(fs.readFileSync('docs/step6/poses.json', 'utf8'));
for (const k of ['kungsgatan-street', 'stromparken-path', 'stadium-elevated-se']) poses[k] = step6[k];
const selected = (process.env.ONLY ?? Object.keys(poses).join(',')).split(',');
const states = { day: [759, 'off'], night: [1290, 'off'] };
if (process.env.STATES)
  for (const k of Object.keys(states)) if (!process.env.STATES.split(',').includes(k)) delete states[k];
const stress = process.env.STRESS === '1'
  ? JSON.parse(fs.readFileSync('work/lighting-city-l1/l0-stress-set.json', 'utf8'))
  : null;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const metadata = {
  base,
  date: '2026-10-21',
  timezoneId: 'Europe/Stockholm',
  viewport: { width: 1400, height: 1000 },
  stressSet: !!stress,
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
  if (stress) {
    metadata.swap = await page.evaluate((data) => {
      const h = globalThis.__cityLighting;
      const t0 = performance.now();
      const r = h.replaceStreetLighting(
        h.registries.runtimePlus(data, {
          dataset: 'l1-stress-set',
          generator: { script: 'scripts/lighting-l1/stress-set.ts', version: 'lighting-l1-stress-v0' },
        }),
      );
      return { ...r, ms: performance.now() - t0, fixtures: h.describe().fixtures };
    }, stress);
    if (!metadata.swap.ok) throw new Error('stress set rejected: ' + JSON.stringify(metadata.swap));
  }
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
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await page.locator('.map-panel').screenshot({ path: `${out}/${name}-${state}.png` });
      metadata.captures[`${name}-${state}`] = await page.evaluate(() => {
        const d = globalThis.__cityLighting.describe();
        const v = d.streetLighting?.visuals;
        return {
          lighting: {
            artificial: d.artificial,
            exposure: d.exposure,
            fixtures: d.fixtures,
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
console.log(JSON.stringify({ out, captures: Object.keys(metadata.captures).length, errors, swap: metadata.swap }));
if (errors.length) process.exitCode = 1;
