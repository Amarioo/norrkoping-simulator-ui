// Lighting Phase L1 scale measurement: the runtime set (273 fixtures) vs runtime + stress set
// (≈ 25 300) in ONE production bundle built with VITE_LIGHTING_HOOK=1 (vite build --outDir
// work/lighting-city-l1/dist-hook; served by vite preview). Same method as Phase 0 – A3
// (scripts/lighting-phase0/measure.mjs): uncapped Edge, 1280×900, DPR 1, Europe/Stockholm,
// 2026-10-21, API aborted, a fresh browser per run, the set order alternating per round. Browser
// frame intervals (requestAnimationFrame deltas), NOT isolated GPU time; JS heap after forced GC is
// not total memory or VRAM.
//
//   node scripts/lighting-l1/measure-scale.mjs <out.json> [rounds=3] [port=5215]
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [out = 'work/lighting-city-l1/perf/scale.json', roundsArg = '3', port = '5215'] =
  process.argv.slice(2);
const rounds = Number(roundsArg);
const VIEWS = (
  process.env.VIEWS ??
  'kungsgatan,ingelstaBridge,policeEmblem,station,grandHotel,centrum,city,stromparken,idrottsparkenPitch,parken'
).split(',');
const CONDITIONS = [
  ['day', 759, 'off'],
  ['night-off', 1290, 'off'],
];
const SAMPLES = 180;
const stress = JSON.parse(fs.readFileSync('work/lighting-city-l1/l0-stress-set.json', 'utf8'));
const IDENTITY = {
  dataset: 'l1-stress-set',
  generator: { script: 'scripts/lighting-l1/stress-set.ts', version: 'lighting-l1-stress-v0' },
};
const report = {
  note: 'Production bundle with the lighting hook (VITE_LIGHTING_HOOK=1); uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit); 1280×900, DPR 1; API aborted; Europe/Stockholm; fresh browser per run; set order alternates per round. The stress set is swapped in after map-ready.',
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
  stressFixtures: stress.fixtures.length,
  runs: [],
  errors: [],
};
const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s.at(-1) };
};
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
for (let round = 1; round <= rounds; round++)
  for (const set of round % 2 ? ['runtime', 'stress'] : ['stress', 'runtime']) {
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
      page.on('pageerror', (e) => report.errors.push(`${set} r${round}: ${e.message}`));
      await page.route('**/api/**', (r) => r.abort());
      await page.addInitScript(() =>
        new MutationObserver(() => {
          if (!globalThis.__mapReadyAt && document.querySelector('[data-map-ready="true"]'))
            globalThis.__mapReadyAt = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true }),
      );
      await page.goto(`http://127.0.0.1:${port}/?date=2026-10-21&time=12:39&stadium=off`);
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      const run = {
        set,
        round,
        order: report.runs.filter((r) => r.round === round).length,
        mapReadyMs: await page.evaluate(() => globalThis.__mapReadyAt),
        frames: {},
        rendering: {},
      };
      await page.waitForTimeout(3500);
      if (set === 'stress') {
        run.swap = await page.evaluate(
          ({ data, identity }) => {
            const h = globalThis.__cityLighting;
            const t0 = performance.now();
            const r = h.replaceStreetLighting(h.registries.runtimePlus(data, identity));
            return { ...r, ms: performance.now() - t0 };
          },
          { data: stress, identity: IDENTITY },
        );
        if (!run.swap.ok) throw new Error('stress set rejected');
        await page.waitForTimeout(1500);
      }
      run.describe = await page.evaluate(() => {
        const d = globalThis.__cityLighting.describe();
        return {
          fixtures: d.fixtures,
          programs: d.programs,
          index: d.streetLighting.index && {
            maxRawOccupancy: d.streetLighting.index.maxRawOccupancy,
            pages: d.streetLighting.index.pages.allocated,
          },
          bytes: d.streetLighting.bytes,
          timings: d.streetLighting.timings,
        };
      });
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
        run.rendering[condition] = {};
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
          run.rendering[condition][view] = await page.evaluate(() => {
            const r = globalThis.__cityLighting.renderer.info;
            const v = globalThis.__cityLighting.describe().streetLighting.visuals;
            return {
              calls: r.render.calls,
              triangles: r.render.triangles,
              programs: r.programs.length,
              detailInstances: v?.detailInstances ?? null,
              detailTriangles: v?.detailTriangles ?? null,
            };
          });
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
      console.log(JSON.stringify({ set, round, mapReadyMs: run.mapReadyMs, heapMB: run.heapMB, swap: run.swap }));
    } catch (e) {
      report.errors.push(`${set} r${round}: ${e.message}`);
      report.runs.push({ set, round, failed: String(e.message) });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  }
if (report.errors.length) process.exitCode = 1;
