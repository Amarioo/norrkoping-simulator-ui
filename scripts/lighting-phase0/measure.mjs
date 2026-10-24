// Lighting Phase 0 paired performance: production builds served by `vite preview`, before (baseline
// bf5f726) and after (Phase 0), alternating rounds, a fresh browser per run, run serially. Browser
// frame intervals (requestAnimationFrame deltas, uncapped), NOT isolated GPU time. JS heap after
// forced GC is not total memory or VRAM.
//
//   node scripts/lighting-phase0/measure.mjs <out.json> [rounds=3] [beforePort=5190] [afterPort=5191]
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [
  out = 'work/lighting-phase0/perf/frontend.json',
  roundsArg = '3',
  beforePort = '5190',
  afterPort = '5191',
] = process.argv.slice(2);
const rounds = Number(roundsArg);
// Lighting Phase A1: optional view subset/extension (VIEWS=station,grandHotel,…; CITY_VIEWS keys).
const VIEWS = process.env.VIEWS?.split(',') ?? ['kungsgatan', 'stromparken', 'idrottsparkenPitch', 'parken', 'city'];
const CONDITIONS = [
  ['day', 759, 'off'],
  ['night-off', 1290, 'off'],
  ['night-match', 1290, 'event'],
];
const SAMPLES = 180;
const report = {
  note: 'Production builds (vite preview); uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit); 1280×900, DPR 1; API aborted (no traffic); Europe/Stockholm; fresh browser per run; before/after alternate within each round.',
  host: {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1e9),
    platform: `${os.platform()} ${os.release()}`,
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
  for (const [label, port] of round % 2
    ? [
        ['before', beforePort],
        ['after', afterPort],
      ]
    : [
        ['after', afterPort],
        ['before', beforePort],
      ]) {
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
      await page.addInitScript(() =>
        new MutationObserver(() => {
          if (!globalThis.__mapReadyAt && document.querySelector('[data-map-ready="true"]'))
            globalThis.__mapReadyAt = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true }),
      );
      const start = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?date=2026-10-21&time=12:39&stadium=off`);
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      const run = {
        label,
        round,
        order: report.runs.filter((r) => r.round === round).length,
        pageReadyMs: Date.now() - start,
        mapReadyMs: await page.evaluate(() => globalThis.__mapReadyAt),
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
      run.gpu = await page.evaluate(() => {
        const gl = document.querySelector('.map-panel canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      run.browser = browser.version();
      report.runs.push(run);
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ label, round, mapReadyMs: run.mapReadyMs, heapMB: run.heapMB }));
    } catch (e) {
      report.errors.push(`${label} r${round}: ${e.message}`);
      report.runs.push({ label, round, failed: String(e.message) });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  }
if (report.errors.length) process.exitCode = 1;
