// SSE debug panel: what it costs per frame, with live traffic (the backend must run, so that the
// city stream delivers ~7–10 events/s of ~50 kB each). Same method as
// scripts/fullscreen-fps/counter-cost.mjs (production builds served by `vite preview`, uncapped Edge,
// 1280×900, DPR 1, fresh browser per run, variants alternate within each round). Frame intervals are
// requestAnimationFrame deltas, not GPU time.
//
// Variants:
//   base      plain production build (no debug code at all)            → <basePort>
//   closed    VITE_SSE_DEBUG=1 build, panel closed (nothing recorded)   → <ssePort>
//   open      VITE_SSE_DEBUG=1 build, ?sse-debug (recording, panel open)
//   open-raw  VITE_SSE_DEBUG=1 build, ?sse-debug=raw (+3 raw fetch readers)
//
//   node scripts/sse-debug/panel-cost.mjs <out.json> [rounds=3] [basePort=5283] [ssePort=5284]
// Refuses to overwrite <out.json>.
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const [out, roundsArg = '3', basePort = '5283', ssePort = '5284'] = process.argv.slice(2);
if (!out) throw new Error('usage: panel-cost.mjs <out.json> [rounds] [basePort] [ssePort]');
if (fs.existsSync(out)) throw new Error(`${out} exists; measurements are never overwritten`);
const rounds = Number(roundsArg);
const VIEWS = process.env.VIEWS?.split(',') ?? ['kungsgatan', 'stromparken', 'city'];
const SAMPLES = 240;
const VARIANTS = {
  base: { port: basePort, query: '' },
  closed: { port: ssePort, query: '' },
  open: { port: ssePort, query: '&sse-debug' },
  'open-raw': { port: ssePort, query: '&sse-debug=raw' },
};
const ORDER = Object.keys(VARIANTS);
const report = {
  note: 'Production builds; uncapped Edge (--disable-gpu-vsync --disable-frame-rate-limit); 1280×900, DPR 1; live backend traffic through the vite preview proxy; fresh browser per run; variant order rotates each round. Day (12:39).',
  host: {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1e9),
  },
  viewport: { width: 1280, height: 900 },
  views: VIEWS,
  samplesPerView: SAMPLES,
  variants: VARIANTS,
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
for (let round = 1; round <= rounds; round++) {
  const shift = (round - 1) % ORDER.length;
  const order = [...ORDER.slice(shift), ...ORDER.slice(0, shift)];
  for (const label of order) {
    const v = VARIANTS[label];
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
      await page.goto(
        `http://127.0.0.1:${v.port}/?date=2026-10-21&time=12:39&stadium=off${v.query}`,
      );
      await page.locator('[data-map-ready="true"]').waitFor({ timeout: 180000 });
      await page.waitForTimeout(3500);
      const run = {
        label,
        round,
        panelShown: await page.locator('.sse-debug').count(),
        hook: await page.evaluate(() => typeof globalThis.__sseLog),
        frames: {},
      };
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
        run.frames[view] = stats(intervals);
      }
      run.sse = await page.evaluate(() => {
        const h = globalThis.__sseLog;
        if (!h) return null;
        return {
          recording: h.recording,
          stored: h.log.size,
          storedMB: h.log.bytesStored / 1e6,
          channels: h.channels().map((c) => ({
            channel: c.channel,
            events: c.events,
            eventsPerSecond: c.eventsPerSecond,
            kBPerSecond: c.bytesPerSecond / 1024,
          })),
        };
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('HeapProfiler.enable');
      for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('Performance.enable');
      run.heapMB =
        (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')
          .value / 1e6;
      run.vehicles = await page.evaluate(
        () => document.querySelector('#vehicle-select')?.querySelectorAll('option').length ?? null,
      );
      report.runs.push(run);
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          label,
          round,
          heapMB: run.heapMB.toFixed(1),
          shown: run.panelShown,
          hook: run.hook,
          p95: Object.fromEntries(
            Object.entries(run.frames).map(([k, f]) => [k, f.p95.toFixed(2)]),
          ),
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
}
// Summary: per variant and view, median of the runs' median and p95 frame intervals.
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
report.summary = {};
for (const label of ORDER) {
  const runs = report.runs.filter((r) => r.label === label && r.frames);
  report.summary[label] = {
    runs: runs.length,
    heapMB: runs.length ? med(runs.map((r) => r.heapMB)) : null,
    views: Object.fromEntries(
      VIEWS.map((view) => [
        view,
        runs.length
          ? {
              medianMs: med(runs.map((r) => r.frames[view].median)),
              p95Ms: med(runs.map((r) => r.frames[view].p95)),
            }
          : null,
      ]),
    ),
  };
}
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (report.errors.length) process.exitCode = 1;
