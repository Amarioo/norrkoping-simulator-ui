// Phase P0: what the fps counter costs when it is switched on. Same method as
// scripts/lighting-phase0/measure.mjs (production build served by `vite preview`, uncapped Edge,
// 1280×900, DPR 1, API aborted, fresh browser per run, the two variants alternate within each round),
// but both variants use the SAME build: "off" (default) vs "on" (counter shown and expanded, set in
// localStorage before the page loads). Frame intervals are requestAnimationFrame deltas, not GPU time.
//
//   node scripts/fullscreen-fps/counter-cost.mjs <out.json> [rounds=3] [port=5272]
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [out = 'work/fullscreen-fps/perf/counter-cost.json', roundsArg = '3', port = '5272'] =
  process.argv.slice(2);
const rounds = Number(roundsArg);
const VIEWS = process.env.VIEWS?.split(',') ?? [
  'kungsgatan',
  'stromparken',
  'idrottsparkenPitch',
  'parken',
  'city',
];
const CONDITIONS = [
  ['day', 759, 'off'],
  ['night-off', 1290, 'off'],
];
const SAMPLES = 180;
const VARIANTS = {
  off: {},
  on: { 'norrkoping.fpsCounter': '1', 'norrkoping.fpsCounter.expanded': '1' },
};
const report = {
  note: 'Same production build, counter off vs on (expanded); uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit); 1280×900, DPR 1; API aborted (no traffic); fresh browser per run; variants alternate within each round.',
  host: {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1e9),
  },
  viewport: { width: 1280, height: 900 },
  views: VIEWS,
  conditions: CONDITIONS,
  samplesPerView: SAMPLES,
  runs: [],
  errors: [],
};
const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return {
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.floor(s.length * 0.95)],
    max: s.at(-1),
  };
};
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
for (let round = 1; round <= rounds; round++)
  for (const label of round % 2 ? ['off', 'on'] : ['on', 'off']) {
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    });
    try {
      const context = await browser.newContext({
        viewport: report.viewport,
        deviceScaleFactor: 1,
        timezoneId: 'Europe/Stockholm',
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(`${label} r${round}: ${e.message}`));
      await page.route('**/api/**', (r) => r.abort());
      await page.addInitScript((storage) => {
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
        new MutationObserver(() => {
          if (!globalThis.__mapReadyAt && document.querySelector('[data-map-ready="true"]'))
            globalThis.__mapReadyAt = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true });
      }, VARIANTS[label]);
      await page.goto(`http://127.0.0.1:${port}/?date=2026-10-21&time=12:39&stadium=off`);
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      const run = {
        label,
        round,
        mapReadyMs: await page.evaluate(() => globalThis.__mapReadyAt),
        counterShown: await page.locator('.fps-counter').count(),
        frames: {},
      };
      await page.waitForTimeout(3500);
      for (const [condition, minutes, mode] of CONDITIONS) {
        await page.$eval(
          '#light-time',
          (el, v) => {
            el.value = String(v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          },
          minutes,
        );
        await page.selectOption('#stadium-lights', mode);
        await page.waitForTimeout(1600);
        run.frames[condition] = {};
        for (const view of VIEWS) {
          await page.selectOption('#city-focus', view);
          await page.waitForTimeout(1500);
          const intervals = await page.evaluate(async (n) => {
            const samples = [];
            let previous = await new Promise((r) => requestAnimationFrame(r));
            for (let i = 0; i < n; i++) {
              const now = await new Promise((r) => requestAnimationFrame(r));
              samples.push(now - previous);
              previous = now;
            }
            return samples;
          }, SAMPLES);
          run.frames[condition][view] = stats(intervals);
        }
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send('HeapProfiler.enable');
      for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('Performance.enable');
      run.heapMB =
        (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')
          .value / 1e6;
      run.programs = await page.evaluate(
        () => document.querySelector('.fps-counter')?.dataset.programs ?? null,
      );
      report.runs.push(run);
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          label,
          round,
          mapReadyMs: run.mapReadyMs,
          heapMB: run.heapMB,
          shown: run.counterShown,
        }),
      );
    } catch (e) {
      report.errors.push(`${label} r${round}: ${e.message}`);
      report.runs.push({ label, round, failed: String(e.message) });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  }
if (report.errors.length) process.exitCode = 1;
