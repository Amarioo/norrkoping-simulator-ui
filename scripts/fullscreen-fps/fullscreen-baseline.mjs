// Phase P0: baseline for the performance work. The map in fullscreen (Fullscreen API, entered with the
// map's own button) at the user's display sizes, day and night, with simulated traffic from the
// backend, in a production build made with VITE_LIGHTING_HOOK=1 (for globalThis.__fpsStats).
// Uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit), so the frame time shows the
// headroom below the display's refresh interval; headless, so the browser window is the "screen".
// Frame intervals are requestAnimationFrame deltas (CPU + GPU + browser), not isolated GPU time.
//
//   node scripts/fullscreen-fps/fullscreen-baseline.mjs <out.json> [rounds=2] [baseUrl=http://127.0.0.1:5273]
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [
  out = 'work/fullscreen-fps/perf/fullscreen-baseline.json',
  roundsArg = '2',
  base = 'http://127.0.0.1:5273',
] = process.argv.slice(2);
const rounds = Number(roundsArg);
const SCREENS = (process.env.SCREENS ?? '2560x1440,1920x1080')
  .split(',')
  .map((s) => s.split('x').map(Number));
const VIEWS = process.env.VIEWS?.split(',') ?? [
  'overview',
  'city',
  'kungsgatan',
  'stromparken',
  'police',
  'idrottsparkenPitch',
];
const CONDITIONS = [
  ['day', 759],
  ['night', 1290],
];
const SAMPLES = 300;
const report = {
  note: 'Fullscreen map (Fullscreen API via the map button), production build with VITE_LIGHTING_HOOK=1, headless uncapped Edge, DPR 1, traffic from the backend (default settings), Europe/Stockholm 2026-10-21, stadium off; fresh browser per screen and round.',
  host: {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1e9),
  },
  views: VIEWS,
  conditions: CONDITIONS,
  samplesPerView: SAMPLES,
  runs: [],
  errors: [],
};
const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const mean = s.reduce((x, y) => x + y, 0) / s.length;
  return {
    fps: 1000 / mean,
    meanMs: mean,
    medianMs: s[Math.floor(s.length / 2)],
    p95Ms: s[Math.ceil(s.length * 0.95) - 1],
    maxMs: s.at(-1),
    over16_7: s.filter((v) => v > 1000 / 60).length / s.length,
  };
};
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
for (let round = 1; round <= rounds; round++)
  for (const [width, height] of SCREENS) {
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    });
    try {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        timezoneId: 'Europe/Stockholm',
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(`${width}x${height} r${round}: ${e.message}`));
      await page.goto(new URL('?date=2026-10-21&time=12:39&stadium=off', base).href);
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      await page.locator('.fullscreen-toggle').click();
      await page.waitForFunction(
        () => document.fullscreenElement?.classList.contains('map-panel'),
        undefined,
        { timeout: 10000 },
      );
      await page.waitForTimeout(4000);
      const run = { screen: `${width}x${height}`, round, gpu: null, vehicles: null, views: {} };
      run.gpu = await page.evaluate(() => {
        const gl = document.querySelector('.map-panel canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      for (const [condition, minutes] of CONDITIONS) {
        await page.$eval(
          '#light-time',
          (el, v) => {
            el.value = String(v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          },
          minutes,
        );
        await page.waitForTimeout(1600);
        for (const view of VIEWS) {
          await page.selectOption('#city-focus', view);
          await page.waitForTimeout(2500);
          const intervals = await page.evaluate(async (n) => {
            globalThis.__fpsStats.reset();
            const samples = [];
            let previous = await new Promise((r) => requestAnimationFrame(r));
            for (let i = 0; i < n; i++) {
              const now = await new Promise((r) => requestAnimationFrame(r));
              samples.push(now - previous);
              previous = now;
            }
            return samples;
          }, SAMPLES);
          const hook = await page.evaluate(() => globalThis.__fpsStats.read());
          run.views[`${condition}/${view}`] = {
            ...stats(intervals),
            cpuMeanMs: hook.cpuMeanMs,
            cpuP95Ms: hook.cpuP95Ms,
            calls: hook.calls,
            triangles: hook.triangles,
            programs: hook.programs,
            resolution: `${hook.width}x${hook.height}`,
          };
        }
      }
      run.vehicles = await page.evaluate(
        () => document.querySelector('#vehicle-select')?.options.length - 1,
      );
      report.runs.push(run);
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({ screen: run.screen, round, vehicles: run.vehicles, gpu: run.gpu }),
      );
    } catch (e) {
      report.errors.push(`${width}x${height} r${round}: ${e.message}`);
      report.runs.push({ screen: `${width}x${height}`, round, failed: String(e.message) });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  }
if (report.errors.length) process.exitCode = 1;
