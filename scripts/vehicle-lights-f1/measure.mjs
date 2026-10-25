// Vehicle Lights Phase F1 paired performance WITH TRAFFIC: the Lighting Phase 0 method
// (scripts/lighting-phase0/measure.mjs: production builds served by `vite preview`, uncapped Edge,
// 1280×900, DPR 1, fresh browser per run, before/after alternating within each round), except that
// the API is NOT aborted: both previews proxy /api to the isolated backend copy (API_TARGET, port
// 8095). Before the series the world is set to the default traffic, reset and PAUSED, so before and
// after see the same frozen vehicles. Extra view `follow`: the camera follows the lowest-id car.
// STRESS=1 calls the build's hook setVehicleRange(Infinity) (VITE_LIGHTING_HOOK=1 builds only):
// all 16 beams stay active wherever the camera is (worst-case shader cost); a build without the
// method (the main baseline) is unaffected.
//
//   node scripts/vehicle-lights-f1/measure.mjs <out.json> [rounds=3] [beforePort=5221] [afterPort=5222]
//
// Frame intervals are requestAnimationFrame deltas, NOT isolated GPU time; heap after forced GC is not
// total memory or VRAM.
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [
  out = 'work/vehicle-lights-f1/perf/traffic.json',
  roundsArg = '3',
  beforePort = '5221',
  afterPort = '5222',
] = process.argv.slice(2);
const rounds = Number(roundsArg);
const API = process.env.API ?? 'http://127.0.0.1:8095';
const STRESS = process.env.STRESS === '1';
const VIEWS = process.env.VIEWS?.split(',') ?? ['kungsgatan', 'stromparken', 'city', 'follow'];
const CONDITIONS = [
  ['day', 759, 'off'],
  ['night-off', 1290, 'off'],
];
const SAMPLES = 180;
const TRAFFIC = {
  compact: 100,
  estate: 60,
  trucks: 20,
  buses: 12,
  trams: 8,
  trains: 2,
  flights: true,
  timeScale: 3,
};
const post = (path, body) =>
  fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  });
await post('/api/simulator/settings', TRAFFIC);
await post('/api/simulator/reset', {});
await post('/api/simulator/pause', { paused: true });
const world = await (await fetch(API + '/api/simulator/world')).json();
const followId = world.vehicles
  .filter((v) => v.kind === 'compact')
  .map((v) => v.id)
  .sort((a, b) => a - b)[0];
const report = {
  note: 'Production builds (vite preview, /api proxied to the isolated backend copy); uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit); 1280×900, DPR 1; default traffic, reset then PAUSED (same frozen world for before and after); Europe/Stockholm; fresh browser per run; before/after alternate within each round.',
  stress: STRESS,
  traffic: TRAFFIC,
  vehicles: world.vehicles.length,
  simulationTime: world.simulationTime,
  followId,
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
  return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s.at(-1) };
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
        beams: {},
      };
      await page
        .locator('.sim-live')
        .filter({ hasText: 'Simulatorn är ansluten' })
        .waitFor({ timeout: 30000 });
      if (STRESS)
        run.stressHook = await page.evaluate(() => {
          const l = globalThis.__cityLighting;
          if (!l?.setVehicleRange) return false;
          l.setVehicleRange(Infinity);
          return true;
        });
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
        run.beams[condition] = {};
        for (const view of VIEWS) {
          if (view === 'follow') {
            await page.selectOption('#vehicle-select', String(followId));
            await page.getByRole('button', { name: /Följ fordonet/ }).click();
            await page.getByRole('button', { name: 'Stäng fordonsdetaljer' }).click();
            await page.waitForTimeout(3000);
          } else {
            await page.selectOption('#city-focus', view);
            await page.waitForTimeout(1500);
          }
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
          // Active beams (hook builds only; null otherwise).
          run.beams[condition][view] = await page.evaluate(
            () => globalThis.__cityLighting?.describe().vehicleLights?.active ?? null,
          );
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
